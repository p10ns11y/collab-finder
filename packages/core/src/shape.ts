import type { Result } from 'neverthrow';
import { toPublicPool, type ExportFailure } from './export.ts';
import { companyIndustries, type Industry } from './industry.ts';
import { inScope } from './match.ts';
import type { PublicPool, PublicRow } from './schema.ts';
import { isLeadershipRow, regionOf, type PlaceRegion } from './vocab.ts';

const EUROPE: ReadonlyArray<PlaceRegion> = ['SE', 'EU', 'UK'];
const LOCATION_PARTS = /\s*[/;|•]\s*/;

export const honestRegion = (region: string | null, location: string | null): string | null => {
  if (region === null || !location || !EUROPE.includes(region as PlaceRegion)) return region;
  const found = location.split(LOCATION_PARTS).map(regionOf).filter((r): r is PlaceRegion => r !== null);
  if (!found.length || found.includes(region as PlaceRegion)) return region;
  return EUROPE.find(r => found.includes(r)) ?? found[0] ?? region;
};

export const inPoolScope = (row: Pick<PublicRow, 'title' | 'role_tags' | 'seniority'>): boolean =>
  inScope(row as PublicRow) || isLeadershipRow(row);

export type ShapeStats = { input: number; outOfScope: number; regionMoved: number; withIndustry: number };
export type PostingText = { company: string; text: string };

export function shapeRows(engineRows: ReadonlyArray<Readonly<Record<string, unknown>>>, texts: Iterable<PostingText>): { rows: Array<Record<string, unknown>>; stats: ShapeStats } {
  const industries = companyIndustries(texts);
  const stats: ShapeStats = { input: engineRows.length, outOfScope: 0, regionMoved: 0, withIndustry: 0 };
  const rows: Array<Record<string, unknown>> = [];
  for (const row of engineRows) {
    const title = String(row['title'] ?? '');
    const role_tags = Array.isArray(row['role_tags']) ? row['role_tags'].map(String) : [];
    const seniority = typeof row['seniority'] === 'string' ? row['seniority'] : null;
    if (!inPoolScope({ title, role_tags, seniority })) { stats.outOfScope += 1; continue; }
    const region = typeof row['region'] === 'string' ? row['region'] : null;
    const location = typeof row['location'] === 'string' ? row['location'] : null;
    const fixed = honestRegion(region, location);
    if (fixed !== region) stats.regionMoved += 1;
    const tagged: ReadonlyArray<Industry> = industries.get(String(row['company'] ?? '').trim().toLowerCase()) ?? [];
    if (tagged.length) stats.withIndustry += 1;
    rows.push({ ...row, region: fixed, industries: [...tagged] });
  }
  return { rows, stats };
}

export function buildPublicPool(engineRows: ReadonlyArray<Readonly<Record<string, unknown>>>, texts: Iterable<PostingText>, version: string): { pool: Result<PublicPool, ExportFailure>; stats: ShapeStats } {
  const { rows, stats } = shapeRows(engineRows, texts);
  return { pool: toPublicPool(rows, version), stats };
}
