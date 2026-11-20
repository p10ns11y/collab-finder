import { test } from 'node:test';
import fc from 'fast-check';
import { PERSONAL_KEYS, PublicRowSchema, toPublicPool } from '../src/index.ts';

const ALLOWED = new Set(Object.keys(PublicRowSchema.shape));
const RUNS = { numRuns: 300, seed: 20261119 };
const iso = fc.integer({ min: 1, max: 28 }).map(d => `2026-11-${String(d).padStart(2, '0')}T08:00:00Z`);
const publicRow = fc.record({
  id: fc.uuid().map(u => `ashby:${u}`), source: fc.constantFrom('ashby', 'greenhouse', 'lever'), company: fc.string({ minLength: 1, maxLength: 20 }),
  title: fc.string({ minLength: 1, maxLength: 40 }), url: fc.uuid().map(u => `https://jobs.example.com/${u}`), location: fc.option(fc.string({ maxLength: 20 })),
  remote: fc.constantFrom('remote', 'hybrid', 'onsite', 'unknown'), region: fc.option(fc.constantFrom('SE', 'EU', 'UK', 'US', 'other')),
  role_tags: fc.array(fc.string({ maxLength: 10 }), { maxLength: 3 }), seniority: fc.option(fc.constantFrom('senior', 'staff', 'unknown')),
  posted_at: fc.option(fc.constant('2009-01-01')), status: fc.constantFrom('open', 'closed', 'unknown'), status_checked_at: iso,
});
const personalExtras = fc.dictionary(fc.constantFrom(...PERSONAL_KEYS, 'notes', 'email', 'phone', 'cv_text'), fc.jsonValue(), { maxKeys: 6 });
const engineRow = fc.tuple(publicRow, personalExtras).map(([row, extra]) => ({ ...extra, ...row }));

test('export: allowed fields only and 0 personal keys, whatever the engine row carries', () => {
  fc.assert(fc.property(fc.array(engineRow, { minLength: 1, maxLength: 30 }), rows => {
    const r = toPublicPool(rows, 'v');
    return r.isOk() && r.value.rows.every(row => Object.keys(row).every(k => ALLOWED.has(k)) && PERSONAL_KEYS.every(k => !(k in row)));
  }), RUNS);
});

test('export: fails closed when any row breaks the contract', () => {
  const broken = fc.tuple(publicRow, fc.constantFrom('url', 'status', 'remote', 'id', 'status_checked_at'))
    .map(([row, key]) => ({ ...row, [key]: 42 }));
  fc.assert(fc.property(fc.array(engineRow, { maxLength: 20 }), broken, fc.nat(), (rows, bad, at) => {
    const all = [...rows]; all.splice(at % (rows.length + 1), 0, bad);
    return toPublicPool(all, 'v').isErr();
  }), RUNS);
});

test('export: empty input fails closed; checkedRange spans the rows', () => {
  fc.assert(fc.property(fc.array(engineRow, { maxLength: 20 }), rows => {
    const r = toPublicPool(rows, 'v');
    if (rows.length === 0) return r.isErr();
    if (r.isErr()) return false;
    const ts = rows.map(x => x.status_checked_at).sort();
    return r.value.checkedRange.from === ts[0] && r.value.checkedRange.to === ts[ts.length - 1] && r.value.rows.length === rows.length;
  }), RUNS);
});
