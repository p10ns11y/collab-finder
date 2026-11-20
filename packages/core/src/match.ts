import { err, ok, type Result } from 'neverthrow';
import type { GroupKey } from './decisions.ts';
import type { PiiKind, VisitorError, Warning } from './errors.ts';
import type { PublicPool, PublicRow } from './schema.ts';
import { corpusStats, isSkillList, queryTokens, relevance, titleFocus, tokensOf, type CorpusStats, type TitleFocus } from './relevance.ts';
import { hasSwedish, inEnglish, isLeadershipRow, isLearner, isLocationPart, leadsEngineering, regionOf, swedishOnlyTitle, COVERS, ENGINEERING_TITLE, LEVELS, MANAGER_TITLE, MOBILE_TITLE, MTS, NARROWING_ROLES, NON_ENGINEERING_TITLE, PLACES, OUTSIDE_POOL, TAG_TERMS, currentLevel, isAgencyRow, kindOf, label, levelOf, levelOfPool, termsIn, type Level } from './vocab.ts';

export const CORE_VERSION = '0.1.0';
export const MIN_CHARS = 20;
export const MAX_CHARS = 2000;
export const STALE_DAYS = 7;
export const DEFAULT_LIMIT = 30;

export type RegionPref = 'SE' | 'EU' | 'UK' | 'US' | 'any';
export type RemotePref = 'remote' | 'hybrid' | 'onsite' | 'any';
export type RegionChoice = RegionPref | ReadonlyArray<RegionPref>;
export type MatchProfile = { description: string; goal?: string; likes?: string; region?: RegionChoice; remote?: RemotePref; productOnly?: boolean };
export const LIKED_POINTS = 15;
export const MAX_LIKES = 50;
const LEGAL_SUFFIX = new Set(['ab', 'inc', 'ltd', 'llc', 'gmbh', 'plc', 'corp', 'oy', 'bv', 'as', 'aps', 'sa', 'co']);
const nameWords = (s: string): string[] => s.toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '').split(/[^a-z0-9]+/).filter(Boolean);
export type Liked = ReadonlyArray<ReadonlyArray<string>>;
export const likedEntries = (likes = ''): Liked => likes.slice(0, MAX_CHARS).split(/[,;\n]/).map(e => {
  const w = nameWords(e);
  while (w.length > 1 && LEGAL_SUFFIX.has(w[w.length - 1]!)) w.pop();
  return w;
}).filter(w => w.join('').length >= 2).slice(0, MAX_LIKES);
export const likesCompany = (liked: Liked, company: string): boolean => {
  const c = nameWords(company);
  return liked.some(e => e.length <= c.length && e.every((w, i) => c[i] === w));
};
export const likesText = (liked: Liked, text: string): boolean => {
  const tokens = nameWords(text);
  return liked.some(e => e.length > 0 && e.every(w => tokens.includes(w)));
};
export const regionsOf = (r: RegionChoice | undefined): ReadonlyArray<Exclude<RegionPref, 'any'>> => {
  const list = r === undefined ? [] : typeof r === 'string' ? [r] : [...r];
  return list.includes('any') ? [] : [...new Set(list.filter((x): x is Exclude<RegionPref, 'any'> => x !== 'any'))].sort();
};
export type MatchOptions = { now?: Date; limit?: number; excludeIds?: ReadonlySet<string> | ReadonlyArray<string> };
export const LEVEL_RELEVANCE_STEP = 1;
export const PLACE_RELEVANCE = 0.5;
export const MOBILE_FREE_TOP = 10;
export const SCORE_BUCKET = 5;
export const SKILL_POINTS: ReadonlyArray<number> = [0, 15, 23, 27, 29, 30];
export const SKILL_LIST_PENALTY = 10;
const skillPoints = (n: number): number => SKILL_POINTS[Math.min(n, SKILL_POINTS.length - 1)]!;

export type Tier = 0 | 1 | 2;
export const LEVEL_STEP = 10;
export const GENERALIST_ROLES: ReadonlySet<string> = new Set(['software', 'fullstack', 'frontend']);
export type MatchRow = {
  id: string; title: string; company: string; url: string; location: string | null;
  region: string | null; remote: PublicRow['remote']; seniority: string | null; status: PublicRow['status'];
  lastChecked: string; ageDays: number; stale: boolean; tier: Tier; relevance: number; score: number; reasons: ReadonlyArray<string>; alsoIds: ReadonlyArray<string>;
};
export type Understood = { roles: ReadonlyArray<string>; skills: ReadonlyArray<string>; goal: ReadonlyArray<string>; seniority: Level | null; places: ReadonlyArray<string>; entry: boolean; nordic: boolean; learned: ReadonlyArray<string> };
export type MatchResult = {
  coreVersion: string; poolVersion: string;
  groups: Record<GroupKey, ReadonlyArray<MatchRow>>; totals: Record<GroupKey, number>;
  warnings: ReadonlyArray<Warning>; understood: Understood; likesMiss: boolean;
};
export type MatchError = VisitorError;

const PHONE_CANDIDATE = /\+?\d[\d\s().-]{7,}\d/g;
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const ID_NUMBER = /\b(?:19|20)?\d{6}[-+]\d{4}\b/g;
export type PiiSpan = { start: number; end: number; pii: PiiKind };
export function findPii(text: string): ReadonlyArray<PiiSpan> {
  const spans: PiiSpan[] = [];
  for (const m of text.matchAll(EMAIL)) spans.push({ start: m.index, end: m.index + m[0].length, pii: 'email' });
  for (const m of text.matchAll(ID_NUMBER)) spans.push({ start: m.index, end: m.index + m[0].length, pii: 'id-number' });
  for (const m of text.matchAll(PHONE_CANDIDATE)) {
    const digits = m[0].replace(/\D/g, '');
    const yearRange = /^\s*(19|20)\d{2}\s*[-–]\s*(19|20)\d{2}\s*$/.test(m[0]);
    const inside = spans.some(s => m.index >= s.start && m.index < s.end);
    if (digits.length >= 9 && !yearRange && !inside) spans.push({ start: m.index, end: m.index + m[0].length, pii: 'phone' });
  }
  return spans.sort((a, b) => a.start - b.start);
}

export function redactPii(text: string): string {
  let out = text;
  for (const s of [...findPii(text)].sort((a, b) => b.start - a.start)) out = out.slice(0, s.start) + `[${s.pii} removed]` + out.slice(s.end);
  return out;
}

export function validateProfile(p: MatchProfile): Result<MatchProfile, VisitorError> {
  const d = typeof p.description === 'string' ? p.description.trim() : '';
  if (!d) return err({ kind: 'InputEmpty' });
  if (d.length < MIN_CHARS) return err({ kind: 'InputTooShort', minChars: MIN_CHARS, got: d.length });
  if (d.length > MAX_CHARS) return err({ kind: 'InputTooLong', maxChars: MAX_CHARS, got: d.length });
  const spans = findPii(`${d}\n${p.goal ?? ''}\n${p.likes ?? ''}`);
  if (spans.length) return err({ kind: 'PiiDetected', from: 'human', spans });
  return ok({ ...p, description: d });
}

export function understand(p: MatchProfile): Result<Understood, VisitorError> {
  const d = termsIn(p.description);
  const g = termsIn(p.goal ?? '');
  const seniority = currentLevel(p.description);
  const roles = [...d].filter(k => kindOf(k) === 'role' || kindOf(k) === 'generic');
  const skills = [...d].filter(k => kindOf(k) === 'skill');
  const entry = isLearner(p.description);
  if (seniority === 'junior' && !entry) return err({ kind: 'OutOfScope', reason: 'junior' });
  if (!entry && roles.length === 0 && skills.length === 0)
    return err({ kind: 'OutOfScope', reason: OUTSIDE_POOL.test(p.description) ? 'outside-pool-roles' : 'no-engineering-terms' });
  if (!entry && skills.length === 0 && roles.every(k => k === 'leadership') && !leadsEngineering(p.description))
    return err({ kind: 'OutOfScope', reason: OUTSIDE_POOL.test(p.description) ? 'outside-pool-roles' : 'no-engineering-terms' });
  const specific = roles.filter(k => kindOf(k) === 'role');
  if (!entry && specific.length === 0 && skills.length === 0 && OUTSIDE_POOL.test(p.description)) return err({ kind: 'OutOfScope', reason: 'outside-pool-roles' });
  const places = PLACES.filter(([, re]) => re.test(p.description)).map(([r]) => r);
  const rolesOut = entry && roles.length === 0 ? ['software'] : roles;
  const LEARNED = ['html', 'css', 'javascript', 'typescript', 'python', 'react', 'sql', 'rust', 'java', 'kotlin', 'go'];
  const learned = entry ? LEARNED.filter(s => new RegExp(`(?:^|[^a-z0-9])${s}(?=$|[^a-z0-9])`, 'i').test(p.description)) : [];
  return ok({ roles: rolesOut.sort(), skills: skills.sort(), goal: [...g].filter(k => !d.has(k) && kindOf(k) !== 'generic').sort(), seniority: entry ? 'junior' : seniority, places, entry, nordic: hasSwedish(p.description), learned });
}
const NORDIC_LOC = /(?:^|[^a-z])(?:sweden|sverige|stockholm|gothenburg|goteborg|malmo|malmö|uppsala|oslo|bergen|norway|norge|copenhagen|københavn|denmark|danmark|helsinki|espoo|finland|reykjavik|iceland|nordics?)(?=$|[^a-z])/i;

const regionOk = (prefs: ReadonlyArray<Exclude<RegionPref, 'any'>>, r: string | null): 'yes' | 'no' | 'unknown' => {
  if (r === 'remote-anywhere') return 'yes';
  if (r === null || r === 'other' || r === '') return 'unknown';
  if (prefs.length === 0) return 'yes';
  return prefs.some(pref => (pref === 'EU' ? r === 'EU' || r === 'SE' : r === pref)) ? 'yes' : 'no';
};
const remoteOk = (pref: RemotePref, r: PublicRow['remote']): 'yes' | 'no' | 'unknown' => {
  if (pref === 'any' || pref === 'onsite') return r === 'unknown' ? (pref === 'any' ? 'yes' : 'unknown') : 'yes';
  if (r === 'unknown') return 'unknown';
  if (pref === 'remote') return r === 'remote' ? 'yes' : 'no';
  return r === 'remote' || r === 'hybrid' ? 'yes' : 'no';
};
const rowTerms = (row: PublicRow): { title: Set<string>; tags: Set<string> } => {
  const tags = new Set<string>();
  for (const tag of row.role_tags) { const k = TAG_TERMS[tag]; if (k) tags.add(k); }
  return { title: termsIn(row.title), tags };
};
const dayMs = 864e5;
const ageOf = (iso: string, now: Date): number => { const t = Date.parse(iso); return Number.isFinite(t) ? Math.max(0, Math.floor((now.getTime() - t) / dayMs)) : 9999; };

export const inScope = (row: PublicRow): boolean =>
  row.seniority !== 'executive' && (ENGINEERING_TITLE.test(inEnglish(row.title)) || row.role_tags.some(t => t in TAG_TERMS)) && !NON_ENGINEERING_TITLE.test(inEnglish(row.title)) && !MANAGER_TITLE.test(inEnglish(row.title));
export const inLeadershipTrack = (u: Pick<Understood, 'roles'>, row: PublicRow): boolean => u.roles.includes('leadership') && isLeadershipRow(row);

type Scored = { group: GroupKey; row: MatchRow; mobile: 'none' | 'covered' | 'bottom' };
type Prefs = { regions: ReadonlyArray<Exclude<RegionPref, 'any'>>; remote: RemotePref; mobile: boolean; productOnly: boolean; liked: Liked; query: ReadonlySet<string>; stats: CorpusStats };
function judge(u: Understood, p: Prefs, row: PublicRow, now: Date): Scored | null {
  if (row.status === 'closed') return null;
  if (!inScope(row) && !inLeadershipTrack(u, row)) return null;
  if (p.productOnly && isAgencyRow(row)) return null;
  const rt = rowTerms(row);
  const roleHits = u.roles.filter(k => kindOf(k) === 'role' && rt.title.has(k));
  const tagRoleHits = u.roles.filter(k => kindOf(k) === 'role' && !rt.title.has(k) && rt.tags.has(k));
  const skillHits = u.skills.filter(k => rt.title.has(k) || rt.tags.has(k));
  const generalist = u.roles.some(k => GENERALIST_ROLES.has(k));
  const generalistTitle = rt.title.has('software') || rt.title.has('product') || rt.tags.has('product');
  const coveredHits = [...rt.title].filter(k => kindOf(k) === 'role' && !roleHits.includes(k) && u.roles.some(m => (COVERS[m] ?? []).includes(k)));
  const generalistHit = generalist && !roleHits.length && !coveredHits.length && generalistTitle ? [rt.title.has('product') || rt.tags.has('product') ? 'product' : 'software'] : [];
  const titleHits = [...roleHits, ...generalistHit];
  const genericHit = !titleHits.length && u.roles.includes('software') && rt.title.has('software');
  const goalHits = u.goal.filter(k => rt.title.has(k));
  if (u.entry && !entryFieldOk(row.title, u.learned)) return null;
  if (!u.entry && !titleHits.length && !coveredHits.length && !tagRoleHits.length && !skillHits.length && !genericHit && !goalHits.length) return null;

  const region = row.region === 'EU' && regionOf(row.location ?? '') === 'other' ? 'other' : row.region;
  const reg = regionOk(p.regions, region); if (reg === 'no') return null;
  const rem = remoteOk(p.remote, row.remote); if (rem === 'no') return null;
  MTS.lastIndex = 0;
  const isMts = MTS.test(row.title); MTS.lastIndex = 0;
  const rowLevel = isMts ? levelOf(row.title) : (levelOfPool(row.seniority) ?? levelOf(row.title));
  let levelGap = 0;
  if (u.seniority && rowLevel) levelGap = LEVELS.indexOf(rowLevel) - LEVELS.indexOf(u.seniority);
  if (u.entry) { if (rowLevel !== 'junior') return null; }
  else if (levelGap >= 2 || levelGap <= -2 || rowLevel === 'junior') return null;

  const mine = new Set([...u.roles, ...u.goal, ...[...u.roles, ...u.goal].flatMap(k => COVERS[k] ?? [])]);
  const mobileMismatch = !p.mobile && MOBILE_TITLE.test(row.title);
  const narrowedAway = mobileMismatch || (!roleHits.length && !coveredHits.length && [...rt.title].some(k => NARROWING_ROLES.has(k) && !mine.has(k)));

  const reasons: string[] = [];
  if (titleHits.length || coveredHits.length) reasons.push(`Title matches what you do: ${[...titleHits, ...coveredHits].map(label).join(', ')}`);
  if (tagRoleHits.length || skillHits.length) reasons.push(`Tagged with: ${[...tagRoleHits, ...skillHits].map(label).join(', ')}`);
  else if (genericHit) reasons.push('General software engineering title');
  if (goalHits.length) reasons.push(`Toward your goal: ${goalHits.map(label).join(', ')}`);
  if (!rowLevel) reasons.push('Seniority not stated in the posting');
  else if (!u.seniority) reasons.push(`Posting level: ${rowLevel}`);
  else if (levelGap === 1) reasons.push(`One level above yours (${rowLevel})`);
  else reasons.push(`Level fits: ${rowLevel}`);
  reasons.push(reg === 'unknown' ? 'Location not confirmed, check the posting' : `Region: ${region}${row.location ? ` (${row.location})` : ''}`);
  const liked = p.liked.length > 0 && likesCompany(p.liked, row.company);
  const interest = p.liked.length > 0 && !liked && likesText(p.liked, row.title);
  if (liked) reasons.push('At a company on your list');
  if (interest) reasons.push('Matches an interest you named');
  if (narrowedAway) reasons.push('Title points to a different specialty than yours');
  if (rem === 'unknown') reasons.push('Remote policy not stated');
  else if (p.remote !== 'any') reasons.push(`Work mode: ${row.remote}`);
  const ageDays = ageOf(row.status_checked_at, now);
  const stale = ageDays > STALE_DAYS;
  reasons.push(row.status === 'open' ? `Open when last checked (${row.status_checked_at.slice(0, 10)})` : 'Status unknown, verify before applying');

  const nordicHit = u.nordic && p.regions.length === 0 && (region === 'SE' || NORDIC_LOC.test(row.location ?? ''));
  const placeBonus = (region !== null && u.places.includes(region)) || nordicHit ? 6 : 0;
  const tagDepth = [...rt.tags].filter(k => u.roles.includes(k) || u.skills.includes(k) || u.goal.includes(k)).length * 3;
  const rawScore = titleHits.length * 30 + coveredHits.length * 20 + tagRoleHits.length * 10 + skillPoints(skillHits.length) + (genericHit ? 10 : 0) + goalHits.length * 25
    + placeBonus + tagDepth + ((liked || interest) ? LIKED_POINTS : 0) + (rem === 'yes' && row.remote !== 'unknown' ? 1 : 0)
    - (levelGap === 1 ? LEVEL_STEP : 0) - (rowLevel ? 0 : 3) - (reg === 'unknown' ? 5 : 0) - (rem === 'unknown' ? 3 : 0) - (row.status === 'open' ? 0 : 20)
    - (narrowedAway ? 8 : 0) - (isSkillList(row) ? SKILL_LIST_PENALTY : 0);
  const shown = Math.floor(rawScore / SCORE_BUCKET) * SCORE_BUCKET;

  const certain = row.status === 'open' && reg === 'yes' && rem === 'yes' && levelGap <= 0 && !narrowedAway;
  const strongCore = titleHits.length > 0 || coveredHits.length > 0 || (u.roles.every(k => kindOf(k) !== 'role') && (skillHits.length > 0 || genericHit)) || u.entry;
  let group: GroupKey;
  if (goalHits.length && certain && (strongCore || skillHits.length || genericHit)) group = 'stepTowardGoal';
  else if (strongCore && certain && !goalHits.length) group = 'fitsNow';
  else group = 'stretch';

  const rel = Math.round((relevance(p.query, row, p.stats) + ((region !== null && u.places.includes(region)) || nordicHit ? PLACE_RELEVANCE : 0)
    - (levelGap === 1 ? LEVEL_RELEVANCE_STEP : 0)) * 1e4) / 1e4;
  const tier: Tier = reg !== 'yes' ? 2 : row.status === 'open' && rem === 'yes' && levelGap <= 0 ? 0 : 1;
  return { group, row: {
    id: row.id, title: row.title, company: row.company, url: row.url, location: row.location, region, remote: row.remote,
    seniority: rowLevel, status: row.status, lastChecked: row.status_checked_at, ageDays, stale, tier, relevance: rel, score: shown, reasons, alsoIds: [],
  }, mobile: !mobileMismatch ? 'none' : roleHits.length || skillHits.length || coveredHits.length ? 'covered' : 'bottom' };
}

const NO_FOCUS: TitleFocus = { skill: false, roles: 0 };
type Crowd = { sv: boolean; agency: boolean; lead: boolean; lang: boolean; far: boolean };
const NO_CROWD: Crowd = { sv: false, agency: false, lead: false, lang: false, far: false };
const TITLE_LANG = new Set(['pascal', 'cobol', 'fortran', 'ada', 'haskell', 'elixir', 'erlang', 'ruby', 'php', 'perl', 'lua', 'kotlin', 'scala', 'java', 'python', 'golang', 'go', 'rust', 'typescript', 'javascript', 'cpp', 'csharp', 'swift', 'dart', 'clojure', 'matlab']);
export const unlistedLanguage = (query: ReadonlySet<string>, title: string, skills: ReadonlyArray<string> = []): boolean => {
  const have = new Set([...query, ...skills]);
  if (have.has('go') || have.has('golang')) { have.add('go'); have.add('golang'); }
  const langs = tokensOf(title).filter(t => TITLE_LANG.has(t));
  return langs.length > 0 && langs.every(t => !have.has(t));
};
const byRank = (focusOf: ReadonlyMap<string, TitleFocus>, crowdOf: ReadonlyMap<string, Crowd>, english: boolean, leadership: boolean) => (a: MatchRow, b: MatchRow): number => {
  const fa = focusOf.get(a.id) ?? NO_FOCUS;
  const fb = focusOf.get(b.id) ?? NO_FOCUS;
  const ca = crowdOf.get(a.id) ?? NO_CROWD;
  const cb = crowdOf.get(b.id) ?? NO_CROWD;
  return a.tier - b.tier || (leadership ? Number(cb.lead) - Number(ca.lead) : 0) || b.score - a.score || Number(ca.lang) - Number(cb.lang) || Number(ca.far) - Number(cb.far) || (english ? Number(ca.sv) - Number(cb.sv) : 0) || Number(ca.agency) - Number(cb.agency) || Number(fb.skill) - Number(fa.skill) || fb.roles - fa.roles || b.relevance - a.relevance || (a.lastChecked < b.lastChecked ? 1 : a.lastChecked > b.lastChecked ? -1 : 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
};

export const normalizedTitle = (t: string): string => {
  const segments = t.split('|').map(x => x.trim());
  let head = [segments[0] ?? '', ...segments.slice(1).filter(x => !isLocationPart(x))].join(' ');
  head = head.replace(/\(([^)]*)\)|\[([^\]]*)\]/g, (m, a: string | undefined, b: string | undefined) => (isLocationPart(a ?? b ?? '') ? ' ' : m));
  const parts = head.split(/(\s[-–—]\s|,)/);
  let end = parts.length;
  while (end >= 3 && !/[-–—]/.test(parts[end - 1]!) && isLocationPart(parts[end - 1]!)) end -= 2;
  head = parts.slice(0, end).join('');
  return head.toLowerCase().replace(/[^a-z0-9+#åäö]+/g, ' ').trim();
};
const stretchRank = (mobileOf: ReadonlyMap<string, Scored['mobile']>, focusOf: ReadonlyMap<string, TitleFocus>, crowdOf: ReadonlyMap<string, Crowd>, english: boolean, leadership: boolean) => (a: MatchRow, b: MatchRow): number =>
  Number(mobileOf.get(a.id) === 'bottom') - Number(mobileOf.get(b.id) === 'bottom') || byRank(focusOf, crowdOf, english, leadership)(a, b);
const PROGRAMME_LEVEL = /\b(?:junior|jr|senior|sr|staff|principal|lead|intern(?:ship)?|trainee|graduate|associate|entry|level|i{1,3}|iv|vi{0,3}|\d+)\b/g;
const EARLY_TITLE = /\b(?:junior|jr|intern(?:ship)?|trainee|graduate|new grad|praktik(?:ant)?)\b/i;
const programmeOf = (title: string): string => normalizedTitle(title).replace(PROGRAMME_LEVEL, ' ').replace(/\s+/g, ' ').trim();
const FIELD_OK = new Set(['engineer', 'software', 'programmer', 'web', 'trainee', 'backend', 'frontend', 'fullstack', 'full', 'stack', 'platform', 'infrastructure', 'api', 'service', 'system', 'app', 'application', 'developer']);
const entryFieldOk = (title: string, learned: ReadonlyArray<string>): boolean => {
  const known = new Set([...FIELD_OK, ...learned]);
  return tokensOf(title).every(t => known.has(t));
};
const DIVERSE_TOP = 10;
const diversityKey = (r: MatchRow): string => `${r.company.toLowerCase().trim()}|${r.seniority === 'junior' || EARLY_TITLE.test(r.title) ? 'early' : programmeOf(r.title)}`;
const capByEmployer = (rows: ReadonlyArray<MatchRow>, n = 2): { kept: MatchRow[]; rest: MatchRow[] } => {
  const seen = new Map<string, number>();
  const kept: MatchRow[] = [];
  const rest: MatchRow[] = [];
  for (const r of rows) {
    const k = r.company.toLowerCase().trim();
    const c = seen.get(k) ?? 0;
    if (c >= n) rest.push(r);
    else { seen.set(k, c + 1); kept.push(r); }
  }
  return { kept, rest };
};
const diversify = (rows: ReadonlyArray<MatchRow>): MatchRow[] => {
  const top: MatchRow[] = [];
  const later: MatchRow[] = [];
  const rest: MatchRow[] = [];
  const seen = new Map<string, number>();
  for (const r of rows) {
    if (top.length >= DIVERSE_TOP) { rest.push(r); continue; }
    const k = diversityKey(r);
    const n = seen.get(k) ?? 0;
    if (n >= 2) later.push(r);
    else { seen.set(k, n + 1); top.push(r); }
  }
  return [...top, ...later, ...rest];
};
const mobileLast = (rows: ReadonlyArray<MatchRow>, mobileOf: ReadonlyMap<string, Scored['mobile']>): MatchRow[] => {
  const isMobile = (r: MatchRow) => mobileOf.get(r.id) !== 'none';
  const others = rows.filter(r => !isMobile(r));
  const top = others.slice(0, MOBILE_FREE_TOP);
  const rest = rows.filter(r => !top.includes(r));
  return [...top, ...rest];
};
const keyOf = (r: MatchRow): string => `${r.company.toLowerCase().trim()}|${normalizedTitle(r.title)}`;
const withAlso = (r: MatchRow, extra: ReadonlyArray<string>): MatchRow => {
  const alsoIds = [...r.alsoIds, ...extra];
  const n = alsoIds.length;
  return n ? { ...r, alsoIds, reasons: [...r.reasons.filter(x => !x.startsWith('Also listed in ')), `Also listed in ${n} more ${n === 1 ? 'location' : 'locations'}`] } : r;
};
const collapse = (rows: ReadonlyArray<MatchRow>, keep: (key: string) => boolean, carried: ReadonlyMap<string, ReadonlyArray<string>>): MatchRow[] => {
  const byKey = new Map<string, MatchRow>();
  const order: string[] = [];
  for (const r of rows) {
    const key = keyOf(r);
    if (!keep(key)) continue;
    const head = byKey.get(key);
    if (head) byKey.set(key, { ...head, alsoIds: [...head.alsoIds, r.id] });
    else { byKey.set(key, r); order.push(key); }
  }
  return order.map(k => withAlso({ ...byKey.get(k)!, alsoIds: [] }, [...byKey.get(k)!.alsoIds, ...(carried.get(k) ?? [])]));
};
const GROUP_ORDER: ReadonlyArray<GroupKey> = ['fitsNow', 'stepTowardGoal', 'stretch'];
const acrossGroups = (all: Record<GroupKey, MatchRow[]>) => {
  const best = new Map<string, GroupKey>();
  for (const g of GROUP_ORDER) for (const r of all[g]) { const k = keyOf(r); if (!best.has(k)) best.set(k, g); }
  const carried = new Map<string, string[]>();
  for (const g of GROUP_ORDER) for (const r of all[g]) { const k = keyOf(r); if (best.get(k) !== g) carried.set(k, [...(carried.get(k) ?? []), r.id]); }
  return { keep: (g: GroupKey) => (k: string) => best.get(k) === g, carried };
};

const STATS = new WeakMap<PublicPool, CorpusStats>();
export const poolStats = (pool: PublicPool): CorpusStats => {
  const known = STATS.get(pool);
  if (known) return known;
  const fresh = corpusStats(pool.rows);
  STATS.set(pool, fresh);
  return fresh;
};
export const match = (profile: MatchProfile, pool: PublicPool, opts: MatchOptions = {}): Result<MatchResult, MatchError> => matchUnder(poolStats(pool), profile, pool, opts);

export function matchUnder(stats: CorpusStats, profile: MatchProfile, pool: PublicPool, opts: MatchOptions = {}): Result<MatchResult, MatchError> {
  const now = opts.now ?? new Date();
  const limit = opts.limit ?? DEFAULT_LIMIT;
  return validateProfile(profile).andThen(p => understand(p).andThen(u => {
    const prefs: Prefs = { regions: regionsOf(p.region), remote: p.remote ?? 'any', mobile: MOBILE_TITLE.test(`${p.description}\n${p.goal ?? ''}`), productOnly: p.productOnly === true,
      liked: likedEntries(p.likes), query: new Set([...queryTokens(p.description, p.goal ?? ''), ...queryTokens(p.likes?.slice(0, MAX_CHARS) ?? '')]), stats };
    const all: Record<GroupKey, MatchRow[]> = { fitsNow: [], stepTowardGoal: [], stretch: [] };
    const mobileOf = new Map<string, Scored['mobile']>();
    const focusOf = new Map<string, TitleFocus>();
    const crowdOf = new Map<string, Crowd>();
    const english = !hasSwedish(p.description) && !hasSwedish(p.goal ?? '');
    const leadership = u.roles.includes('leadership');
    const excluded = new Set(opts.excludeIds ?? []);
    for (const row of pool.rows) { if (excluded.has(row.id)) continue; const s = judge(u, prefs, row, now); if (s) { all[s.group].push(s.row); mobileOf.set(s.row.id, s.mobile); focusOf.set(s.row.id, titleFocus(prefs.query, row.title)); crowdOf.set(s.row.id, { sv: swedishOnlyTitle(row.title), agency: isAgencyRow(row), lead: isLeadershipRow(row), lang: unlistedLanguage(prefs.query, row.title, u.skills), far: prefs.regions.includes('SE') && s.row.region === 'remote-anywhere' }); } }
    const x = acrossGroups(all);
    const rank = byRank(focusOf, crowdOf, english, leadership);
    const fitted = capByEmployer(collapse(all.fitsNow.sort(rank), x.keep('fitsNow'), x.carried));
    const stretchRows = collapse(all.stretch.sort(stretchRank(mobileOf, focusOf, crowdOf, english, leadership)), x.keep('stretch'), x.carried);
    const stretchNon = [...fitted.rest, ...stretchRows.filter(r => mobileOf.get(r.id) === 'none')].sort(rank);
    const ranked = {
      fitsNow: fitted.kept,
      stepTowardGoal: diversify(collapse(all.stepTowardGoal.sort(rank), x.keep('stepTowardGoal'), x.carried)),
      stretch: mobileLast([...diversify(stretchNon), ...stretchRows.filter(r => mobileOf.get(r.id) !== 'none')], mobileOf),
    };
    const totals = { fitsNow: ranked.fitsNow.length, stepTowardGoal: ranked.stepTowardGoal.length, stretch: ranked.stretch.length };
    const likesMiss = prefs.liked.length > 0 && !pool.rows.some(row => likesCompany(prefs.liked, row.company) || likesText(prefs.liked, row.title));
    if (totals.fitsNow + totals.stepTowardGoal + totals.stretch === 0) {
      if (u.entry) return err<MatchResult, MatchError>({ kind: 'OutOfScope', reason: 'junior' });
      const widen: Array<'region' | 'remote' | 'goal' | 'productOnly'> = [];
      if (prefs.regions.length) widen.push('region');
      if (prefs.remote !== 'any') widen.push('remote');
      if (prefs.productOnly) widen.push('productOnly');
      if (!u.goal.length) widen.push('goal');
      return err<MatchResult, MatchError>({ kind: 'ZeroResults', widen });
    }
    const groups = {
      fitsNow: ranked.fitsNow.slice(0, limit),
      stepTowardGoal: ranked.stepTowardGoal.slice(0, limit),
      stretch: ranked.stretch.slice(0, limit),
    };
    const warnings: Warning[] = [];
    const poolAge = ageOf(pool.checkedRange.to, now);
    if (poolAge > STALE_DAYS) warnings.push({ kind: 'PoolStale', checkedAt: `${pool.checkedRange.from} to ${pool.checkedRange.to}`, ageDays: poolAge });
    const staleOpen = [...groups.fitsNow, ...groups.stepTowardGoal].filter(r => r.stale).map(r => r.id);
    if (staleOpen.length) warnings.push({ kind: 'StaleOpenStatus', ids: staleOpen });
    return ok({ coreVersion: CORE_VERSION, poolVersion: pool.version, groups, totals, warnings, understood: u, likesMiss });
  }));
}
