import { test } from 'node:test';import { test } from 'node:test';
import assert from 'node:assert/strict';import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { match, parsePool, redactPii, findPii, type MatchProfile, type PublicPool } from '../src/index.ts';import { match, parsePool, redactPii, findPii, type MatchProfile, type PublicPool } from '../src/index.ts';
import { ABUSE_INPUTS } from './abuse.ts';import { ABUSE_INPUTS } from './abuse.ts';

const raw = JSON.parse(readFileSync(new URL('../fixtures/pool.sample.json', import.meta.url), 'utf8'));const raw = JSON.parse(readFileSync(new URL('../fixtures/pool.sample.json', import.meta.url), 'utf8'));
const pool = parsePool(raw)._unsafeUnwrap();const pool = parsePool(raw)._unsafeUnwrap();
const now = new Date('2026-11-19T20:00:00Z');const now = new Date('2026-11-19T20:00:00Z');
const ids = (p: MatchProfile, pl: PublicPool = pool) => {const ids = (p: MatchProfile, pl: PublicPool = pool) => {
  const r = match(p, pl, { now });  const r = match(p, pl, { now });
  return r.isOk() ? Object.fromEntries(Object.entries(r.value.groups).map(([k, v]) => [k, v.map(x => x.id)])) : { error: r.error.kind };  return r.isOk() ? Object.fromEntries(Object.entries(r.value.groups).map(([k, v]) => [k, v.map(x => x.id)])) : { error: r.error.kind };
};};

const PERSONAS: Record<string, MatchProfile> = {const PERSONAS: Record<string, MatchProfile> = {
  staffBackendEuAi: { description: 'Staff backend engineer with Go and Postgres, distributed systems', goal: 'AI infrastructure', region: 'EU' },  staffBackendEuAi: { description: 'Staff backend engineer with Go and Postgres, distributed systems', goal: 'AI infrastructure', region: 'EU' },
  seniorFullstackSe: { description: 'Senior full-stack engineer, TypeScript and React, 8 years', goal: 'agentic AI products', region: 'SE' },  seniorFullstackSe: { description: 'Senior full-stack engineer, TypeScript and React, 8 years', goal: 'agentic AI products', region: 'SE' },
  platformRemote: { description: 'Senior platform engineer, Kubernetes and cloud infrastructure', remote: 'remote' },  platformRemote: { description: 'Senior platform engineer, Kubernetes and cloud infrastructure', remote: 'remote' },
  mlUk: { description: 'Machine learning engineer working on LLM inference', region: 'UK', remote: 'hybrid' },  mlUk: { description: 'Machine learning engineer working on LLM inference', region: 'UK', remote: 'hybrid' },
  genericSwe: { description: 'Software engineer with 6 years of experience building web apps' },  genericSwe: { description: 'Software engineer with 6 years of experience building web apps' },
  fdeAny: { description: 'Forward deployed engineer, Python and TypeScript, customer facing', goal: 'AI agents' },  fdeAny: { description: 'Forward deployed engineer, Python and TypeScript, customer facing', goal: 'AI agents' },
  nurse: { description: 'Registered nurse with 8 years in intensive care' },  nurse: { description: 'Registered nurse with 8 years in intensive care' },
  iosJunior: { description: 'Junior iOS developer looking for my first job' },  iosJunior: { description: 'Junior iOS developer looking for my first job' },
  sales: { description: 'Account executive in B2B SaaS sales, quota carrier' },  sales: { description: 'Account executive in B2B SaaS sales, quota carrier' },
};};

test('golden: persona → group ids (frozen)', () => {test('golden: persona → group ids (frozen)', () => {
  const got = Object.fromEntries(Object.entries(PERSONAS).map(([k, p]) => [k, ids(p)]));  const got = Object.fromEntries(Object.entries(PERSONAS).map(([k, p]) => [k, ids(p)]));
  const file = new URL('./golden.json', import.meta.url);  const file = new URL('./golden.json', import.meta.url);
  if (process.env['UPDATE_GOLDEN'] === '1' || !existsSync(file)) writeFileSync(file, JSON.stringify(got, null, 1) + '\n');  if (process.env['UPDATE_GOLDEN'] === '1' || !existsSync(file)) writeFileSync(file, JSON.stringify(got, null, 1) + '\n');
  assert.deepEqual(got, JSON.parse(readFileSync(file, 'utf8')));  assert.deepEqual(got, JSON.parse(readFileSync(file, 'utf8')));
});});

test('out of scope: nurse, junior iOS, sales get the honest message', () => {test('out of scope: nurse, junior iOS, sales get the honest message', () => {
  for (const k of ['nurse', 'iosJunior', 'sales']) {  for (const k of ['nurse', 'iosJunior', 'sales']) {
    const r = match(PERSONAS[k]!, pool, { now });    const r = match(PERSONAS[k]!, pool, { now });
    assert.ok(r.isErr() && r.error.kind === 'OutOfScope', k);    assert.ok(r.isErr() && r.error.kind === 'OutOfScope', k);
  }  }
});});

test('unknown status never in fitsNow or stepTowardGoal; closed never shown', () => {test('unknown status never in fitsNow or stepTowardGoal; closed never shown', () => {
  const statusOf = new Map(pool.rows.map(r => [r.id, r.status]));  const statusOf = new Map(pool.rows.map(r => [r.id, r.status]));
  for (const p of Object.values(PERSONAS)) {  for (const p of Object.values(PERSONAS)) {
    const r = match(p, pool, { now }); if (r.isErr()) continue;    const r = match(p, pool, { now }); if (r.isErr()) continue;
    for (const row of [...r.value.groups.fitsNow, ...r.value.groups.stepTowardGoal]) assert.equal(statusOf.get(row.id), 'open');    for (const row of [...r.value.groups.fitsNow, ...r.value.groups.stepTowardGoal]) assert.equal(statusOf.get(row.id), 'open');
    for (const row of r.value.groups.stretch) assert.notEqual(statusOf.get(row.id), 'closed');    for (const row of r.value.groups.stretch) assert.notEqual(statusOf.get(row.id), 'closed');
  }  }
  const unknownOnly: PublicPool = { ...pool, rows: pool.rows.map(r => ({ ...r, status: 'unknown' as const })) };  const unknownOnly: PublicPool = { ...pool, rows: pool.rows.map(r => ({ ...r, status: 'unknown' as const })) };
  const r = match(PERSONAS['staffBackendEuAi']!, unknownOnly, { now })._unsafeUnwrap();  const r = match(PERSONAS['staffBackendEuAi']!, unknownOnly, { now })._unsafeUnwrap();
  assert.equal(r.totals.fitsNow, 0); assert.equal(r.totals.stepTowardGoal, 0); assert.ok(r.totals.stretch > 0);  assert.equal(r.totals.fitsNow, 0); assert.equal(r.totals.stepTowardGoal, 0); assert.ok(r.totals.stretch > 0);
});});

test('every row carries reasons and a last-checked time; reasons never echo raw input', () => {test('every row carries reasons and a last-checked time; reasons never echo raw input', () => {
  const marker = 'zqxjmarker';  const marker = 'zqxjmarker';
  const r = match({ description: `Senior backend engineer ${marker} with Go` , goal: `AI ${marker}` }, pool, { now })._unsafeUnwrap();  const r = match({ description: `Senior backend engineer ${marker} with Go` , goal: `AI ${marker}` }, pool, { now })._unsafeUnwrap();
  const rows = [...r.groups.fitsNow, ...r.groups.stepTowardGoal, ...r.groups.stretch];  const rows = [...r.groups.fitsNow, ...r.groups.stepTowardGoal, ...r.groups.stretch];
  assert.ok(rows.length > 0);  assert.ok(rows.length > 0);
  for (const row of rows) { assert.ok(row.reasons.length >= 2); assert.match(row.lastChecked, /^\d{4}-\d{2}-\d{2}/); }  for (const row of rows) { assert.ok(row.reasons.length >= 2); assert.match(row.lastChecked, /^\d{4}-\d{2}-\d{2}/); }
  assert.ok(!JSON.stringify(r).includes(marker));  assert.ok(!JSON.stringify(r).includes(marker));
});});

test('deterministic: same input twice and shuffled pool give identical output', () => {test('deterministic: same input twice and shuffled pool give identical output', () => {
  const a = match(PERSONAS['seniorFullstackSe']!, pool, { now });  const a = match(PERSONAS['seniorFullstackSe']!, pool, { now });
  const shuffled: PublicPool = { ...pool, rows: [...pool.rows].reverse() };  const shuffled: PublicPool = { ...pool, rows: [...pool.rows].reverse() };
  const b = match(PERSONAS['seniorFullstackSe']!, shuffled, { now });  const b = match(PERSONAS['seniorFullstackSe']!, shuffled, { now });
  assert.equal(JSON.stringify(a), JSON.stringify(match(PERSONAS['seniorFullstackSe']!, pool, { now })));  assert.equal(JSON.stringify(a), JSON.stringify(match(PERSONAS['seniorFullstackSe']!, pool, { now })));
  assert.equal(JSON.stringify(a), JSON.stringify(b));  assert.equal(JSON.stringify(a), JSON.stringify(b));
});});

test('zero results suggests widening; stale pool warns', () => {test('zero results suggests widening; stale pool warns', () => {
  const r = match({ description: 'Senior security engineer, application security', region: 'US', remote: 'remote' }, pool, { now });  const r = match({ description: 'Senior security engineer, application security', region: 'US', remote: 'remote' }, pool, { now });
  assert.ok(r.isErr() && r.error.kind === 'ZeroResults' && r.error.widen.includes('region'));  assert.ok(r.isErr() && r.error.kind === 'ZeroResults' && r.error.widen.includes('region'));
  const late = match(PERSONAS['genericSwe']!, pool, { now: new Date('2026-12-31T00:00:00Z') })._unsafeUnwrap();  const late = match(PERSONAS['genericSwe']!, pool, { now: new Date('2026-12-31T00:00:00Z') })._unsafeUnwrap();
  assert.ok(late.warnings.some(w => w.kind === 'PoolStale'));  assert.ok(late.warnings.some(w => w.kind === 'PoolStale'));
});});

test('PII: email/phone/personal number detected and redacted; year ranges are not PII', () => {test('PII: email/phone/personal number detected and redacted; year ranges are not PII', () => {
  assert.equal(findPii('worked 2015-2023 and 2019 – 2024 on backend').length, 0);  assert.equal(findPii('worked 2015-2023 and 2019 – 2024 on backend').length, 0);
  const s = 'mail a.b@example.com or +46 70 123 45 67, id 19900101-1234'; // pre-push-allow: synthetic PII test value
  assert.deepEqual(findPii(s).map(x => x.pii), ['email', 'phone', 'id-number']);  assert.deepEqual(findPii(s).map(x => x.pii), ['email', 'phone', 'id-number']);
  assert.equal(findPii(redactPii(s)).length, 0);  assert.equal(findPii(redactPii(s)).length, 0);
  const r = match({ description: 'Senior backend engineer, reach me at a.b@example.com' }, pool, { now });  const r = match({ description: 'Senior backend engineer, reach me at a.b@example.com' }, pool, { now });
  assert.ok(r.isErr() && r.error.kind === 'PiiDetected');  assert.ok(r.isErr() && r.error.kind === 'PiiDetected');
});});

test('pool parse fails closed on personal or unknown keys', () => {test('pool parse fails closed on personal or unknown keys', () => {
  const bad = { ...raw, rows: [{ ...raw.rows[0], fit_score: 94 }] };  const bad = { ...raw, rows: [{ ...raw.rows[0], fit_score: 94 }] };
  assert.equal(parsePool(bad)._unsafeUnwrapErr().kind, 'PersonalFieldLeak');  assert.equal(parsePool(bad)._unsafeUnwrapErr().kind, 'PersonalFieldLeak');
  const unk = { ...raw, rows: [{ ...raw.rows[0], notes: 'x' }] };  const unk = { ...raw, rows: [{ ...raw.rows[0], notes: 'x' }] };
  assert.equal(parsePool(unk)._unsafeUnwrapErr().kind, 'UnknownField');  assert.equal(parsePool(unk)._unsafeUnwrapErr().kind, 'UnknownField');
});});

test('30 abuse inputs: never throw, always a typed result', () => {test('30 abuse inputs: never throw, always a typed result', () => {
  assert.equal(ABUSE_INPUTS.length, 30);  assert.equal(ABUSE_INPUTS.length, 30);
  for (const d of ABUSE_INPUTS) {  for (const d of ABUSE_INPUTS) {
    const r = match({ description: d, goal: d }, pool, { now });    const r = match({ description: d, goal: d }, pool, { now });
    assert.ok(r.isOk() || typeof r.error.kind === 'string');    assert.ok(r.isOk() || typeof r.error.kind === 'string');
  }  }
});});
