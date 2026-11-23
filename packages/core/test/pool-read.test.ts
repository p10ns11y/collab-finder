import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { companyCount, parsePool, readPool, scopeMessage } from '../src/index.ts';

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
  assert.equal(scopeMessage(1234), 'We cover software & AI engineering roles at 1,234 tech companies, SE/EU/UK/US.');
  assert.equal(scopeMessage(1), 'We cover software & AI engineering roles at 1 tech company, SE/EU/UK/US.');
});
