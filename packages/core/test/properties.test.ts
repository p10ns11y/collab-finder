import { test } from 'node:test';
import fc from 'fast-check';
import { match, parsePool, PERSONAL_KEYS, type MatchProfile, type PublicPool, type PublicRow } from '../src/index.ts';
import { TERMS, termsIn } from '../src/vocab.ts';
import type { MatchRow } from '../src/match.ts';

const PHRASES = ['backend', 'frontend', 'full-stack', 'platform', 'infrastructure', 'data engineering', 'machine learning', 'AI', 'LLM', 'security',
  'product engineer', 'forward deployed', 'distributed systems', 'embedded', 'developer tools', 'TypeScript', 'React', 'Python', 'golang', 'Rust',
  'software engineer', 'developer', 'kubernetes', 'agentic', 'payments', 'growth', 'search', 'nurse', 'sales', 'iOS', 'manager',
  'web applications', 'Member of Technical Staff', 'customer service agent', 'Engineering Manager', 'Head of', 'Director'];
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


const ok = (p: MatchProfile, pool: PublicPool, extra: Record<string, unknown> = {}) => match(p, pool, { now: NOW, ...extra });
const groupsOf = (r: ReturnType<typeof match>) => (r.isOk() ? [r.value.groups.fitsNow, r.value.groups.stepTowardGoal, r.value.groups.stretch] : []);
const rowById = (pool: PublicPool) => new Map(pool.rows.map(r => [r.id, r]));
const NON_VOCAB = ['gardening', 'teaching', 'patients', 'cooking', 'kitchen', 'retail', 'cashier', 'driving', 'nursing', 'sales', 'marketing', 'hotel', 'cleaning', 'warehouse', 'farming', 'accounting', 'legal', 'singing'];
const LABELS = new Set(TERMS.map(t => t.label));
const labelsOk = (s: string) => s.split(', ').every(x => LABELS.has(x));
const reasonOk = (r: string, row: MatchRow) =>
  (/^Title matches what you do: /.test(r) && labelsOk(r.slice(27)))
  || (/^Tagged with: /.test(r) && labelsOk(r.slice(13)))
  || (/^Toward your goal: /.test(r) && labelsOk(r.slice(18)))
  || ['General software engineering title', 'Seniority not stated in the posting', 'Location not confirmed, check the posting', 'Remote policy not stated',
    'Title points to a different specialty than yours', 'Status unknown, verify before applying'].includes(r)
  || /^(Posting level: |Level fits: )(mid|senior|staff|principal)$/.test(r) || /^One level above yours \((mid|senior|staff|principal)\)$/.test(r)
  || r === `Region: ${row.region}${row.location ? ` (${row.location})` : ''}`
  || /^Work mode: (remote|hybrid|onsite)$/.test(r) || r === `Open when last checked (${row.lastChecked.slice(0, 10)})`;
const compat = (pref: string, region: string | null) =>
  region !== null && region !== 'other' && (region === 'remote-anywhere' || pref === 'any' || region === pref || (pref === 'EU' && region === 'SE'));

test('P1 closed rows never appear in any group', () => {
  fc.assert(fc.property(profileArb, poolArb, (p, pool) => {
    const closed = new Set(pool.rows.filter(r => r.status === 'closed').map(r => r.id));
    return allRows(ok(p, pool)).every(x => !closed.has(x.id));
  }), RUNS);
});

test('P2 fitsNow and stepTowardGoal rows are all open', () => {
  fc.assert(fc.property(profileArb, poolArb, (p, pool) => {
    const r = ok(p, pool);
    return r.isErr() || [...r.value.groups.fitsNow, ...r.value.groups.stepTowardGoal].every(x => x.status === 'open');
  }), RUNS);
});

test('P3 excludeIds are never returned', () => {
  fc.assert(fc.property(profileArb, poolArb, fc.array(fc.nat()), (p, pool, picks) => {
    const ex = picks.map(i => pool.rows[i % Math.max(1, pool.rows.length)]?.id).filter((x): x is string => !!x);
    const set = new Set(ex);
    return allRows(ok(p, pool, { excludeIds: ex })).every(x => !set.has(x.id));
  }), RUNS);
});

test('P4 byte-identical on rerun and under any row order', () => {
  fc.assert(fc.property(profileArb, poolArb, fc.integer(), (p, pool, seed) => {
    const a = JSON.stringify(ok(p, pool));
    const order = [...pool.rows].map((row, i) => ({ row, k: Math.imul(i + 1, seed | 1) >>> 0 })).sort((x, y) => x.k - y.k).map(x => x.row);
    return a === JSON.stringify(ok(p, pool)) && a === JSON.stringify(ok(p, { ...pool, rows: order }));
  }), RUNS);
});

test('P5 a row appears in at most one group', () => {
  fc.assert(fc.property(profileArb, poolArb, (p, pool) => { const ids = allRows(ok(p, pool)).map(x => x.id); return new Set(ids).size === ids.length; }), RUNS);
});

test('P6 each group length ≤ limit and totals ≥ length', () => {
  fc.assert(fc.property(profileArb, poolArb, fc.integer({ min: 1, max: 30 }), (p, pool, limit) => {
    const r = ok(p, pool, { limit });
    return r.isErr() || (['fitsNow', 'stepTowardGoal', 'stretch'] as const).every(g => r.value.groups[g].length <= limit && r.value.totals[g] >= r.value.groups[g].length);
  }), RUNS);
});

test('P7 groups ranked by score desc, lastChecked desc, id asc', () => {
  fc.assert(fc.property(profileArb, poolArb, (p, pool) => groupsOf(ok(p, pool)).every(g => g.every((x, i) => {
    const y = g[i + 1];
    if (!y) return true;
    return x.score > y.score || (x.score === y.score && (x.lastChecked > y.lastChecked || (x.lastChecked === y.lastChecked && x.id < y.id)));
  }))), RUNS);
});

test('P8 descriptions without engineering vocabulary are OutOfScope', () => {
  fc.assert(fc.property(fc.array(fc.constantFrom(...NON_VOCAB), { minLength: 4, maxLength: 10 }), poolArb, (words, pool) => {
    const r = ok({ description: `I work in ${words.join(' and ')} every day` }, pool);
    return r.isErr() && r.error.kind === 'OutOfScope';
  }), RUNS);
});

test('P9 junior level with a mobile-only role is OutOfScope', () => {
  fc.assert(fc.property(fc.constantFrom('Junior', 'Intern', 'Graduate', 'Entry-level'), fc.constantFrom('iOS', 'Android', 'mobile'), fc.constantFrom('developer', 'engineer'), poolArb,
    (lvl, mob, noun, pool) => { const r = ok({ description: `${lvl} ${mob} ${noun} looking for a first role` }, pool); return r.isErr() && r.error.kind === 'OutOfScope'; }), RUNS);
});

test('P10 fitsNow rows are region-compatible; null or unknown region never in fitsNow', () => {
  fc.assert(fc.property(profileArb, poolArb, (p, pool) => {
    const r = ok(p, pool);
    return r.isErr() || r.value.groups.fitsNow.every(x => compat(p.region ?? 'any', x.region));
  }), RUNS);
});

test('P11 remote preference holds in fitsNow', () => {
  fc.assert(fc.property(profileArb, poolArb, (p, pool) => {
    const r = ok(p, pool);
    if (r.isErr()) return true;
    return r.value.groups.fitsNow.every(x => p.remote === 'remote' ? x.remote === 'remote' : p.remote === 'hybrid' ? x.remote === 'remote' || x.remote === 'hybrid' : true);
  }), RUNS);
});

test('P12 reasons are fixed templates and never echo the description', () => {
  fc.assert(fc.property(profileArb, poolArb, fc.stringMatching(/^[a-z]{12}$/), (p, pool, marker) => {
    const r = ok({ ...p, description: `${p.description} ${marker}`, goal: `${p.goal ?? ''} ${marker}` }, pool);
    return !JSON.stringify(r).includes(marker) && allRows(r).every(row => row.reasons.every(x => reasonOk(x, row)));
  }), RUNS);
});

test('P13 adding a closed row never changes the output', () => {
  fc.assert(fc.property(profileArb, poolArb, rowArb(999), (p, pool, extra) => {
    const closed = { ...extra, id: 'prop:closed', status: 'closed' as const };
    return JSON.stringify(ok(p, pool)) === JSON.stringify(ok(p, { ...pool, rows: [...pool.rows, closed] }));
  }), RUNS);
});

test('P14 removing a row not in the output leaves every shown group unchanged', () => {
  fc.assert(fc.property(profileArb, poolArb, fc.nat(), (p, pool, k) => {
    const before = ok(p, pool, { limit: 5 });
    if (before.isErr() || pool.rows.length === 0) return true;
    const shown = new Set(allRows(before).map(x => x.id));
    const candidates = pool.rows.filter(r => !shown.has(r.id));
    const drop = candidates[k % Math.max(1, candidates.length)];
    if (!drop) return true;
    const after = ok(p, { ...pool, rows: pool.rows.filter(r => r.id !== drop.id) }, { limit: 5 });
    if (after.isErr()) return false;
    const ids = (r: typeof before) => r.isOk() ? groupsOf(r).map(g => g.map(x => x.id)) : [];
    return JSON.stringify(ids(before)) === JSON.stringify(ids(after));
  }), RUNS);
});

test('P15 manager, director, head-of and VP titles never appear', () => {
  fc.assert(fc.property(profileArb, poolArb, (p, pool) => allRows(ok(p, pool)).every(x => !/manager|director|head of|(?:^|[^a-z])vp(?=$|[^a-z])/i.test(x.title))), RUNS);
});

test('P16 output ids come from the pool and are never URLs', () => {
  fc.assert(fc.property(profileArb, poolArb, (p, pool) => {
    const byId = rowById(pool);
    return allRows(ok(p, pool)).every(x => byId.has(x.id) && !x.id.includes('://'));
  }), RUNS);
});

test('allowed fields only: output rows carry only allow-listed keys and 0 personal keys', () => {
  fc.assert(fc.property(profileArb, poolArb, (p, pool) =>
    allRows(ok(p, pool)).every(row => Object.keys(row).every(k => OUTPUT_KEYS.has(k)) && PERSONAL_KEYS.every(k => !(k in row)))), RUNS);
});

test('pool with any personal or unknown key is rejected whole', () => {
  fc.assert(fc.property(poolArb.filter(p => p.rows.length > 0), fc.nat(), fc.constantFrom(...PERSONAL_KEYS, 'notes', 'email'), (pool, i, key) => {
    const rows = pool.rows.map((r, j) => (j === i % pool.rows.length ? { ...r, [key]: 1 } : r));
    return parsePool({ ...pool, rows }).isErr();
  }), RUNS);
});

test('a fits-now title always shares a term with the description', () => {
  fc.assert(fc.property(profileArb, poolArb, (p, pool) => {
    const r = ok(p, pool);
    if (r.isErr()) return true;
    const mine = termsIn(p.description);
    const byId = rowById(pool);
    return r.value.groups.fitsNow.every(x => {
      const row = byId.get(x.id)!;
      const theirs = termsIn(row.title);
      for (const t of ['typescript', 'react']) if (row.role_tags.includes(t)) theirs.add(t);
      return [...mine].some(t => theirs.has(t));
    });
  }), RUNS);
});

test('never throws on arbitrary input', () => {
  fc.assert(fc.property(fc.string({ maxLength: 3000 }), fc.option(fc.string()), poolArb, (d, g, pool) => {
    const r = match({ description: d, ...(g === null ? {} : { goal: g }) }, pool, { now: NOW });
    return r.isOk() || typeof r.error.kind === 'string';
  }), RUNS);
});
