import { test } from 'node:test';
import fc from 'fast-check';
import { match, understand, regionsOf, parsePool, normalizedTitle, LEVEL_STEP, GENERALIST_ROLES, PERSONAL_KEYS, type MatchProfile, type PublicPool, type PublicRow, type RegionChoice } from '../src/index.ts';
import { COVERS, LEVELS, MOBILE_TITLE, TERMS, kindOf, levelOf, termsIn } from '../src/vocab.ts';
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

const IN_SCOPE = PHRASES.filter(x => termsIn(x).size > 0 && !/manager|head of|director|customer service/i.test(x));
const phraseList = fc.array(fc.constantFrom(...PHRASES), { minLength: 1, maxLength: 4 });
const inScopeList = fc.array(fc.constantFrom(...IN_SCOPE), { minLength: 1, maxLength: 3 });
const rowArb = (n: number): fc.Arbitrary<PublicRow> => fc.record({
  level: fc.constantFrom(...LEVEL_WORDS), words: fc.oneof({ weight: 3, arbitrary: inScopeList }, { weight: 1, arbitrary: phraseList }), region: fc.constantFrom(...REGIONS), remote: fc.constantFrom(...REMOTES, 'remote'),
  status: fc.constantFrom(...STATUSES, 'open', 'open'), seniority: fc.constantFrom(...POOL_SENIORITY), day: fc.integer({ min: 1, max: 28 }),
  tags: fc.subarray(['typescript', 'react', 'platform', 'frontend', 'fullstack', 'forward-deployed', 'product-engineer', 'si-llm', 'agentic', 'physical']),
}).map(r => ({
  id: `prop:${n}`, source: 'synthetic', company: `Company ${n % 7}`, title: `${r.level} ${r.words.join(', ')} Engineer`.trim(),
  url: `https://jobs.example.com/${n}`, location: null, remote: r.remote, region: r.region, role_tags: r.tags, seniority: r.seniority,
  posted_at: null, status: r.status, status_checked_at: `2026-11-${String(r.day).padStart(2, '0')}T08:00:00Z`,
}));
const poolArb: fc.Arbitrary<PublicPool> = fc.oneof({ weight: 1, arbitrary: fc.integer({ min: 0, max: 4 }) }, { weight: 5, arbitrary: fc.integer({ min: 5, max: 60 }) }).chain(len =>
  fc.tuple(...Array.from({ length: len }, (_, i) => rowArb(i))).map(rows => ({ version: 'prop', checkedRange: { from: '2026-11-01', to: '2026-11-18' }, rows })));
const profileArb: fc.Arbitrary<MatchProfile> = fc.record({
  level: fc.constantFrom(...LEVEL_WORDS.filter(x => x !== 'Junior')), words: fc.oneof({ weight: 4, arbitrary: inScopeList }, { weight: 1, arbitrary: phraseList }),
  filler: fc.oneof({ weight: 3, arbitrary: fc.constant('') }, { weight: 1, arbitrary: fc.string({ maxLength: 40 }) }), goal: fc.array(fc.constantFrom(...PHRASES), { maxLength: 3 }),
  region: fc.oneof({ weight: 3, arbitrary: fc.constantFrom('SE', 'EU', 'UK', 'US', 'any', 'any') }, { weight: 1, arbitrary: fc.subarray(['SE', 'EU', 'UK', 'US'] as const, { minLength: 1 }) }) as fc.Arbitrary<RegionChoice>,
  remote: fc.constantFrom('remote', 'hybrid', 'onsite', 'any', 'any'),
}).map(p => ({ description: `${p.level} engineer working on ${p.words.join(' and ')} ${p.filler}`, goal: p.goal.join(' '), region: p.region, remote: p.remote }) as MatchProfile);

const RUNS = { numRuns: 400, seed: 20261119 };
const allRows = (r: ReturnType<typeof match>) => (r.isOk() ? [...r.value.groups.fitsNow, ...r.value.groups.stepTowardGoal, ...r.value.groups.stretch] : []);
const OUTPUT_KEYS = new Set(['id', 'title', 'company', 'url', 'location', 'region', 'remote', 'seniority', 'status', 'lastChecked', 'ageDays', 'stale', 'tier', 'score', 'reasons', 'alsoIds']);


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
  || /^Also listed in (1 more location|([2-9]|\d\d+) more locations)$/.test(r)
  || /^Work mode: (remote|hybrid|onsite)$/.test(r) || r === `Open when last checked (${row.lastChecked.slice(0, 10)})`;
const compat = (pref: RegionChoice | undefined, region: string | null) => {
  const prefs = regionsOf(pref);
  return region !== null && region !== 'other' && (region === 'remote-anywhere' || prefs.length === 0 || prefs.some(x => region === x || (x === 'EU' && region === 'SE')));
};

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
  fc.assert(fc.property(profileArb, poolArb, (p, pool) => { const ids = allRows(ok(p, pool)).flatMap(x => [x.id, ...x.alsoIds]); return new Set(ids).size === ids.length; }), RUNS);
});

test('P6 each group length ≤ limit and totals ≥ length', () => {
  fc.assert(fc.property(profileArb, poolArb, fc.integer({ min: 1, max: 30 }), (p, pool, limit) => {
    const r = ok(p, pool, { limit });
    return r.isErr() || (['fitsNow', 'stepTowardGoal', 'stretch'] as const).every(g => r.value.groups[g].length <= limit && r.value.totals[g] >= r.value.groups[g].length);
  }), RUNS);
});

test('P7 groups ranked by tier asc, score desc, lastChecked desc, id asc', () => {
  fc.assert(fc.property(profileArb, poolArb, (p, pool) => groupsOf(ok(p, pool)).every(g => g.every((x, i) => {
    const y = g[i + 1];
    if (!y) return true;
    return x.tier < y.tier || (x.tier === y.tier && (x.score > y.score || (x.score === y.score && (x.lastChecked > y.lastChecked || (x.lastChecked === y.lastChecked && x.id < y.id)))));
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
    return allRows(ok(p, pool)).every(x => [x.id, ...x.alsoIds].every(id => byId.has(id) && !id.includes('://')));
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
    const said = termsIn(p.description);
    const mine = new Set([...said, ...[...said].flatMap(k => COVERS[k] ?? [])]);
    if ([...said].some(k => GENERALIST_ROLES.has(k))) { mine.add('software'); mine.add('product'); }
    const byId = rowById(pool);
    return r.value.groups.fitsNow.every(x => {
      const row = byId.get(x.id)!;
      const theirs = termsIn(row.title);
      for (const t of ['typescript', 'react']) if (row.role_tags.includes(t)) theirs.add(t);
      if (row.role_tags.includes('product-engineer')) theirs.add('product');
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

const BIG = { limit: 10_000 };
const groupIndex = (r: ReturnType<typeof match>, id: string): number => groupsOf(r).findIndex(g => g.some(x => x.id === id || x.alsoIds.includes(id)));
const confirmedIn = (pref: RegionChoice | undefined, region: string | null) => compat(pref, region);

test('P17 no two rows in a group share company and normalized title', () => {
  fc.assert(fc.property(profileArb, poolArb, (p, pool) => groupsOf(ok(p, pool, BIG)).every(g => {
    const keys = g.map(x => `${x.company.toLowerCase().trim()}|${normalizedTitle(x.title)}`);
    return new Set(keys).size === keys.length;
  })), RUNS);
});

test('P18 excludeIds never appear in any group at any limit, collapsed ids included', () => {
  fc.assert(fc.property(profileArb, poolArb, fc.array(fc.nat()), fc.integer({ min: 1, max: 100 }), (p, pool, picks, limit) => {
    const ex = picks.map(i => pool.rows[i % Math.max(1, pool.rows.length)]?.id).filter((x): x is string => !!x);
    const set = new Set(ex);
    return allRows(ok(p, pool, { excludeIds: ex, limit })).every(x => !set.has(x.id) && x.alsoIds.every(id => !set.has(id)));
  }), RUNS);
});

test('P19 in stretch every confirmed-place row ranks above every unconfirmed-place row', () => {
  fc.assert(fc.property(profileArb, poolArb, (p, pool) => {
    const r = ok(p, pool, BIG);
    if (r.isErr()) return true;
    const flags = r.value.groups.stretch.map(x => confirmedIn(p.region, x.region));
    return flags.every((c, i) => c || flags.slice(i).every(f => !f));
  }), RUNS);
});

const levelPair = fc.record({
  row: rowArb(0).filter(r => !/member of technical staff/i.test(r.title)), at: fc.integer({ min: 1, max: LEVELS.length - 2 }), words: phraseList,
  region: fc.constantFrom('SE', 'EU', 'UK', 'US', 'any'), remote: fc.constantFrom('remote', 'hybrid', 'onsite', 'any'),
}).map(({ row, at, words, region, remote }) => {
  const mine = LEVELS[at]!;
  const plain = { ...row, title: row.title.replace(/^(Junior|Mid-level|Senior|Staff|Lead|Principal) /, ''), status: 'open' as const };
  const profile = { description: `${mine} engineer working on ${words.join(' and ')}`, region, remote } as MatchProfile;
  return { profile, fit: { ...plain, seniority: mine }, up: { ...plain, seniority: LEVELS[at + 1]! } };
});
const scoreOf = (p: MatchProfile, row: PublicRow) => allRows(ok(p, { version: 'prop', checkedRange: { from: '2026-11-01', to: '2026-11-18' }, rows: [row] })).find(x => x.id === row.id)?.score;

test('P20 one level up never raises the score and lowers it by exactly the fixed step', () => {
  fc.assert(fc.property(levelPair, ({ profile, fit, up }) => {
    const a = scoreOf(profile, fit);
    const b = scoreOf(profile, up);
    return a === undefined ? b === undefined : b !== undefined && b <= a && a - b === LEVEL_STEP;
  }), RUNS);
});

const roleTermArb = fc.constantFrom(...PHRASES.filter(x => [...termsIn(x)].some(k => TERMS.find(t => t.key === k)?.kind !== 'skill')));
test('P21 adding a role term the title contains never moves that row to a lower group', () => {
  fc.assert(fc.property(profileArb, poolArb, fc.nat(), roleTermArb, (p, pool, k, phrase) => {
    const before = ok(p, pool, BIG);
    if (before.isErr()) return true;
    const shown = allRows(before);
    const target = shown[k % Math.max(1, shown.length)];
    if (!target || !new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(target.title)) return true;
    const after = ok({ ...p, description: `${p.description} ${phrase}` }, pool, BIG);
    if (after.isErr()) return false;
    const was = groupIndex(before, target.id);
    const now = groupIndex(after, target.id);
    const rank = (g: number) => (g === 2 ? 1 : 0);
    return now !== -1 && rank(now) <= rank(was);
  }), RUNS);
});

const generalistArb = fc.record({
  who: fc.constantFrom('software engineer', 'full-stack developer', 'frontend engineer', 'web developer building web applications'),
  title: fc.constantFrom('Software Engineer', 'Product Engineer', 'Senior Software Engineer', 'Senior Product Engineer', 'Software Engineer - Product Engineering'),
  region: fc.constantFrom('SE', 'EU', 'UK', 'US'),
});
test('N1 plain Software Engineer and Product Engineer titles are a role match for generalist profiles', () => {
  fc.assert(fc.property(generalistArb, ({ who, title, region }) => {
    const row: PublicRow = { id: 'n1', source: 'synthetic', company: 'Acme', title, url: 'https://jobs.example.com/n1', location: null, remote: 'remote', region,
      role_tags: [], seniority: 'senior', posted_at: null, status: 'open', status_checked_at: '2026-11-18T08:00:00Z' };
    const r = ok({ description: `Senior ${who} with ten years of experience`, region, remote: 'any' }, { version: 'prop', checkedRange: { from: '2026-11-01', to: '2026-11-18' }, rows: [row] });
    return r.isOk() && r.value.groups.fitsNow.some(x => x.id === 'n1' && x.reasons.some(z => z.startsWith('Title matches what you do: ')));
  }), RUNS);
});

test('N2 in every group no unconfirmed-place row outranks a confirmed-place row', () => {
  fc.assert(fc.property(profileArb, poolArb, (p, pool) => groupsOf(ok(p, pool, BIG)).every(g => {
    const flags = g.map(x => confirmedIn(p.region, x.region));
    return flags.every((c, i) => c || flags.slice(i).every(f => !f));
  })), RUNS);
});

test('N3 a one-level-up row keeps a score within the fixed step of the fitting row', () => {
  fc.assert(fc.property(levelPair, ({ profile, fit, up }) => {
    const a = scoreOf(profile, fit);
    const b = scoreOf(profile, up);
    return a === undefined || (b !== undefined && b >= a - LEVEL_STEP);
  }), RUNS);
});

test('N4 collapsing loses no row: shown ids plus collapsed ids equal the uncollapsed set', () => {
  fc.assert(fc.property(profileArb, poolArb, (p, pool) => {
    const r = ok(p, pool, BIG);
    if (r.isErr()) return true;
    const ids = allRows(r).flatMap(x => [x.id, ...x.alsoIds]).sort();
    const one = (row: PublicRow) => allRows(ok(p, { ...pool, rows: [row] }, BIG)).map(x => x.id);
    const expected = pool.rows.flatMap(one).sort();
    return JSON.stringify(ids) === JSON.stringify(expected);
  }), RUNS);
});

test('coverage floor: generated runs mostly reach a verdict and many fill fits-now', () => {
  const runs = fc.sample(fc.tuple(profileArb, poolArb), { numRuns: 400, seed: RUNS.seed }).map(([p, pool]) => ok(p, pool));
  const errors = runs.filter(r => r.isErr()).length;
  const withFits = runs.filter(r => r.isOk() && r.value.groups.fitsNow.length > 0).length;
  const withStep = runs.filter(r => r.isOk() && r.value.groups.stepTowardGoal.length > 0).length;
  if (errors > 160 || withFits < 120 || withStep < 20) throw new Error(`coverage too thin: errors ${errors}, fitsNow ${withFits}, step ${withStep} of 400`);
});

const NARROW_TITLES = ['Security', 'Embedded', 'Firmware', 'Machine Learning', 'Forward Deployed', 'Backend', 'Frontend', 'iOS', 'Android', 'Mobile', 'Data Platform'];
const mismatchArb = fc.record({
  level: fc.constantFrom('', 'Senior', 'Staff'), generalist: fc.boolean(), skills: fc.subarray(['TypeScript', 'React', 'Python', 'Rust', 'golang'], { minLength: 1 }),
  narrow: fc.constantFrom(...NARROW_TITLES), shape: fc.constantFrom('lead', 'suffix'), tags: fc.subarray(['typescript', 'react']),
  region: fc.constantFrom('SE', 'EU', 'UK', 'US'),
}).map(m => {
  const who = m.generalist ? 'software engineer' : 'engineer';
  const profile = { description: `${m.level} ${who} working with ${m.skills.join(' and ')}`.trim(), region: m.region, remote: 'any' } as MatchProfile;
  const title = m.shape === 'lead' ? `${m.level} ${m.narrow} Engineer`.trim() : `${m.level} Software Engineer, ${m.narrow}`.trim();
  const row: PublicRow = { id: 'r6', source: 'synthetic', company: 'Acme', title, url: 'https://jobs.example.com/r6', location: null, remote: 'remote', region: m.region,
    role_tags: m.tags, seniority: m.level ? m.level.toLowerCase() : null, posted_at: null, status: 'open', status_checked_at: '2026-11-18T08:00:00Z' };
  return { profile, row };
});
test('R6 a title naming a specialty the profile does not cover never reaches fits-now or step-toward-goal', () => {
  fc.assert(fc.property(mismatchArb, ({ profile, row }) => {
    const r = ok(profile, { version: 'prop', checkedRange: { from: '2026-11-01', to: '2026-11-18' }, rows: [row] });
    return r.isErr() || (r.value.groups.fitsNow.length === 0 && r.value.groups.stepTowardGoal.length === 0);
  }), RUNS);
});

test('R6 is live: the same mismatch rows do surface, in stretch', () => {
  const sample = fc.sample(mismatchArb, { numRuns: 200, seed: RUNS.seed }).filter(({ row }) => !MOBILE_TITLE.test(row.title));
  const shown = sample.filter(({ profile, row }) => {
    const r = ok(profile, { version: 'prop', checkedRange: { from: '2026-11-01', to: '2026-11-18' }, rows: [row] });
    return r.isOk() && r.value.groups.stretch.some(x => x.id === 'r6' && x.reasons.includes('Title points to a different specialty than yours'));
  }).length;
  if (shown < sample.length * 0.3) throw new Error(`only ${shown} of ${sample.length} mismatch rows reached stretch with the specialty reason`);
});

const GOAL_PHRASES = ['agentic AI', 'AI agents', 'robots', 'robotics', 'vehicles', 'devices', 'physical products', 'drones', 'autonomous systems', 'hardware',
  'frontier AI labs', 'product teams', 'machine learning', 'developer tools', 'platform', 'security', 'distributed systems', 'IA'];
test('P22 every vocab goal term in the goal text reaches understood.goal', () => {
  fc.assert(fc.property(profileArb, fc.array(fc.constantFrom(...GOAL_PHRASES), { minLength: 1, maxLength: 5 }), (p, parts) => {
    const goal = parts.join(', ');
    const u = understand({ ...p, goal });
    if (u.isErr()) return true;
    const said = termsIn(p.description);
    return [...termsIn(goal)].filter(k => !said.has(k) && kindOf(k) !== 'generic').every(k => u.value.goal.includes(k));
  }), RUNS);
});

test('P22 the multi-part goal reaches the matcher as several signals', () => {
  const u = understand({ description: 'Senior software engineer building web applications with TypeScript and React',
    goal: 'agentic AI engineering on product teams, physical products (devices, robots, vehicles), frontier AI labs' })._unsafeUnwrap();
  for (const k of ['agents', 'ai', 'physical', 'frontier', 'productteams']) if (!u.goal.includes(k)) throw new Error(`missing goal signal ${k}: ${u.goal.join(',')}`);
});

test('P23 level words in a past-tense clause never set the current level', () => {
  fc.assert(fc.property(
    fc.constantFrom('', 'Mid-level', 'Senior', 'Staff', 'Principal'), fc.constantFrom('Junior', 'Senior', 'Staff', 'Lead', 'Principal', 'team lead', 'intern'),
    fc.constantFrom('Was', 'I was', 'Former', 'Formerly', 'Ex-', 'Previously', 'Before that I was'), inScopeList,
    (cur, past, intro, words) => {
      const now = `${cur} software engineer working on ${words.join(' and ')}`.trim();
      const u = understand({ description: `${now}. ${intro}${intro.endsWith('-') ? '' : ' '}${past} engineer at a startup.` });
      return u.isOk() && u.value.seniority === levelOf(now);
    }), RUNS);
});

test('P24 every step-toward-goal row has a title term from understood.goal', () => {
  fc.assert(fc.property(profileArb, poolArb, (p, pool) => {
    const r = ok(p, pool, BIG);
    return r.isErr() || r.value.groups.stepTowardGoal.every(x => [...termsIn(x.title)].some(k => r.value.understood.goal.includes(k)));
  }), RUNS);
});

test('P25 a profile without mobile terms sees no mobile title in the stretch top 10', () => {
  fc.assert(fc.property(profileArb, poolArb, (p, pool) => {
    if (MOBILE_TITLE.test(`${p.description}\n${p.goal ?? ''}`)) return true;
    const r = ok(p, pool);
    return r.isErr() || r.value.groups.stretch.slice(0, 10).every(x => !MOBILE_TITLE.test(x.title));
  }), RUNS);
});

test('region multi-select returns exactly the union of the single-region results', () => {
  fc.assert(fc.property(profileArb, poolArb, fc.subarray(['SE', 'EU', 'UK', 'US'] as const, { minLength: 2 }), (p, pool, regions) => {
    const idsOf = (region: RegionChoice) => { const r = ok({ ...p, region }, pool, BIG); return new Set(allRows(r).flatMap(x => [x.id, ...x.alsoIds])); };
    const multi = idsOf(regions);
    const union = new Set(regions.flatMap(x => [...idsOf(x)]));
    return multi.size === union.size && [...multi].every(id => union.has(id));
  }), RUNS);
});

test('region multi-select keeps every fits-now row inside one of the chosen regions', () => {
  fc.assert(fc.property(profileArb, poolArb, fc.subarray(['SE', 'EU', 'UK', 'US'] as const, { minLength: 1 }), (p, pool, regions) => {
    const r = ok({ ...p, region: regions }, pool, BIG);
    return r.isErr() || r.value.groups.fitsNow.every(x => compat(regions, x.region));
  }), RUNS);
});
