import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { match, parsePool, type MatchProfile, type PublicPool } from '../src/index.ts';
import { GapGuidanceSchema } from '../src/pool-seam.ts';
import { gapGuidance, THIN } from '../src/source-gaps.ts';

const now = new Date('2026-11-19T20:00:00Z');
const sample = parsePool(JSON.parse(readFileSync(new URL('../fixtures/pool.sample.json', import.meta.url), 'utf8')))._unsafeUnwrap();
const guide = (p: MatchProfile, pool: PublicPool = sample) => {
  const r = match(p, pool, { now });
  if (r.isOk()) return { found: r.value.totals.fitsNow + r.value.totals.stepTowardGoal, g: gapGuidance(p, pool, r.value) };
  return { found: 0, g: r.error.kind === 'ZeroResults' ? gapGuidance(p, pool, null) : undefined };
};
let n = 0;
const row = (title: string, region: string, location: string, status = 'open') => ({
  id: `sample:${n += 1}`, source: 'sample', company: `Sample Co ${n}`, title, url: `https://jobs.example.com/${n}`, location, remote: 'onsite',
  region, role_tags: [], seniority: 'senior', posted_at: '2026-11-10', status, status_checked_at: '2026-11-19T19:00:00Z',
});
const small = parsePool({
  version: 'sample', checkedRange: { from: '2026-11-19T19:00:00Z', to: '2026-11-19T19:00:00Z' },
  rows: [
    row('Senior Platform Engineer', 'SE', 'Stockholm, Sweden'),
    ...[1, 2, 3, 4].map(() => row('Senior Backend Engineer', 'SE', 'Gothenburg, Sweden', 'unknown')),
    ...[1, 2, 3].map(() => row('Senior Platform Engineer', 'EU', 'Berlin, Germany', 'unknown')),
    ...[1, 2, 3, 4, 5].map(() => row('Senior Platform Engineer', 'US', 'Austin, TX')),
  ],
})._unsafeUnwrap();

test('source gaps: nothing to show when matching finds enough roles', () => {
  const { found, g } = guide({ description: 'Machine learning engineer working on LLM inference', region: 'UK', remote: 'hybrid' });
  assert.ok(found >= THIN);
  assert.equal(g, null);
});

test('source gaps: zero results name the missing topic and region, with one suggestion per source kind', () => {
  const { g } = guide({ description: 'Senior backend engineer with Rust and Postgres', region: 'SE' });
  assert.ok(g);
  assert.deepEqual([g.topic, g.region, g.rows_found], ['Rust', 'SE', 0]);
  assert.match(g.message, /^Missing sources for Rust in Sweden: 0 roles matched\./);
  assert.deepEqual(g.suggestions.map(s => s.kind), ['careers_page', 'ats_board', 'community_list']);
  assert.ok(g.suggestions.every(s => s.hint.includes('Rust') && s.hint.includes('Sweden')));
});

test('source gaps: a thin region suggests the wider region and nearby topics that have roles', () => {
  const { found, g } = guide({ description: 'Senior platform engineer', region: 'SE' }, small);
  assert.equal(found, 1);
  assert.ok(g);
  assert.deepEqual([g.topic, g.region, g.rows_found], ['platform', 'SE', 1]);
  assert.equal(g.message, 'Missing sources for platform in Sweden: 1 role matched. Widening to the EU reaches 4 roles that name platform. Nearby topics with more roles: backend.');
});

test('source gaps: with several regions picked, the guidance names the thinnest one', () => {
  const { g } = guide({ description: 'Senior platform engineer', region: ['EU', 'SE'] }, small);
  assert.equal(g?.region, 'SE');
  const none = guide({ description: 'Senior platform engineer' }, small);
  assert.equal(none.g, null);
});

test('source gaps: across sample asks, guidance shows only when results are thin and always fits the schema', () => {
  const asks = ['Senior backend engineer with Rust and Postgres', 'Staff backend engineer with Go and Postgres, distributed systems', 'Senior security engineer, appsec',
    'Embedded firmware engineer, C++', 'Senior full-stack engineer, TypeScript and React, 8 years', 'Senior platform engineer, Kubernetes and cloud infrastructure', 'Machine learning engineer working on LLM inference'];
  const regions = [undefined, 'SE', 'EU', 'UK', 'US', ['SE', 'UK'], ['EU', 'US']] as const;
  let shown = 0, hidden = 0;
  for (const description of asks) for (const region of regions) for (const remote of ['any', 'remote'] as const) {
    const { found, g } = guide({ description, remote, goal: 'AI agents', ...(region ? { region: region as MatchProfile['region'] & {} } : {}) });
    if (g === undefined) continue;
    assert.equal(g !== null, found < THIN, `${description} ${String(region)} ${remote}`);
    if (!g) { hidden++; continue; }
    shown++;
    assert.deepEqual(GapGuidanceSchema.parse(g), g);
    assert.equal(g.rows_found, found);
    assert.ok(g.message.startsWith(`Missing sources for ${g.topic}`));
  }
  assert.ok(shown > 5 && hidden > 5, `${shown} shown, ${hidden} hidden`);
});
