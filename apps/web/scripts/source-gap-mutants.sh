#!/usr/bin/env bash
set -uo pipefail
cd "$(dirname "$0")/.."
out="${1:-/tmp/source-gap-mutants}"
mkdir -p "$out"
files=(../../packages/core/src/source-gaps.ts src/source-gaps.tsx src/webmcp.ts)
for f in "${files[@]}"; do cp "$f" "$out/$(basename "$f").orig"; done
restore() { for f in "${files[@]}"; do cp "$out/$(basename "$f").orig" "$f"; done; }
trap restore EXIT
mutants=(
  "guidance only on zero results|../../packages/core/src/source-gaps.ts|s/if (found >= THIN) return null;/if (found > 0) return null;/"
  "panel ignores the flow state|src/source-gaps.tsx|s/view.kind === 'results' || view.kind === 'zeroResults' ?/true ?/"
  "find_roles drops the guidance|src/webmcp.ts|s/const gap = last \&\& /const gap = null \&\& /")
printf 'mutant\tunit_failed\tunit_total\te2e_failed\te2e_total\n' > "$out/table.tsv"
for m in "${mutants[@]}"; do
  IFS='|' read -r name file expr <<< "$m"
  restore
  sed -i "$expr" "$file"
  if cmp -s "$file" "$out/$(basename "$file").orig"; then echo "mutant $name did not change $file" >&2; exit 2; fi
  slug=$(echo "$name" | tr -c 'A-Za-z0-9' '-')
  node --test ../../packages/core/test/source-gaps.test.ts check/page-tools.test.ts > "$out/$slug-unit.log" 2>&1
  uf=$(sed -n 's/^ℹ fail //p' "$out/$slug-unit.log"); ut=$(sed -n 's/^ℹ tests //p' "$out/$slug-unit.log")
  npx vite build > "$out/$slug-build.log" 2>&1 || { echo "build failed for $name" >&2; exit 2; }
  PLAYWRIGHT_JSON_OUTPUT_NAME="$out/$slug-e2e.json" npx playwright test ${PW_CONFIG:+-c "$PW_CONFIG"} tests/web.spec.ts -g "source gaps:" --project chromium --workers=1 --timeout=15000 --reporter=json > /dev/null 2>&1
  read -r ef et < <(node -e "const s=require(process.argv[1]).stats; console.log(s.unexpected+s.flaky, s.expected+s.unexpected+s.flaky)" "$out/$slug-e2e.json")
  if [ "${et:-0}" -eq 0 ]; then echo "no e2e tests ran for $name" >&2; exit 2; fi
  printf '%s\t%s\t%s\t%s\t%s\n' "$name" "$uf" "$ut" "$ef" "$et" >> "$out/table.tsv"
done
restore
npx vite build > "$out/restored-build.log" 2>&1
cat "$out/table.tsv"
