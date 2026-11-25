import { COVERS, LEVELS, TAG_TERMS, kindOf, label, termsIn, type Level } from './vocab.ts';
import type { RegionPref, RemotePref, Understood } from './match.ts';
import type { PublicRow } from './schema.ts';

export type GapKind = 'skill' | 'level' | 'region' | 'remote';
export type Gap = { kind: GapKind; detail: string; step: string };
export type GapAsk = { understood: Understood; regions: ReadonlyArray<Exclude<RegionPref, 'any'>>; remote: RemotePref };
export type GapRole = { title: string; company: string; tags: ReadonlyArray<string>; seniority: string | null; region: string | null; location: string | null; remote: PublicRow['remote'] };

const PLACE_NAME: Readonly<Record<string, string>> = { SE: 'Sweden', EU: 'the EU', UK: 'the UK', US: 'the US' };
const list = (xs: ReadonlyArray<string>) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const EUROPE_EU = ['SE', 'EU'];
const within = (home: string, region: string) => home === region || (EUROPE_EU.includes(home) && EUROPE_EU.includes(region));

export function roleGaps(ask: GapAsk, role: GapRole): Gap[] {
  const u = ask.understood;
  const gaps: Gap[] = [];
  const mine = new Set([...u.roles, ...u.skills, ...u.goal, ...[...u.roles, ...u.goal].flatMap(k => COVERS[k] ?? [])]);
  const asked = new Set([...termsIn(role.title), ...role.tags.flatMap(t => TAG_TERMS[t] ?? [])]);
  const missing = [...asked].filter(k => kindOf(k) !== 'generic' && !mine.has(k)).map(label).slice(0, 3);
  if (missing.length) gaps.push({
    kind: 'skill',
    detail: `The posting names ${list(missing)}; your description does not.`,
    step: `Add one line on your ${missing[0]} experience, or on the closest work you have done.`,
  });
  const step = u.seniority && role.seniority ? LEVELS.indexOf(role.seniority as Level) - LEVELS.indexOf(u.seniority) : 0;
  if (step === 1) gaps.push({
    kind: 'level',
    detail: `Posted at ${role.seniority}, one level above your ${u.seniority}.`,
    step: 'Lead with one project where you set direction beyond your own tasks.',
  });
  const known = role.region !== null && role.region !== 'other';
  const where = role.location ?? (known ? PLACE_NAME[role.region!] ?? role.region! : '');
  const home = u.places.find(p => PLACE_NAME[p]);
  if (ask.regions.length && !known) gaps.push({
    kind: 'region',
    detail: `Location not confirmed for ${list(ask.regions.map(p => PLACE_NAME[p] ?? p))}.`,
    step: 'Check where the posting hires before you tailor a CV.',
  });
  else if (home && known && role.region !== 'remote-anywhere' && !within(home, role.region!)) gaps.push({
    kind: 'region',
    detail: `You mentioned ${PLACE_NAME[home]}; the posting lists ${where}.`,
    step: `Check whether ${role.company} hires remotely from ${PLACE_NAME[home]} or helps with relocation.`,
  });
  if (ask.remote !== 'any' && ask.remote !== 'onsite' && role.remote === 'unknown') gaps.push({
    kind: 'remote',
    detail: 'The posting does not state a remote policy.',
    step: `Ask ${role.company} about remote work before you apply.`,
  });
  return gaps;
}
