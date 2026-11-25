/**
 * Helpers for opportunity source URLs (rail, fit panel, history/data).
 * Keeps link rendering consistent and tolerates missing/relative values.
 */

/** True when the string is a single URL, not a JD that merely contains a URL. */
export function looksLikeLoneOpportunityUrl(raw: string | null | undefined): boolean {
  if (raw == null) return false
  const t = String(raw).trim()
  if (!t || t.length > 2000) return false
  if (t.includes('\n') || t.includes('\r')) return false
  if (t.startsWith('#')) return false
  if (/^https?:\/\//i.test(t) || t.startsWith('//')) return true
  return !t.includes(' ') && t.includes('.')
}

/** Return a browser-openable http(s) URL, or null if none. */
export function normalizeOpportunityUrl(raw: string | null | undefined): string | null {
  if (!looksLikeLoneOpportunityUrl(raw)) return null
  if (raw == null) return null
  const t = String(raw).trim()
  if (!t) return null
  if (/^https?:\/\//i.test(t)) return t
  // Bare host/path from some paste paths — only promote if it looks like a host.
  if (/^[a-z0-9][a-z0-9.-]+\.[a-z]{2,}([/:?].*)?$/i.test(t)) {
    return `https://${t}`
  }
  return null
}

/** Short label for dense UI (host + path prefix). */
export function displayOpportunityUrl(raw: string | null | undefined, maxLen = 48): string {
  const href = normalizeOpportunityUrl(raw)
  if (!href) return ''
  try {
    const u = new URL(href)
    const shown = `${u.host}${u.pathname === '/' ? '' : u.pathname}`
    return shown.length > maxLen ? `${shown.slice(0, maxLen - 1)}…` : shown
  } catch {
    return href.length > maxLen ? `${href.slice(0, maxLen - 1)}…` : href
  }
}
