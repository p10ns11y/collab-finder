/**
 * Local Grok quest drawer — compact harness + snapshot, not a repo dump.
 * Evaluate/prep stay on the xAI API. This surface is read-only Q&A via grok -p.
 */

export const QUEST_PROMPT_CHAR_CAP = 4500
export const QUEST_CONTEXT_CHAR_CAP = 1600

export type QuestKind = 'eva' | 'control' | 'hunt' | 'apply' | 'free'

export type QuestSnapshot = {
  screen: string
  rail?: string
  query?: string
  municipality?: string
  harvested?: string[]
  selectedTitle?: string
  selectedEmployer?: string
  lastOppId?: number
}

export type QuestResult = {
  answer: string
  backend: string
  elapsed_ms: number
  prompt_chars: number
  session_id: string
}

export type QuestTurn = {
  role: 'user' | 'assistant'
  text: string
}

export const QUEST_KIND_CHIPS: readonly { id: QuestKind; label: string }[] = [
  { id: 'eva', label: 'EVA' },
  { id: 'control', label: 'Control graph' },
  { id: 'hunt', label: 'Hunt' },
  { id: 'apply', label: 'Apply' },
  { id: 'free', label: 'Free' },
]

const HARNESS: Record<QuestKind, string> = {
  eva: [
    'HARNESS: eva-emptiness (Prior→Probe→Simulate→Score→ActOrAsk).',
    'Output: emptiness_score; knowns[]; unknowns[]; idk; disprove_with; one DOE question.',
    'Do not Act. Do not edit files. Ask only if auth_horizon=hit.',
  ].join(' '),
  control: [
    'HARNESS: control-graph outer SM.',
    'Output: phase; max_loop_iters; next 3 inner steps (id, done_when, role); pause gate if any.',
    'Roles: fast|explore|coding|deep|review. No unbounded ReAct.',
  ].join(' '),
  hunt: [
    'HARNESS: dual-rail hunt. JobTech q is AND tokens (no OR/-).',
    'A=honest Oneflow TS/React. B=stretch-adjacent software titles only (not research scientist).',
    'Output: better q string(s); refuse list; next search.',
  ].join(' '),
  apply: [
    'HARNESS: 3 honest-now + 2 stretch-adjacent. 2 AF + 3 portals. Honesty contract: no fabricated ML YOE.',
    'Output: slot table or gaps. Stay on Sweden; no auto-submit.',
  ].join(' '),
  free: [
    'HARNESS: free-form Q&A. Answer the question now.',
    'Do not recast this as a hunt, EVA card, or selected-role check unless the user asked that.',
    'Do not stop at a plan. Use the web if facts may have changed. ≤400 words.',
  ].join(' '),
}

export function parseQuestKind(raw: string | undefined): QuestKind {
  if (raw === 'eva' || raw === 'control' || raw === 'hunt' || raw === 'apply' || raw === 'free') {
    return raw
  }
  return 'eva'
}

export function clipChars(text: string, cap: number): string {
  if (text.length <= cap) return text
  return `${text.slice(0, Math.max(0, cap - 1)).trimEnd()}…`
}

export function formatQuestSnapshot(snap: QuestSnapshot): string {
  const lines = [
    `screen=${snap.screen}`,
    snap.rail ? `rail=${snap.rail}` : '',
    snap.query ? `q=${snap.query}` : '',
    snap.municipality ? `muni=${snap.municipality}` : '',
    snap.harvested?.length ? `keys=${snap.harvested.slice(0, 5).join('|')}` : '',
    snap.selectedTitle
      ? `selected=${snap.selectedTitle}${snap.selectedEmployer ? ` @ ${snap.selectedEmployer}` : ''}`
      : '',
    typeof snap.lastOppId === 'number' ? `opp=${snap.lastOppId}` : '',
  ].filter(Boolean)
  return clipChars(lines.join('\n'), QUEST_CONTEXT_CHAR_CAP)
}

const SKILL_INDEX = [
  'eva-emptiness: emptiness card + DOE',
  'control-graph: phases/budgets/HITL',
  'finder-reactor: fit/cost/rate guards',
  'hunt-rails: honest vs stretch keys',
  'cv-promote-guard: sidecar only',
].join('; ')

export function buildQuestPrompt(input: {
  kind: QuestKind
  question: string
  snapshot: QuestSnapshot
  followUp?: boolean
}): string {
  const q = input.question.trim() || '(empty — propose the next cheapest probe)'
  // Follow-ups ride the Grok session — do not re-send harness/snapshot.
  if (input.followUp) {
    return clipChars(`QUESTION:\n${q}`, QUEST_PROMPT_CHAR_CAP)
  }
  const lead =
    input.kind === 'free'
      ? 'LOCAL QUEST (free). Answer the user now. Read-only. No file edits.'
      : 'LOCAL QUEST. Read-only. No file edits. Lead with the answer. Then ≤5 short bullets.'
  const skills = input.kind === 'free' ? '' : `SKILLS: ${SKILL_INDEX}`
  const snap = input.kind === 'free' ? '' : `SNAPSHOT:\n${formatQuestSnapshot(input.snapshot)}`
  const body = [lead, skills, HARNESS[input.kind], snap, 'QUESTION:', q].filter(Boolean).join('\n')
  return clipChars(body, QUEST_PROMPT_CHAR_CAP)
}

export function snapshotFromFinder(model: {
  activeScreen: string
  huntRail?: string
  platsbankenQ?: string
  platsbankenMunicipality?: string
  huntHarvested?: Array<{ key: string }>
  lastActiveOppId?: number
  opportunityTargetUrl?: string
}): QuestSnapshot {
  return {
    screen: model.activeScreen,
    rail: model.huntRail,
    query: model.platsbankenQ,
    municipality: model.platsbankenMunicipality,
    harvested: model.huntHarvested?.map((h) => h.key),
    selectedTitle: model.opportunityTargetUrl
      ? model.opportunityTargetUrl.replace(/^https?:\/\//, '').slice(0, 80)
      : undefined,
    lastOppId: model.lastActiveOppId,
  }
}
