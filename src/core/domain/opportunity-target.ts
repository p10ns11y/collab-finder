/** OpportunityTarget domain types for quick opportunity analysis (URL or pasted description) + prep.
 * Mirror the Rust wire types from src-tauri/src/opportunity_target.rs exactly:
 *   - OpportunityTargetAnalysisResult / OpportunityTargetPrepResult (top level from analyze_opportunity_target / prep_opportunity_target)
 *   - Inner fit report (from xAI structured schema in analyze)
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

export type OpportunityTargetFit = {
  overall: number
  rationale: string
  gaps_must: string[]
  gaps_nice?: string[]
  recommended_action: string
}

export type OpportunityTargetPrep = {
  cover_letter: string
  cv_suggestions: string[]
  research_notes: string
  exceptional_work_example?: string
}

export type OpportunityTargetAnalysisResult = {
  opportunity_id: number
  fit: OpportunityTargetFit
  /**
   * A prefix of the CV packet that was actually sent to the model for this call.
   * The *full* packet the user entered in the input is always used verbatim
   * (the input is already the distilled version intended for the model).
   * This field exists only so the result UI can show a compact "what was sent" reference.
   */
  packet_preview: string
  est_cost_usd: number
}

export type OpportunityTargetPrepResult = {
  opportunity_id: number
  prep: OpportunityTargetPrep
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
  | (OpportunityTargetAnalysisResult & { prep: OpportunityTargetPrep })

/** Mirror of Rust OpportunityTargetPageResult (used by fetch_opportunity_target_page; mostly internal to backend today). */
export type OpportunityTargetPageResult = {
  title?: string | null
  company?: string | null
  cleaned_text: string
  original_len: number
  truncated: boolean
}
