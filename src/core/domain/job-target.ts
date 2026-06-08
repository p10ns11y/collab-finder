/** Job target domain types (Slice B/C + prep-in-place).
 * Mirror the Rust wire types from src-tauri/src/lib.rs exactly:
 *   - JobAnalysisResult / JobPrepResult (top level from analyze_job_target / prep_job_target)
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

export type JobFit = {
  overall: number
  rationale: string
  gaps_must: string[]
  gaps_nice?: string[]
  recommended_action: string
}

export type JobPrep = {
  cover_letter: string
  cv_suggestions: string[]
  research_notes: string
  exceptional_work_example?: string
}

export type JobAnalysisResult = {
  opportunity_id: number
  fit: JobFit
  packet_preview: string
  est_cost_usd: number
}

export type JobPrepResult = {
  opportunity_id: number
  prep: JobPrep
  est_cost_usd: number
}

/** Union for the data carried in AsyncState<JobTargetResult> (model.jobTarget).
 * - After JobTargetAnalyzeSucceeded: JobAnalysisResult
 * - After JobTargetPrepSucceeded (merged in update): JobAnalysisResult & { prep: JobPrep } (fit preserved + prep added)
 * - JobPrepResult alone is possible in fallback flows
 * Uses structural/property-presence narrowing (e.g. 'fit' in r) rather than a runtime 'type' tag (intentional: no new state, mirrors separate Rust results + client merge exactly; see PR2 design + update.ts).
 */
export type JobTargetResult =
  | JobAnalysisResult
  | JobPrepResult
  | (JobAnalysisResult & { prep: JobPrep })

/** Mirror of Rust JobPageResult (used by fetch_job_page; mostly internal to backend today). */
export type JobPageResult = {
  title?: string | null
  company?: string | null
  cleaned_text: string
  original_len: number
  truncated: boolean
}
