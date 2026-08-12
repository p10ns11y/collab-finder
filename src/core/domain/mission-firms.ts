/**
 * Mission firms — SpaceXAI / Tesla / Swedish JobTech / Nordic+EU career boards.
 * Pull is query-keyed: same query reuses cache; new query fetches and appends to the pool.
 */

export const MISSION_FIRM_CHIPS = [
  { id: 'spacexai', label: 'SpaceXAI' },
  { id: 'tesla', label: 'Tesla' },
  { id: 'einride', label: 'Einride' },
  { id: 'ericsson', label: 'Ericsson' },
  { id: 'saab', label: 'Saab' },
  { id: 'klarna', label: 'Klarna' },
  { id: 'volvo_cars', label: 'Volvo Cars' },
  { id: 'spotify', label: 'Spotify' },
  { id: 'wolt', label: 'Wolt' },
  { id: 'gitlab', label: 'GitLab' },
  { id: 'waymo', label: 'Waymo' },
  { id: 'figure', label: 'Figure' },
  { id: 'agility', label: 'Agility' },
  { id: 'pi', label: 'Physical Int.' },
  { id: 'onex', label: '1X' },
  { id: 'hive', label: 'Hive' },
  { id: 'deepmind', label: 'DeepMind' },
] as const

export type MissionFirmChipId = (typeof MISSION_FIRM_CHIPS)[number]['id']

export type MissionFirmLead = {
  firm_id: string
  firm_label: string
  source: string
  external_id: string
  title: string
  location: string
  absolute_url: string
  department?: string | null
  rank_score: number
  rank_reasons: string[]
  texas_match: boolean
  terafab_adjacent: boolean
  already_in_db: boolean
  opportunity_id?: number | null
}

export type MissionFirmFilter = {
  q?: string
  firms?: string[]
  texas_only?: boolean
  terafab_bias?: boolean
  limit?: number
  force_refresh?: boolean
}

/** Empty default — change query (or a rail chip) to trigger a new fetch+append. */
export const MISSION_FIRMS_DEFAULT_QUERY = ''

export { MISSION_QUERY_CHIPS } from './hunt-rails'

export const MISSION_FIRMS_DEFAULT_SELECTED: MissionFirmChipId[] = [
  'spacexai',
  'tesla',
  'einride',
  'ericsson',
  'saab',
  'klarna',
  'volvo_cars',
  'spotify',
  'wolt',
]
