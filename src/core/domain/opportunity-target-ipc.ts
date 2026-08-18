import type { OpportunityTargetAnalysisResult, OpportunityTargetFit } from './opportunity-target'
import type { Opportunity } from './history'

/**
 * Pure contract for Quick Target IPC with the Rust side.
 * - Never injects DEFAULT_CV_SUMMARY here.
 * - Empty/blank input => undefined (so Rust receives None and can choose devprofile_path or its internal DEFAULT).
 * - Bundled distilled default with no user edit => undefined (devprofile / kanithanj.cv / packs win on Rust).
 */
export function cvSummaryForIpc(
  trimmed: string,
  options?: { distilledDefault?: string; userEdited?: boolean },
): string | undefined {
  const t = (trimmed || '').trim()
  if (!t) return undefined
  const isDistilledDefaultOnly =
    options?.distilledDefault != null &&
    options.userEdited !== true &&
    t === options.distilledDefault.trim()
  if (isDistilledDefaultOnly) return undefined
  return t
}

/**
 * Pure reconstruction of OpportunityTargetAnalysisResult from a persisted Opportunity row (analysis_json).
 * Moved from effects.ts loadOpportunityCmd so it can be unit-tested and used by verify.
 */
export function reconstructAnalysisFromOpportunity(o: Opportunity): OpportunityTargetAnalysisResult | null {
  if (o.analysis_json) {
    try {
      const parsed = JSON.parse(o.analysis_json)
      const fit: OpportunityTargetFit | undefined = parsed && typeof parsed === 'object' && 'fit' in parsed ? (parsed as any).fit : parsed
      if (fit && typeof fit.overall === 'number' && typeof fit.rationale === 'string' && Array.isArray(fit.gaps_must)) {
        const full = parsed && typeof parsed === 'object' ? (parsed as any) : {}
        const analysis: OpportunityTargetAnalysisResult = {
          opportunity_id: o.id,
          fit,
          fit_mode:
            typeof full.fit_mode === 'string' && full.fit_mode
              ? full.fit_mode
              : 'strict',
          packet_preview: typeof full.packet_preview === 'string' ? full.packet_preview : (o.jd_text || '').slice(0, 800),
          packet_preview_truncated: typeof full.packet_preview_truncated === 'boolean' ? full.packet_preview_truncated : (o.jd_text || '').length > 800,
          cv_chars_sent: typeof full.cv_chars_sent === 'number' ? full.cv_chars_sent : 0,
          cv_ipc_chars: typeof full.cv_ipc_chars === 'number' ? full.cv_ipc_chars : 0,
          cv_used_fallback: typeof full.cv_used_fallback === 'boolean' ? full.cv_used_fallback : false,
          prompt_tokens: typeof full.prompt_tokens === 'number' ? full.prompt_tokens : 0,
          completion_tokens: typeof full.completion_tokens === 'number' ? full.completion_tokens : 0,
          est_cost_usd: typeof full.est_cost_usd === 'number' ? full.est_cost_usd : 0,
        }
        return analysis
      }
    } catch {
      // fall through
    }
  }
  if (typeof o.fit_score === 'number') {
    const stubFit: OpportunityTargetFit = {
      overall: o.fit_score,
      rationale: 'Restored from prior opportunity record (no full analysis_json available).',
      gaps_must: [],
      recommended_action: 'Review prep artifacts or re-evaluate fit.',
    }
    const analysis: OpportunityTargetAnalysisResult = {
      opportunity_id: o.id,
      fit: stubFit,
      packet_preview: '(restored — the original distilled CV packet that was sent is not stored; only the opportunity record remains)',
      packet_preview_truncated: false,
      cv_chars_sent: 0,
      cv_ipc_chars: 0,
      cv_used_fallback: false,
      prompt_tokens: 0,
      completion_tokens: 0,
      est_cost_usd: 0,
    }
    return analysis
  }
  return null
}

/**
 * Pure predicate for whether to show the "Restored from DB — CV packet ... not stored" warning.
 * Moved from panel so it is testable in isolation.
 */
export function shouldShowRestoredCvWarning(analysis: OpportunityTargetAnalysisResult): boolean {
  const cvCharsSent = 'cv_chars_sent' in analysis ? (analysis as any).cv_chars_sent : undefined
  const cvIpcChars = 'cv_ipc_chars' in analysis ? (analysis as any).cv_ipc_chars : undefined
  const cvUsedFallback = 'cv_used_fallback' in analysis ? (analysis as any).cv_used_fallback : undefined
  const estCost = 'est_cost_usd' in analysis ? (analysis as any).est_cost_usd : undefined
  return cvCharsSent === 0 && cvIpcChars === 0 && !cvUsedFallback && (estCost === 0 || estCost === undefined)
}
