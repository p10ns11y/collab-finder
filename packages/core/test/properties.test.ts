import { test } from 'node:test';
import fc from 'fast-check';
import { inEnglish, inScope, likesText, mostlyNonLatin, regionOf, LIKED_POINTS, likedEntries, likesCompany, SCORE_BUCKET, titleFocus, languageGo, corpusStats, queryTokens, relevance, rowTokens, tokensOf, isLocationPart, isAgencyRow, match, understand, regionsOf, parsePool, normalizedTitle, LEVEL_STEP, GENERALIST_ROLES, PERSONAL_KEYS, type MatchProfile, type PublicPool, type PublicRow, type RegionChoice } from '../src/index.ts';
import { COVERS, LEVELS, MOBILE_TITLE, TERMS, hasLeadershipPhrase, hasSwedish, isLeadershipRow, kindOf, levelOf, swedishOnlyTitle, termsIn } from '../src/vocab.ts';
import { matchUnder, unlistedLanguage, type MatchRow } from '../src/match.ts';
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
    'Title points to a different specialty than yours', 'Status unknown, verify before applying', 'At a company on your list', 'Matches an interest you named'].includes(r)
  || /^(Posting level: |Level fits: )(junior|mid|senior|staff|principal)$/.test(r) || /^One level above yours \((junior|mid|senior|staff|principal)\)$/.test(r)
  || r === `Region: ${row.region}${row.location ? ` (${row.location})` : ''}`
  || /^Also listed in (1 more location|([2-9]|\d\d+) more locations)$/.test(r)
  || /^Work mode: (remote|hybrid|onsite)$/.test(r) || r === `Open when last checked (${row.lastChecked.slice(0, 10)})`;
const compat = (pref: RegionChoice | undefined, region: string | null) => {
  const prefs = regionsOf(pref);
  if (region === null || region === '') return false;
  if (region === 'remote-anywhere' || prefs.length === 0) return true;
  return region !== 'other' && prefs.some(x => region === x || (x === 'EU' && region === 'SE'));
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
const leadProfile = (p: MatchProfile) => { const u = understand(p); return u.isOk() && u.value.roles.includes('leadership'); };
const englishProfile = (p: MatchProfile) => !hasSwedish(p.description) && !hasSwedish(p.goal ?? '');
const programmeKey = (r: MatchRow) => `${r.company.toLowerCase().trim()}|${normalizedTitle(r.title).replace(/\b(?:junior|jr|senior|sr|staff|principal|lead|intern|trainee|associate|entry|level|i{1,3}|iv|vi{0,3}|\d+)\b/g, ' ').replace(/\s+/g, ' ').trim()}`;
const deferredPast = (g: ReadonlyArray<MatchRow>, index: number) => {
  if (index < 10) return false;
  const k = programmeKey(g[index]!);
  let n = 0;
  for (let i = 0; i < 10 && i < g.length; i++) if (programmeKey(g[i]!) === k) n += 1;
  return n >= 2;
};
test('P7 groups ranked by tier asc, leadership, shown score desc, language, consultancy, title skill, title role focus, relevance desc, lastChecked desc, id asc', () => {
  fc.assert(fc.property(profileArb, poolArb, (p, pool) => {
    const q = queryTokens(p.description, p.goal ?? '');
    const lead = leadProfile(p);
    const english = englishProfile(p);
    const se = regionsOf(p.region).includes('SE');
    const skills = understand(p).isOk() ? understand(p)._unsafeUnwrap().skills : [];
    const byId = rowById(pool);
    const key = (x: MatchRow) => {
      const f = titleFocus(q, x.title);
      const row = byId.get(x.id);
      const fl = { lead: row ? isLeadershipRow(row) : isLeadershipRow(x), sv: english && swedishOnlyTitle(row?.title ?? x.title), agency: isAgencyRow(row ?? x), lang: unlistedLanguage(q, row?.title ?? x.title, skills), far: se && x.region === 'remote-anywhere' };
      return [x.tier, lead ? (fl.lead ? 0 : 1) : 0, -x.score, fl.lang ? 1 : 0, fl.far ? 1 : 0, fl.sv ? 1 : 0, fl.agency ? 1 : 0, -Number(f.skill), -f.roles, -x.relevance];
    };
    return groupsOf(ok(p, pool)).every(full => { const g = withoutMobile(p, full); return g.every((x, i) => {
      const y = g[i + 1];
      if (!y || deferredPast(g, i + 1)) return true;
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

const NON_ENG_LEAD = ['Director of Finance', 'Head of People', 'Head of Growth', 'Director of Operations', 'Product Director', 'Head of Design', 'Senior Director, Corporate Counsel', 'Vice President Finance - Corporate Controller', 'Senior Director, Global Total Rewards', 'Director of Business Development', 'Partner Development Manager', 'Director, Physical Security', 'Head of Data Protection', 'Revenue Development Director', 'Business Development Manager, Cloud & AI', 'Director, Infrastructure Lease Accounting', 'Director, Strategic AI Partnerships', 'Head of People Tech & Data', 'Senior Executive Assistant to the CTO', 'Executive Assistant to Head of Engineering', 'Chief of Staff to the CTO', 'Executive Assistant, Office of the CTO', 'Director, SOX Infrastructure', 'Director, Materials Management (Starbase Infrastructure - Louisiana)', 'Head of AI Startups, EMEA'];
const ENG_LEAD = ['Engineering Manager', 'Head of Engineering', 'VP Engineering', 'Director of Engineering', 'Head of Platform', 'VP Eng', 'CTO', 'Director of Infrastructure', 'Director of Product Engineering', 'Head of Data Engineering', 'Director of Application Security', 'Director of Product Security', 'Head of AI', 'Head of IT Platform & Infrastructure', 'Utvecklingschef', 'Head of Data Science', 'Head of Information Security', 'CISO'];
const leadRows = (titles: ReadonlyArray<string>, tag: string): PublicRow[] => titles.map((title, i) => ({
  id: `${tag}:${i}`, source: 'synthetic', company: `${tag} Co ${i}`, title, url: `https://jobs.example.com/${tag}${i}`, location: null, remote: 'remote', region: 'SE',
  role_tags: [], seniority: null, posted_at: null, status: 'open', status_checked_at: '2026-11-18T08:00:00Z',
}));
test('P15 non-engineering leadership titles never appear, and engineering leadership titles appear only for a leadership profile', () => {
  fc.assert(fc.property(profileArb, poolArb, (p, pool) => {
    const r = ok(p, { ...pool, rows: [...pool.rows, ...leadRows(NON_ENG_LEAD, 'p15bad'), ...leadRows(ENG_LEAD, 'p15good')] });
    const shown = new Set(allRows(r).map(x => x.title));
    const leads = r.isOk() && r.value.understood.roles.includes('leadership');
    return NON_ENG_LEAD.every(t => !shown.has(t)) && ENG_LEAD.every(t => !shown.has(t) || leads);
  }), RUNS);
});

test('P34 every accepted leadership title contains an allowlisted phrase', () => {
  fc.assert(fc.property(fc.string({ maxLength: 80 }), fc.constantFrom(...ENG_LEAD, ...NON_ENG_LEAD, 'html', 'HTML', 'Head of HTML', 'Head of ML'), (noise, known) => {
    return [noise, known, `${noise} ${known}`].every(title => !isLeadershipRow({ title }) || hasLeadershipPhrase(title))
      && !hasLeadershipPhrase('html') && !hasLeadershipPhrase('HTML developer') && hasLeadershipPhrase('Head of ML');
  }), RUNS);
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
  fc.assert(fc.property(profileArb, poolArb, (p, pool) => {
    const lead = leadProfile(p);
    return groupsOf(ok(p, pool, BIG)).every(full => {
      const g = withoutMobile(p, full);
      return g.every(x => x.score % SCORE_BUCKET === 0) && g.every((x, i) => {
        const y = g[i + 1];
        if (!y || y.tier > x.tier || y.score <= x.score) return true;
        if (lead && isLeadershipRow(x) && !isLeadershipRow(y)) return true;
        return deferredPast(g, i + 1);
      });
    });
  }), RUNS);
});

test('P29 within one tier a strictly higher score bucket never ranks below a lower one', () => {
  fc.assert(fc.property(profileArb, poolArb, (p, pool) => {
    const lead = leadProfile(p);
    return groupsOf(ok(p, pool, BIG)).every(full => {
      const g = withoutMobile(p, full);
      return g.every((x, i) => g.slice(i + 1).every((y, j) => {
        if (y.tier !== x.tier || Math.floor(y.score / SCORE_BUCKET) <= Math.floor(x.score / SCORE_BUCKET)) return true;
        if (lead && isLeadershipRow(x) && !isLeadershipRow(y)) return true;
        return deferredPast(g, i + 1 + j);
      }));
    });
  }), RUNS);
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
    const groups = groupsOf(r);
    const employer = (x: { company: string }) => x.company.toLowerCase().trim();
    return groups.every((g, gi) => g.every(x => {
      const best = alone(byId.get(x.id)!);
      const capped = best >= 0 && best < gi && groups.slice(0, gi).some(h => h.filter(y => employer(y) === employer(x)).length >= 2);
      return (best === gi || capped) && x.alsoIds.every(id => { const a = alone(byId.get(id)!); return a === -1 || a >= gi || capped; });
    }));
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
    const lead = leadProfile(p);
    const english = englishProfile(p);
    const se = regionsOf(p.region).includes('SE');
    const skills = understand(p).isOk() ? understand(p)._unsafeUnwrap().skills : [];
    return groupsOf(ok(p, pool, BIG)).every(full => { const g = withoutMobile(p, full); return g.every((x, i) => g.slice(i + 1).every((y, j) => {
      if (x.tier !== y.tier || x.score !== y.score || deferredPast(g, i + 1 + j)) return true;
      if (lead && isLeadershipRow(x) !== isLeadershipRow(y)) return isLeadershipRow(x);
      if (unlistedLanguage(q, x.title, skills) !== unlistedLanguage(q, y.title, skills)) return !unlistedLanguage(q, x.title, skills);
      if (se && (x.region === 'remote-anywhere') !== (y.region === 'remote-anywhere')) return x.region !== 'remote-anywhere';
      if (english && swedishOnlyTitle(x.title) !== swedishOnlyTitle(y.title)) return !swedishOnlyTitle(x.title);
      if (isAgencyRow(x) !== isAgencyRow(y)) return !isAgencyRow(x);
      const fx = titleFocus(q, x.title);
      const fy = titleFocus(q, y.title);
      return Number(fx.skill) >= Number(fy.skill) && (fx.skill !== fy.skill || fx.roles >= fy.roles);
    })); });
  }), RUNS);
});

const COMPANY_LIKES = ['Company 0', 'company 3', 'COMPANY 5 AB', 'Nordic Consulting', 'Talent Partners Inc', 'Bemanning'];
const INTEREST_LIKES = ['robotics', 'payments', 'AI agents', 'developer tools', 'climate'];
const likesArb = (pool: string[]) => fc.tuple(fc.subarray(pool, { minLength: 1 }), fc.constantFrom(', ', '; ', '\n', ',')).map(([xs, sep]) => xs.join(sep));
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

const LEAD_PROFILES = ['VP engineering', 'VP of Engineering', 'Head of Engineering', 'Director of Engineering', 'Engineering Manager', 'Senior Engineering Manager', 'CTO', 'Utvecklingschef'];
const leadArb = fc.record({
  who: fc.constantFrom(...LEAD_PROFILES), level: fc.constantFrom('', 'Senior ', 'Staff '), extra: fc.constantFrom('', ', 10 years', ', backend and Python', ' leading platform teams'),
  region: fc.oneof({ weight: 2, arbitrary: fc.constant('any') }, { weight: 1, arbitrary: fc.constantFrom('SE', 'EU', 'UK', 'US') }) as fc.Arbitrary<RegionChoice>,
  remote: fc.oneof({ weight: 2, arbitrary: fc.constant('any') }, { weight: 1, arbitrary: fc.constantFrom('remote', 'hybrid', 'onsite') }) as fc.Arbitrary<MatchProfile['remote']>,
  base: poolArb,
}).map(x => ({
  profile: { description: `${x.level}${x.who}${x.extra}, looking for a new role`, region: x.region, remote: x.remote } as MatchProfile,
  pool: { ...x.base, rows: [...x.base.rows, ...leadRows(ENG_LEAD, 'lead'), ...leadRows(NON_ENG_LEAD, 'off')] } as PublicPool,
}));
test('an engineering leader whose description contains a title-veto word stays in scope and still matches', () => {
  const pool: PublicPool = { version: 'lead-scope', checkedRange: { from: '2026-11-18T08:00:00Z', to: '2026-11-18T08:00:00Z' }, rows: leadRows(ENG_LEAD, 'scope') };
  fc.assert(fc.property(fc.constantFrom(
    'Engineering director reporting to the CTO, leading 5 teams',
    'Engineering manager, previously an assistant professor, leading 8 engineers',
  ), (description) => {
    const r = ok({ description, region: 'any', remote: 'any' }, pool, BIG);
    return r.isOk() && allRows(r).length > 0;
  }), RUNS);
});

test('P33 a leadership profile is never outside what we cover when engineering leadership rows exist, sees every one of them with no filters, and never sees a non-engineering leadership title', () => {
  fc.assert(fc.property(leadArb, ({ profile, pool }) => {
    const r = ok(profile, pool, BIG);
    if (r.isErr()) return r.error.kind !== 'OutOfScope' && (profile.region !== 'any' || profile.remote !== 'any');
    const shown = new Set(allRows(r).flatMap(x => [x.id, ...x.alsoIds]));
    const eng = pool.rows.filter(row => row.id.startsWith('lead:'));
    const off = pool.rows.filter(row => row.id.startsWith('off:'));
    return r.value.understood.roles.includes('leadership') && off.every(row => !shown.has(row.id))
      && (profile.region !== 'any' || profile.remote !== 'any' || eng.every(row => shown.has(row.id)));
  }), RUNS);
});

const SV_ROLES: ReadonlyArray<[string, string]> = [['Systemutvecklare', 'software developer'], ['backendutvecklare', 'backend developer'], ['Frontendutvecklare', 'frontend developer'],
  ['fullstackutvecklare', 'fullstack developer'], ['Mjukvaruingenjör', 'software engineer'], ['utvecklare', 'developer'], ['webbutvecklare', 'web developer'],
  ['dataingenjör', 'data engineer'], ['Utvecklingschef', 'engineering manager']];
const SV_TOPICS: ReadonlyArray<[string, string]> = [['maskininlärning', 'machine learning'], ['molntjänster', 'cloud'], ['infrastruktur', 'infrastructure'], ['plattformen', 'platform'],
  ['säkerhet', 'security'], ['distribuerade system', 'distributed systems'], ['inbyggda system', 'embedded systems'], ['robotik', 'robotics'], ['hårdvara', 'hardware'],
  ['Python', 'Python'], ['TypeScript', 'TypeScript'], ['React', 'React']];
const SV_ROW: PublicRow = { id: 'v1', source: 'synthetic', company: 'Acme', title: '', url: 'https://jobs.example.com/v1', location: null, remote: 'remote',
  region: 'SE', role_tags: [], seniority: null, posted_at: null, status: 'open', status_checked_at: '2026-11-18T08:00:00Z' };
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
test('V1 a Swedish profile or title reads exactly like its English twin', () => {
  fc.assert(fc.property(fc.constantFrom('', 'Senior ', 'Staff '), fc.constantFrom(...SV_ROLES), fc.subarray([...SV_TOPICS], { minLength: 1, maxLength: 3 }), fc.integer({ min: 2, max: 15 }), poolArb,
    (level, [svRole, enRole], topics, years, pool) => {
    const sv = `${level}${svRole} med ${years} års erfarenhet av ${topics.map(x => x[0]).join(' och ')}`;
    const en = `${level}${enRole} with ${years} years experience of ${topics.map(x => x[1]).join(' and ')}`;
    const svTitle = `${level}${svRole}`;
    const enTitle = `${level}${enRole}`;
    return understand({ description: sv }).isOk() && understand({ description: en }).isOk()
      && same([...termsIn(sv)].sort(), [...termsIn(en)].sort()) && levelOf(sv) === levelOf(en) && same(tokensOf(sv), tokensOf(en))
      && same([...termsIn(svTitle)].sort(), [...termsIn(enTitle)].sort()) && inScope({ ...SV_ROW, title: svTitle }) === inScope({ ...SV_ROW, title: enTitle })
      && same(tokensOf(svTitle), tokensOf(enTitle)) && inEnglish(en) === en;
  }), RUNS);
});

const NON_LATIN = ['Старший инженер-программист', '高级后端工程师', 'مهندس برمجيات أول', 'シニアソフトウェアエンジニア', 'Ανώτερος μηχανικός λογισμικού'];
test('V2 input that is mostly not Latin script is flagged; English and Swedish never are', () => {
  fc.assert(fc.property(fc.constantFrom(...NON_LATIN), fc.constantFrom('', 'Go', 'AWS', 'React'), profileArb, fc.constantFrom(...SV_ROLES), (other, latin, p, [sv]) =>
    mostlyNonLatin(`${other} ${latin}`) && !mostlyNonLatin(p.description) && !mostlyNonLatin(`${sv} med 8 års erfarenhet av maskininlärning och säkerhet`) && !mostlyNonLatin('8 + 2 = 10')), RUNS);
});

const OPEN_ROW = { source: 'synthetic', location: null, remote: 'remote' as const, region: 'SE' as const, role_tags: [] as string[], seniority: 'senior' as const, posted_at: null, status: 'open' as const, status_checked_at: '2026-11-18T08:00:00Z' };
const posOf = (r: ReturnType<typeof match>, id: string) => allRows(r).findIndex(x => x.id === id);

test('L6 a non-company interest word in a title moves that row up', () => {
  fc.assert(fc.property(fc.constantFrom('climate', 'payments', 'search'), fc.constantFrom('Backend', 'Platform', 'Software'), fc.constantFrom('title', 'description'), (word, role, where) => {
    const hitTitle = where === 'title' ? `Senior ${role} Engineer, ${word}` : `Senior ${role} Engineer building ${word} systems`;
    const rows: PublicRow[] = [
      { ...OPEN_ROW, id: 'l6:plain', company: 'North Co', title: `Senior ${role} Engineer`, url: 'https://jobs.example.com/l6a' },
      { ...OPEN_ROW, id: 'l6:hit', company: 'South Co', title: hitTitle, url: 'https://jobs.example.com/l6b' },
    ];
    const pool: PublicPool = { version: 'l6', checkedRange: { from: '2026-11-18T08:00:00Z', to: '2026-11-18T08:00:00Z' }, rows };
    const profile: MatchProfile = { description: `Senior ${role.toLowerCase()} engineer with 8 years of experience`, region: 'any', remote: 'any' };
    if (likesCompany(likedEntries(word), 'North Co') || likesCompany(likedEntries(word), 'South Co')) return false;
    if (!likesText(likedEntries(word), hitTitle)) return false;
    const before = ok(profile, pool, BIG);
    const after = ok({ ...profile, likes: word }, pool, BIG);
    if (before.isErr() || after.isErr()) return false;
    const hit = allRows(after).find(x => x.id === 'l6:hit');
    return !!hit && hit.score === (allRows(before).find(x => x.id === 'l6:hit')?.score ?? 0) + LIKED_POINTS
      && posOf(after, 'l6:hit') < posOf(after, 'l6:plain') && posOf(after, 'l6:hit') <= posOf(before, 'l6:hit');
  }), RUNS);
});

test('L7 when no interest word matches a company or title, the result says so once', () => {
  fc.assert(fc.property(profileArb, poolArb, fc.constantFrom('xylophonequartz', 'blorptang', 'quokkazebra'), (p, pool, word) => {
    const r = ok({ ...p, likes: word }, pool, BIG);
    if (r.isErr()) return r.error.kind !== 'PiiDetected';
    const hit = pool.rows.some(row => likesCompany(likedEntries(word), row.company) || likesText(likedEntries(word), row.title));
    return r.value.likesMiss === !hit && !JSON.stringify(r).includes(word);
  }), RUNS);
});

const KNOWN_PLACES: ReadonlyArray<readonly [string, string, 'SE' | 'EU' | 'UK' | 'US' | 'other']> = [
  ['Porto Alegre', 'Brazil', 'other'], ['São Paulo', 'Brazil', 'other'], ['Rio de Janeiro', 'Brazil', 'other'],
  ['Buenos Aires', 'Argentina', 'other'], ['Mexico City', 'Mexico', 'other'], ['Santiago', 'Chile', 'other'],
  ['Bogotá', 'Colombia', 'other'], ['Lima', 'Peru', 'other'], ['Montevideo', 'Uruguay', 'other'],
  ['Porto', 'Portugal', 'EU'], ['Lisbon', 'Portugal', 'EU'], ['Berlin', 'Germany', 'EU'], ['Amsterdam', 'Netherlands', 'EU'], ['Paris', 'France', 'EU'],
  ['Stockholm', 'Sweden', 'SE'], ['Malmö', 'Sweden', 'SE'], ['Gothenburg', 'Sweden', 'SE'],
  ['Oslo', 'Norway', 'EU'], ['Copenhagen', 'Denmark', 'EU'], ['Helsinki', 'Finland', 'EU'],
  ['London', 'United Kingdom', 'UK'], ['Manchester', 'UK', 'UK'],
  ['Austin', 'United States', 'US'], ['San Francisco', 'United States', 'US'], ['New York', 'NY', 'US'],
  ['Toronto', 'Canada', 'other'], ['Bengaluru', 'India', 'other'], ['Singapore', 'Singapore', 'other'],
];
test('G1 a known city and country classify together, and Latin America is never EU', () => {
  fc.assert(fc.property(fc.constantFrom(...KNOWN_PLACES), fc.constantFrom(', ', ' - ', ' / '), ([city, country, region], sep) => {
    const got = regionOf(`${city}${sep}${country}`);
    const latam = /brazil|argentina|mexico|chile|colombia|peru|uruguay/i.test(country);
    return got === region && (!latam || got !== 'EU');
  }), RUNS);
});

test('G2 a Latin American row tagged EU is not treated as EU', () => {
  fc.assert(fc.property(fc.constantFrom(...KNOWN_PLACES.filter(([, country, region]) => region === 'other' && /brazil|argentina|mexico|chile|colombia|peru|uruguay/i.test(country))), (pair) => {
    const [city, country] = pair;
    const row: PublicRow = { ...OPEN_ROW, id: 'g2', company: 'Example Studio', title: 'Senior UI Programmer', url: 'https://jobs.example.com/g2', location: `${city}, ${country}`, region: 'EU' };
    const pool: PublicPool = { version: 'g2', checkedRange: { from: '2026-11-18T08:00:00Z', to: '2026-11-18T08:00:00Z' }, rows: [row] };
    const profile: MatchProfile = { description: 'Senior frontend engineer with TypeScript and React, 8 years', region: 'any', remote: 'any' };
    const r = ok(profile, pool, BIG);
    const eu = ok({ ...profile, region: 'EU' }, pool, BIG);
    if (r.isErr()) return false;
    const shown = allRows(r).find(x => x.id === 'g2');
    return shown?.region === 'other' && shown.reasons.every(x => !x.startsWith('Region: EU')) && (eu.isErr() || eu.value.groups.fitsNow.every(x => x.id !== 'g2'));
  }), RUNS);
});

test('V3 a Swedish description with no region set prefers Sweden and the Nordics', () => {
  fc.assert(fc.property(
    fc.constantFrom('Systemutvecklare med 8 års erfarenhet av Go och Postgres', 'Senior backendutvecklare med 6 års erfarenhet av TypeScript', 'Mjukvaruingenjör med 10 års erfarenhet av distribuerade system'),
    fc.constantFrom(['Stockholm, Sweden', 'SE'], ['Malmö, Sweden', 'SE'], ['Oslo, Norway', 'EU'], ['Copenhagen, Denmark', 'EU'], ['Helsinki, Finland', 'EU']),
    fc.constantFrom(['Austin, TX', 'US'], ['San Francisco, CA', 'US'], ['London, UK', 'UK']),
    (desc, nordic, other) => {
      const row = (id: string, location: string, region: string): PublicRow => ({ ...OPEN_ROW, id, company: id === 'v3:n' ? 'North Co' : 'South Co', title: 'Senior Software Engineer', url: `https://jobs.example.com/${id}`, location, region });
      const pool: PublicPool = { version: 'v3', checkedRange: { from: '2026-11-18T08:00:00Z', to: '2026-11-18T08:00:00Z' }, rows: [row('v3:o', other[0], other[1]), row('v3:n', nordic[0], nordic[1])] };
      const r = ok({ description: desc }, pool, BIG);
      return r.isOk() && posOf(r, 'v3:n') >= 0 && posOf(r, 'v3:n') < posOf(r, 'v3:o');
    }), RUNS);
});

test('E1 a student learning HTML gets junior or trainee rows when the pool has them', () => {
  fc.assert(fc.property(
    fc.constantFrom('student learning HTML', 'Student learning HTML and CSS', 'a student learning HTML for a first job'),
    fc.constantFrom('Junior Software Engineer', 'Trainee Developer', 'Junior Backend Engineer', 'Software Engineering Intern'),
    fc.constantFrom('Senior Backend Engineer', 'Staff Platform Engineer'),
    (desc, juniorTitle, seniorTitle) => {
      const row = (id: string, title: string, seniority: PublicRow['seniority']): PublicRow => ({ ...OPEN_ROW, id, company: 'Example Studio', title, url: `https://jobs.example.com/${id}`, seniority });
      const pool: PublicPool = { version: 'e1', checkedRange: { from: '2026-11-18T08:00:00Z', to: '2026-11-18T08:00:00Z' }, rows: [row('e:s', seniorTitle, 'senior'), row('e:j', juniorTitle, juniorTitle.toLowerCase().includes('intern') ? 'intern' : 'junior')] };
      const r = ok({ description: desc.length < 20 ? `${desc} pages` : desc, region: 'any', remote: 'any' }, pool, BIG);
      if (r.isErr()) return false;
      const shown = allRows(r);
      return shown.some(x => x.id === 'e:j') && shown.every(x => x.id !== 'e:s') && shown.every(x => /junior|trainee|intern/i.test(x.title));
    }), RUNS);
});

test('R1 an English profile ranks a Swedish-only title below an equal English title, and a consultancy row gets no boost', () => {
  fc.assert(fc.property(
    fc.constantFrom(['Senior Software Developer', 'Senior systemutvecklare'], ['Software Engineer', 'Mjukvaruingenjör'], ['Backend Developer', 'backendutvecklare']),
    fc.constantFrom('North Consulting', 'People Agency', 'Staffing House'),
    ([enTitle, svTitle], agency) => {
      const row = (id: string, company: string, title: string): PublicRow => ({ ...OPEN_ROW, id, company, title, url: `https://jobs.example.com/${id}` });
      const pool: PublicPool = { version: 'r1', checkedRange: { from: '2026-11-18T08:00:00Z', to: '2026-11-18T08:00:00Z' }, rows: [
        row('r1:sv', 'South Co', svTitle), row('r1:en', 'North Co', enTitle), row('r1:ag', agency, enTitle), row('r1:pr', 'Plain Product', enTitle),
      ] };
      const r = ok({ description: 'Senior software developer with 8 years of experience building web applications', region: 'any', remote: 'any' }, pool, BIG);
      if (r.isErr()) return false;
      const shown = allRows(r);
      const en = shown.find(x => x.id === 'r1:en');
      const sv = shown.find(x => x.id === 'r1:sv');
      const ag = shown.find(x => x.id === 'r1:ag');
      const pr = shown.find(x => x.id === 'r1:pr');
      return !!en && !!sv && !!ag && !!pr && en.score === sv.score && en.tier === sv.tier && pr.score === ag.score && pr.tier === ag.tier
        && posOf(r, 'r1:en') < posOf(r, 'r1:sv') && posOf(r, 'r1:pr') < posOf(r, 'r1:ag');
    }), RUNS);
});

test('K1 Kotlin, Spring and Kafka are separate skills and Kotlin is not Java', () => {
  fc.assert(fc.property(
    fc.constantFrom('Kotlin', 'kotlin', 'Kotlin services'),
    fc.constantFrom('Java', 'java', 'JVM'),
    fc.constantFrom('Spring', 'Spring Boot', 'spring boot'),
    fc.constantFrom('Kafka', 'kafka'),
    (kt, java, spring, kafka) => {
      const row = (id: string, title: string): PublicRow => ({ ...OPEN_ROW, id, company: 'Example Studio', title, url: `https://jobs.example.com/${id}` });
      const pool: PublicPool = { version: 'k1', checkedRange: { from: '2026-11-18T08:00:00Z', to: '2026-11-18T08:00:00Z' }, rows: [
        row('k:kt', `Senior ${kt} Engineer`), row('k:jv', `Senior ${java} Engineer`), row('k:sp', `Senior ${spring} Engineer`), row('k:kf', `Senior ${kafka} Engineer`),
      ] };
      const hit = (description: string, id: string) => { const r = ok({ description, region: 'any', remote: 'any' }, pool, BIG); return r.isOk() && allRows(r).some(x => x.id === id); };
      const ktTerms = termsIn(`${kt} engineer`);
      const javaTerms = termsIn(`${java} engineer`);
      return ktTerms.has('kotlin') && !ktTerms.has('java') && javaTerms.has('java') && !javaTerms.has('kotlin')
        && termsIn(`${spring} developer`).has('spring') && !termsIn(`${spring} developer`).has('java')
        && termsIn(`${kafka} engineer`).has('kafka') && !termsIn(`${kafka} engineer`).has('java')
        && tokensOf(kt).includes('kotlin') && !tokensOf(kt).includes('java')
        && tokensOf(spring).includes('spring') && !tokensOf(spring).includes('java')
        && tokensOf(kafka).includes('kafka')
        && hit('Senior Kotlin engineer with 8 years of experience', 'k:kt') && !hit('Senior Java engineer with 8 years of JVM experience', 'k:kt')
        && hit('Senior Spring engineer with 8 years of experience', 'k:sp') && !hit('Senior Java engineer with 8 years of JVM experience', 'k:sp')
        && hit('Senior engineer with 8 years of Kafka experience', 'k:kf') && !hit('Senior Java engineer with 8 years of JVM experience', 'k:kf');
    }), RUNS);
});

test('R3 a leadership profile ranks engineering leadership rows above IC rows', () => {
  fc.assert(fc.property(
    fc.constantFrom('Engineering Manager', 'Head of Engineering', 'VP Engineering', 'Director of Engineering'),
    fc.constantFrom('Senior Backend Engineer', 'Backend Engineer'),
    (lead, ic) => {
      const row = (id: string, title: string): PublicRow => ({ ...OPEN_ROW, id, company: id === 'r3:l' ? 'North Co' : 'South Co', title, url: `https://jobs.example.com/${id}` });
      const pool: PublicPool = { version: 'r3', checkedRange: { from: '2026-11-18T08:00:00Z', to: '2026-11-18T08:00:00Z' }, rows: [row('r3:i', ic), row('r3:l', lead)] };
      const r = ok({ description: 'Head of Engineering, backend and Python, 10 years building services', region: 'any', remote: 'any' }, pool, BIG);
      if (r.isErr()) return false;
      const shown = allRows(r);
      const a = shown.find(x => x.id === 'r3:l');
      const b = shown.find(x => x.id === 'r3:i');
      return !!a && !!b && b.score >= a.score && posOf(r, 'r3:l') < posOf(r, 'r3:i');
    }), RUNS);
});

test('the employer cap never changes any row\'s group', () => {
  fc.assert(fc.property(
    fc.constantFrom('Repeat Studio', 'Northwind Labs', 'Example Studio'),
    fc.constantFrom('Backend Engineer', 'Software Engineer'),
    (company, title) => {
      const names = [title, `Senior ${title}`, `${title} Platform`, `Senior ${title.replace('Engineer', 'Developer')}`, title.replace('Engineer', 'Developer')];
      const row = (id: string, co: string, name: string): PublicRow => ({ ...OPEN_ROW, id, company: co, title: name, url: `https://jobs.example.com/${id}` });
      const rows = [...names.map((name, i) => row(`cap:${i}`, company, name)), ...Array.from({ length: 8 }, (_, i) => row(`cap:o${i}`, `Other Studio ${i}`, title))];
      const pool: PublicPool = { version: 'cap', checkedRange: { from: '2026-11-18T08:00:00Z', to: '2026-11-18T08:00:00Z' }, rows };
      const profile = { description: `Senior ${title.toLowerCase()} with 8 years of experience building services`, region: 'any' as const, remote: 'any' as const };
      const stats = corpusStats(rows);
      const together = fixed(stats, profile, pool, BIG);
      if (together.isErr() || together.value.groups.fitsNow.length < 5) return false;
      const groupOf = (r: ReturnType<typeof match>, id: string) => groupsOf(r).findIndex(g => g.some(x => x.id === id || x.alsoIds.includes(id)));
      return rows.every(one => {
        const alone = fixed(stats, profile, { ...pool, rows: [one] }, BIG);
        return alone.isOk() && groupOf(alone, one.id) === 0 && groupOf(together, one.id) === 0;
      });
    }), RUNS);
});

test('D1 at most two rows from one employer and programme are in the top 10', () => {
  fc.assert(fc.property(
    fc.constantFrom('Backend Engineer', 'Software Engineer'),
    fc.constantFrom('Repeat Studio', 'Northwind Labs'),
    fc.integer({ min: 8, max: 12 }),
    (title, company, others) => {
      const variants = ['', 'Senior ', 'Principal ', ''].map((lv, i) => `${lv}${title}${['', '', ' II', ' 2'][i]}`.replace(/\s+/g, ' ').trim());
      const row = (id: string, co: string, name: string): PublicRow => ({ ...OPEN_ROW, id, company: co, title: name, url: `https://jobs.example.com/${id}` });
      const same = variants.map((name, i) => row(`d:s${i}`, company, name));
      const rest = Array.from({ length: others }, (_, i) => row(`d:o${i}`, `Other Studio ${i}`, title));
      const pool: PublicPool = { version: 'd1', checkedRange: { from: '2026-11-18T08:00:00Z', to: '2026-11-18T08:00:00Z' }, rows: [...same, ...rest] };
      const r = ok({ description: `${title.toLowerCase()} with 8 years of experience building services`, region: 'any', remote: 'any' }, pool, BIG);
      if (r.isErr()) return false;
      const g = r.value.groups.fitsNow;
      const mine = (rows: ReadonlyArray<MatchRow>) => rows.filter(x => x.company.toLowerCase() === company.toLowerCase());
      const shown = allRows(r);
      return mine(g.slice(0, 10)).length <= 2 && mine(shown).length === same.length;
    }), RUNS);
});

test('D2 a learner profile keeps two early-career rows per employer in every group top 10', () => {
  fc.assert(fc.property(
    fc.constantFrom('student learning HTML', 'Student learning HTML and CSS', 'a student learning HTML for a first job'),
    fc.constantFrom('Repeat Studio', 'Northwind Labs'),
    fc.integer({ min: 8, max: 12 }),
    (desc, company, others) => {
      const titles = ['Junior Software Engineer', 'Trainee Developer', 'Software Engineering Intern', 'Junior Web Developer'];
      const row = (id: string, co: string, title: string): PublicRow => ({ ...OPEN_ROW, id, company: co, title, url: `https://jobs.example.com/${id}`, seniority: 'junior' });
      const same = titles.map((title, i) => row(`d2:s${i}`, company, title));
      const rest = Array.from({ length: others }, (_, i) => row(`d2:o${i}`, `Other Studio ${i}`, 'Junior Software Engineer'));
      const pool: PublicPool = { version: 'd2', checkedRange: { from: '2026-11-18T08:00:00Z', to: '2026-11-18T08:00:00Z' }, rows: [...same, ...rest] };
      const text = desc.length < 20 ? `${desc} pages` : desc;
      const r = ok({ description: text, region: 'any', remote: 'any' }, pool, BIG);
      if (r.isErr()) return false;
      const mine = (rows: ReadonlyArray<MatchRow>) => rows.filter(x => x.company.toLowerCase() === company.toLowerCase());
      return mine(r.value.groups.fitsNow.slice(0, 10)).length <= 2 && mine(allRows(r)).length === same.length;
    }), RUNS);
});

test('E4 an HTML learner does not get a title outside that field', () => {
  fc.assert(fc.property(
    fc.constantFrom('student learning HTML', 'Student learning HTML and CSS', 'a student learning HTML for a first job'),
    fc.constantFrom('Junior Software Engineer', 'Trainee Developer', 'Junior Web Developer'),
    fc.constantFrom('Propulsion Test Engineer', 'Junior Propulsion Engineer', 'Turbine Test Engineer Intern'),
    (desc, fit, miss) => {
      const row = (id: string, title: string): PublicRow => ({ ...OPEN_ROW, id, company: 'Example Studio', title, url: `https://jobs.example.com/${id}`, seniority: 'junior' });
      const pool: PublicPool = { version: 'e2', checkedRange: { from: '2026-11-18T08:00:00Z', to: '2026-11-18T08:00:00Z' }, rows: [row('e2:m', miss), row('e2:f', fit)] };
      const text = desc.length < 20 ? `${desc} pages` : desc;
      const r = ok({ description: text, region: 'any', remote: 'any' }, pool, BIG);
      return r.isOk() && allRows(r).some(x => x.id === 'e2:f') && allRows(r).every(x => x.id !== 'e2:m');
    }), RUNS);
});

test('R4 a title language the profile does not list ranks below an equal row', () => {
  fc.assert(fc.property(
    fc.constantFrom('Pascal', 'Cobol', 'Fortran'),
    fc.constantFrom('Python', 'Go', 'TypeScript'),
    (foreign, known) => {
      const row = (id: string, title: string): PublicRow => ({ ...OPEN_ROW, id, company: id, title, url: `https://jobs.example.com/${id}` });
      const pool: PublicPool = { version: 'r4', checkedRange: { from: '2026-11-18T08:00:00Z', to: '2026-11-18T08:00:00Z' }, rows: [row('r4:f', `${foreign} Developer`), row('r4:k', 'Software Engineer')] };
      const r = ok({ description: `Senior software developer with 8 years of ${known} experience`, region: 'any', remote: 'any' }, pool, BIG);
      if (r.isErr()) return false;
      const a = allRows(r).find(x => x.id === 'r4:k');
      const b = allRows(r).find(x => x.id === 'r4:f');
      return !!a && !!b && a.score === b.score && posOf(r, 'r4:k') < posOf(r, 'r4:f');
    }), RUNS);
});

test('R5 a Sweden profile ranks a remote-global row below a Sweden row in the same score band', () => {
  fc.assert(fc.property(
    fc.constantFrom('Senior Software Engineer', 'Software Engineer'),
    (title) => {
      const row = (id: string, region: PublicRow['region'], location: string): PublicRow => ({ ...OPEN_ROW, id, company: id, title, url: `https://jobs.example.com/${id}`, region, location });
      const pool: PublicPool = { version: 'r5', checkedRange: { from: '2026-11-18T08:00:00Z', to: '2026-11-18T08:00:00Z' }, rows: [row('r5:g', 'remote-anywhere', 'Remote'), row('r5:s', 'SE', 'Stockholm, Sweden')] };
      const r = ok({ description: 'Senior software engineer with 8 years of experience building services', region: 'SE', remote: 'any' }, pool, BIG);
      if (r.isErr()) return false;
      const se = allRows(r).find(x => x.id === 'r5:s');
      const global = allRows(r).find(x => x.id === 'r5:g');
      return !!se && !!global && se.score === global.score && posOf(r, 'r5:s') < posOf(r, 'r5:g');
    }), RUNS);
});

const RESTORED_LEAD = ['Head of Platform', 'Director of Infrastructure', 'Director of Application Security', 'VP Eng', 'Director of Product Security', 'Head of AI', 'Head of IT Platform & Infrastructure'];
test('leadership phrases accept platform, infrastructure, application security and VP Eng, and reject partner, accounting and business development', () => {
  for (const title of RESTORED_LEAD) if (!isLeadershipRow({ title })) throw new Error(title);
  for (const title of ['Business Development Manager, Cloud & AI', 'Director, Infrastructure Lease Accounting', 'Director, Strategic AI Partnerships', 'Head of People Tech & Data', 'Head of HTML', 'html']) {
    if (isLeadershipRow({ title }) || hasLeadershipPhrase(title)) throw new Error(title);
  }
  const pool: PublicPool = { version: 'lead-fix', checkedRange: { from: '2026-11-18T08:00:00Z', to: '2026-11-18T08:00:00Z' }, rows: leadRows(RESTORED_LEAD, 'restored') };
  const r = ok({ description: 'Head of Engineering, backend and Python, 10 years building services', region: 'any', remote: 'any' }, pool, BIG);
  if (r.isErr()) throw new Error(r.error.kind);
  const shown = new Set(allRows(r).map(x => x.title));
  for (const title of RESTORED_LEAD) if (!shown.has(title)) throw new Error(`missing ${title}`);
});

test('E5 an HTML learner keeps Tech Trainee Programme: Developer in fitsNow', () => {
  const row: PublicRow = { ...OPEN_ROW, id: 'e5', company: 'Example Studio', title: 'Tech Trainee Programme: Developer', url: 'https://jobs.example.com/e5', seniority: null };
  const pool: PublicPool = { version: 'e5', checkedRange: { from: '2026-11-18T08:00:00Z', to: '2026-11-18T08:00:00Z' }, rows: [row] };
  const r = ok({ description: 'student learning HTML', region: 'any', remote: 'any' }, pool, BIG);
  if (r.isErr()) throw new Error(r.error.kind);
  if (r.value.groups.fitsNow.length === 0 || !r.value.groups.fitsNow.some(x => x.id === 'e5')) throw new Error('fitsNow empty');
});

test('N6 a web-applications profile treats Product Engineer as a focus role and keeps engineer in the title tokens', () => {
  const q = queryTokens('Senior software engineer with 8 years of experience building web applications in TypeScript and React');
  if (!q.has('productengineer')) throw new Error('query missing productengineer');
  if (!q.has('fullstack')) throw new Error('query missing fullstack');
  const titleToks = tokensOf('Senior Product Engineer');
  if (!titleToks.includes('productengineer') || !titleToks.includes('engineer')) throw new Error(`title tokens ${titleToks.join(',')}`);
  if (titleFocus(q, 'Senior Product Engineer').roles < 1) throw new Error('product title has no role focus');
  if (titleFocus(q, 'Senior Fullstack Engineer').roles < 1) throw new Error('fullstack title lost role focus');
});

test('N6b Member of Technical Staff keeps software and engineer tokens for a software-engineer query', () => {
  const q = queryTokens('Senior software engineer with 8 years of experience building services in TypeScript');
  const toks = tokensOf('Member of Technical Staff - SDK (Stockholm)');
  if (!toks.includes('mts') || !toks.includes('software') || !toks.includes('engineer')) throw new Error(`mts tokens ${toks.join(',')}`);
  const rel = relevance(q, { title: 'Member of Technical Staff - SDK (Stockholm)', role_tags: [] }, corpusStats([]));
  if (rel <= 0) throw new Error(`mts relevance ${rel}`);
});

test('N6c a generalist scores Software Engineer - Product Engineering above Product Engineer or Software Engineer alone', () => {
  const profile: MatchProfile = { description: 'Senior software engineer with 8 years of experience building web applications in TypeScript and React', region: 'EU', remote: 'any' };
  const row = (id: string, title: string): PublicRow => ({ ...OPEN_ROW, id, company: id, title, url: `https://jobs.example.com/${id}`, role_tags: [], seniority: null });
  const pool: PublicPool = { version: 'n6c', checkedRange: { from: '2026-11-18T08:00:00Z', to: '2026-11-18T08:00:00Z' },
    rows: [row('n6:both', 'Software Engineer - Product Engineering'), row('n6:pe', 'Product Engineer'), row('n6:se', 'Software Engineer')] };
  const r = ok(profile, pool, BIG);
  if (r.isErr()) throw new Error(r.error.kind);
  const score = (id: string) => allRows(r).find(x => x.id === id)?.score;
  const both = score('n6:both');
  const pe = score('n6:pe');
  const se = score('n6:se');
  if (both === undefined || pe === undefined || se === undefined) throw new Error('missing row');
  if (!(both > pe) || !(both > se)) throw new Error(`scores both=${both} pe=${pe} se=${se}`);
  if (r.value.groups.fitsNow.every(x => x.id !== 'n6:both') || r.value.groups.fitsNow.every(x => x.id !== 'n6:pe')) throw new Error('not fitsNow');
});
