import type { MatchProfile, MatchResult } from './match.ts';
import type { GapGuidance } from './pool-seam.ts';
import type { PublicPool } from './schema.ts';

export type { GapGuidance };
import { COVERS, TAG_TERMS, kindOf, label, termsIn } from './vocab.ts';

export const THIN = 3;
type Region = GapGuidance['region'];
const PLACE: Readonly<Record<Region, string>> = { SE: 'Sweden', EU: 'the EU', UK: 'the UK', US: 'the US', CA: 'Canada', LATAM: 'Latin America', APAC: 'Asia-Pacific', MEA: 'the Middle East and Africa', any: 'all regions' };
const WIDER: Readonly<Record<Region, Region | null>> = { SE: 'EU', UK: 'EU', EU: 'any', US: 'any', CA: 'any', LATAM: 'any', APAC: 'any', MEA: 'any', any: null };

const INDEX = new WeakMap<PublicPool, ReadonlyArray<{ region: string | null; terms: Set<string> }>>();
const indexOf = (pool: PublicPool) => {
  let rows = INDEX.get(pool);
  if (!rows) {
    rows = pool.rows.filter(r => r.status !== 'closed').map(r => ({ region: r.region, terms: new Set([...termsIn(r.title), ...r.role_tags.flatMap(t => TAG_TERMS[t] ?? [])]) }));
    INDEX.set(pool, rows);
  }
  return rows;
};
const roles = (n: number) => `${n} ${n === 1 ? 'role' : 'roles'}`;
const inRegion = (want: Region, r: string | null) => want === 'any' || r === 'remote-anywhere' || r === want || (want === 'EU' && r === 'SE');

export function gapGuidance(ask: MatchProfile, pool: PublicPool, result: MatchResult | null): GapGuidance | null {
  const found = result ? result.totals.fitsNow + result.totals.stepTowardGoal : 0;
  if (found >= THIN) return null;
  const said = [...termsIn(ask.description)];
  const of = (kind: string) => said.filter(k => kindOf(k) === kind);
  const asked = [...[...termsIn(ask.goal ?? '')].filter(k => !said.includes(k) && kindOf(k) !== 'generic'), ...of('role'), ...of('skill')];
  const topics = asked.length ? asked : said;
  const index = indexOf(pool);
  const count = (term: string, region: Region) => index.filter(r => inRegion(region, r.region) && r.terms.has(term)).length;
  const chosen: Region[] = [ask.region ?? []].flat();
  const picked: Region[] = chosen.length && !chosen.includes('any') ? [...new Set(chosen)] : ['any'];
  let best: { topic: string; region: Region; n: number; all: number } | null = null;
  for (const topic of topics) for (const region of picked) {
    const n = count(topic, region), all = count(topic, 'any');
    if (!best || n < best.n || (n === best.n && all < best.all)) best = { topic, region, n, all };
  }
  if (!best) return null;
  const { topic, region, n } = best;
  const name = label(topic);
  const where = region === 'any' ? '' : ` in ${PLACE[region]}`;
  const wide = WIDER[region];
  const wideN = wide ? count(topic, wide) : 0;
  const near = [...new Set([...(COVERS[topic] ?? []), ...Object.keys(COVERS).filter(k => COVERS[k]!.includes(topic))])]
    .filter(k => k !== topic).map(k => [k, count(k, region)] as const).filter(([, c]) => c >= THIN && c > n)
    .sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k]) => label(k));
  const message = [
    `Missing sources for ${name}${where}: ${roles(found)} matched.`,
    wide && wideN > n ? `Widening to ${PLACE[wide]} reaches ${roles(wideN)} that name ${name}.` : '',
    near.length ? `Nearby topics with more roles: ${near.join(', ')}.` : '',
  ].filter(Boolean).join(' ');
  return {
    topic: name, region, rows_found: found, message,
    suggestions: [
      { kind: 'careers_page', hint: `Add careers pages of companies that hire for ${name}${where}.` },
      { kind: 'ats_board', hint: `Add the job board of a company that posts ${name} roles${where}.` },
      { kind: 'community_list', hint: `Add a community-kept list of ${name} roles${where}.` },
    ],
  };
}
