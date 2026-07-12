/**
 * CV packet (distilled summary) integrity helpers.
 *
 * The Discover textarea is backed by localStorage (`cf.cvSummary`). We have seen
 * that value surface as dense CJK / mojibake (classic UTF-8 bytes paired as
 * UTF-16 code units) while the on-disk SQLite still holds English "PROFILE…".
 * That also breaks session restore when CV + session share one try/catch.
 *
 * These predicates keep the product usable: reject obvious corruption, fall back
 * to the distilled default, and re-write a clean cache entry.
 */

/** CJK Unified Ideographs — dense presence in an English CV packet = corruption. */
const CJK_RE = /[\u4e00-\u9fff]/g
/** Private-use / unpaired-surrogate debris often left by UTF-16 pair mis-decode. */
const PU_RE = /[\ue000-\uf8ff]/
/** Expected anchors in our distilled packet (and agent variants). */
const ANCHOR_RE = /PROFILE|Peramanathan|AGENT CONTEXT|CORE IDENTITY|Senior Software Engineer/i

/**
 * True when `s` looks like a usable English (or mixed) CV packet for this app.
 * Intentionally strict on CJK density: this product's distilled packet is English.
 * A real Chinese CV would need an explicit allow-path later.
 */
export function isPlausibleCvPacket(s: string | null | undefined): boolean {
  if (s == null) return false
  const t = s.trim()
  if (t.length < 40) return false
  if (PU_RE.test(t)) return false

  const cjk = (t.match(CJK_RE) || []).length
  const cjkRatio = cjk / t.length
  // UTF-16LE mis-decode of English yields ~40–60% CJK-looking units.
  if (cjkRatio > 0.12) return false

  // Prefer known anchors; if missing, still allow high-ASCII prose (user edits).
  if (ANCHOR_RE.test(t)) return true

  const asciiLetters = (t.match(/[A-Za-z]/g) || []).length
  return asciiLetters / t.length >= 0.45
}

/**
 * Return a safe CV packet: prefer `candidate` when plausible, else `fallback`.
 * Does not touch localStorage (caller decides whether to re-persist).
 */
export function sanitizeCvPacket(candidate: string | null | undefined, fallback: string): {
  value: string
  wasCorrupted: boolean
  source: 'candidate' | 'fallback'
} {
  if (isPlausibleCvPacket(candidate)) {
    return { value: candidate as string, wasCorrupted: false, source: 'candidate' }
  }
  const wasCorrupted = candidate != null && candidate.trim().length > 0
  return { value: fallback, wasCorrupted, source: 'fallback' }
}
