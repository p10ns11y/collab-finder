import { test } from 'node:test';
import fc from 'fast-check';
import { LIKED_POINTS, likedEntries, likesCompany, SCORE_BUCKET, titleFocus, languageGo, corpusStats, queryTokens, relevance, rowTokens, tokensOf, isLocationPart, isAgencyRow, match, understand, regionsOf, parsePool, normalizedTitle, LEVEL_STEP, GENERALIST_ROLES, PERSONAL_KEYS, type MatchProfile, type PublicPool, type PublicRow, type RegionChoice } from '../src/index.ts';
import { COVERS, LEVELS, MOBILE_TITLE, TERMS, kindOf, levelOf, termsIn } from '../src/vocab.ts';
import { matchUnder, type MatchRow } from '../src/match.ts';
import type { CorpusStats } from '../src/relevance.ts';

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
  co: fc.constantFrom('', '', '', '', 'Nordic Consulting', 'Talent Partners', 'Bemanning Group'), tail: fc.constantFrom('', '', '', '', ' (Contract)', ' - Freelance', ' to Acme Robotics'),
  tags: fc.subarray(['typescript', 'react', 'platform', 'frontend', 'fullstack', 'forward-deployed', 'product-engineer', 'si-llm', 'agentic', 'physical']),
}).map(r => ({
  id: `prop:${n}`, source: 'synthetic', company: r.co || `Company ${n % 7}`, title: `${`${r.level} ${r.words.join(', ')} Engineer`.trim()}${r.tail}`,
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
const OUTPUT_KEYS = new Set(['id', 'title', 'company', 'url', 'location', 'region', 'remote', 'seniority', 'status', 'lastChecked', 'ageDays', 'stale', 'tier', 'relevance', 'score', 'reasons', 'alsoIds']);


const ok = (p: MatchProfile, pool: PublicPool, extra: Record<string, unknown> = {}) => match(p, pool, { now: NOW, ...extra });
const fixed = (stats: CorpusStats, p: MatchProfile, pool: PublicPool, extra: Record<string, unknown> = {}) => matchUnder(stats, p, pool, { now: NOW, ...extra });
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
    'Title points to a different specialty than yours', 'Status unknown, verify before applying', 'At a company on your list'].includes(r)
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

const mobileProfile = (p: MatchProfile) => MOBILE_TITLE.test(`${p.description}\n${p.goal ?? ''}`);
const withoutMobile = (p: MatchProfile, g: ReadonlyArray<MatchRow>) => (mobileProfile(p) ? g : g.filter(x => !MOBILE_TITLE.test(x.title)));
test('P7 groups ranked by tier asc, shown score desc, title names a skill, title role focus, relevance desc, lastChecked desc, id asc', () => {
  fc.assert(fc.property(profileArb, poolArb, (p, pool) => {
    const q = queryTokens(p.description, p.goal ?? '');
    const key = (x: MatchRow) => { const f = titleFocus(q, x.title); return [x.tier, -x.score, -Number(f.skill), -f.roles, -x.relevance]; };
    return groupsOf(ok(p, pool)).every(full => { const g = withoutMobile(p, full); return g.every((x, i) => {
      const y = g[i + 1];
      if (!y) return true;
      const a = key(x);
      const b = key(y);
      const k = a.findIndex((v, j) => v !== b[j]);
      if (k >= 0) return a[k]! < b[k]!;
      return x.lastChecked > y.lastChecked || (x.lastChecked === y.lastChecked && x.id < y.id);
    }); });
  }), RUNS);
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

test('P14 under fixed corpus stats, removing a row not in the output leaves every shown group unchanged', () => {
  fc.assert(fc.property(profileArb, poolArb, fc.nat(), (p, pool, k) => {
    const stats = corpusStats(pool.rows);
    const before = fixed(stats, p, pool, { limit: 5 });
    if (before.isErr() || pool.rows.length === 0) return true;
    const shown = new Set(allRows(before).map(x => x.id));
    const candidates = pool.rows.filter(r => !shown.has(r.id));
    const drop = candidates[k % Math.max(1, candidates.length)];
    if (!drop) return true;
    const after = fixed(stats, p, { ...pool, rows: pool.rows.filter(r => r.id !== drop.id) }, { limit: 5 });
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
    const flags = withoutMobile(p, r.value.groups.stretch).map(x => confirmedIn(p.region, x.region));
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
    const flags = withoutMobile(p, g).map(x => confirmedIn(p.region, x.region));
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
  if (errors > 160 || withFits < 120 || withStep < 15) throw new Error(`coverage too thin: errors ${errors}, fitsNow ${withFits}, step ${withStep} of 400`);
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

test('P22 a multi-part goal reaches the matcher as several signals', () => {
  fc.assert(fc.property(fc.subarray(['AI agents', 'drones for agriculture', 'research labs', 'developer tools', 'data engineering', 'security'], { minLength: 2 }), parts => {
    const goal = parts.join(', ');
    const u = understand({ description: 'Mid-level backend engineer working with Python and Postgres', goal })._unsafeUnwrap();
    return u.goal.length >= parts.length && parts.every(x => [...termsIn(x)].some(k => u.goal.includes(k)));
  }), RUNS);
});

test('C3 autonomous alone is not a physical-products signal; devices, robots, vehicles, drones, satellites and hardware are', () => {
  for (const x of ['Autonomous Supply Chains', 'autonomous agents', 'autonomy at work']) if (termsIn(x).has('physical')) throw new Error(x);
  for (const x of ['devices', 'robot', 'robotics', 'vehicle', 'hardware', 'drone', 'satellite', 'embedded', 'autonomous vehicles', 'autonomous driving']) if (!termsIn(x).has('physical')) throw new Error(x);
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

test('P25 a profile without mobile terms sees no mobile title in the stretch top 10 while other stretch rows remain', () => {
  fc.assert(fc.property(profileArb, poolArb, (p, pool) => {
    if (mobileProfile(p)) return true;
    const r = ok(p, pool, BIG);
    if (r.isErr()) return true;
    const st = r.value.groups.stretch;
    const others = st.filter(x => !MOBILE_TITLE.test(x.title)).length;
    return st.slice(0, Math.min(10, others)).every(x => !MOBILE_TITLE.test(x.title));
  }), RUNS);
});

test('P25 mobile rows are never dropped: they sit in stretch, never in fits-now or step', () => {
  fc.assert(fc.property(profileArb, poolArb, (p, pool) => {
    if (mobileProfile(p)) return true;
    const r = ok(p, pool, BIG);
    if (r.isErr()) return true;
    const mobileIds = (q: MatchProfile) => { const x = ok(q, { ...pool, rows: pool.rows.map(row => ({ ...row, title: row.title.replace(/\b(iOS|Android|Mobile)\b/g, 'Widget') })) }, BIG); return x; };
    const stripped = mobileIds(p);
    const shownNow = new Set(allRows(r).flatMap(x => [x.id, ...x.alsoIds]));
    const mobileRows = pool.rows.filter(row => MOBILE_TITLE.test(row.title)).map(row => row.id);
    const shownStripped = new Set(allRows(stripped).flatMap(x => [x.id, ...x.alsoIds]));
    return mobileRows.every(id => !shownStripped.has(id) || shownNow.has(id))
      && [...r.value.groups.fitsNow, ...r.value.groups.stepTowardGoal].every(x => !MOBILE_TITLE.test(x.title));
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

test('product-only off: results are identical to leaving the filter out', () => {
  fc.assert(fc.property(profileArb, poolArb, (p, pool) =>
    JSON.stringify(ok(p, pool)) === JSON.stringify(ok({ ...p, productOnly: false }, pool))), RUNS);
});

test('product-only on: no agency, consultancy or freelance row appears, collapsed ids included', () => {
  fc.assert(fc.property(profileArb, poolArb, (p, pool) => {
    const byId = rowById(pool);
    return allRows(ok({ ...p, productOnly: true }, pool, BIG)).every(x => [x.id, ...x.alsoIds].every(id => !isAgencyRow(byId.get(id)!)));
  }), RUNS);
});

test('product-only on only removes flagged rows: every other row is still shown', () => {
  fc.assert(fc.property(profileArb, poolArb, (p, pool) => {
    const ids = (r: ReturnType<typeof match>) => new Set(allRows(r).flatMap(x => [x.id, ...x.alsoIds]));
    const off = ids(ok(p, pool, BIG));
    const on = ids(ok({ ...p, productOnly: true }, pool, BIG));
    const byId = rowById(pool);
    return [...on].every(id => off.has(id)) && [...off].every(id => on.has(id) || isAgencyRow(byId.get(id)!));
  }), RUNS);
});

test('product-only filter is live: generated pools do contain flagged rows that it removes', () => {
  const removed = fc.sample(fc.tuple(profileArb, poolArb), { numRuns: 200, seed: RUNS.seed }).filter(([p, pool]) => {
    const off = allRows(ok(p, pool, BIG)).length;
    const on = allRows(ok({ ...p, productOnly: true }, pool, BIG)).length;
    return on < off;
  }).length;
  if (removed < 20) throw new Error(`filter removed rows in only ${removed} of 200 runs`);
});

const tokenArb = fc.constantFrom('backend', 'frontend', 'fullstack', 'platform', 'python', 'typescript', 'react', 'go', 'rust', 'ai', 'ml', 'security', 'data', 'robot', 'device', 'agent', 'infrastructure', 'payments', 'search', 'growth');
test('relevance is monotonic: adding a token the row carries never lowers it, adding any token never lowers it', () => {
  fc.assert(fc.property(profileArb, poolArb, tokenArb, fc.nat(), (p, pool, extra, k) => {
    if (!pool.rows.length) return true;
    const stats = corpusStats(pool.rows);
    const row = pool.rows[k % pool.rows.length]!;
    const q = queryTokens(p.description, p.goal ?? '');
    const own = rowTokens(row);
    const add = own.length ? own[k % own.length]! : extra;
    const base = relevance(q, row, stats);
    return relevance(new Set([...q, add]), row, stats) >= base && relevance(new Set([...q, extra]), row, stats) >= base
      && (q.has(add) || !own.includes(add) || relevance(new Set([...q, add]), row, stats) > base);
  }), RUNS);
});

test('relevance is shuffle-invariant and identical on rerun', () => {
  fc.assert(fc.property(profileArb, poolArb, fc.integer(), (p, pool, seed) => {
    const order = [...pool.rows].map((row, i) => ({ row, k: Math.imul(i + 1, seed | 1) >>> 0 })).sort((x, y) => x.k - y.k).map(x => x.row);
    const a = corpusStats(pool.rows);
    const b = corpusStats(order);
    const q = queryTokens(p.description, p.goal ?? '');
    return pool.rows.every(row => relevance(q, row, a) === relevance(q, row, b) && relevance(q, row, a) === relevance(q, row, corpusStats(pool.rows)));
  }), RUNS);
});

test('relevance through match: adding a title token of a shown row to the description never lowers its relevance', () => {
  let tried = 0;
  let vanished = 0;
  fc.assert(fc.property(profileArb, poolArb, fc.nat(), (p, pool, k) => {
    const before = ok(p, pool, BIG);
    if (before.isErr()) return true;
    const shown = allRows(before);
    const row = shown[k % Math.max(1, shown.length)];
    if (!row) return true;
    const toks = rowTokens({ title: row.title, role_tags: [] });
    const tok = toks[k % Math.max(1, toks.length)];
    if (!tok || /^(?:mobile|junior|intern|manager)$/.test(tok)) return true;
    const after = ok({ ...p, description: `${p.description} ${tok}` }, pool, BIG);
    if (after.isErr()) return true;
    tried += 1;
    const rows = allRows(after);
    const again = rows.find(x => x.id === row.id);
    if (!again) { if (!rows.some(x => x.alsoIds.includes(row.id))) vanished += 1; return true; }
    return again.relevance >= row.relevance;
  }), RUNS);
  if (tried < 20 || vanished > tried * 0.1) throw new Error(`row left the output in ${vanished} of ${tried} runs`);
});

const LOCATIONS = ['', ', Rome', ', Paris', ' - Berlin', ' - EMEA Remote', ' (London)', ' | Sweden | Remote', ' (Remote, EU)', ', Stockholm', ' - US Remote'];
const ROLE_PARTS = ['', ' (Runtime)', ' (Infrastructure)', ' (Backend Leaning)', ', Developer Enablement', ' - Telemetry', ' (AI Platform)', ', Payments'];
const dupPool = fc.record({
  base: fc.constantFrom('Senior Backend Engineer', 'Platform Engineer', 'Full-Stack Engineer', 'AI Engineer', 'Senior Software Engineer'),
  variants: fc.array(fc.record({ role: fc.constantFrom(...ROLE_PARTS), loc: fc.constantFrom(...LOCATIONS), region: fc.constantFrom('SE', 'EU', 'UK') }), { minLength: 2, maxLength: 8 }),
}).map(({ base, variants }) => ({
  base, variants,
  pool: { version: 'prop', checkedRange: { from: '2026-11-01', to: '2026-11-18' }, rows: variants.map((v, i): PublicRow => ({
    id: `dup:${i}`, source: 'synthetic', company: 'Acme', title: `${base}${v.role}${v.loc}`, url: `https://jobs.example.com/d${i}`, location: null, remote: 'remote',
    region: v.region, role_tags: ['typescript'], seniority: 'senior', posted_at: null, status: 'open', status_checked_at: '2026-11-18T08:00:00Z' })) } as PublicPool,
}));
const DUP_PROFILE: MatchProfile = { description: 'Senior backend platform software engineer, full-stack, AI, TypeScript', region: 'any', remote: 'any' };

test('C1 two rows with different role words never merge; P26 every absorbed id has the same company and location-free title', () => {
  fc.assert(fc.property(dupPool, ({ pool }) => {
    const r = ok(DUP_PROFILE, pool, BIG);
    if (r.isErr()) return true;
    const byId = rowById(pool);
    return allRows(r).every(x => x.alsoIds.every(id => {
      const other = byId.get(id)!;
      return other.company === x.company && normalizedTitle(other.title) === normalizedTitle(x.title);
    }));
  }), RUNS);
});

test('P27 "Also listed in N more locations" has N = alsoIds and absorbed titles differ only in location parts', () => {
  fc.assert(fc.property(dupPool, ({ pool, variants, base }) => {
    const r = ok(DUP_PROFILE, pool, BIG);
    if (r.isErr()) return true;
    return allRows(r).every(x => {
      const reason = x.reasons.find(z => z.startsWith('Also listed in '));
      const n = reason ? Number(/(\d+)/.exec(reason)![1]) : 0;
      if (n !== x.alsoIds.length) return false;
      const role = (id: string) => variants[Number(id.slice(4))]!.role;
      return x.alsoIds.every(id => role(id) === role(x.id)) && x.title.startsWith(base);
    });
  }), RUNS);
});

test('C2 trailing ", City" and " - City" are location parts; role parts are not', () => {
  for (const l of LOCATIONS.filter(Boolean)) if (normalizedTitle(`AI/ML Engineer${l}`) !== normalizedTitle('AI/ML Engineer')) throw new Error(l);
  for (const r of ROLE_PARTS.filter(Boolean)) if (normalizedTitle(`Platform Engineer${r}`) === normalizedTitle('Platform Engineer')) throw new Error(r);
  if (!isLocationPart('Remote, EU') || isLocationPart('Runtime') || isLocationPart('Payments')) throw new Error('isLocationPart');
});

test('collapse in fits-now: location-only duplicates show once with the rest in alsoIds', () => {
  fc.assert(fc.property(dupPool, ({ pool, variants }) => {
    const r = ok(DUP_PROFILE, pool, BIG);
    if (r.isErr()) return true;
    const fits = r.value.groups.fitsNow;
    const roles = new Map<string, number>();
    for (const [i, v] of variants.entries()) if (fits.some(x => x.id === `dup:${i}` || x.alsoIds.includes(`dup:${i}`))) roles.set(v.role, (roles.get(v.role) ?? 0) + 1);
    return fits.length === roles.size && fits.reduce((n, x) => n + 1 + x.alsoIds.length, 0) === [...roles.values()].reduce((a, b) => a + b, 0);
  }), RUNS);
});

test('no fits-now row is above the profile level', () => {
  fc.assert(fc.property(profileArb, poolArb, (p, pool) => {
    const r = ok(p, pool, BIG);
    if (r.isErr() || !r.value.understood.seniority) return true;
    const mine = LEVELS.indexOf(r.value.understood.seniority);
    return r.value.groups.fitsNow.every(x => x.seniority === null || LEVELS.indexOf(x.seniority as typeof LEVELS[number]) <= mine);
  }), RUNS);
});

test('P28 widening the region list never drops a fits-now row', () => {
  fc.assert(fc.property(profileArb, poolArb, fc.subarray(['SE', 'EU', 'UK', 'US'] as const, { minLength: 1 }), fc.subarray(['SE', 'EU', 'UK', 'US'] as const), (p, pool, small, extra) => {
    const big = [...new Set([...small, ...extra])];
    const fits = (region: RegionChoice) => { const r = ok({ ...p, region }, pool, BIG); return new Set(r.isOk() ? r.value.groups.fitsNow.flatMap(x => [x.id, ...x.alsoIds]) : []); };
    const a = fits(small);
    const b = fits(big);
    return [...a].every(id => b.has(id));
  }), RUNS);
});

test('C4 multi-region rows interleave by relevance, not by region order', () => {
  fc.assert(fc.property(profileArb, poolArb, (p, pool) => {
    const a = ok({ ...p, region: ['SE', 'UK', 'EU'] }, pool, BIG);
    const b = ok({ ...p, region: ['UK', 'EU', 'SE'] }, pool, BIG);
    return JSON.stringify(a.isOk() ? a.value.groups : a.error) === JSON.stringify(b.isOk() ? b.value.groups : b.error);
  }), RUNS);
});

test('shown scores are multiples of the bucket and never increase down a tier', () => {
  fc.assert(fc.property(profileArb, poolArb, (p, pool) => groupsOf(ok(p, pool, BIG)).every(full => {
    const g = withoutMobile(p, full);
    return g.every(x => x.score % SCORE_BUCKET === 0) && g.every((x, i) => { const y = g[i + 1]; return !y || y.tier > x.tier || y.score <= x.score; });
  })), RUNS);
});

test('P29 within one tier a strictly higher score bucket never ranks below a lower one', () => {
  fc.assert(fc.property(profileArb, poolArb, (p, pool) => groupsOf(ok(p, pool, BIG)).every(full => {
    const g = withoutMobile(p, full);
    return g.every((x, i) => g.slice(i + 1).every(y => y.tier !== x.tier || Math.floor(y.score / SCORE_BUCKET) <= Math.floor(x.score / SCORE_BUCKET)));
  })), RUNS);
});

test('P30 repeating a profile token in a title never raises its score or relevance', () => {
  fc.assert(fc.property(profileArb, poolArb, fc.nat(), fc.integer({ min: 1, max: 4 }), (p, pool, k, times) => {
    const r = ok(p, pool, BIG);
    if (r.isErr()) return true;
    const shown = allRows(r);
    const x = shown[k % Math.max(1, shown.length)];
    if (!x) return true;
    const q = queryTokens(p.description, p.goal ?? '');
    const word = x.title.split(/\s+/).find(w => tokensOf(w).some(t => q.has(t)));
    if (!word) return true;
    const stats = corpusStats(pool.rows);
    const row = pool.rows.find(y => y.id === x.id)!;
    const stuffed = { ...row, title: `${row.title}${` ${word}`.repeat(times)}` };
    const one = fixed(stats, p, { ...pool, rows: [row] }, BIG);
    const many = fixed(stats, p, { ...pool, rows: [stuffed] }, BIG);
    if (one.isErr() || many.isErr()) return one.isErr() === many.isErr();
    const a = allRows(one)[0];
    const b = allRows(many)[0];
    return !a || !b || (b.score <= a.score && b.relevance <= a.relevance);
  }), RUNS);
});

test('P31 a posting id and a company plus location-free title appear in at most one group', () => {
  fc.assert(fc.property(profileArb, poolArb, (p, pool) => {
    const rows = allRows(ok(p, pool, BIG));
    const ids = rows.flatMap(x => [x.id, ...x.alsoIds]);
    const keys = rows.map(x => `${x.company.toLowerCase().trim()}|${normalizedTitle(x.title)}`);
    return new Set(ids).size === ids.length && new Set(keys).size === keys.length;
  }), RUNS);
});

test('E3 a collapsed key stays in its best group', () => {
  fc.assert(fc.property(profileArb, poolArb, (p, pool) => {
    const r = ok(p, pool, BIG);
    if (r.isErr()) return true;
    const stats = corpusStats(pool.rows);
    const alone = (row: PublicRow) => { const one = fixed(stats, p, { ...pool, rows: [row] }, BIG); return one.isOk() ? groupsOf(one).findIndex(g => g.length > 0) : -1; };
    const byId = rowById(pool);
    return groupsOf(r).every((g, gi) => g.every(x => alone(byId.get(x.id)!) === gi && x.alsoIds.every(id => { const a = alone(byId.get(id)!); return a === -1 || a >= gi; })));
  }), RUNS);
});

test('E2 a title that is mostly a skill list is damped against the same role named plainly', () => {
  const stats = corpusStats([]);
  const q = queryTokens('Senior full-stack engineer with Node.js, Python, TypeScript and React');
  const plain = relevance(q, { title: 'Senior Fullstack Developer', role_tags: [] }, stats);
  const stuffed = relevance(q, { title: 'Senior Fullstack Developer (Node.js + Python + TypeScript + React)', role_tags: [] }, stats);
  if (stuffed > plain * 1.5) throw new Error(`stuffing not damped: ${stuffed} vs ${plain}`);
});

test('removing a row not in the output never changes which group any remaining row lands in', () => {
  fc.assert(fc.property(profileArb, poolArb, fc.nat(), (p, pool, k) => {
    const before = ok(p, pool, BIG);
    if (before.isErr()) return true;
    const members = (r: typeof before) => groupsOf(r).map(g => g.flatMap(x => [x.id, ...x.alsoIds]).sort());
    const shown = new Set(members(before).flat());
    const candidates = pool.rows.filter(r => !shown.has(r.id));
    const drop = candidates[k % Math.max(1, candidates.length)];
    if (!drop) return true;
    const after = ok(p, { ...pool, rows: pool.rows.filter(r => r.id !== drop.id) }, BIG);
    return after.isOk() && JSON.stringify(members(before)) === JSON.stringify(members(after));
  }), RUNS);
});

const FILLER = ['I want to go further.', 'Help us grow.', 'Happy to help us scale.', "Let's go!", 'I would really love to grow with you.', 'We can get it done.'];
test('filler sentences never change any group or the top 10', () => {
  fc.assert(fc.property(profileArb, poolArb, fc.subarray(FILLER, { minLength: 1 }), (p, pool, fill) => {
    const before = ok(p, pool, BIG);
    const after = ok({ ...p, description: `${p.description} ${fill.join(' ')}` }, pool, BIG);
    if (before.isErr() || after.isErr()) return before.isErr() === after.isErr();
    const ids = (r: typeof before, n: number) => groupsOf(r).map(g => g.slice(0, n).map(x => x.id));
    return JSON.stringify(ids(before, 10_000)) === JSON.stringify(ids(after, 10_000)) && JSON.stringify(ids(before, 10)) === JSON.stringify(ids(after, 10));
  }), RUNS);
});

test('the relevance query keeps go only as the language and drops place words', () => {
  const q = queryTokens('I want to go further and help us scale from the UK, Stockholm or New York', 'Go developer, golang');
  for (const t of ['go', 'us', 'uk', 'stockholm', 'new', 'york', 'further']) if (q.has(t)) throw new Error(`query kept ${t}`);
  if (!q.has('golang')) throw new Error('query lost the language');
  if (!tokensOf('Senior Go Engineer').includes('golang')) throw new Error('title lost the language');
});

const LANGS: ReadonlyArray<[string, string]> = [['Go', 'golang'], ['Rust', 'rust'], ['Python', 'python'], ['TypeScript', 'typescript']];
test('P32 for a profile naming language L, "X Engineer (L)" ranks above "X Engineer" of equal score', () => {
  fc.assert(fc.property(fc.constantFrom(...LANGS), fc.constantFrom('Backend', 'Platform', 'Software', 'Senior Backend', 'Infrastructure', 'Fullstack'), fc.constantFrom('SE', 'EU', 'UK'),
    fc.constantFrom('', ' and distributed systems', ', APIs and Postgres'), (lang, x, region, extra) => {
    const base = { source: 'synthetic', company: 'Example', url: 'https://jobs.example.com/x', location: null, remote: 'remote' as const, region, role_tags: [],
      seniority: 'senior' as const, posted_at: null, status: 'open' as const, status_checked_at: '2026-11-18T08:00:00Z' };
    const named = { ...base, id: 'p32:named', company: 'Named Co', title: `${x} Engineer (${lang[0]})` };
    const plain = { ...base, id: 'p32:plain', company: 'Plain Co', title: `${x} Engineer` };
    const pool: PublicPool = { version: 'p32', checkedRange: { from: '2026-11-18T08:00:00Z', to: '2026-11-18T08:00:00Z' }, rows: [plain, named] };
    const r = ok({ description: `Senior backend engineer, 8 years of ${lang[0]}${extra}`, region: [region] }, pool, BIG);
    if (r.isErr()) return false;
    const g = groupsOf(r).find(gr => gr.some(y => y.id === named.id));
    const a = g?.findIndex(y => y.id === named.id) ?? -1;
    const b = g?.findIndex(y => y.id === plain.id) ?? -1;
    if (a < 0) return false;
    if (b < 0) return true;
    return g![a]!.score !== g![b]!.score || g![a]!.tier !== g![b]!.tier || a < b;
  }), RUNS);
});

test('F1 Go counts as a language in language contexts on both sides and never as a lowercase verb', () => {
  const VERB = ['I want to go further.', "Let's go!", 'Go further with us.', 'Ready to go and grow.', 'We can go faster.', 'Happy to go the extra mile.'];
  const LANG = ['I write Go every day.', '7 years of Go and Postgres.', 'Backend: Go, Python.', 'Experience in go.', 'python and go', 'Go is my main language.', 'Senior Go developer'];
  const TITLE = ['Backend Engineer (Go)', 'Software Engineer - Go', 'Senior Backend Engineer(Go), Storage', 'Go Engineer', 'Product Engineer - Python and/or Go'];
  fc.assert(fc.property(fc.constantFrom(...VERB), fc.constantFrom(...LANG), fc.constantFrom(...TITLE), fc.constantFrom('', 'Senior backend engineer with Rust. '), (verb, lang, title, lead) => {
    const vq = queryTokens(`${lead}${verb}`);
    const lq = queryTokens(`${lead}${lang}`);
    return !vq.has('golang') && !vq.has('go') && lq.has('golang') && rowTokens({ title, role_tags: [] }).includes('golang') && relevance(lq, { title, role_tags: [] }, corpusStats([])) > 0
      && termsIn(languageGo(lang)).has('go') && !termsIn(verb).has('go');
  }), RUNS);
});

test('F1 us and uk count only through the place boost, in any case', () => {
  fc.assert(fc.property(fc.constantFrom('help us', 'Help US grow', 'based in the UK', 'to the uk', 'remote from the US', 'US or UK'), fc.constantFrom('Senior backend engineer with Python', 'Frontend engineer, React'), (place, d) => {
    const a = [...queryTokens(d)].sort().join(' ');
    const b = [...queryTokens(`${d}, ${place}`)].sort().join(' ');
    return a === b;
  }), RUNS);
});

test('precision: inside a score band a title naming the profile focus ranks above a generic title', () => {
  fc.assert(fc.property(profileArb, poolArb, (p, pool) => {
    const q = queryTokens(p.description, p.goal ?? '');
    return groupsOf(ok(p, pool, BIG)).every(full => { const g = withoutMobile(p, full); return g.every((x, i) => g.slice(i + 1).every(y => {
      if (x.tier !== y.tier || x.score !== y.score) return true;
      const fx = titleFocus(q, x.title);
      const fy = titleFocus(q, y.title);
      return Number(fx.skill) >= Number(fy.skill) && (fx.skill !== fy.skill || fx.roles >= fy.roles);
    })); });
  }), RUNS);
});

const COMPANY_LIKES = ['Company 0', 'company 3', 'COMPANY 5 AB', 'Nordic Consulting', 'Talent Partners Inc', 'Bemanning'];
const INTEREST_LIKES = ['robotics', 'payments', 'AI agents', 'developer tools', 'climate'];
const likesArb = (pool: ReadonlyArray<string>) => fc.tuple(fc.subarray(pool, { minLength: 1 }), fc.constantFrom(', ', '; ', '\n', ',')).map(([xs, sep]) => xs.join(sep));
const members = (r: ReturnType<typeof match>) => groupsOf(r).map(g => g.flatMap(x => [x.id, ...x.alsoIds]).sort());
const likedCo = (likes: string) => { const l = likedEntries(likes); return (c: string) => likesCompany(l, c); };

test('L1 an empty or blank likes box leaves the output byte-identical', () => {
  fc.assert(fc.property(profileArb, poolArb, fc.constantFrom('', ' ', ',,;', '\n\n', 'a', ' , x ;'), (p, pool, likes) =>
    JSON.stringify(ok(p, pool, BIG)) === JSON.stringify(ok({ ...p, likes }, pool, BIG))), RUNS);
});

test('L2 likes never add, drop or regroup a row, only reorder', () => {
  fc.assert(fc.property(profileArb, poolArb, likesArb([...COMPANY_LIKES, ...INTEREST_LIKES]), (p, pool, likes) => {
    const a = ok(p, pool, BIG);
    const b = ok({ ...p, likes }, pool, BIG);
    if (a.isErr() || b.isErr()) return a.isErr() === b.isErr();
    return JSON.stringify(members(a)) === JSON.stringify(members(b)) && JSON.stringify(a.value.totals) === JSON.stringify(b.value.totals);
  }), RUNS);
});

test('L3 a liked company counts once: its score rises by exactly the fixed points and no other row passes it', () => {
  fc.assert(fc.property(profileArb, poolArb, likesArb(COMPANY_LIKES), (p, pool, likes) => {
    const a = ok(p, pool, BIG);
    const b = ok({ ...p, likes }, pool, BIG);
    if (a.isErr() || b.isErr()) return a.isErr() === b.isErr();
    const isLiked = likedCo(likes);
    const before = groupsOf(a);
    return groupsOf(b).every((g, gi) => g.every((x, i) => {
      const old = before[gi]!.find(y => y.id === x.id);
      if (!old) return true;
      const liked = isLiked(x.company);
      if (x.score !== old.score + (liked ? LIKED_POINTS : 0)) return false;
      if (liked !== x.reasons.includes('At a company on your list')) return false;
      if (!liked) return true;
      const above = (rows: ReadonlyArray<MatchRow>, at: number) => rows.slice(0, at).filter(y => !isLiked(y.company)).length;
      return above(g, i) <= above(before[gi]!, before[gi]!.indexOf(old));
    }));
  }), RUNS);
});

test('L4 likes are never echoed and personal details in them stop the match', () => {
  fc.assert(fc.property(profileArb, poolArb, likesArb([...COMPANY_LIKES, ...INTEREST_LIKES]), (p, pool, likes) => {
    const marked = `${likes}, quokkazebra`;
    const r = ok({ ...p, likes: marked }, pool, BIG);
    const pii = ok({ ...p, likes: `${likes}, ${['someone', 'example.com'].join('@')}` }, pool, BIG);
    return pii.isErr() && pii.error.kind === 'PiiDetected' && !JSON.stringify(r).includes('quokkazebra') && allRows(r).every(x => x.reasons.every(y => reasonOk(y, x)));
  }), RUNS);
});

test('L5 a liked name matches the company by whole leading words, in any case, with or without a legal suffix', () => {
  fc.assert(fc.property(fc.constantFrom('spotify', 'klarna', 'einride', 'acme-robotics', 'Polestar'), fc.constantFrom('', ' AB', ' Inc', ' ltd'), fc.constantFrom((s: string) => s, (s: string) => s.toUpperCase(), (s: string) => s.replace(/-/g, ' ')), (co, suffix, shape) => {
    const liked = likedEntries(`${shape(co)}${suffix}`);
    return likesCompany(liked, co) && !likesCompany(liked, `x${co}`) && !likesCompany(likedEntries(`${co}x`), co);
  }), RUNS);
});

const LIST_SKILLS =['Go', 'Rust', 'Python', 'TypeScript', 'React', 'Kubernetes', 'Java', 'Node.js'];
test('S1 the skill tie-break counts once and never for a title listing two or more skills', () => {
  fc.assert(fc.property(fc.constantFrom('Frontend', 'Backend', 'Platform', 'Software', 'Fullstack'), fc.shuffledSubarray(LIST_SKILLS, { minLength: 2, maxLength: 4 }),
    fc.constantFrom(', ', ' + ', '/', ' and '), (x, skills, sep) => {
    const d = `Senior ${x.toLowerCase()} engineer, 8 years of ${skills.join(', ')}`;
    const q = queryTokens(d);
    const listed = `${x} Engineer (${skills.join(sep)})`;
    const single = `${x} Engineer (${skills[0]})`;
    if (titleFocus(q, listed).skill || !titleFocus(q, single).skill) return false;
    const base = { source: 'synthetic', url: 'https://jobs.example.com/x', location: null, remote: 'remote' as const, region: 'SE', role_tags: [],
      seniority: 'senior' as const, posted_at: null, status: 'open' as const, status_checked_at: '2026-11-18T08:00:00Z' };
    const rows = [{ ...base, id: 's1:list', company: 'List Co', title: listed }, { ...base, id: 's1:single', company: 'Single Co', title: single }];
    const r = ok({ description: d }, { version: 's1', checkedRange: { from: '2026-11-18T08:00:00Z', to: '2026-11-18T08:00:00Z' }, rows }, BIG);
    if (r.isErr()) return false;
    return groupsOf(r).every(g => {
      const a = g.findIndex(y => y.id === 's1:single');
      const b = g.findIndex(y => y.id === 's1:list');
      return a < 0 || b < 0 || g[a]!.tier !== g[b]!.tier || g[a]!.score !== g[b]!.score || a < b;
    });
  }), RUNS);
});

test('F2 go in any case, alone or at any place in a comma or slash list, reads as the language on both paths', () => {
  fc.assert(fc.property(fc.constantFrom('go', 'Go'), fc.array(fc.constantFrom('Rust', 'Postgres', 'distributed systems', 'Kubernetes', 'backend', 'python'), { maxLength: 3 }),
    fc.nat(), fc.constantFrom(', ', ',', '/'), fc.constantFrom('', ',', '.'), (go, others, at, sep, end) => {
    const items: string[] = [...others];
    items.splice(at % (items.length + 1), 0, go);
    const d = `${items.join(sep)}${end}`;
    return termsIn(d).has('go') && queryTokens(d).has('golang');
  }), RUNS);
});
