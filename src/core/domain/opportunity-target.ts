/** OpportunityTarget domain types for quick opportunity analysis (URL or pasted description) + prep.
 * Mirror the Rust wire types from src-tauri/src/opportunity_target.rs exactly:
 *   - OpportunityTargetAnalysisResult / OpportunityTargetPrepResult (top level from analyze_opportunity_target / prep_opportunity_target)
 *   - Inner fit report (from xAI structured schema in analyze) — dual-fit v2
 *   - Inner prep artifacts (from xAI structured schema in prep)
 * Opportunity row shape (from history + db) is related but separate (analysis_json/prep_artifacts_json strings).
 *
 * This removes all `any` + `as any` at the boundary (model/msg/port/adapter/effects/update/panel).
 * The merged shape (fit + prep coexisting after "Evaluate fit" then "Generate prep pack")
 * is expressed via the union + intersection arm so merge stays cheap (no new state machinery).
 *
 * Enables future MCP/agents + CV promote without amplification of untyped shapes.
 * Per design PR2 / TD-006 + Key Decision 3.
 */

/** Dual-fit report. New fields optional for backward-tolerant history restore. */
export type OpportunityTargetFit = {
  overall: number
  rationale: string
  gaps_must: string[]
  gaps_nice?: string[]
  recommended_action: string
  /** Candidate can do the role (from CV). */
  candidate_to_role?: number
  /** Role is right for the candidate (from constraints). */
  role_to_candidate?: number
  /** Ways the role fails candidate constraints. */
  role_concerns?: string[]
  /** Hard constraint violations when clearly evidenced. */
  deal_breakers_triggered?: string[]
}

/** Real JD body only — ignore empty and the old analyze upsert placeholder `"jd"`. */
export function usableOpportunityJdText(text?: string | null): string | undefined {
  if (text == null) return undefined
  const trimmed = text.trim()
  if (!trimmed || trimmed === 'jd') return undefined
  return text
}

export type OpportunityTargetPrep = {
  cover_letter: string
  cv_suggestions: string[]
  research_notes: string
  exceptional_work_example?: string
  /** Subject + email touch + full cover letter for apply-via-email. */
  email_draft?: string
  /** Embedded by Rust after variant selection (also on prep result top-level). */
  proof_variant_id?: string
  proof_variant_title?: string
}

export type OpportunityTargetAnalysisResult = {
  opportunity_id: number
  fit: OpportunityTargetFit
  /**
   * `strict` = dual-fit (You↔Role + constraints). `relaxed` = simple fitness → prep.
   * Omitted on older DB rows (treat as strict).
   */
  fit_mode?: 'strict' | 'relaxed' | string
  /**
   * Prefix of the CV packet in the xAI user prompt (max 8000 chars).
   * When `packet_preview_truncated` is false and this matches your input, the full CV was sent.
   */
  packet_preview: string
  /** True when the full CV exceeded the preview cap (model still received the full CV). */
  packet_preview_truncated: boolean
  /** Character count of the full CV in the prompt (not JD). */
  cv_chars_sent: number
  /** Non-zero when `cv_summary` was non-empty over IPC (after trim). */
  cv_ipc_chars: number
  /** True when IPC omitted/empty `cv_summary` and the distillation default was used. */
  cv_used_fallback: boolean
  prompt_tokens: number
  completion_tokens: number
  est_cost_usd: number
}

export type OpportunityTargetPrepResult = {
  opportunity_id: number
  prep: OpportunityTargetPrep
  /** Role-class exceptional-work variant selected from proof-variants bank. */
  proof_variant_id?: string
  est_cost_usd: number
}

/** Union for the data carried in AsyncState<OpportunityTargetResult> (model.opportunityTarget).
 * - After OpportunityTargetAnalyzeSucceeded: OpportunityTargetAnalysisResult
 * - After OpportunityTargetPrepSucceeded (merged in update): OpportunityTargetAnalysisResult & { prep: OpportunityTargetPrep } (fit preserved + prep added)
 * - OpportunityTargetPrepResult alone is possible in fallback flows
 * Uses structural/property-presence narrowing (e.g. 'fit' in r) rather than a runtime 'type' tag (intentional: no new state, mirrors separate Rust results + client merge exactly; see PR2 design + update.ts).
 */
export type OpportunityTargetResult =
  | OpportunityTargetAnalysisResult
  | OpportunityTargetPrepResult
  | (OpportunityTargetAnalysisResult & { prep: OpportunityTargetPrep; proof_variant_id?: string })

/** Mirror of Rust OpportunityTargetPageResult (used by fetch_opportunity_target_page; mostly internal to backend today). */
export type OpportunityTargetPageResult = {
  title?: string | null
  company?: string | null
  cleaned_text: string
  original_len: number
  truncated: boolean
}

/** Compact previous_fit payload for prep IPC (includes dual-fit when present). */
export function serializePreviousFitForPrep(fit: OpportunityTargetFit): string {
  return JSON.stringify({
    overall: fit.overall,
    candidate_to_role: fit.candidate_to_role,
    role_to_candidate: fit.role_to_candidate,
    rationale: fit.rationale,
    gaps_must: fit.gaps_must,
    gaps_nice: fit.gaps_nice,
    role_concerns: fit.role_concerns,
    deal_breakers_triggered: fit.deal_breakers_triggered,
    recommended_action: fit.recommended_action,
  })
}

function firstSentences(text: string, maxSentences: number): string {
  const kept: string[] = []
  let buffer = ''
  for (const ch of text) {
    buffer += ch
    if (ch === '.' || ch === '!' || ch === '?') {
      const trimmed = buffer.trim()
      if (trimmed) kept.push(trimmed)
      buffer = ''
      if (kept.length >= maxSentences) break
    }
  }
  if (kept.length < maxSentences && buffer.trim()) kept.push(buffer.trim())
  return kept.join(' ')
}

function coverLetterBodyExcerpt(cover: string, maxChars: number): string {
  const lines = cover
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  while (lines[0]) {
    const lower = lines[0].toLowerCase()
    if (lower.startsWith('dear ') || lower.startsWith('hi ') || lower.startsWith('hello ')) {
      lines.shift()
      continue
    }
    break
  }
  while (lines[lines.length - 1]) {
    const last = lines[lines.length - 1]
    const lower = last.toLowerCase()
    if (
      lower.startsWith('sincerely') ||
      lower.startsWith('best regards') ||
      lower.startsWith('kind regards') ||
      lower.startsWith('regards') ||
      last === '—'
    ) {
      lines.pop()
      continue
    }
    break
  }
  return lines.join(' ').slice(0, maxChars)
}

function displayCompanyName(company: string): string {
  const trimmed = company.trim()
  if (!trimmed) return 'the company'
  if (trimmed.includes(' ')) {
    return trimmed
      .split(/\s+/)
      .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
      .join(' ')
  }
  return trimmed[0].toUpperCase() + trimmed.slice(1)
}

function displayRoleTitle(title: string): string {
  const trimmed = title.trim().replace('Typescript', 'TypeScript')
  return trimmed || 'Software Engineer'
}

/** Deterministic email body: short touch + attach-CV line + full cover letter. */
export function buildEmailApplyDraft(
  cover: string,
  company?: string | null,
  title?: string | null,
): string {
  const companyName = displayCompanyName(company ?? '')
  const role = displayRoleTitle(title ?? '')
  const subject = `Application — ${role} — ${companyName}`
  const excerpt = coverLetterBodyExcerpt(cover, 480)
  const touch =
    firstSentences(excerpt, 2) || `I'm applying for the ${role} role at ${companyName}.`
  return `Subject: ${subject}\n\nHi,\n\n${touch}\n\nI've attached my CV as a PDF.\n\n---\n\n${cover.trim()}\n`
}
