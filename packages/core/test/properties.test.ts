import { test } from 'node:test';
import fc from 'fast-check';
import { match, parsePool, PERSONAL_KEYS, type MatchProfile, type PublicPool, type PublicRow } from '../src/index.ts';
import { termsIn } from '../src/vocab.ts';

const PHRASES = ['backend', 'frontend', 'full-stack', 'platform', 'infrastructure', 'data engineering', 'machine learning', 'AI', 'LLM', 'security',
  'product engineer', 'forward deployed', 'distributed systems', 'embedded', 'developer tools', 'TypeScript', 'React', 'Python', 'golang', 'Rust',
  'software engineer', 'developer', 'kubernetes', 'agentic', 'payments', 'growth', 'search', 'nurse', 'sales', 'iOS', 'manager'];
const LEVEL_WORDS = ['', 'Junior', 'Mid-level', 'Senior', 'Staff', 'Lead', 'Principal'];
const REGIONS = ['SE', 'EU', 'UK', 'US', 'remote-anywhere', 'other', null] as const;
const REMOTES = ['remote', 'hybrid', 'onsite', 'unknown'] as const;
const STATUSES = ['open', 'closed', 'unknown'] as const;
const POOL_SENIORITY = ['mid', 'senior', 'staff', 'lead', 'principal', 'unknown', null] as const;
const NOW = new Date('2026-11-19T20:00:00Z');

const phraseList = fc.array(fc.constantFrom(...PHRASES), { minLength: 1, maxLength: 4 });
const rowArb = (n: number): fc.Arbitrary<PublicRow> => fc.record({
  level: fc.constantFrom(...LEVEL_WORDS), words: phraseList, region: fc.constantFrom(...REGIONS), remote: fc.constantFrom(...REMOTES),
  status: fc.constantFrom(...STATUSES), seniority: fc.constantFrom(...POOL_SENIORITY), day: fc.integer({ min: 1, max: 28 }),
  tags: fc.subarray(['typescript', 'react', 'platform', 'frontend', 'fullstack', 'forward-deployed', 'product-engineer', 'si-llm', 'agentic', 'physical']),
}).map(r => ({
  id: `prop:${n}`, source: 'synthetic', company: `Company ${n % 7}`, title: `${r.level} ${r.words.join(', ')} Engineer`.trim(),
  url: `https://jobs.example.com/${n}`, location: null, remote: r.remote, region: r.region, role_tags: r.tags, seniority: r.seniority,
  posted_at: null, status: r.status, status_checked_at: `2026-11-${String(r.day).padStart(2, '0')}T08:00:00Z`,
}));
const poolArb: fc.Arbitrary<PublicPool> = fc.integer({ min: 0, max: 60 }).chain(len =>
  fc.tuple(...Array.from({ length: len }, (_, i) => rowArb(i))).map(rows => ({ version: 'prop', checkedRange: { from: '2026-11-01', to: '2026-11-18' }, rows })));
const profileArb: fc.Arbitrary<MatchProfile> = fc.record({
  level: fc.constantFrom(...LEVEL_WORDS), words: phraseList, filler: fc.string({ maxLength: 40 }), goal: fc.array(fc.constantFrom(...PHRASES), { maxLength: 3 }),
  region: fc.constantFrom('SE', 'EU', 'UK', 'US', 'any'), remote: fc.constantFrom('remote', 'hybrid', 'onsite', 'any'),
}).map(p => ({ description: `${p.level} engineer working on ${p.words.join(' and ')} ${p.filler}`, goal: p.goal.join(' '), region: p.region, remote: p.remote }) as MatchProfile);

const RUNS = { numRuns: 400, seed: 20261119 };
const allRows = (r: ReturnType<typeof match>) => (r.isOk() ? [...r.value.groups.fitsNow, ...r.value.groups.stepTowardGoal, ...r.value.groups.stretch] : []);
const OUTPUT_KEYS = new Set(['id', 'title', 'company', 'url', 'location', 'region', 'remote', 'seniority', 'status', 'lastChecked', 'ageDays', 'stale', 'score', 'reasons']);

test('allowed fields only: output rows carry only allow-listed keys and 0 personal keys', () => {
  fc.assert(fc.property(profileArb, poolArb, (p, pool) =>
    allRows(match(p, pool, { now: NOW })).every(row => Object.keys(row).every(k => OUTPUT_KEYS.has(k)) && PERSONAL_KEYS.every(k => !(k in row)))), RUNS);
});

test('pool with any personal or unknown key is rejected whole', () => {
  fc.assert(fc.property(poolArb.filter(p => p.rows.length > 0), fc.nat(), fc.constantFrom(...PERSONAL_KEYS, 'notes', 'email'), (pool, i, key) => {
    const rows = pool.rows.map((r, j) => (j === i % pool.rows.length ? { ...r, [key]: 1 } : r));
    return parsePool({ ...pool, rows }).isErr();
  }), RUNS);
});

test('unknown status never in fitsNow or stepTowardGoal', () => {
  fc.assert(fc.property(profileArb, poolArb, (p, pool) => {
    const r = match(p, pool, { now: NOW });
    return r.isErr() || [...r.value.groups.fitsNow, ...r.value.groups.stepTowardGoal].every(x => x.status === 'open');
  }), RUNS);
});

test('closed rows never shown', () => {
  fc.assert(fc.property(profileArb, poolArb, (p, pool) => {
    const closed = new Set(pool.rows.filter(r => r.status === 'closed').map(r => r.id));
    return allRows(match(p, pool, { now: NOW })).every(x => !closed.has(x.id));
  }), RUNS);
});

test('no known mismatch in fitsNow: a fits-now title always shares a term with the description and never a goal-only or manager title', () => {
  fc.assert(fc.property(profileArb, poolArb, (p, pool) => {
    const r = match(p, pool, { now: NOW });
    if (r.isErr()) return true;
    const mine = termsIn(p.description);
    return r.value.groups.fitsNow.every(x => {
      const row = pool.rows.find(y => y.id === x.id)!;
      const theirs = termsIn(row.title);
      for (const t of ['typescript', 'react', 'platform', 'frontend', 'fullstack']) if (row.role_tags.includes(t)) theirs.add(t);
      if (row.role_tags.includes('forward-deployed')) theirs.add('fde');
      if (row.role_tags.includes('product-engineer')) theirs.add('product');
      return [...mine].some(t => theirs.has(t)) && !/manager|director|head of/i.test(row.title)
        && (p.region === 'any' || row.region === 'remote-anywhere' || row.region === p.region || (p.region === 'EU' && row.region === 'SE'));
    });
  }), RUNS);
});

test('every row appears in at most one group and groups respect the limit', () => {
  fc.assert(fc.property(profileArb, poolArb, fc.integer({ min: 1, max: 30 }), (p, pool, limit) => {
    const r = match(p, pool, { now: NOW, limit });
    if (r.isErr()) return true;
    const ids = allRows(r).map(x => x.id);
    const g = r.value.groups;
    return new Set(ids).size === ids.length && [g.fitsNow, g.stepTowardGoal, g.stretch].every(x => x.length <= limit)
      && g.fitsNow.length <= r.value.totals.fitsNow && g.stretch.length <= r.value.totals.stretch;
  }), RUNS);
});

test('deterministic: repeated calls and any pool order give byte-identical output', () => {
  fc.assert(fc.property(profileArb, poolArb, fc.integer(), (p, pool, seed) => {
    const a = JSON.stringify(match(p, pool, { now: NOW }));
    const order = [...pool.rows].map((row, i) => ({ row, k: Math.imul(i + 1, seed | 1) >>> 0 })).sort((x, y) => x.k - y.k).map(x => x.row);
    return a === JSON.stringify(match(p, pool, { now: NOW })) && a === JSON.stringify(match(p, { ...pool, rows: order }, { now: NOW }));
  }), RUNS);
});

test('raw description text is never echoed in the output', () => {
  fc.assert(fc.property(profileArb, poolArb, fc.stringMatching(/^[a-z]{12}$/), (p, pool, marker) => {
    const r = match({ ...p, description: `${p.description} ${marker}`, goal: `${p.goal ?? ''} ${marker}` }, pool, { now: NOW });
    return !JSON.stringify(r).includes(marker);
  }), RUNS);
});

test('never throws on arbitrary input', () => {
  fc.assert(fc.property(fc.string({ maxLength: 3000 }), fc.option(fc.string()), poolArb, (d, g, pool) => {
    const r = match({ description: d, ...(g === null ? {} : { goal: g }) }, pool, { now: NOW });
    return r.isOk() || typeof r.error.kind === 'string';
  }), RUNS);
});
