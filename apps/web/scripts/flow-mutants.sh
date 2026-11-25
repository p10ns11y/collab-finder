#!/usr/bin/env bash
set -uo pipefail
cd "$(dirname "$0")/.."
out="${1:-/tmp/flow-mutants}"
mkdir -p "$out"
cp src/flow.ts "$out/flow.ts.orig"
restore() { cp "$out/flow.ts.orig" src/flow.ts; }
trap restore EXIT
mutants=(
  "CANCEL->find|s/CANCEL: 'matched'/CANCEL: 'find'/"
  "PACK skips REQUEST_CONFIRM|s/PACK: 'pack'/PACK: 'confirmed'/"
  "MATCH_FAILED->matched|s/MATCH_FAILED: 'find'/MATCH_FAILED: 'matched'/g"
  "RETRY dropped|s/failed: { RETRY: 'loading' }/failed: {}/"
  "CANCEL->confirmed|s/CANCEL: 'matched'/CANCEL: 'confirmed'/"
)
printf 'mutant\tunit_failed\tunit_total\te2e_failed\te2e_total\n' > "$out/table.tsv"
for m in "${mutants[@]}"; do
  name="${m%%|*}"; expr="${m#*|}"
  restore
  sed -i "$expr" src/flow.ts
  if cmp -s src/flow.ts "$out/flow.ts.orig"; then echo "mutant $name did not change flow.ts" >&2; exit 2; fi
  slug=$(echo "$name" | tr -c 'A-Za-z0-9' '-')
  node --test check/flow.test.ts > "$out/$slug-unit.log" 2>&1
  uf=$(sed -n 's/^ℹ fail //p' "$out/$slug-unit.log"); ut=$(sed -n 's/^ℹ tests //p' "$out/$slug-unit.log")
  npx vite build > "$out/$slug-build.log" 2>&1 || { echo "build failed for $name" >&2; exit 2; }
  npx playwright test tests/flow.spec.ts --project chromium --workers=1 -g "flow path" --reporter=line > "$out/$slug-e2e.log" 2>&1
  ef=$(grep -oE '[0-9]+ failed' "$out/$slug-e2e.log" | tail -1 | awk '{print $1+0}'); et=$(grep -oE '[0-9]+ (passed|failed)' "$out/$slug-e2e.log" | tail -2 | awk '{s+=$1} END {print s}')
  printf '%s\t%s\t%s\t%s\t%s\n' "$name" "$uf" "$ut" "$ef" "$et" >> "$out/table.tsv"
done
restore
npx vite build > "$out/restored-build.log" 2>&1
cat "$out/table.tsv"
