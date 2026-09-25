#!/usr/bin/env bash
#
# SynAmp — reorganise the music share into a bounded scan root.
#
#   music/
#     library/     <- everything currently at the share root moves in here
#     incoming/    <- created empty, for new rips awaiting filing
#
# WHY: Navidrome identifies tracks by path, so this must happen BEFORE the first
# scan. Doing it afterwards makes every track look deleted-and-re-added, which
# loses play counts and ratings and breaks playlist entries.
#
# SAFETY: dry-run by default. Nothing is touched until you pass --apply.
# The move is a same-volume rename, so it is fast — but it is still a bulk
# rename of thousands of folders. Take a Btrfs snapshot first.
#
#   On the NAS, over SSH:
#     ./reorganize-library.sh                 # show the plan
#     ./reorganize-library.sh --apply         # do it (asks for confirmation)
#     ./reorganize-library.sh --apply --yes   # do it, no prompt
#
# See ../../docs/synamp/STORAGE-LAYOUT.md for the full rationale.

set -euo pipefail
shopt -s nullglob

MUSIC_ROOT="${MUSIC_ROOT:-/volume1/music}"
LIBRARY_NAME="library"
INCOMING_NAME="incoming"
APPLY=0
ASSUME_YES=0
LIST_LIMIT=15
EXTRA_SKIPS=()

usage() {
	cat <<'EOF'
Reorganise the SynAmp music share into a bounded scan root.

Usage: reorganize-library.sh [options]

Options:
  --apply                 Actually move files. Without this, a dry run is shown.
  --yes, -y               Skip the interactive confirmation (for --apply).
  --music-root <path>     Share root to reorganise. Default: /volume1/music
  --library-name <name>   Subfolder that becomes the scan root. Default: library
  --incoming-name <name>  Subfolder for unfiled audio. Default: incoming
  --skip <name>           Extra top-level entry to leave in place. Repeatable.
  --list-limit <n>        How many entries to preview in the dry run. Default: 15
  --help, -h              This message.

Always skipped: the library/ and incoming/ folders themselves, "deploy"
(app files do not belong in the library), "@eaDir" and "#recycle" (Synology).

Exit codes: 0 success | 1 error | 2 bad usage | 3 verification mismatch
EOF
}

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
die_usage() { printf 'ERROR: %s\n' "$*" >&2; exit 2; }
warn() { printf 'WARN:  %s\n' "$*" >&2; }
note() { printf '       %s\n' "$*"; }
hr() { printf '%s\n' "────────────────────────────────────────────────────────────"; }

# ---------------------------------------------------------------- arguments
while [ $# -gt 0 ]; do
	case "$1" in
		--apply) APPLY=1; shift ;;
		--yes|-y) ASSUME_YES=1; shift ;;
		--music-root) [ $# -ge 2 ] || die_usage "--music-root needs a value"; MUSIC_ROOT="$2"; shift 2 ;;
		--library-name) [ $# -ge 2 ] || die_usage "--library-name needs a value"; LIBRARY_NAME="$2"; shift 2 ;;
		--incoming-name) [ $# -ge 2 ] || die_usage "--incoming-name needs a value"; INCOMING_NAME="$2"; shift 2 ;;
		--skip) [ $# -ge 2 ] || die_usage "--skip needs a value"; EXTRA_SKIPS+=("$2"); shift 2 ;;
		--list-limit) [ $# -ge 2 ] || die_usage "--list-limit needs a value"; LIST_LIMIT="$2"; shift 2 ;;
		--help|-h) usage; exit 0 ;;
		*) usage >&2; die_usage "unknown option: $1" ;;
	esac
done

SKIP_NAMES=("$LIBRARY_NAME" "$INCOMING_NAME" "deploy" "@eaDir" "#recycle")
if [ "${#EXTRA_SKIPS[@]}" -gt 0 ]; then SKIP_NAMES+=("${EXTRA_SKIPS[@]}"); fi

LIBRARY_DIR="$MUSIC_ROOT/$LIBRARY_NAME"
INCOMING_DIR="$MUSIC_ROOT/$INCOMING_NAME"

# ---------------------------------------------------------------- preflight
[ -d "$MUSIC_ROOT" ] || die "music root does not exist: $MUSIC_ROOT"

is_skip() {
	local needle="$1" s
	for s in "${SKIP_NAMES[@]}"; do
		[ "$needle" = "$s" ] && return 0
	done
	return 1
}

if [ "$APPLY" -eq 1 ]; then
	# Guard 1: never operate on a network mount. This script belongs ON the NAS.
	if mount | grep -qF " on ${MUSIC_ROOT} "; then
		die "$MUSIC_ROOT is a mounted filesystem (not a plain directory).
       Run this ON THE NAS over SSH. Do not run it against a Mac network mount —
       you would get slow per-item round trips and wrong ACLs."
	fi
	# Guard 2: the usual macOS mistake — operating on /Volumes/<share>.
	if [ "$(uname -s)" = "Darwin" ] && case "$MUSIC_ROOT" in /Volumes/*) true ;; *) false ;; esac; then
		die "$MUSIC_ROOT is a macOS network volume. Run this ON THE NAS over SSH."
	fi
	[ -d "$LIBRARY_DIR" ] || [ -w "$MUSIC_ROOT" ] || die "no write permission on $MUSIC_ROOT"
fi

# ---------------------------------------------------------------- plan
all_entries=("$MUSIC_ROOT"/*)
move_list=()
skip_list=()
for path in "${all_entries[@]}"; do
	name="${path##*/}"
	if is_skip "$name"; then
		skip_list+=("$name")
	else
		move_list+=("$path")
	fi
done

dot_entries=()
for path in "$MUSIC_ROOT"/.[!.]*; do
	[ -e "$path" ] && dot_entries+=("${path##*/}")
done

hr
printf 'SynAmp library reorganisation\n'
hr
printf 'music root : %s\n' "$MUSIC_ROOT"
printf 'scan root  : %s\n' "$LIBRARY_DIR"
printf 'incoming   : %s\n' "$INCOMING_DIR"
printf 'mode       : %s\n' "$([ "$APPLY" -eq 1 ] && echo 'APPLY (files will move)' || echo 'DRY RUN (nothing changes)')"
hr
printf 'top-level entries : %s\n' "${#all_entries[@]}"
printf 'will move         : %s\n' "${#move_list[@]}"
printf 'will skip         : %s' "${#skip_list[@]}"
if [ "${#skip_list[@]}" -gt 0 ]; then printf '  (%s)' "$(printf '%s, ' "${skip_list[@]}" | sed 's/, $//')"; fi
printf '\n'

if [ "${#dot_entries[@]}" -gt 0 ]; then
	printf 'dot-entries       : %s  (%s)\n' "${#dot_entries[@]}" "$(printf '%s, ' "${dot_entries[@]}" | sed 's/, $//')"
	note "these stay at the root; they are macOS/Synology junk, not music"
fi
hr

if [ "${#move_list[@]}" -gt 0 ]; then
	printf 'First %s that would move:\n' "$LIST_LIMIT"
	count=0
	for path in "${move_list[@]}"; do
		printf '  %s\n' "${path##*/}"
		count=$((count + 1))
		[ "$count" -ge "$LIST_LIMIT" ] && break
	done
	if [ "${#move_list[@]}" -gt "$LIST_LIMIT" ]; then
		printf '  … and %s more\n' "$((${#move_list[@]} - LIST_LIMIT))"
	fi
fi

if [ "$APPLY" -eq 0 ]; then
	hr
	printf 'DRY RUN — nothing has changed.\n'
	note "Take a Btrfs snapshot (Snapshot & Replication) before applying."
	note "Then re-run with --apply"
	exit 0
fi

# ---------------------------------------------------------------- confirm
if [ "${#move_list[@]}" -eq 0 ]; then
	hr
	printf 'Nothing to move — the share is already organised.\n'
	exit 0
fi

if [ "$ASSUME_YES" -ne 1 ] && [ -t 0 ]; then
	hr
	printf 'This will move %s folders into %s\n' "${#move_list[@]}" "$LIBRARY_DIR"
	printf 'Type MOVE to proceed: '
	read -r answer
	[ "$answer" = "MOVE" ] || die "aborted at confirmation"
fi

# ---------------------------------------------------------------- apply
mkdir -p "$LIBRARY_DIR" "$INCOMING_DIR"

library_before=("$LIBRARY_DIR"/*)
moved=0
collisions=()
failures=()

for path in "${move_list[@]}"; do
	name="${path##*/}"
	dest="$LIBRARY_DIR/$name"
	if [ -e "$dest" ]; then
		collisions+=("$name")
		continue
	fi
	if mv -- "$path" "$LIBRARY_DIR/"; then
		moved=$((moved + 1))
	else
		failures+=("$name")
		warn "could not move: $name"
	fi
done

# ---------------------------------------------------------------- verify
remaining=()
for path in "$MUSIC_ROOT"/*; do
	remaining+=("${path##*/}")
done

expected_remaining=()
for s in "${SKIP_NAMES[@]}"; do
	[ -e "$MUSIC_ROOT/$s" ] && expected_remaining+=("$s")
done

library_after=("$LIBRARY_DIR"/*)
expected_library_count=$((${#library_before[@]} + moved))

hr
printf 'Result\n'
hr
printf 'moved            : %s\n' "$moved"
printf 'collisions       : %s' "${#collisions[@]}"
if [ "${#collisions[@]}" -gt 0 ]; then printf '  (%s)' "$(printf '%s, ' "${collisions[@]}" | sed 's/, $//')"; fi
printf '\n'
printf 'failures         : %s\n' "${#failures[@]}"
printf 'library now holds: %s  (expected %s)\n' "${#library_after[@]}" "$expected_library_count"
printf 'root still holds : %s  (expected %s)' "${#remaining[@]}" "${#expected_remaining[@]}"
if [ "${#remaining[@]}" -gt 0 ]; then printf '  (%s)' "$(printf '%s, ' "${remaining[@]}" | sed 's/, $//')"; fi
printf '\n'
hr

status=0

if [ "${#library_after[@]}" -ne "$expected_library_count" ]; then
	warn "library count mismatch — investigate before scanning"
	status=3
fi

if [ "${#remaining[@]}" -ne "${#expected_remaining[@]}" ]; then
	warn "unexpected entries remain at the share root"
	status=3
fi

if [ "${#collisions[@]}" -gt 0 ]; then
	warn "collisions were skipped — those items are still at the root"
	status=3
fi

if [ "${#failures[@]}" -gt 0 ]; then
	warn "some moves failed"
	status=3
fi

if [ "$status" -eq 0 ]; then
	printf 'OK — move complete and verified.\n'
	note "next: point Navidrome at $LIBRARY_DIR (MUSIC_PATH in deploy/.env)"
	note "and move 'deploy' out of the music share entirely:"
	note "  mv $MUSIC_ROOT/deploy /volume1/synamp/deploy"
else
	printf 'COMPLETED WITH WARNINGS — review the lines above.\n'
fi

exit "$status"
