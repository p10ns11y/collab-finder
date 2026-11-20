import { test } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { applyRun, approveBatch, nextEntry, stateOf, type ApprovedBatch, type FormDriver, type Ledger, type LedgerEntry, type LedgerStore } from '../src/ledger.ts';

class Crash extends Error {}
const world = (crashAt: ReadonlySet<number>) => {
  const ledger: LedgerEntry[] = [];
  const submits: string[] = [];
  const fills: string[] = [];
  let tick = 0;
  const maybeCrash = () => { tick += 1; if (crashAt.has(tick)) throw new Crash(`crash at ${tick}`); };
  const store: LedgerStore = { read: async () => [...ledger], append: async e => { maybeCrash(); ledger.push(e); } };
  const driver: FormDriver = {
    fill: async id => { maybeCrash(); fills.push(id); },
    submit: async (id, batch) => { maybeCrash(); if (!batch.postingIds.has(id)) throw new Error('driver saw an unapproved submit'); submits.push(id); maybeCrash(); },
  };
  return { ledger, submits, fills, store, driver };
};
const clock = () => '2026-11-20T21:00:00Z';
const IDS = ['ashby:a1', 'greenhouse:2671957', 'lever:l9', 'ashby:b2', 'greenhouse:3700071'];

test('resume after a crash anywhere: no duplicate ledger entry, at most one submit per posting, only approved postings submitted', async () => {
  await fc.assert(fc.asyncProperty(fc.subarray(IDS, { minLength: 1 }), fc.subarray(IDS), fc.uniqueArray(fc.integer({ min: 1, max: 40 }), { maxLength: 6 }), async (ids, approvedIds, crashes) => {
    const w = world(new Set(crashes));
    const batch = approvedIds.length ? approveBatch('batch-1', approvedIds, clock()) : undefined;
    let crashed = 0;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try { await applyRun(ids, w.store, w.driver, clock, batch); break; } catch (e) { if (!(e instanceof Crash)) throw e; crashed += 1; }
    }
    const keys = w.ledger.map(e => e.key);
    if (new Set(keys).size !== keys.length) return false;
    if (new Set(w.submits).size !== w.submits.length) return false;
    if (w.submits.some(id => !batch?.postingIds.has(id))) return false;
    return ids.every(id => {
      const s = stateOf(w.ledger, id);
      if (!batch?.postingIds.has(id)) return s === 'awaiting-submit';
      if (s === 'submitted') return w.submits.includes(id);
      return s === 'needs-check' && crashed > 0;
    });
  }), { numRuns: 500, seed: 20261120 });
});

test('without an approved batch the run stops every posting at awaiting-submit and never submits', async () => {
  const w = world(new Set());
  const out = await applyRun(IDS, w.store, w.driver, clock);
  assert.deepEqual(out.map(o => o.state), IDS.map(() => 'awaiting-submit'));
  assert.deepEqual(w.submits, []);
  const again = await applyRun(IDS, w.store, w.driver, clock);
  assert.deepEqual(again.map(o => o.state), IDS.map(() => 'awaiting-submit'));
  assert.equal(w.fills.length, IDS.length);
});

test('a submitting intent left by a crash goes to needs-check and is never resubmitted by a rerun', async () => {
  const w = world(new Set());
  const batch = approveBatch('b', ['ashby:a1'], clock());
  for (const s of ['drafted', 'filled', 'awaiting-submit', 'submitting'] as const) w.ledger.push(nextEntry(w.ledger, 'ashby:a1', s, clock(), batch)._unsafeUnwrap()!);
  await applyRun(['ashby:a1'], w.store, w.driver, clock, batch);
  await applyRun(['ashby:a1'], w.store, w.driver, clock, batch);
  assert.equal(stateOf(w.ledger, 'ashby:a1'), 'needs-check');
  assert.deepEqual(w.submits, []);
});

test('transitions: submitting needs the posting in an approved batch; skipping states is refused', () => {
  const l: Ledger = [];
  const other: ApprovedBatch = approveBatch('x', ['lever:l9'], clock());
  assert.equal(nextEntry(l, 'ashby:a1', 'submitted', clock()).isErr(), true);
  const at = (s: Ledger, st: Parameters<typeof nextEntry>[2]) => [...s, nextEntry(s, 'ashby:a1', st, clock())._unsafeUnwrap()!];
  const ready = at(at(at(l, 'drafted'), 'filled'), 'awaiting-submit');
  const r = nextEntry(ready, 'ashby:a1', 'submitting', clock(), other);
  assert.ok(r.isErr() && r.error.kind === 'NotInApprovedBatch');
  assert.ok(nextEntry(ready, 'ashby:a1', 'submitting', clock()).isErr());
  assert.ok(nextEntry(ready, 'ashby:a1', 'awaiting-submit', clock())._unsafeUnwrap() === null);
});
