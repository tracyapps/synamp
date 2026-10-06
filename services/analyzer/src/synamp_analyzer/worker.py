"""The analyzer as a background worker, driven from the web app.

Instead of typing `scan`, `export` and `analyze` in a Terminal, the worker runs
quietly on the Mac (started at login by launchd: `synamp-analyze install-agent`)
and asks the brain what to do, the same way the librarian does:

    update   = scan for changes, then export the library list (the common one)
    scan     = scan only
    export   = export only
    analyze  = analyse the queue until it's empty or you press Pause; exports
               every hour along the way and once at the end

When its own code changes (a new version of SynAmp on this Mac), it finishes
the current track, exits, and launchd starts the new version 30 seconds later;
an analysis that was running carries on by itself.

It reports progress through the usual progress reports, keeps the Mac awake
while analysing (macOS `caffeinate`), and tries to mount the music share if it
isn't mounted (SYNAMP_MUSIC_SHARE_URL, e.g. smb://Syd.local/music).
"""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

from . import __version__
from .config import AnalyzerConfig
from .export import write_export
from .pipeline import run_analyze, run_scan
from .store import Database

ACTIONS = ("update", "scan", "export", "analyze")
CHECK_EVERY_S = 10.0
EXPORT_EVERY_S = 60 * 60.0
MOUNT_RETRY_S = 5 * 60.0
AGENT_LABEL = "org.synamp.analyzer"


def code_stamp(root: Path = Path(__file__).parent) -> str:
    """Changes whenever any of the analyzer's own Python files change."""
    digest = hashlib.sha256()
    for path in sorted(root.rglob("*.py")):
        try:
            stat = path.stat()
        except OSError:
            continue
        digest.update(f"{path.relative_to(root)}\0{stat.st_size}\0{stat.st_mtime_ns}\n".encode())
    return digest.hexdigest()


class BrainError(Exception):
    pass


class Brain:
    """A tiny JSON client for the brain's worker endpoints."""

    def __init__(self, url: str, token: str | None, timeout: float = 30.0):
        self.base = url.rstrip("/")
        self.token = token
        self.timeout = timeout

    def post(self, path: str, body: dict) -> dict:
        request = urllib.request.Request(
            self.base + path, data=json.dumps(body).encode("utf-8"), method="POST",
            headers={"content-type": "application/json", **({"authorization": f"Bearer {self.token}"} if self.token else {})},
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                text = response.read().decode("utf-8")
        except urllib.error.HTTPError as error:
            raise BrainError(f"the brain answered HTTP {error.code} for {path}") from error
        except (urllib.error.URLError, OSError, ValueError) as error:
            raise BrainError(f"can't reach the brain at {self.base}: {error}") from error
        try:
            return json.loads(text) if text else {}
        except ValueError as error:
            raise BrainError(f"the brain sent something that isn't JSON for {path}") from error


def default_export_path(cfg: AnalyzerConfig) -> Path:
    """Beside the library on the share: <share>/.synamp/library-signals.json (where the brain reads it)."""
    explicit = os.environ.get("SYNAMP_EXPORT_PATH")
    return Path(explicit) if explicit else cfg.library_path.parent / ".synamp" / "library-signals.json"


class Worker:
    def __init__(self, cfg: AnalyzerConfig, brain: Brain, export_path: Path | None = None,
                 log=print, sleep=time.sleep, now=time.time, mount=None, keep_awake=None, stamp=code_stamp):
        self.cfg = cfg
        self.brain = brain
        self.export_path = export_path or default_export_path(cfg)
        self.log = log
        self.sleep = sleep
        self.now = now
        self.mount = mount if mount is not None else try_mount
        self.keep_awake = keep_awake if keep_awake is not None else caffeinate
        self.last_mount_try = -MOUNT_RETRY_S
        self.stamp = stamp
        self.started_with = stamp()
        self.resume_analysis = False
        self.current: str | None = None  # the command being worked on

    def activity(self, value: dict | None) -> None:
        """Tell the web app what the worker is busy with inside a command (None: finished).

        Best effort: a brain that's unreachable or older just doesn't show it.
        """
        if not self.current:
            return
        try:
            self.brain.post(f"/api/v1/analyzer/commands/{self.current}/activity", {"activity": value})
        except BrainError:
            pass

    def code_changed(self) -> bool:
        """A new version of the analyzer is on disk: time to restart into it."""
        return self.stamp() != self.started_with

    # --- what the web app sees ------------------------------------------------------
    def library_ok(self) -> bool:
        try:
            return self.cfg.library_path.is_dir() and any(True for _ in self.cfg.library_path.iterdir())
        except OSError:
            return False

    def about(self, state: str, problem: str | None = None) -> dict:
        return {
            "version": __version__, "host": socket.gethostname(), "state": state,
            "library_path": str(self.cfg.library_path), "library_ok": self.library_ok(),
            "export_path": str(self.export_path), "journal": str(self.cfg.rename_journal or ""),
            **({"problem": problem} if problem else {}),
        }

    def ensure_library(self) -> str | None:
        """None when the music is reachable; otherwise a plain-language problem."""
        if self.library_ok():
            return None
        share = os.environ.get("SYNAMP_MUSIC_SHARE_URL")
        if share and self.now() - self.last_mount_try >= MOUNT_RETRY_S:
            self.last_mount_try = self.now()
            self.log(f"worker: the music isn't at {self.cfg.library_path}; trying to mount {share}")
            self.mount(share)
            if self.library_ok():
                return None
        return (f"The music isn't reachable at {self.cfg.library_path}. "
                f"{'Mount the music share in Finder (Go → Connect to Server).' if not share else f'Mounting {share} failed; mount it in Finder.'}")

    # --- doing the work ---------------------------------------------------------------
    def export(self) -> str:
        # Usually seconds; after an update that re-reads every file's tags, the better part of an hour —
        # during which analysis waits, so the web app says so.
        self.activity({"kind": "export"})
        try:
            with Database(self.cfg.db_path) as db:
                counts = write_export(db, self.cfg.library_path, self.export_path, progress=self.log,
                                      on_count=lambda done, total: self.activity({"kind": "export", "done": done, "total": total}))
        finally:
            self.activity(None)
        return f"library list updated: {counts['exported']:,} tracks"

    def scan(self) -> str:
        counts = run_scan(self.cfg, progress=self.log)
        parts = [f"{counts['scanned']:,} files", f"{counts['new']:,} new", f"{counts['changed']:,} changed", f"{counts['missing']:,} missing"]
        if counts.get("renamed"):
            parts.append(f"{counts['renamed']:,} moved by the librarian")
        return "scan: " + ", ".join(parts)

    def analyze(self, command_id: str) -> tuple[str, str]:
        state = {"checked": self.now(), "exported": self.now(), "stop": False}

        def should_stop() -> bool:
            now = self.now()
            if now - state["checked"] >= CHECK_EVERY_S:
                state["checked"] = now
                try:
                    state["stop"] = bool(self.brain.post(f"/api/v1/analyzer/commands/{command_id}/check", {}).get("stop"))
                except BrainError as error:
                    self.log(f"worker: {error} (carrying on)")
                if not state["stop"] and self.code_changed():
                    self.log("worker: a new version of the analyzer is here; stopping after this track to restart into it")
                    state["stop"] = True
                    self.resume_analysis = True
            if not state["stop"] and now - state["exported"] >= EXPORT_EVERY_S:
                state["exported"] = now
                self.log("worker: hourly export so smart playlists see the new results")
                try:
                    self.export()
                except Exception as error:  # an export hiccup must not stop analysis
                    self.log(f"worker: export failed: {error}")
            return state["stop"]

        awake = self.keep_awake()
        try:
            summary = run_analyze(self.cfg, progress=self.log, should_stop=should_stop)
        finally:
            if awake is not None:
                awake.terminate()
        exported = self.export()
        text = f"analysed {summary['completed']:,} tracks ({summary['failed']:,} couldn't be read); {exported}"
        if summary.get("fingerprints_filled"):
            text += f"; fingerprints filled in for {summary['fingerprints_filled']:,} earlier tracks"
        if self.resume_analysis:
            text += "; restarting to use the new version, then carrying on"
        return ("stopped" if summary.get("stopped") else "done"), text

    def run_command(self, command: dict) -> dict:
        action = command.get("action")
        if action not in ACTIONS:
            return {"status": "failed", "summary": f"unknown action {action!r}"}
        problem = self.ensure_library()
        if problem:
            return {"status": "failed", "summary": problem}
        started = self.now()
        self.current = str(command.get("id") or "") or None
        try:
            if action == "scan":
                status, text = "done", self.scan()
            elif action == "export":
                status, text = "done", self.export()
            elif action == "update":
                status, text = "done", f"{self.scan()}; {self.export()}"
            else:
                status, text = self.analyze(str(command["id"]))
        except Exception as error:  # report it; the worker itself keeps running
            return {"status": "failed", "summary": f"{type(error).__name__}: {error}"}
        finally:
            self.current = None
        return {"status": status, "summary": f"{text} ({(self.now() - started) / 60:.0f} min)" if self.now() - started >= 90 else text}

    def report(self, command_id: str, result: dict) -> None:
        for attempt in range(5):
            try:
                self.brain.post(f"/api/v1/analyzer/commands/{command_id}", result)
                return
            except BrainError as error:
                self.log(f"worker: couldn't report back ({error}); retrying")
                self.sleep(min(60.0, 5.0 * (attempt + 1)))

    def once(self) -> str:
        """One round: say hello, and run a command if there is one. Returns what happened."""
        problem = None if self.library_ok() else self.ensure_library()
        claimed = self.brain.post("/api/v1/analyzer/claim", {"worker": self.about("idle", problem)})
        command = claimed.get("command")
        if not command:
            return "idle"
        self.log(f"worker: {command.get('action')} (asked {command.get('requested_by', 'from the web app')})")
        result = self.run_command(command)
        self.log(f"worker: {result['status']}: {result['summary']}")
        self.report(str(command["id"]), result)
        if self.resume_analysis:
            # Queue the analysis again, so the new version picks it up where this one stopped.
            try:
                self.brain.post("/api/v1/analyzer/request", {"action": "analyze"})
            except BrainError as error:
                self.log(f"worker: couldn't queue the analysis to carry on ({error}); press Start analysis")
            return "restart"
        return result["status"]

    def run_forever(self, poll: float = 5.0) -> None:
        self.log(f"worker: SynAmp analyzer {__version__} on {socket.gethostname()}; library {self.cfg.library_path}; "
                 f"asking {self.brain.base} every {poll:.0f}s")
        while True:
            try:
                outcome = self.once()
            except BrainError as error:
                self.log(f"worker: {error}")
                outcome = "unreachable"
            if outcome == "restart" or self.code_changed():
                # launchd (KeepAlive) starts the new version in 30 seconds.
                self.log("worker: restarting to use the new version of the analyzer")
                return
            self.sleep(poll if outcome in ("idle",) else 1.0 if outcome != "unreachable" else poll * 6)


# --- macOS helpers ------------------------------------------------------------------------

def try_mount(share_url: str) -> bool:
    """Ask Finder to mount an SMB share (uses the password saved in the Keychain)."""
    if sys.platform != "darwin":
        return False
    script = f'mount volume "{share_url.replace(chr(34), "")}"'
    try:
        subprocess.run(["osascript", "-e", script], check=True, timeout=90, capture_output=True)
        return True
    except (subprocess.SubprocessError, OSError):
        return False


def caffeinate():
    """Keep the Mac awake while this process runs (macOS only)."""
    if sys.platform != "darwin" or not shutil.which("caffeinate"):
        return None
    try:
        return subprocess.Popen(["caffeinate", "-i", "-w", str(os.getpid())])
    except OSError:
        return None


def agent_plist(analyzer_dir: Path, env_file: Path, uv: str, log_file: Path) -> str:
    """A launchd agent: runs the worker at login and restarts it if it stops."""
    command = f"source '{env_file}' && cd '{analyzer_dir}' && exec '{uv}' run synamp-analyze worker"
    esc = lambda text: text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")  # noqa: E731
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>{AGENT_LABEL}</string>
  <key>ProgramArguments</key>
  <array><string>/bin/zsh</string><string>-c</string><string>{esc(command)}</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>ProcessType</key><string>Background</string>
  <key>StandardOutPath</key><string>{esc(str(log_file))}</string>
  <key>StandardErrorPath</key><string>{esc(str(log_file))}</string>
</dict>
</plist>
"""


def install_agent(env_file: Path, analyzer_dir: Path, log=print) -> int:
    if sys.platform != "darwin":
        log("install-agent: this sets up a macOS login item; on other systems run `synamp-analyze worker` as a service.")
        return 2
    if not env_file.exists():
        log(f"install-agent: no settings file at {env_file} (see services/analyzer/mac-env.example.sh)")
        return 2
    uv = shutil.which("uv")
    if not uv:
        log("install-agent: can't find uv on this Mac")
        return 2
    agents = Path.home() / "Library" / "LaunchAgents"
    agents.mkdir(parents=True, exist_ok=True)
    plist = agents / f"{AGENT_LABEL}.plist"
    log_file = env_file.parent / "worker.log"
    plist.write_text(agent_plist(analyzer_dir, env_file, uv, log_file), encoding="utf-8")
    domain = f"gui/{os.getuid()}"
    subprocess.run(["launchctl", "bootout", f"{domain}/{AGENT_LABEL}"], capture_output=True)
    result = subprocess.run(["launchctl", "bootstrap", domain, str(plist)], capture_output=True, text=True)
    if result.returncode != 0:
        log(f"install-agent: launchctl refused: {result.stderr.strip()}")
        return 1
    log("install-agent: done. The SynAmp analyzer now runs in the background, now and at every login.")
    log("install-agent: control it from the Library strip in the web app.")
    log(f"install-agent: its log is {log_file}  (remove it again with: uv run synamp-analyze uninstall-agent)")
    return 0


def uninstall_agent(log=print) -> int:
    if sys.platform != "darwin":
        return 2
    plist = Path.home() / "Library" / "LaunchAgents" / f"{AGENT_LABEL}.plist"
    subprocess.run(["launchctl", "bootout", f"gui/{os.getuid()}/{AGENT_LABEL}"], capture_output=True)
    if plist.exists():
        plist.unlink()
    log("uninstall-agent: the background analyzer is stopped and won't start at login.")
    return 0
