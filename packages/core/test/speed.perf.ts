import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { match, parsePool, type MatchProfile } from '../src/index.ts';

const pool = parsePool(JSON.parse(readFileSync(new URL('../fixtures/pool.sample.json', import.meta.url), 'utf8')))._unsafeUnwrap();
const now = new Date('2026-11-19T20:00:00Z');
const profile: MatchProfile = { description: 'Senior full-stack engineer, TypeScript and React, 8 years', goal: 'agentic AI products', region: 'SE' };
const COPIES = 100;
const RUNS = 5;
const BUDGET_MS = 400;

const counted = (p: typeof pool) => {
  const t = match(profile, p, { now })._unsafeUnwrap().totals;
  return t.fitsNow + t.stepTowardGoal + t.stretch;
};

const visitedRows = (p: typeof pool) => {
  const seen = new Set<string>();
  const rows = p.rows.map(r => new Proxy(r, { get: (o, k) => { if (k !== 'id') seen.add(o.id); return Reflect.get(o, k); } }));
  counted({ ...p, rows });
  return seen.size;
};

const cpuMs = (f: () => void) => {
  const c0 = process.cpuUsage();
  f();
  const c = process.cpuUsage(c0);
  return (c.user + c.system) / 1000;
};

test('speed: a 30,000-row pool matches within budget once corpus stats are cached', () => {
  const rows = Array.from({ length: COPIES }, (_, k) => pool.rows.map(r => ({ ...r, id: `${r.id}#${k}` }))).flat();
  const big = { ...pool, rows };
  assert.equal(rows.length, 30_000);
  assert.equal(visitedRows(big), rows.length);
  const expected = counted(big);
  assert.ok(expected > 0);
  const runs = Array.from({ length: RUNS }, () => {
    let n = 0;
    const ms = cpuMs(() => { n = counted(big); });
    assert.equal(n, expected);
    return ms;
  });
  const best = Math.min(...runs);
  assert.ok(best < BUDGET_MS, `best ${Math.round(best)} ms cpu of ${runs.map(Math.round).join(', ')}`);
});
