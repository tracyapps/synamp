#!/bin/sh
# Build SynAmp's two images for a release, push them, and make the download.
#
#   tools/release/publish.sh <registry/owner> <version> [output folder]
#   e.g. tools/release/publish.sh ghcr.io/tracyapps 0.1.0 dist/release
#
# Used by .github/workflows/release.yml, and by hand against a private test
# registry to rehearse an install, update and roll back. Needs Docker, a login
# to the registry, Node 22+ and zip, and Docker Buildx able to build for both
# chips (on GitHub: QEMU, set up in release.yml).
#
# Each image is one name for two chips: Intel/AMD (linux/amd64) and ARM
# (linux/arm64). The server pulls the one that matches it. SYNAMP_PLATFORMS
# narrows that for a rehearsal (e.g. linux/amd64 only).
set -eu
registry=${1:?registry/owner, e.g. ghcr.io/tracyapps}
version=${2:?version, e.g. 0.1.0}
out=${3:-dist/release}
version=${version#v}
case "$version" in
  [0-9]*.[0-9]*.[0-9]*) ;;
  *) echo "Version must look like 1.2.3 (or v1.2.3)"; exit 2 ;;
esac
root=$(cd "$(dirname "$0")/../.." && pwd)
source_url=https://github.com/tracyapps/synamp

platforms=${SYNAMP_PLATFORMS:-linux/amd64,linux/arm64}

build_push() { # name, context, dockerfile, extra build args...
  name=$1; context=$2; dockerfile=$3; shift 3
  tag="$registry/synamp-$name:$version"
  meta=$(mktemp)
  # SYNAMP_BUILD_FLAGS: extra build flags for a rehearsal machine (unused on GitHub).
  # shellcheck disable=SC2086
  docker buildx build --platform "$platforms" --push --metadata-file "$meta" ${SYNAMP_BUILD_FLAGS:-} "$@" \
    --label "org.opencontainers.image.source=$source_url" \
    --label "org.opencontainers.image.version=$version" \
    -f "$dockerfile" -t "$tag" "$context" >&2
  # The digest of the two-chip list the registry stored, so installs pull exactly it.
  digest=$(node -e 'const m=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));process.stdout.write(m["containerimage.digest"]||"")' "$meta")
  rm -f "$meta"
  case "$digest" in sha256:*) ;; *) echo "No registry digest for $tag" >&2; exit 1 ;; esac
  echo "$tag@$digest"
}

brain=$(build_push brain "$root/apps" "$root/apps/brain/Dockerfile" --build-arg "SYNAMP_VERSION=$version")
web=$(build_push web "$root/apps/web" "$root/apps/web/Dockerfile")
node "$root/tools/release/bundle.mjs" --version "$version" --brain "$brain" --web "$web" --out "$out"
echo "brain $brain"
echo "web   $web"
