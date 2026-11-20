import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fc from 'fast-check';
import { MAX_SOURCE_DROP, refreshOnce, type SourceRun, type SwapStore } from '../src/refresh.ts';
import { fileSwapStore } from '../src/refresh-file.ts';
import type { Source } from '../src/errors.ts';
import type { PublicPool, PublicRow } from '../src/schema.ts';

const SOURCES: ReadonlyArray<Source> = ['ashby', 'greenhouse', 'lever'];
const row = (source: Source, n: number, status: PublicRow['status'] = 'open'): PublicRow => ({ id: `${source}:${n}`, source, company: `co-${n % 5}`, title: 'Senior Backend Engineer',
  url: `https://jobs.example.com/${source}/${n}`, location: null, remote: 'remote', region: 'SE', role_tags: [], seniority: 'senior', posted_at: null, status, status_checked_at: '2026-11-20T06:00:00Z' });
const poolOf = (version: string, counts: Readonly<Record<string, number>>): PublicPool => ({ version, checkedRange: { from: '2026-11-20', to: '2026-11-20' },
  rows: SOURCES.flatMap(s => Array.from({ length: counts[s] ?? 0 }, (_, i) => row(s, i))) });
const memStore = (p: PublicPool) => { let cur = p; const s: SwapStore = { read: async () => cur, swap: async n => { cur = n; } }; return { s, get: () => cur }; };

test('swap on pass: the live pool changes only when every source ran, no source dropped past the limit and the eval did not regress', async () => {
  const counts = fc.record(Object.fromEntries(SOURCES.map(s => [s, fc.integer({ min: 0, max: 30 })])) as Record<Source, fc.Arbitrary<number>>);
  await fc.assert(fc.asyncProperty(counts, counts, fc.subarray([...SOURCES]), fc.integer({ min: -2, max: 2 }), async (a, b, failing, evalDelta) => {
    const before = poolOf('v-before', a);
    const after = poolOf('v-after', b);
    const runs: SourceRun[] = SOURCES.map(source => ({ source, ok: !failing.includes(source) }));
    const store = memStore(before);
    const out = await refreshOnce(store.s, { pool: after, runs }, async p => (p === before ? 10 : 10 + evalDelta));
    const dropped = SOURCES.some(s => (a[s] ?? 0) > 0 && ((a[s] ?? 0) - (b[s] ?? 0)) / (a[s] ?? 1) > MAX_SOURCE_DROP);
    const shouldSwap = failing.length === 0 && !dropped && evalDelta >= 0;
    return out.swapped === shouldSwap && store.get().version === (shouldSwap ? 'v-after' : 'v-before');
  }), { numRuns: 400, seed: 20261120 });
});

test('a candidate with a personal key never swaps in, whatever the runs say', async () => {
  const before = poolOf('v1', { ashby: 3 });
  const leaky = { ...poolOf('v2', { ashby: 3 }), rows: poolOf('v2', { ashby: 3 }).rows.map(r => ({ ...r, prior_application: true })) };
  const store = memStore(before);
  const out = await refreshOnce(store.s, { pool: leaky, runs: [{ source: 'ashby', ok: true }] }, async () => 1);
  assert.ok(!out.swapped && out.error.kind === 'PersonalFieldLeak');
  assert.equal(store.get(), before);
});

test('file store: a crash after writing the candidate but before the rename leaves the old pool live and readable', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'kanithanj-refresh-'));
  const path = join(dir, 'pool.json');
  const before = poolOf('v-old', { ashby: 4, greenhouse: 4 });
  writeFileSync(path, JSON.stringify(before));
  const crashing = fileSwapStore(path, async () => { throw new Error('killed'); });
  await assert.rejects(refreshOnce(crashing, { pool: poolOf('v-new', { ashby: 4, greenhouse: 4 }), runs: [{ source: 'ashby', ok: true }, { source: 'greenhouse', ok: true }] }, async () => 1));
  assert.equal((JSON.parse(readFileSync(path, 'utf8')) as PublicPool).version, 'v-old');
  const ok = fileSwapStore(path);
  const out = await refreshOnce(ok, { pool: poolOf('v-new', { ashby: 4, greenhouse: 4 }), runs: [{ source: 'ashby', ok: true }, { source: 'greenhouse', ok: true }] }, async () => 1);
  assert.deepEqual(out, { swapped: true, version: 'v-new' });
  assert.equal((await ok.read()).version, 'v-new');
});
