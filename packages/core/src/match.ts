import { err, ok, type Result } from 'neverthrow';
import type { GroupKey } from './decisions.ts';
import type { PiiKind, VisitorError, Warning } from './errors.ts';
import type { PublicPool, PublicRow } from './schema.ts';
import { COVERS, ENGINEERING_TITLE, LEVELS, MANAGER_TITLE, MOBILE_TITLE, MTS, NARROWING_ROLES, NON_ENGINEERING_TITLE, PLACES, OUTSIDE_POOL, TAG_TERMS, currentLevel, isAgencyRow, kindOf, label, levelOf, levelOfPool, termsIn, type Level } from './vocab.ts';

export const CORE_VERSION = '0.1.0';
export const MIN_CHARS = 20;
export const MAX_CHARS = 2000;
export const STALE_DAYS = 7;
export const DEFAULT_LIMIT = 30;

export type RegionPref = 'SE' | 'EU' | 'UK' | 'US' | 'any';
export type RemotePref = 'remote' | 'hybrid' | 'onsite' | 'any';
export type RegionChoice = RegionPref | ReadonlyArray<RegionPref>;
export type MatchProfile = { description: string; goal?: string; region?: RegionChoice; remote?: RemotePref; productOnly?: boolean };
export const regionsOf = (r: RegionChoice | undefined): ReadonlyArray<Exclude<RegionPref, 'any'>> => {
  const list = r === undefined ? [] : typeof r === 'string' ? [r] : [...r];
  return list.includes('any') ? [] : [...new Set(list.filter((x): x is Exclude<RegionPref, 'any'> => x !== 'any'))].sort();
};
export type MatchOptions = { now?: Date; limit?: number; excludeIds?: ReadonlySet<string> | ReadonlyArray<string> };

export type Tier = 0 | 1 | 2;
export const LEVEL_STEP = 10;
export const GENERALIST_ROLES: ReadonlySet<string> = new Set(['software', 'fullstack', 'frontend']);
export type MatchRow = {
  id: string; title: string; company: string; url: string; location: string | null;
  region: string | null; remote: PublicRow['remote']; seniority: string | null; status: PublicRow['status'];
  lastChecked: string; ageDays: number; stale: boolean; tier: Tier; score: number; reasons: ReadonlyArray<string>; alsoIds: ReadonlyArray<string>;
};
export type Understood = { roles: ReadonlyArray<string>; skills: ReadonlyArray<string>; goal: ReadonlyArray<string>; seniority: Level | null; places: ReadonlyArray<string> };
export type MatchResult = {
  coreVersion: string; poolVersion: string;
  groups: Record<GroupKey, ReadonlyArray<MatchRow>>; totals: Record<GroupKey, number>;
  warnings: ReadonlyArray<Warning>; understood: Understood;
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
  const spans = findPii(`${d}\n${p.goal ?? ''}`);
  if (spans.length) return err({ kind: 'PiiDetected', from: 'human', spans });
  return ok({ ...p, description: d });
}

export function understand(p: MatchProfile): Result<Understood, VisitorError> {
  const d = termsIn(p.description);
  const g = termsIn(p.goal ?? '');
  const seniority = currentLevel(p.description);
  const roles = [...d].filter(k => kindOf(k) === 'role' || kindOf(k) === 'generic');
  const skills = [...d].filter(k => kindOf(k) === 'skill');
  if (seniority === 'junior') return err({ kind: 'OutOfScope', reason: 'junior' });
  if (roles.length === 0 && skills.length === 0)
    return err({ kind: 'OutOfScope', reason: OUTSIDE_POOL.test(p.description) ? 'outside-pool-roles' : 'no-engineering-terms' });
  const specific = roles.filter(k => kindOf(k) === 'role');
  if (specific.length === 0 && skills.length === 0 && OUTSIDE_POOL.test(p.description)) return err({ kind: 'OutOfScope', reason: 'outside-pool-roles' });
  const places = PLACES.filter(([, re]) => re.test(p.description)).map(([r]) => r);
  return ok({ roles: roles.sort(), skills: skills.sort(), goal: [...g].filter(k => !d.has(k) && kindOf(k) !== 'generic').sort(), seniority, places });
}

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
  row.seniority !== 'executive' && (ENGINEERING_TITLE.test(row.title) || row.role_tags.some(t => t in TAG_TERMS)) && !NON_ENGINEERING_TITLE.test(row.title) && !MANAGER_TITLE.test(row.title);

type Scored = { group: GroupKey; row: MatchRow };
type Prefs = { regions: ReadonlyArray<Exclude<RegionPref, 'any'>>; remote: RemotePref; mobile: boolean; productOnly: boolean };
function judge(u: Understood, p: Prefs, row: PublicRow, now: Date): Scored | null {
  if (row.status === 'closed') return null;
  if (!inScope(row)) return null;
  if (!p.mobile && MOBILE_TITLE.test(row.title)) return null;
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
  if (!titleHits.length && !coveredHits.length && !tagRoleHits.length && !skillHits.length && !genericHit && !goalHits.length) return null;

  const reg = regionOk(p.regions, row.region); if (reg === 'no') return null;
  const rem = remoteOk(p.remote, row.remote); if (rem === 'no') return null;
  MTS.lastIndex = 0;
  const isMts = MTS.test(row.title); MTS.lastIndex = 0;
  const rowLevel = isMts ? levelOf(row.title) : (levelOfPool(row.seniority) ?? levelOf(row.title));
  let levelGap = 0;
  if (u.seniority && rowLevel) levelGap = LEVELS.indexOf(rowLevel) - LEVELS.indexOf(u.seniority);
  if (levelGap >= 2 || levelGap <= -2 || rowLevel === 'junior') return null;

  const mine = new Set([...u.roles, ...u.goal, ...[...u.roles, ...u.goal].flatMap(k => COVERS[k] ?? [])]);
  const narrowedAway = (MOBILE_TITLE.test(row.title) && !mine.has('mobile')) || (!roleHits.length && !coveredHits.length && [...rt.title].some(k => NARROWING_ROLES.has(k) && !mine.has(k)));

  const reasons: string[] = [];
  if (titleHits.length || coveredHits.length) reasons.push(`Title matches what you do: ${[...titleHits, ...coveredHits].map(label).join(', ')}`);
  if (tagRoleHits.length || skillHits.length) reasons.push(`Tagged with: ${[...tagRoleHits, ...skillHits].map(label).join(', ')}`);
  else if (genericHit) reasons.push('General software engineering title');
  if (goalHits.length) reasons.push(`Toward your goal: ${goalHits.map(label).join(', ')}`);
  if (!rowLevel) reasons.push('Seniority not stated in the posting');
  else if (!u.seniority) reasons.push(`Posting level: ${rowLevel}`);
  else if (levelGap === 1) reasons.push(`One level above yours (${rowLevel})`);
  else reasons.push(`Level fits: ${rowLevel}`);
  reasons.push(reg === 'unknown' ? 'Location not confirmed, check the posting' : `Region: ${row.region}${row.location ? ` (${row.location})` : ''}`);
  if (narrowedAway) reasons.push('Title points to a different specialty than yours');
  if (rem === 'unknown') reasons.push('Remote policy not stated');
  else if (p.remote !== 'any') reasons.push(`Work mode: ${row.remote}`);
  const ageDays = ageOf(row.status_checked_at, now);
  const stale = ageDays > STALE_DAYS;
  reasons.push(row.status === 'open' ? `Open when last checked (${row.status_checked_at.slice(0, 10)})` : 'Status unknown, verify before applying');

  const placeBonus = row.region !== null && u.places.includes(row.region) ? 6 : 0;
  const tagDepth = [...rt.tags].filter(k => u.roles.includes(k) || u.skills.includes(k) || u.goal.includes(k)).length * 3;
  const score = titleHits.length * 30 + coveredHits.length * 20 + tagRoleHits.length * 10 + skillHits.length * 15 + (genericHit ? 10 : 0) + goalHits.length * 25
    + placeBonus + tagDepth + (rem === 'yes' && row.remote !== 'unknown' ? 1 : 0)
    - (levelGap === 1 ? LEVEL_STEP : 0) - (rowLevel ? 0 : 3) - (reg === 'unknown' ? 5 : 0) - (rem === 'unknown' ? 3 : 0) - (row.status === 'open' ? 0 : 20)
    - (narrowedAway ? 8 : 0);

  const certain = row.status === 'open' && reg === 'yes' && rem === 'yes' && levelGap <= 0 && !narrowedAway;
  const strongCore = titleHits.length > 0 || coveredHits.length > 0 || (u.roles.every(k => kindOf(k) !== 'role') && (skillHits.length > 0 || genericHit));
  let group: GroupKey;
  if (goalHits.length && certain && (strongCore || skillHits.length || genericHit)) group = 'stepTowardGoal';
  else if (strongCore && certain && !goalHits.length) group = 'fitsNow';
  else group = 'stretch';

  const tier: Tier = reg !== 'yes' ? 2 : row.status === 'open' && rem === 'yes' && levelGap <= 0 ? 0 : 1;
  return { group, row: {
    id: row.id, title: row.title, company: row.company, url: row.url, location: row.location, region: row.region, remote: row.remote,
    seniority: rowLevel, status: row.status, lastChecked: row.status_checked_at, ageDays, stale, tier, score, reasons, alsoIds: [],
  } };
}

const byRank = (a: MatchRow, b: MatchRow): number =>
  a.tier - b.tier || b.score - a.score || (a.lastChecked < b.lastChecked ? 1 : a.lastChecked > b.lastChecked ? -1 : 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export const normalizedTitle = (t: string): string =>
  t.toLowerCase().split('|')[0]!.replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .replace(/\s[-–—]\s[^-–—]*(?:remote|hybrid|on-?site|emea|europe|americas|apac|\beu\b|\bus\b|\buk\b)[^-–—]*$/, ' ')
    .replace(/[^a-z0-9+#]+/g, ' ').trim();
const collapse = (rows: ReadonlyArray<MatchRow>): MatchRow[] => {
  const byKey = new Map<string, MatchRow>();
  const order: string[] = [];
  for (const r of rows) {
    const key = `${r.company.toLowerCase().trim()}|${normalizedTitle(r.title)}`;
    const head = byKey.get(key);
    if (head) byKey.set(key, { ...head, alsoIds: [...head.alsoIds, r.id] });
    else { byKey.set(key, r); order.push(key); }
  }
  return order.map(k => {
    const r = byKey.get(k)!;
    const n = r.alsoIds.length;
    return n ? { ...r, reasons: [...r.reasons, `Also listed in ${n} more ${n === 1 ? 'location' : 'locations'}`] } : r;
  });
};

export function match(profile: MatchProfile, pool: PublicPool, opts: MatchOptions = {}): Result<MatchResult, MatchError> {
  const now = opts.now ?? new Date();
  const limit = opts.limit ?? DEFAULT_LIMIT;
  return validateProfile(profile).andThen(p => understand(p).andThen(u => {
    const prefs: Prefs = { regions: regionsOf(p.region), remote: p.remote ?? 'any', mobile: MOBILE_TITLE.test(`${p.description}\n${p.goal ?? ''}`), productOnly: p.productOnly === true };
    const all: Record<GroupKey, MatchRow[]> = { fitsNow: [], stepTowardGoal: [], stretch: [] };
    const excluded = new Set(opts.excludeIds ?? []);
    for (const row of pool.rows) { if (excluded.has(row.id)) continue; const s = judge(u, prefs, row, now); if (s) all[s.group].push(s.row); }
    const ranked = { fitsNow: collapse(all.fitsNow.sort(byRank)), stepTowardGoal: collapse(all.stepTowardGoal.sort(byRank)), stretch: collapse(all.stretch.sort(byRank)) };
    const totals = { fitsNow: ranked.fitsNow.length, stepTowardGoal: ranked.stepTowardGoal.length, stretch: ranked.stretch.length };
    if (totals.fitsNow + totals.stepTowardGoal + totals.stretch === 0) {
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
    return ok({ coreVersion: CORE_VERSION, poolVersion: pool.version, groups, totals, warnings, understood: u });
  }));
}
