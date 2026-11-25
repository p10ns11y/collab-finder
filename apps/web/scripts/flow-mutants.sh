#!/usr/bin/env bash
set -uo pipefail
cd "$(dirname "$0")/.."
out="${1:-/tmp/flow-mutants}"
mkdir -p "$out"
cp src/flow.ts "$out/flow.ts.orig"
cp src/App.tsx "$out/App.tsx.orig"
restore() { cp "$out/flow.ts.orig" src/flow.ts; cp "$out/App.tsx.orig" src/App.tsx; }
trap restore EXIT
mutants=(
  "CANCEL->find|src/flow.ts|s/CANCEL: 'matched'/CANCEL: 'find'/"
  "PACK skips REQUEST_CONFIRM|src/flow.ts|s/PACK: 'pack'/PACK: 'confirmed'/"
  "MATCH_FAILED->matched|src/flow.ts|s/MATCH_FAILED: 'find'/MATCH_FAILED: 'matched'/g"
  "RETRY dropped|src/flow.ts|s/failed: { RETRY: 'loading' }/failed: {}/"
  "CANCEL->confirmed|src/flow.ts|s/CANCEL: 'matched'/CANCEL: 'confirmed'/"
  "EDIT keeps results|src/flow.ts|s/view: { kind: 'idle' }, outline: null, pack: null };/view: s.view, outline: null, pack: null };/"
  "TAILOR keeps the old pack|src/flow.ts|s/outline: e.outline, pack: null/outline: e.outline/"
  "CONFIRM drops the pack|src/flow.ts|s/pack: s.ask?.pack ?? null, ask: null/ask: null/"
  "own1 CONFIRM shows the shown pack|src/flow.ts|s/pack: s.ask?.pack ?? null, ask: null/pack: s.pack ?? s.ask?.pack ?? null, ask: null/"
  "(a) second ask keeps first content|src/flow.ts|s/case 'REQUEST_CONFIRM': return { ...n, ask: e.ask };/case 'REQUEST_CONFIRM': return { ...n, ask: s.ask ? { ...s.ask, id: e.ask.id } : e.ask };/"
  "own2 App keeps first ask content|src/App.tsx|s/ask: { ...ask, id: confirmId.current += 1 }/ask: { ...(snapRef.current?.ask ?? ask), id: confirmId.current += 1 }/"
)
printf 'mutant\tunit_failed\tunit_total\te2e_failed\te2e_total\n' > "$out/table.tsv"
for m in "${mutants[@]}"; do
  IFS='|' read -r name file expr <<< "$m"
  restore
  sed -i "$expr" "$file"
  if cmp -s "$file" "$out/$(basename "$file").orig"; then echo "mutant $name did not change $file" >&2; exit 2; fi
  slug=$(echo "$name" | tr -c 'A-Za-z0-9' '-')
  node --test check/flow.test.ts > "$out/$slug-unit.log" 2>&1
  uf=$(sed -n 's/^ℹ fail //p' "$out/$slug-unit.log"); ut=$(sed -n 's/^ℹ tests //p' "$out/$slug-unit.log")
  npx vite build > "$out/$slug-build.log" 2>&1 || { echo "build failed for $name" >&2; exit 2; }
  PLAYWRIGHT_JSON_OUTPUT_NAME="$out/$slug-e2e.json" npx playwright test tests/flow.spec.ts --project chromium --workers=1 --timeout=15000 --reporter=json > /dev/null 2>&1
  read -r ef et < <(node -e "const s=require(process.argv[1]).stats; console.log(s.unexpected+s.flaky, s.expected+s.unexpected+s.flaky)" "$out/$slug-e2e.json")
  if [ "${et:-0}" -eq 0 ]; then echo "no e2e tests ran for $name" >&2; exit 2; fi
  printf '%s\t%s\t%s\t%s\t%s\n' "$name" "$uf" "$ut" "$ef" "$et" >> "$out/table.tsv"
done
restore
npx vite build > "$out/restored-build.log" 2>&1
cat "$out/table.tsv"
