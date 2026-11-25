import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import fc from 'fast-check';
import { match, parsePool, type PublicPool } from '../src/index.ts';
import { WEIGHTS } from '../src/match.ts';
import { adopt, approveProposal, proposeRules, recallAt, type EvalCase } from '../src/loop.ts';

const now = new Date('2026-11-19T20:00:00Z');
const pool: PublicPool = parsePool(JSON.parse(readFileSync(new URL('../fixtures/pool.sample.json', import.meta.url), 'utf8')))._unsafeUnwrap();
const PROFILES = [
  { description: 'Senior full-stack engineer, TypeScript and React, 8 years', goal: 'agentic AI products', likes: 'Delphin Marine' },
  { description: 'Staff backend engineer with Go and Postgres, distributed systems', goal: 'AI infrastructure' },
  { description: 'Senior platform engineer, Kubernetes and cloud infrastructure' },
];
const RESULTS = ['rejected', 'interview', 'no-reply'] as const;
const caseArb: fc.Arbitrary<EvalCase> = fc.record({ p: fc.constantFrom(...PROFILES), ids: fc.subarray(pool.rows.map(r => r.id), { maxLength: 6 }), r: fc.constantFrom(...RESULTS) })
  .map(({ p, ids, r }) => ({ profile: p, applied: ids.map(postingId => ({ postingId, result: r })) }));

test('default weights reproduce the frozen output byte for byte', () => {
  for (const p of PROFILES) assert.equal(JSON.stringify(match(p, pool, { now })), JSON.stringify(match(p, pool, { now, weights: { ...WEIGHTS } })));
});

test('propose-only: proposals never change the live weights, each one raises recall without losing a found posting, and adoption needs the owner', () => {
  fc.assert(fc.property(fc.array(caseArb, { minLength: 1, maxLength: 3 }), cases => {
    const snapshot = JSON.stringify(WEIGHTS);
    const proposals = proposeRules(cases, pool, now);
    if (JSON.stringify(WEIGHTS) !== snapshot || !Object.isFrozen(WEIGHTS)) return false;
    return proposals.every(p => {
      const next = adopt(WEIGHTS, approveProposal(p, '2026-11-20T22:00:00Z'));
      const again = recallAt(cases, pool, next, now);
      return p.evalAfter.hits > p.evalBefore.hits && p.lost.length === 0 && again.hits === p.evalAfter.hits && next[p.weight] === p.to && WEIGHTS[p.weight] === p.from;
    });
  }), { numRuns: 60, seed: 20261120 });
});

test('a rejection counts as relevant: recall treats rejected, interview and no-reply the same', () => {
  const ids = pool.rows.slice(0, 5).map(r => r.id);
  const as = (result: 'rejected' | 'interview' | 'no-reply'): EvalCase[] => [{ profile: PROFILES[0]!, applied: ids.map(postingId => ({ postingId, result })) }];
  const hits = RESULTS.map(r => recallAt(as(r), pool, WEIGHTS, now).hits);
  assert.ok(hits.every(h => h === hits[0]));
});

test('adopting a stale proposal is a no-op', () => {
  const p = { weight: 'liked' as const, from: 999, to: 5, evalBefore: { hits: 0, total: 1, found: [] }, evalAfter: { hits: 1, total: 1, found: ['x'] }, gained: ['x'], lost: [] };
  assert.equal(adopt(WEIGHTS, approveProposal(p, 'now')), WEIGHTS);
});
