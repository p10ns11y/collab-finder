import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { match, parsePool, WORLD_REGIONS } from '../src/index.ts';
import { MatchInputSchema } from '../src/surface.ts';
import { FindRolesBase } from '../src/flow-schema.ts';
import { GapGuidanceSchema, SourceSubmissionSchema } from '../src/pool-seam.ts';

const now = new Date('2026-11-19T20:00:00Z');
const base = JSON.parse(readFileSync(new URL('../fixtures/pool.sample.json', import.meta.url), 'utf8'));
const row = (id: string, location: string, region: string) => ({ ...base.rows.find((r: { title: string }) => r.title === 'Senior Full Stack Engineer'), id, company: `Company ${id}`, url: `https://jobs.example.com/${id}`, location, region, remote: 'onsite', status: 'open' });
const pool = parsePool({ ...base, rows: [row('ca', 'Toronto, Canada', 'CA'), row('apac', 'Bengaluru, India', 'APAC'), row('latam', 'São Paulo, Brazil', 'LATAM'), row('mea', 'Tel Aviv, Israel', 'MEA'), row('far', 'Lagos, Nigeria', 'other')] })._unsafeUnwrap();
const profile = { description: 'Senior full stack engineer, TypeScript and React' };
const found = (region?: ReadonlyArray<string>) => {
  const r = match(region ? { ...profile, region: region as never } : profile, pool, { now })._unsafeUnwrap();
  return Object.values(r.groups).flat();
};

test('the region list covers the whole world, not only SE, EU, UK and US', () => {
  assert.deepEqual([...WORLD_REGIONS], ['SE', 'EU', 'UK', 'US', 'CA', 'LATAM', 'APAC', 'MEA']);
});

test('every schema that takes a region accepts every world region and rejects an unknown one', () => {
  for (const r of WORLD_REGIONS) {
    assert.ok(MatchInputSchema.safeParse({ description: 'x', region: [r] }).success, `match ${r}`);
    assert.ok(FindRolesBase.safeParse({ regions: [r] }).success, `find_roles ${r}`);
    assert.ok(SourceSubmissionSchema.safeParse({ kind: 'ats_board', url: 'https://jobs.example.com/b', regions: [r], submitted_at: '2026-11-25T13:00:00Z' }).success, `submission ${r}`);
    assert.ok(GapGuidanceSchema.safeParse({ topic: 'Rust', region: r, rows_found: 0, message: 'Few roles', suggestions: [] }).success, `gap ${r}`);
  }
  assert.ok(SourceSubmissionSchema.safeParse({ kind: 'ats_board', url: 'https://jobs.example.com/b', regions: [...WORLD_REGIONS], submitted_at: '2026-11-25T13:00:00Z' }).success);
  assert.equal(MatchInputSchema.safeParse({ description: 'x', region: ['XX'] }).success, false);
  assert.equal(FindRolesBase.safeParse({ regions: ['XX'] }).success, false);
});

test('by default no country filter applies: roles anywhere in the world are confirmed fits', () => {
  const rows = found();
  assert.deepEqual(rows.map(r => r.id).sort(), ['apac', 'ca', 'far', 'latam', 'mea']);
  for (const r of rows) {
    assert.ok(!r.reasons.includes('Location not confirmed, check the posting'), r.id);
    assert.equal(r.tier, 0, r.id);
  }
  assert.deepEqual(Object.fromEntries(rows.map(r => [r.id, r.region])), { ca: 'CA', apac: 'APAC', latam: 'LATAM', mea: 'MEA', far: 'other' });
});

test('picking a world region keeps only that region', () => {
  assert.deepEqual(found(['APAC']).filter(r => r.tier === 0).map(r => r.id), ['apac']);
  assert.deepEqual(found(['CA', 'MEA']).filter(r => r.tier === 0).map(r => r.id).sort(), ['ca', 'mea']);
  assert.deepEqual(found(['US']).filter(r => r.tier === 0), []);
});
