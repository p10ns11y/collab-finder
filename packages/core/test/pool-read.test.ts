import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { companyCount, match, parsePool, readPool, scopeMessage } from '../src/index.ts';

const raw = JSON.parse(readFileSync(new URL('../fixtures/pool.sample.json', import.meta.url), 'utf8'));
const withRows = (f: (row: Record<string, unknown>) => Record<string, unknown>) => ({ ...raw, rows: raw.rows.map(f) });

test('readPool: a newer pool with an unknown field still loads, the field is dropped; parsePool stays strict', () => {
  const newer = withRows(r => ({ ...r, future_field: ['x'] }));
  const read = readPool(newer)._unsafeUnwrap();
  assert.equal(read.rows.length, raw.rows.length);
  assert.ok(read.rows.every(r => !('future_field' in r)));
  assert.equal(parsePool(newer).isErr(), true);
});

test('readPool: personal keys and broken rows still fail closed', () => {
  assert.equal(readPool(withRows(r => ({ ...r, fit_score: 90 }))).isErr(), true);
  assert.equal(readPool(withRows(r => ({ ...r, status: 42 }))).isErr(), true);
  assert.equal(readPool({ version: 'v' }).isErr(), true);
});

test('companyCount: unique companies, case and spacing folded; scopeMessage uses it', () => {
  const rows = [{ company: 'Brisklabs' }, { company: ' brisklabs ' }, { company: 'Lumenforge' }] as never;
  assert.equal(companyCount({ rows }), 2);
  assert.equal(companyCount(parsePool(raw)._unsafeUnwrap()), new Set(raw.rows.map((r: { company: string }) => r.company.trim().toLowerCase())).size);
  assert.equal(scopeMessage(1234), 'We cover software & AI engineering roles at 1,234 tech companies.');
  assert.equal(scopeMessage(1), 'We cover software & AI engineering roles at 1 tech company.');
});

test('summary: every sample role has a short summary, it reaches the matched row, and a long one is rejected', () => {
  assert.ok(raw.rows.every((r: { summary?: unknown }) => typeof r.summary === 'string' && /^[A-Z].{19,119}\.$/.test(r.summary)));
  assert.ok(raw.rows.every((r: { summary: string; title: string }) => !/ role\.$/.test(r.summary) && r.summary !== r.title));
  const pool = parsePool(raw)._unsafeUnwrap();
  const res = match({ description: 'Senior machine learning engineer, PyTorch and LLM evaluation' }, pool, { now: new Date(pool.checkedRange.to) })._unsafeUnwrap();
  const shown = [...res.groups.fitsNow, ...res.groups.stepTowardGoal, ...res.groups.stretch];
  assert.ok(shown.length > 0);
  assert.ok(shown.every(row => row.summary === pool.rows.find(r => r.id === row.id)?.summary));
  assert.equal(parsePool(withRows(r => ({ ...r, summary: 'x'.repeat(201) }))).isErr(), true);
});

test('sample rows agree with themselves: remote locations are remote, titles read as titles, summaries are unique and leave out the company', () => {
  type Row = { title: string; company: string; summary: string; location: string | null; remote: string };
  const rows = raw.rows as Row[];
  assert.deepEqual(rows.filter(r => /^Remote\b/.test(r.location ?? '') && r.remote !== 'remote').map(r => r.title), []);
  assert.deepEqual(rows.filter(r => /^Director, |, .*, /.test(r.title)).map(r => r.title), []);
  assert.equal(new Set(rows.map(r => r.summary)).size, rows.length);
  const companies = [...new Set(rows.map(r => r.company))];
  assert.deepEqual(rows.filter(r => companies.some(c => r.summary.includes(c))).map(r => r.summary), []);
});
