/**
 * Pure label for Discover opportunity rail rows.
 * Pass pre-shortened `urlLabel` from displayOpportunityUrl when needed (keeps this
 * module dependency-free for Node strip-types verify runners).
 */

export type OpportunityRailLabelInput = {
  title?: string | null
  company?: string | null
  /** Already-shortened URL label (optional). */
  urlLabel?: string | null
}

/** Prefer title → company → urlLabel → fallback. */
export function opportunityRailLabel(row: OpportunityRailLabelInput): string {
  const title = row.title?.trim()
  if (title) return title
  const company = row.company?.trim()
  if (company) return company
  const url = row.urlLabel?.trim()
  if (url) return url
  return 'target'
}
