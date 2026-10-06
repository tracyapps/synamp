#!/usr/bin/env bash
# Vercel's "Ignored Build Step": exit 0 = skip this build, exit 1 = build.
#
# Build unless we're sure nothing in site/ changed since the last deployment
# that actually went out. Vercel gives us that commit as VERCEL_GIT_PREVIOUS_SHA.
# No previous deployment, a manual redeploy, or a commit git can't find
# (Vercel only fetches recent history) → build, to be safe.

if [ -z "$VERCEL_GIT_PREVIOUS_SHA" ]; then
  echo "No earlier deployment to compare with: building."
  exit 1
fi

if ! git cat-file -e "$VERCEL_GIT_PREVIOUS_SHA^{commit}" 2>/dev/null; then
  echo "Last deployed commit isn't in this checkout: building."
  exit 1
fi

if git diff --quiet "$VERCEL_GIT_PREVIOUS_SHA" HEAD -- .; then
  echo "Nothing in site/ changed since the last deployment: skipping."
  exit 0
fi

echo "site/ changed: building."
exit 1
