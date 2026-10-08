"""Export analysed signals for the brain (AGENT-ROADMAP P1, deliverable 5).

The brain's smart playlists read a versioned JSON document of per-track
signals. This module writes it from the local SQLite store. It is deliberately
separate from the queue: the queue is a private worker detail, the export is a
contract.

Rules the export enforces, because the brain trusts what it receives:

* **Only current values.** A field is exported only when the job record says its
  stage is done. A file whose bytes changed is reset to no stages, so its old
  measurements are withheld rather than served as if they described the new
  audio.
* **Null is absence.** Unmeasured values are left out, never written as zero.
* **Only declared signals.** `EXPORTED_SIGNALS` names every field and the stage
  that owns it. A stage that starts producing a field nobody declared here is
  caught by a test, not silently shipped (or silently dropped).
* **Stable identity.** A track's ID is a hash of its path *relative to the
  library root*, so a sample (a symlink tree mirroring the library) and the full
  library give the same track the same ID.
* **Names come from tags when they can.** Title/artist/album are read from the
  file's own tags (tinytag, MIT) and labelled `metadata_source: "tags"`; only
  when a file has no usable tags does the export fall back to the folder layout
  (`metadata_source: "path"`). Downstream, anything that leaves the house — a
  Last.fm scrobble — is only sent for tag-sourced names, never guessed ones.
  Tags are cached per (path, size, mtime), so re-exports do not re-read files.
"""

from __future__ import annotations

import hashlib
from concurrent.futures import ThreadPoolExecutor, as_completed
import json
import os
import re
import tempfile
import time
from pathlib import Path, PurePosixPath

from . import __version__
from .fpsketch import sketch as fingerprint_sketch
from .store import Database

try:  # tag reading is optional at runtime: a missing package degrades to path names
    from tinytag import TinyTag
except ImportError:  # pragma: no cover - exercised only on broken installs
    TinyTag = None  # type: ignore[assignment]

TAG_CACHE_SCHEMA = """
CREATE TABLE IF NOT EXISTS tag_cache (
    path       TEXT PRIMARY KEY,
    size_bytes INTEGER NOT NULL,
    mtime      REAL    NOT NULL,
    payload    TEXT    NOT NULL
);
"""

EXPORT_FORMAT = "synamp.library-signals/1"

EXPORTED_SIGNALS: dict[str, tuple[str, ...]] = {
    # identity produces no signals; its hash is exported at the top level (see build_export).
    "identity": (),
    # stage -> fields it owns. Keep in step with apps/brain/src/query/signals.ts;
    # a brain test reads this mapping and fails if a name is not registered there.
    "dsp_core": (
        "bpm", "tempo_confidence", "pulse_clarity", "pulse_steadiness", "onset_rate", "percussiveness",
        "lufs_integrated", "loudness_range", "crest_factor", "dynamic_complexity",
        "clipping_density", "spectral_centroid", "spectral_flatness", "spectral_tilt",
    ),
    "beat": (
        "beat_grid_strength", "beat_interval_cv", "tempo_drift",
        "microtiming_tightness", "microtiming_signed", "swing_ratio",
    ),
    "voice": ("vocal_fraction", "instrumental"),
}

STATUS_FIELDS: dict[str, tuple[str, ...]] = {
    # Status strings the brain uses to gate eligibility (not signals themselves).
    "dsp_core": ("tempo_status",),
    "beat": ("beat_status", "timing_status", "beat_method"),
    "voice": ("voice_method",),
}

# Stage outputs that are a mapping of name -> number, exported flat as "<group>.<name>"
# (instruments.piano …). Each name must be registered in the brain as well.
EXPORTED_GROUPS: dict[str, tuple[str, ...]] = {
    "voice": ("instruments",),
}

# Top-level folders whose children are not one artist.
_NOT_AN_ARTIST = {"compilations", "various artists", "soundtracks", "va"}
_TRACK_NUMBER = re.compile(r"^\s*(?:\d{1,2}[-.])?\d{1,3}\s*(?:[-._]\s*|\s+)")


def track_id(relative: PurePosixPath) -> str:
    """Stable ID from the library-relative path (case preserved, POSIX separators)."""
    return "p:" + hashlib.sha256(str(relative).encode("utf-8")).hexdigest()[:20]


def describe_from_path(relative: PurePosixPath) -> dict[str, str]:
    """Best-effort title/artist/album from an Artist/Album/NN Title.ext layout.

    Tags are not read yet, so this is labelled `metadata_source: "path"` and the
    brain should prefer the library core's tags once the two are joined by path.
    """
    stem = relative.stem
    title = _TRACK_NUMBER.sub("", stem).strip() or stem
    out = {"title": title, "metadata_source": "path"}
    parts = relative.parts
    if len(parts) >= 3:
        if parts[0].lower() not in _NOT_AN_ARTIST:
            out["artist"] = parts[0]
        out["album"] = parts[-2]
    elif len(parts) == 2 and parts[0].lower() not in _NOT_AN_ARTIST:
        out["artist"] = parts[0]
    return out


def _clean(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    text = value.replace("\x00", "").strip()
    return text[:300] or None


def read_tags(path: Path) -> dict:
    """Title/artist/album/duration from the file's own tags. {} when unreadable."""
    if TinyTag is None:
        return {}
    try:
        tag = TinyTag.get(str(path))
    except Exception:  # one odd file must not stop an export
        return {}
    out: dict = {}
    for key, value in (("title", tag.title), ("artist", tag.artist), ("album", tag.album), ("album_artist", tag.albumartist)):
        cleaned = _clean(value)
        if cleaned:
            out[key] = cleaned
    if isinstance(tag.duration, (int, float)) and tag.duration > 0:
        out["duration_s"] = round(float(tag.duration), 3)
    # Numbers and release identity, used to find missing tracks.
    for key, value in (("track_no", tag.track), ("track_total", tag.track_total), ("disc_no", tag.disc), ("disc_total", tag.disc_total)):
        if isinstance(value, int) and 0 < value < 1000:
            out[key] = value
    year = _year(tag.year)
    if year:
        out["year"] = year
    # Audio quality, used to pick the better of two copies of one recording.
    for key, value, low, high in (("bitrate_kbps", tag.bitrate, 1, 100_000), ("sample_rate", tag.samplerate, 1000, 1_000_000),
                                  ("bit_depth", getattr(tag, "bitdepth", None), 1, 64)):
        if isinstance(value, (int, float)) and not isinstance(value, bool) and low <= value <= high:
            out[key] = round(float(value)) if key != "bitrate_kbps" else round(float(value), 1)
    other = getattr(tag, "other", None) or {}
    for key, values in other.items():
        normal = key.lower().replace(" ", "_")
        if normal in ("musicbrainz_albumid", "musicbrainz_album_id"):
            value = values[0] if isinstance(values, list) and values else values
            if isinstance(value, str) and _MBID.match(value.strip().lower()):
                out["mb_albumid"] = value.strip().lower()
    return out


_MBID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
TAG_CACHE_VERSION = 3  # 3: bitrate, sample rate, bit depth


def _year(value: object) -> int | None:
    match = re.match(r"^\s*(\d{4})", str(value or ""))
    year = int(match.group(1)) if match else None
    return year if year and 1877 <= year <= 2100 else None


def number_from_filename(relative: PurePosixPath) -> dict:
    """'1-07 Name' → disc 1, track 7; '07 - Name' → track 7. {} when there is no leading number."""
    match = re.match(r"^\s*(?:(\d{1,2})[-.])?(\d{1,3})(?=\s*(?:[-._]\s*|\s+)\S)", relative.stem)
    if not match:
        return {}
    out = {"track_no": int(match.group(2))}
    if match.group(1):
        out["disc_no"] = int(match.group(1))
    return out if 0 < out["track_no"] < 1000 else {}


LOSSLESS_FORMATS = {"flac", "wav", "aif", "aiff", "ape", "wv", "alac", "dsf", "dff"}
LOSSY_FORMATS = {"mp3", "aac", "ogg", "oga", "opus", "wma", "mp2", "mpc"}
# An .m4a can be AAC (lossy) or ALAC (lossless); ALAC of CD audio runs far above any AAC encode.
M4A_LOSSLESS_KBPS = 500


def quality(relative: PurePosixPath, tags: dict, size_bytes: int | None) -> dict:
    """Format, lossless or not, bitrate, sample rate, bit depth, size — whatever is known."""
    fmt = relative.suffix.lower().lstrip(".")
    out: dict = {"format": fmt}
    bitrate = tags.get("bitrate_kbps")
    if fmt in LOSSLESS_FORMATS:
        out["lossless"] = True
    elif fmt in LOSSY_FORMATS:
        out["lossless"] = False
    elif fmt in ("m4a", "mp4", "m4b") and isinstance(bitrate, (int, float)):
        out["lossless"] = bitrate >= M4A_LOSSLESS_KBPS
    for key in ("bitrate_kbps", "sample_rate", "bit_depth"):
        if key in tags:
            out[key] = tags[key]
    if isinstance(size_bytes, int) and size_bytes > 0:
        out["size_bytes"] = size_bytes
    return out


def describe(relative: PurePosixPath, tags: dict) -> dict:
    """Tag names when the file has a title and an artist; otherwise the folder layout."""
    if tags.get("title") and (tags.get("artist") or tags.get("album_artist")):
        out = {"title": tags["title"], "artist": tags.get("artist") or tags["album_artist"], "metadata_source": "tags"}
        if tags.get("album"):
            out["album"] = tags["album"]
        if tags.get("album_artist"):
            out["album_artist"] = tags["album_artist"]
        return out
    return describe_from_path(relative)


def _finite(value: object) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and value == value \
        and value not in (float("inf"), float("-inf"))


TAG_READ_WORKERS = 8
_COMMIT_EVERY = 250
_REPORT_EVERY_S = 10.0


def _read_tags_parallel(db: Database, rows, root: Path, progress=None, workers: int = TAG_READ_WORKERS,
                        on_count=None) -> dict[str, dict]:
    """Tags for every present file: from the cache when unchanged, else read.

    Reading is network-bound over a share (one open and a few small reads per
    file), so several files are read at once. Results are saved to the cache as
    they arrive and committed every few hundred files, so stopping half-way
    keeps what was read; progress is reported every ~10 seconds.
    """
    cached: dict[str, dict] = {}
    known = {
        row["path"]: row
        for row in db.conn.execute("SELECT path, size_bytes, mtime, payload FROM tag_cache")
    }
    todo: list[tuple[str, int, float]] = []
    for row in rows:
        if row["missing"]:
            continue
        hit = known.get(row["path"])
        if hit is not None and hit["size_bytes"] == row["size_bytes"] and hit["mtime"] == row["mtime"]:
            payload = json.loads(hit["payload"])
            if payload.get("_v") == TAG_CACHE_VERSION:
                cached[row["path"]] = payload
                continue
        todo.append((row["path"], row["size_bytes"], row["mtime"]))
    if not todo:
        return cached

    def say(text: str) -> None:
        if progress is not None:
            progress(text)

    say(f"export: reading tags from {len(todo):,} files ({len(cached):,} already known), {workers} at a time")
    if on_count is not None:
        on_count(0, len(todo))
    started = last_report = time.time()
    done = 0
    pool = ThreadPoolExecutor(max_workers=max(1, workers))
    try:
        futures = {pool.submit(read_tags, Path(path)): (path, size, mtime) for path, size, mtime in todo}
        for future in as_completed(futures):
            path, size, mtime = futures[future]
            try:
                tags = future.result()
            except Exception:  # read_tags already swallows errors; belt and braces
                tags = {}
            tags = {**tags, "_v": TAG_CACHE_VERSION}
            cached[path] = tags
            db.conn.execute(
                "INSERT INTO tag_cache (path, size_bytes, mtime, payload) VALUES (?, ?, ?, ?) "
                "ON CONFLICT(path) DO UPDATE SET size_bytes = excluded.size_bytes, mtime = excluded.mtime, payload = excluded.payload",
                (path, size, mtime, json.dumps(tags, sort_keys=True)),
            )
            done += 1
            if done % _COMMIT_EVERY == 0:
                db.conn.commit()
            now = time.time()
            if now - last_report >= _REPORT_EVERY_S or done == len(todo):
                last_report = now
                rate = done / max(now - started, 1e-6)
                left = (len(todo) - done) / rate if rate > 0 else 0
                when = f"~{left / 60:.0f} min left" if left >= 90 else f"~{left:.0f} s left"
                say(f"export: tags {done:,} / {len(todo):,} ({100 * done / len(todo):.0f}%), {rate:.0f} files/s, {when}")
                if on_count is not None:
                    on_count(done, len(todo))
    finally:
        # Ctrl-C or an error: keep what was read, and don't wait for the queued files.
        db.conn.commit()
        pool.shutdown(wait=False, cancel_futures=True)
    return cached


def build_export(db: Database, library_root: Path, read_file_tags: bool = True, progress=None,
                 workers: int = TAG_READ_WORKERS, on_count=None) -> dict:
    """The export document, as a plain dict."""
    root = library_root.expanduser()
    if read_file_tags:
        db.conn.executescript(TAG_CACHE_SCHEMA)
    rows = db.conn.execute(
        """
        SELECT t.path, t.missing, t.size_bytes, t.mtime, l.origin, j.state, j.stages_done, r.payload, r.analyzer_version, r.computed_at
          FROM tracks t
          LEFT JOIN jobs j    ON j.track_path = t.path
          LEFT JOIN results r ON r.track_path = t.path
          LEFT JOIN identity_links l ON l.path = t.path
         ORDER BY t.path
        """
    ).fetchall()

    tag_cache = _read_tags_parallel(db, rows, root, progress, workers, on_count) if read_file_tags else {}
    tracks: list[dict] = []
    counts = {"catalog": len(rows), "exported": 0, "missing_on_disk": 0, "outside_root": 0,
              "no_results": 0, "withheld_stale": 0, "failed": 0, "tagged": 0}
    seen_ids: dict[str, str] = {}
    for row in rows:
        if row["missing"]:
            counts["missing_on_disk"] += 1
            continue
        path = Path(row["path"])
        try:
            relative = PurePosixPath(path.relative_to(root).as_posix())
        except ValueError:
            counts["outside_root"] += 1
            continue
        if row["state"] == "failed":
            counts["failed"] += 1
        current = set(json.loads(row["stages_done"] or "[]")) if row["state"] else set()
        payload = json.loads(row["payload"]) if row["payload"] else {}
        if not payload:
            counts["no_results"] += 1
        stored = set(payload.get("stages_done") or [])
        if stored - current:
            # Results exist for stages the queue no longer counts as done
            # (file changed, or --redo-stage). Withhold them.
            counts["withheld_stale"] += 1

        signals: dict[str, float] = {}
        status: dict[str, str] = {}
        for stage in sorted(current & stored):
            for name in EXPORTED_SIGNALS.get(stage, ()):
                value = payload.get(name)
                if _finite(value):
                    signals[name] = float(value)
            for group in EXPORTED_GROUPS.get(stage, ()):
                for key, value in (payload.get(group) or {}).items():
                    if _finite(value):
                        signals[f"{group}.{key}"] = float(value)
            for name in STATUS_FIELDS.get(stage, ()):
                value = payload.get(name)
                if isinstance(value, str) and value:
                    status[name] = value

        tags = tag_cache.get(row["path"], {}) if read_file_tags else {}
        names = describe(relative, tags)
        if names["metadata_source"] == "tags":
            counts["tagged"] += 1

        # Stable identity: an ID is minted from the first path a track had, and a
        # moved or renamed track keeps it. The current path's hash becomes an alias.
        identifier = track_id(relative)
        aliases: list[str] = []
        if row["origin"]:
            try:
                identifier = track_id(PurePosixPath(Path(row["origin"]).relative_to(root).as_posix()))
                aliases.append(track_id(relative))
            except ValueError:
                pass  # origin outside this root (e.g. a sample): fall back to the current path
        if identifier in seen_ids:  # astronomically unlikely; never merge two files
            raise RuntimeError(f"track id collision: {seen_ids[identifier]} vs {relative}")
        seen_ids[identifier] = str(relative)
        entry: dict = {
            "id": identifier,
            "path": str(relative),
            **names,
            **({"duration_s": tags["duration_s"]} if "duration_s" in tags else {}),
            # Track/disc numbers: from tags, else from a leading number in the filename.
            **{key: value for key, value in {**number_from_filename(relative), **{k: tags[k] for k in ("track_no", "disc_no") if k in tags}}.items()},
            **{key: tags[key] for key in ("track_total", "disc_total", "year", "mb_albumid") if key in tags},
            **status,
            **({"aliases": aliases} if aliases else {}),
            **({"audio_hash": payload["audio_hash"]} if "identity" in current & stored and payload.get("audio_hash") else {}),
            # A slice of the Chromaprint fingerprint: "same recording, maybe another format?" (fpsketch.py).
            **({"fp_sketch": sketched} if "identity" in current & stored and (sketched := fingerprint_sketch(payload.get("fingerprint"))) else {}),
            **({"audio_duration_s": payload["audio_duration_s"]} if "identity" in current & stored and _finite(payload.get("audio_duration_s")) else {}),
            "quality": quality(relative, tags, row["size_bytes"]),
            "stages_done": sorted(current & stored),
            "signals": signals,
        }
        if payload.get("analyzer_version") or row["analyzer_version"]:
            entry["analyzer_version"] = payload.get("analyzer_version") or row["analyzer_version"]
        if row["computed_at"]:
            entry["computed_at"] = row["computed_at"]
        tracks.append(entry)
        counts["exported"] += 1

    if read_file_tags:
        db.conn.commit()
    return {
        "format": EXPORT_FORMAT,
        "exported_at": time.time(),
        "exporter_version": __version__,
        "library_root": str(root),
        "signals": {stage: list(names) for stage, names in EXPORTED_SIGNALS.items()},
        "counts": counts,
        "tracks": tracks,
    }


def write_export(db: Database, library_root: Path, out: Path, read_file_tags: bool = True, progress=None,
                 workers: int = TAG_READ_WORKERS, on_count=None) -> dict:
    """Write atomically (temp file + rename) so the brain never reads half a file."""
    document = build_export(db, library_root, read_file_tags, progress, workers, on_count)
    out = out.expanduser()
    out.parent.mkdir(parents=True, exist_ok=True)
    fd, temp = tempfile.mkstemp(prefix=f".{out.name}.", suffix=".tmp", dir=out.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(document, handle, ensure_ascii=False, separators=(",", ":"))
            handle.write("\n")
        os.replace(temp, out)
    except BaseException:
        Path(temp).unlink(missing_ok=True)
        raise
    return document["counts"]
