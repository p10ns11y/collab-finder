import type { RegionPref } from '../../../packages/core/src/index.ts';

export type Place = Exclude<RegionPref, 'any'>;
export const REGIONS: ReadonlyArray<readonly [Place, string]> = [
  ['SE', 'Sweden'], ['EU', 'EU (includes Sweden)'], ['UK', 'United Kingdom'], ['US', 'United States'],
  ['CA', 'Canada'], ['LATAM', 'Latin America'], ['APAC', 'Asia-Pacific'], ['MEA', 'Middle East and Africa'],
];
export const PLACES: ReadonlyArray<Place> = REGIONS.map(([place]) => place);
