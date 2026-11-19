import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { corpusStats, isAgencyRow, match, parsePool, redactPii, findPii, type MatchProfile, type PublicPool } from '../src/index.ts';
import { ABUSE_INPUTS, SYNTHETIC_EMAIL, SYNTHETIC_ID, SYNTHETIC_PHONE } from './abuse.ts';

const raw = JSON.parse(readFileSync(new URL('../fixtures/pool.sample.json', import.meta.url), 'utf8'));
const pool = parsePool(raw)._unsafeUnwrap();
const now = new Date('2026-11-19T20:00:00Z');
const ids = (p: MatchProfile, pl: PublicPool = pool) => {
  const r = match(p, pl, { now });
  return r.isOk() ? Object.fromEntries(Object.entries(r.value.groups).map(([k, v]) => [k, v.map(x => x.id)])) : { error: r.error.kind };
};

const PERSONAS: Record<string, MatchProfile> = {
  staffBackendEuAi: { description: 'Staff backend engineer with Go and Postgres, distributed systems', goal: 'AI infrastructure', region: 'EU' },
  seniorFullstackSe: { description: 'Senior full-stack engineer, TypeScript and React, 8 years', goal: 'agentic AI products', region: 'SE' },
  platformRemote: { description: 'Senior platform engineer, Kubernetes and cloud infrastructure', remote: 'remote' },
  mlUk: { description: 'Machine learning engineer working on LLM inference', region: 'UK', remote: 'hybrid' },
  genericSwe: { description: 'Software engineer with 6 years of experience building web apps' },
  fdeAny: { description: 'Forward deployed engineer, Python and TypeScript, customer facing', goal: 'AI agents' },
  mismatchGeneralist: { description: 'Senior software engineer, TypeScript and React, 8 years of web applications', region: 'any' },
  mismatchSkillsOnly: { description: 'Senior engineer who writes TypeScript and Python every day' },
  productOnlyFullstack: { description: 'Senior full-stack engineer, TypeScript and React, 8 years', region: ['SE', 'EU', 'UK'], productOnly: true },
  nurse: { description: 'Registered nurse with 8 years in intensive care' },
  iosJunior: { description: 'Junior iOS developer looking for my first job' },
  sales: { description: 'Account executive in B2B SaaS sales, quota carrier' },
};

test('golden: persona → group ids (frozen)', () => {
  const got = Object.fromEntries(Object.entries(PERSONAS).map(([k, p]) => [k, ids(p)]));
  const file = new URL('./golden.json', import.meta.url);
  if (process.env['UPDATE_GOLDEN'] === '1' || !existsSync(file)) writeFileSync(file, JSON.stringify(got, null, 1) + '\n');
  assert.deepEqual(got, JSON.parse(readFileSync(file, 'utf8')));
});

test('out of scope: nurse, junior iOS, sales get the honest message', () => {
  for (const k of ['nurse', 'iosJunior', 'sales']) {
    const r = match(PERSONAS[k]!, pool, { now });
    assert.ok(r.isErr() && r.error.kind === 'OutOfScope', k);
  }
});

test('unknown status never in fitsNow or stepTowardGoal; closed never shown', () => {
  const statusOf = new Map(pool.rows.map(r => [r.id, r.status]));
  for (const p of Object.values(PERSONAS)) {
    const r = match(p, pool, { now }); if (r.isErr()) continue;
    for (const row of [...r.value.groups.fitsNow, ...r.value.groups.stepTowardGoal]) assert.equal(statusOf.get(row.id), 'open');
    for (const row of r.value.groups.stretch) assert.notEqual(statusOf.get(row.id), 'closed');
  }
  const unknownOnly: PublicPool = { ...pool, rows: pool.rows.map(r => ({ ...r, status: 'unknown' as const })) };
  const r = match(PERSONAS['staffBackendEuAi']!, unknownOnly, { now })._unsafeUnwrap();
  assert.equal(r.totals.fitsNow, 0); assert.equal(r.totals.stepTowardGoal, 0); assert.ok(r.totals.stretch > 0);
});

test('every row carries reasons and a last-checked time; reasons never echo raw input', () => {
  const marker = 'zqxjmarker';
  const r = match({ description: `Senior backend engineer ${marker} with Go` , goal: `AI ${marker}` }, pool, { now })._unsafeUnwrap();
  const rows = [...r.groups.fitsNow, ...r.groups.stepTowardGoal, ...r.groups.stretch];
  assert.ok(rows.length > 0);
  for (const row of rows) { assert.ok(row.reasons.length >= 2); assert.match(row.lastChecked, /^\d{4}-\d{2}-\d{2}/); }
  assert.ok(!JSON.stringify(r).includes(marker));
});

test('deterministic: same input twice and shuffled pool give identical output', () => {
  const a = match(PERSONAS['seniorFullstackSe']!, pool, { now });
  const shuffled: PublicPool = { ...pool, rows: [...pool.rows].reverse() };
  const b = match(PERSONAS['seniorFullstackSe']!, shuffled, { now });
  assert.equal(JSON.stringify(a), JSON.stringify(match(PERSONAS['seniorFullstackSe']!, pool, { now })));
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

test('zero results suggests widening; stale pool warns', () => {
  const r = match({ description: 'Senior security engineer, application security', region: 'US', remote: 'remote' }, pool, { now });
  assert.ok(r.isErr() && r.error.kind === 'ZeroResults' && r.error.widen.includes('region'));
  const late = match(PERSONAS['genericSwe']!, pool, { now: new Date('2026-12-31T00:00:00Z') })._unsafeUnwrap();
  assert.ok(late.warnings.some(w => w.kind === 'PoolStale'));
});

test('PII: email/phone/personal number detected and redacted; year ranges are not PII', () => {
  assert.equal(findPii('worked 2015-2023 and 2019 – 2024 on backend').length, 0);
  const s = `mail ${SYNTHETIC_EMAIL} or ${SYNTHETIC_PHONE}, id ${SYNTHETIC_ID}`;
  assert.deepEqual(findPii(s).map(x => x.pii), ['email', 'phone', 'id-number']);
  assert.equal(findPii(redactPii(s)).length, 0);
  const r = match({ description: `Senior backend engineer, reach me at ${SYNTHETIC_EMAIL}` }, pool, { now });
  assert.ok(r.isErr() && r.error.kind === 'PiiDetected');
});

test('pool parse fails closed on personal or unknown keys', () => {
  const bad = { ...raw, rows: [{ ...raw.rows[0], fit_score: 94 }] };
  assert.equal(parsePool(bad)._unsafeUnwrapErr().kind, 'PersonalFieldLeak');
  const unk = { ...raw, rows: [{ ...raw.rows[0], notes: 'x' }] };
  assert.equal(parsePool(unk)._unsafeUnwrapErr().kind, 'UnknownField');
});

test('30 abuse inputs: never throw, always a typed result', () => {
  assert.equal(ABUSE_INPUTS.length, 30);
  for (const d of ABUSE_INPUTS) {
    const r = match({ description: d, goal: d }, pool, { now });
    assert.ok(r.isOk() || typeof r.error.kind === 'string');
  }
});

test('mentoring juniors or a graduate degree never trips the junior gate', () => {
  for (const d of ['Backend engineer, 9 years, I mentor junior engineers on Go and Postgres', 'Senior Java developer with a graduate degree in computer science', 'Platform engineer who onboards new graduates and interns']) {
    const r = match({ description: d }, pool, { now });
    assert.ok(!(r.isErr() && r.error.kind === 'OutOfScope'), d);
  }
  const j = match({ description: 'Junior developer looking for my first role' }, pool, { now });
  assert.ok(j.isErr() && j.error.kind === 'OutOfScope' && j.error.reason === 'junior');
});

test('Java and Kotlin profiles are in scope', () => {
  for (const d of ['Java developer with Spring Boot', 'Backend engineer writing Kotlin services']) {
    const r = match({ description: d }, pool, { now });
    assert.ok(!(r.isErr() && r.error.kind === 'OutOfScope'), d);
  }
});

test('pool urls must be http or https', () => {
  const base = pool.rows[0]!;
  for (const url of ['javascript:alert(1)', 'data:text/html,hi', 'vbscript:msgbox', 'ftp://jobs.example.com/x', 'file:///etc/hosts']) {
    assert.ok(parsePool({ ...pool, rows: [{ ...base, url }] }).isErr(), url);
  }
  assert.ok(parsePool({ ...pool, rows: [{ ...base, url: 'http://jobs.example.com/x' }] }).isOk());
});

const oneRow = (title: string, extra: Partial<PublicPool['rows'][number]> = {}): PublicPool => ({
  version: 'case', checkedRange: { from: '2026-11-01', to: '2026-11-18' },
  rows: [{ id: 'case:1', source: 'synthetic', company: 'Example Co', title, url: 'https://jobs.example.com/case', location: null, remote: 'remote', region: 'EU',
    role_tags: [], seniority: 'senior', posted_at: null, status: 'open', status_checked_at: '2026-11-18T08:00:00Z', ...extra }],
});
const groupOf = (r: ReturnType<typeof match>) => r.isOk() ? (Object.entries(r.value.groups).find(([, v]) => v.some(x => x.id === 'case:1'))?.[0] ?? 'none') : r.error.kind;

test('golden case: a Backend Security Engineer is fits-now for a plain backend profile, because the title names backend', () => {
  assert.equal(groupOf(match({ description: 'Senior backend engineer with Go and Postgres', region: 'EU' }, oneRow('Backend Security Engineer'), { now })), 'fitsNow');
  assert.equal(groupOf(match({ description: 'Senior backend engineer with Go and Postgres', region: 'EU' }, oneRow('Security Engineer, Postgres'), { now })), 'stretch');
});

test('golden case: React Native rows stay in stretch for a React profile, mobile rows are never dropped', () => {
  const p = { description: 'Senior frontend engineer with React and TypeScript', region: 'EU' as const };
  assert.equal(groupOf(match(p, oneRow('Senior React Native Engineer', { role_tags: ['react'] }), { now })), 'stretch');
  assert.equal(groupOf(match(p, oneRow('Senior iOS Engineer', { role_tags: ['typescript'] }), { now })), 'stretch');
});

test('a bare Consulting suffix at a product company is not an agency signal', () => {
  assert.equal(isAgencyRow({ company: 'Example AI', title: 'Founding Full Stack Software Engineer, Consulting' }), false);
  assert.equal(isAgencyRow({ company: 'Example Legal', title: 'Legal Engineer - Tax & Consulting' }), false);
  assert.equal(isAgencyRow({ company: 'Nordic Consulting Group', title: 'Backend Engineer' }), true);
  assert.equal(isAgencyRow({ company: 'Example Co', title: 'Backend Engineer (Contract)' }), true);
});

test('speed: a 30,000-row pool matches within budget once corpus stats are cached', () => {
  const rows = Array.from({ length: 100 }, (_, k) => pool.rows.map(r => ({ ...r, id: `${r.id}#${k}` }))).flat();
  const big = { ...pool, rows };
  const stats = corpusStats(big.rows);
  match(PERSONAS['seniorFullstackSe']!, big, { now, stats });
  const t0 = performance.now();
  for (let i = 0; i < 3; i++) match(PERSONAS['seniorFullstackSe']!, big, { now, stats });
  const ms = (performance.now() - t0) / 3;
  assert.ok(ms < 400, `${Math.round(ms)} ms`);
});
