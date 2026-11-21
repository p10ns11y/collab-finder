import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MAX_SOURCE_DROP } from '../src/refresh.ts';

const here = (p: string) => new URL(p, import.meta.url);
const ledgerSrc = readFileSync(here('../src/ledger.ts'), 'utf8');
const applySpec = readFileSync(here('../../../spec/tla/ApplyLedger.tla'), 'utf8');
const refreshSpec = readFileSync(here('../../../spec/tla/RefreshSwap.tla'), 'utf8');
const refreshSrc = readFileSync(here('../src/refresh.ts'), 'utf8');

const TO_TLA: Record<string, string> = {
  none: 'none',
  drafted: 'drafted',
  filled: 'filled',
  'awaiting-submit': 'awaiting',
  submitting: 'submitting',
  'needs-check': 'needsCheck',
  submitted: 'submitted',
  rejected: 'rejected',
  interview: 'interview',
};
const FROM_TLA = Object.fromEntries(Object.entries(TO_TLA).map(([ts, tla]) => [tla, ts]));

const listed = (spec: string, name: string): string[] => {
  const body = new RegExp(name + ' == \{([^}]+)\}').exec(spec)?.[1] ?? '';
  return body.split(',').map(s => s.trim().replace(/"/g, '')).filter(Boolean).sort();
};

const parseNext = (src: string): Record<string, string[]> => {
  const block = /const NEXT(?::[^=]+)? = \{([\s\S]*?)\n\};/.exec(src)?.[1] ?? '';
  const out: Record<string, string[]> = {};
  for (const m of block.matchAll(/(?:'([^']+)'|([A-Za-z0-9-]+))\s*:\s*\[([^\]]*)\]/g)) {
    const key = m[1] ?? m[2];
    assert.ok(key);
    out[key] = [...m[3]!.matchAll(/'([^']+)'/g)].map(x => x[1]!);
  }
  return out;
};

test('LedgerState and NEXT match ApplyLedger.tla States and Write transitions', () => {
  const next = parseNext(ledgerSrc);
  const tsStates = Object.keys(next).sort();
  const tlaStates = listed(applySpec, 'States');
  assert.deepEqual(tsStates, Object.keys(TO_TLA).sort());
  assert.deepEqual(tlaStates, tsStates.map(s => TO_TLA[s]).sort());
  const writes = [...applySpec.matchAll(/Write\([^,]+,\s*"([^"]+)",\s*"([^"]+)"\)/g)].map(m => [m[1]!, m[2]!] as [string, string]);
  assert.ok(writes.length >= tsStates.length - 1);
  const fromTla = new Map<string, string[]>();
  for (const [from, to] of writes) {
    const list = fromTla.get(from) ?? [];
    if (!list.includes(to)) list.push(to);
    fromTla.set(from, list);
  }
  for (const [from, tos] of Object.entries(next)) {
    const got = (fromTla.get(TO_TLA[from]!) ?? []).map(s => FROM_TLA[s]).sort();
    assert.deepEqual(got, [...tos].sort(), from);
  }
  for (const [from, tos] of fromTla) {
    const tsFrom = FROM_TLA[from];
    assert.ok(tsFrom, from);
    assert.deepEqual([...tos].map(s => FROM_TLA[s]).sort(), [...next[tsFrom]!].sort(), from);
  }
});

test('RefreshSwap.tla names the decideRefreshSwap PartialRefresh, MAX_SOURCE_DROP and EvalRegressed gates', () => {
  assert.equal(MAX_SOURCE_DROP, 0.3);
  assert.match(refreshSrc, /kind: 'PartialRefresh'/);
  assert.match(refreshSrc, /kind: 'EvalRegressed'/);
  assert.match(refreshSrc, /export const MAX_SOURCE_DROP/);
  assert.match(refreshSpec, /^MAX_SOURCE_DROP ==/m);
  assert.match(refreshSpec, /^PartialRefresh ==/m);
  assert.match(refreshSpec, /^EvalRegressed ==/m);
  assert.match(refreshSpec, /PartialRefresh ==[\s\S]*failed/);
  assert.match(refreshSpec, /PartialRefresh ==[\s\S]*countDrop/);
  assert.match(refreshSpec, /EvalRegressed ==[\s\S]*regressed/);
});
