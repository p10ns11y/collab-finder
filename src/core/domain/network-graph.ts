/** Personal network graph — local CSV (gitignored PII). Mirrors network_graph.rs. */

export type NetworkCategory =
  | 'first_connection'
  | 'ex_colleague'
  | 'collab_fit'
  | 'location_match'

export type XProfileHit = {
  username: string
  user_id: string
  display_name: string
  description?: string | null
  location?: string | null
  name_match: number
}

export type LinkedInPublicEnrichment = {
  fetched: boolean
  auth_walled?: boolean
  headline?: string | null
  about_snip?: string | null
  location?: string | null
  error?: string | null
}

export type NetworkPerson = {
  id: string
  /** linkedin_connection | contact */
  source?: string
  first_name: string
  last_name: string
  full_name: string
  company: string
  position: string
  linkedin_url: string
  connected_on?: string | null
  emails?: string | null
  phones?: string | null
  collab_score: number
  categories: NetworkCategory[]
  location_bucket?: string | null
  x_profile?: XProfileHit | null
  linkedin_enrichment?: LinkedInPublicEnrichment | null
  score_reasons: string[]
}

export type NetworkCategoryCounts = {
  first_connection: number
  ex_colleague: number
  collab_fit: number
  location_match: number
  with_x: number
}

export type NetworkGraphResult = {
  source_path: string
  total: number
  people: NetworkPerson[]
  top_ids: string[]
  category_counts: NetworkCategoryCounts
  from_db?: boolean
  connections_imported?: number
  contacts_imported?: number
}

export type NetworkFilter =
  | 'all'
  | 'ex_colleague'
  | 'collab_fit'
  | 'has_x'
  | 'location_match'
  | 'top50'
  /** @deprecated alias of top50 */
  | 'top20'

export function filterNetworkPeople(
  people: NetworkPerson[],
  filter: NetworkFilter,
  topIds: string[],
): NetworkPerson[] {
  switch (filter) {
    case 'all':
      return people
    case 'ex_colleague':
      return people.filter((p) => p.categories.includes('ex_colleague'))
    case 'collab_fit':
      return people.filter((p) => p.categories.includes('collab_fit'))
    case 'has_x':
      return people.filter((p) => !!p.x_profile?.username)
    case 'location_match':
      return people.filter((p) => p.categories.includes('location_match'))
    case 'top50':
    case 'top20':
      return people.filter((p) => topIds.includes(p.id))
    default:
      return people
  }
}

export function xProfileUrl(username: string): string {
  return `https://x.com/${username.replace(/^@/, '')}`
}

export function splitContactField(raw?: string | null): string[] {
  if (!raw?.trim()) return []
  return raw
    .split(/[,;|/]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export function primaryMissionTag(reasons: string[]): string | null {
  const a = reasons.find((r) => r.startsWith('mission_a:'))
  if (a) return a.replace('mission_a:', '').split('+')[0] ?? null
  const adj = reasons.find((r) => r.includes('adjacency:target_swe'))
  if (adj) return 'space/defence path'
  return null
}
