#!/usr/bin/env bash
# C1 reproduction script — mandatory checks + adversarial probes (read-only wrt the repo).
# Usage: bash runall.sh   (logs written to ./verification and ./probes)
set -u
REPO=/Users/tapps/_dev/web-apps/SynAmp
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
V="$HERE/verification"; P="$HERE/probes"
mkdir -p "$V"

echo "== 1) brain test suite =="
cd "$REPO"
pnpm --filter @synamp/brain test > "$V/rerun-brain-test.log" 2>&1
echo "exit=$? (expect 1: the one pre-existing macOS librarian case-fold fail)"
grep -E "^. (tests|pass|fail|skipped)" "$V/rerun-brain-test.log"

echo "== 2) type-checks =="
pnpm --filter @synamp/brain type-check > "$V/rerun-tc-brain.log" 2>&1; echo "brain type-check exit=$? (expect 0)"
pnpm --filter @synamp/web  type-check > "$V/rerun-tc-web.log"  2>&1; echo "web type-check exit=$? (expect 0)"

echo "== 3) brain-lab =="
node --experimental-strip-types tools/brain-lab/lab.mts > "$V/rerun-lab.log" 2>&1; echo "lab exit=$? (expect 0)"
grep -E "checks:|SUMMARY|RESULT" "$V/rerun-lab.log"

echo "== 4) adversarial probes =="
cd "$P"
for probe in p1-isolation-boundaries.mts p2-bounds-hides-reset.mts p3-sequence-hash.mts p4-numbers-a3.mts p5-wave-integration.mts; do
  node --experimental-strip-types "$probe" 2>&1 | tee "../$(basename "$probe" .mts).rerun.log"
  echo "  ^ $probe exit=$?"
done
echo "NOTE: p3 contains one deliberate FAIL documenting the wave-arc defect (see C1-code-review.md)."
