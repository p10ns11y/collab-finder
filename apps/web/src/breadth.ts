import { INDUSTRIES, type Industry, type MatchResult, type MatchRow, type PublicPool } from '../../../packages/core/src/index.ts';

const US_STATE = /(?:,|\s-)\s*(?:A[LKZR]|C[AOT]|DE|FL|GA|HI|I[DLNA]|K[SY]|LA|M[EDAINSOT]|N[EVHJMYCD]|O[HKR]|PA|RI|S[CD]|T[NX]|UT|V[TA]|W[AVIY]|DC)\b/;
const COUNTRIES: ReadonlyArray<[string, RegExp]> = ([
  ['United States', 'united states|\\busa?\\b|san francisco|new york|seattle|boston|austin|chicago|sunnyvale|california'],
  ['United Kingdom', 'united kingdom|\\buk\\b|england|london'],
  ['Sweden', 'sweden|sverige|stockholm|g[oö]teborg|malm[oö]'],
  ['Canada', 'canada|toronto|vancouver'],
  ['Germany', 'germany|deutschland|berlin|munich'],
  ['France', 'france|paris'], ['Ireland', 'ireland|dublin'], ['Netherlands', 'netherlands|amsterdam'], ['Spain', 'spain|madrid|barcelona'],
  ['Portugal', 'portugal|lisbon'], ['Poland', 'poland|warsaw|krak[oó]w'], ['Finland', 'finland|helsinki'], ['Denmark', 'denmark|copenhagen'],
  ['India', 'india|bengaluru|bangalore|hyderabad|pune'], ['Singapore', 'singapore'], ['Japan', 'japan|tokyo'],
  ['Australia', 'australia|sydney|melbourne'], ['New Zealand', 'new zealand|\\bnz\\b|auckland'],
] as const).map(([c, re]) => [c, new RegExp(re, 'i')]);
const BY_REGION: Readonly<Record<string, string>> = { SE: 'Sweden', UK: 'United Kingdom', US: 'United States' };
const EU = new Set(['Sweden', 'Germany', 'France', 'Ireland', 'Netherlands', 'Spain', 'Portugal', 'Poland', 'Finland', 'Denmark']);

export const countriesOf = (row: Pick<MatchRow, 'location' | 'region'>): ReadonlyArray<string> => {
  const loc = row.location ?? '';
  const found = COUNTRIES.filter(([, re]) => re.test(loc)).map(([c]) => c);
  if (US_STATE.test(loc) && !found.includes('United States')) found.push('United States');
  const fallback = row.region ? BY_REGION[row.region] : undefined;
  return found.length ? found : fallback ? [fallback] : [];
};

export type Home = 'SE' | 'EU' | 'UK' | 'US' | 'other';
export const HOME_NAME: Readonly<Record<Home, string>> = { SE: 'Sweden', EU: 'the EU', UK: 'the UK', US: 'the US', other: 'your country' };
export const isAbroad = (row: MatchRow, home: Home | null): boolean => {
  if (!home || home === 'other') return false;
  const cs = countriesOf(row);
  if (!cs.length) return false;
  return home === 'EU' ? cs.every(c => !EU.has(c)) : !cs.includes(BY_REGION[home] ?? '');
};

export type FieldIndex = ReadonlyMap<string, ReadonlyArray<Industry>>;
export const fieldIndex = (pool: PublicPool): FieldIndex => new Map(pool.rows.map(r => [r.id, (r.industries ?? []) as ReadonlyArray<Industry>]));
export const fieldLabel = (k: Industry): string => INDUSTRIES[k].label;

export const allRows = (r: MatchResult): ReadonlyArray<MatchRow> => [...r.groups.fitsNow, ...r.groups.stepTowardGoal, ...r.groups.stretch];

export const breadth = (r: MatchResult, fields: FieldIndex) => {
  const rows = allRows(r);
  const f = new Set(rows.flatMap(x => fields.get(x.id) ?? []));
  const c = new Set(rows.flatMap(x => countriesOf(x)));
  return { roles: rows.length, fields: [...f], countries: c.size };
};

export type Pick3 = { row: MatchRow; label: string | null };
export const firstThree = (r: MatchResult, fields: FieldIndex, home: Home | null, homeFields: ReadonlyArray<Industry>): ReadonlyArray<Pick3> => {
  const pool = [...r.groups.fitsNow, ...r.groups.stretch];
  const out: Pick3[] = [];
  const taken = (x: MatchRow) => out.some(p => p.row.id === x.id);
  const first = pool[0];
  if (!first) return out;
  out.push({ row: first, label: null });
  const known = new Set([...homeFields, ...(fields.get(first.id) ?? [])]);
  const pivot = pool.find(x => !taken(x) && (fields.get(x.id) ?? []).length > 0 && (fields.get(x.id) ?? []).every(f => !known.has(f)));
  if (pivot) out.push({ row: pivot, label: `A pivot worth a look: ${fieldLabel((fields.get(pivot.id) ?? [])[0] as Industry).toLowerCase()}` });
  const abroad = home ? pool.find(x => !taken(x) && isAbroad(x, home)) : undefined;
  if (abroad) out.push({ row: abroad, label: `Outside ${HOME_NAME[home as Home]}, worth a look` });
  for (const x of pool) { if (out.length >= 3) break; if (!taken(x)) out.push({ row: x, label: null }); }
  return out.slice(0, 3);
};

export const trim = (r: MatchResult, n: number): MatchResult => ({
  ...r,
  groups: { fitsNow: r.groups.fitsNow.slice(0, n), stepTowardGoal: r.groups.stepTowardGoal.slice(0, n), stretch: r.groups.stretch.slice(0, n) },
});

const KEY = 'kanithanj.found';
export type Found = { found: number; firstMs: number | null };
export const writeFound = (f: Found) => { try { localStorage.setItem(KEY, JSON.stringify(f)); } catch { return; } };
