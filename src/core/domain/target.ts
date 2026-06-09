/** Target domain types for quick opportunity analysis (URL or pasted description) + prep.
 * Mirror the Rust wire types from src-tauri/src/target.rs exactly:
 *   - TargetAnalysisResult / TargetPrepResult (top level from analyze_target / prep_target)
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

export type TargetFit = {
  overall: number
  rationale: string
  gaps_must: string[]
  gaps_nice?: string[]
  recommended_action: string
}

export type TargetPrep = {
  cover_letter: string
  cv_suggestions: string[]
  research_notes: string
  exceptional_work_example?: string
}

export type TargetAnalysisResult = {
  opportunity_id: number
  fit: TargetFit
  packet_preview: string
  est_cost_usd: number
}

export type TargetPrepResult = {
  opportunity_id: number
  prep: TargetPrep
  est_cost_usd: number
}

/** Union for the data carried in AsyncState<TargetResult> (model.opportunityTarget).
 * - After TargetAnalyzeSucceeded: TargetAnalysisResult
 * - After TargetPrepSucceeded (merged in update): TargetAnalysisResult & { prep: TargetPrep } (fit preserved + prep added)
 * - TargetPrepResult alone is possible in fallback flows
 * Uses structural/property-presence narrowing (e.g. 'fit' in r) rather than a runtime 'type' tag (intentional: no new state, mirrors separate Rust results + client merge exactly; see PR2 design + update.ts).
 */
export type TargetResult =
  | TargetAnalysisResult
  | TargetPrepResult
  | (TargetAnalysisResult & { prep: TargetPrep })

/** Mirror of Rust TargetPageResult (used by fetch_target_page; mostly internal to backend today). */
export type TargetPageResult = {
  title?: string | null
  company?: string | null
  cleaned_text: string
  original_len: number
  truncated: boolean
}
