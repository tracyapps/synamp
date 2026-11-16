#!/bin/sh
# The app's build number: one whole number that only ever goes up, so the
# updater can tell any build from an older one. (The updater ignores everything
# after a dash in a version, so "0.3.0-test.1" and "0.3.0-test.2" look the same
# to it; the build number is what it compares.)
#
# It is the time of the commit being built, in UTC: 202611161805. Both chips of
# one release get the same number. BUILD_NUMBER overrides it.
set -eu
if [ -n "${BUILD_NUMBER:-}" ]; then echo "$BUILD_NUMBER"; exit 0; fi
here=$(cd "$(dirname "$0")/.." && pwd)
TZ=UTC git -C "$here" log -1 --format=%cd --date=format-local:%Y%m%d%H%M
