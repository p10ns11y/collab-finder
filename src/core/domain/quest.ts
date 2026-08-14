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

export type QuestThreadSummary = {
  session_id: string
  kind: string
  updated_at: string
  preview?: string | null
}

export type QuestTurnHit = {
  session_id: string
  role: string
  text: string
  ts: string
}

export type QuestThreadRecord = {
  session_id: string
  kind: string
  context_ids: string
  last_opp_id?: number | null
  created_at: string
  updated_at: string
  turns: Array<{
    role: string
    text: string
    ts: string
    backend?: string | null
    prompt_chars?: number | null
  }>
}

export type QuestGraphNode = { id: string; label: string }
export type QuestGraph = {
  nodes: QuestGraphNode[]
  /** Directed next-id per node. Last node may loop to an earlier id. */
  next: Record<string, string | undefined>
}

const GRAPHS: Record<QuestKind, QuestGraph> = {
  eva: {
    nodes: [
      { id: 'prior', label: 'Prior' },
      { id: 'probe', label: 'Probe' },
      { id: 'simulate', label: 'Simulate' },
      { id: 'score', label: 'Score' },
      { id: 'actorask', label: 'ActOrAsk' },
    ],
    next: {
      prior: 'probe',
      probe: 'simulate',
      simulate: 'score',
      score: 'actorask',
    },
  },
  control: {
    nodes: [
      { id: 'orient', label: 'Orient' },
      { id: 'plan', label: 'Plan' },
      { id: 'execute', label: 'Execute' },
      { id: 'verify', label: 'Verify' },
      { id: 'review', label: 'Review' },
      { id: 'integrate', label: 'Integrate' },
    ],
    next: {
      orient: 'plan',
      plan: 'execute',
      execute: 'verify',
      verify: 'review',
      review: 'integrate',
    },
  },
  hunt: {
    nodes: [
      { id: 'data', label: 'Data' },
      { id: 'keys', label: 'Keys' },
      { id: 'query', label: 'Query' },
      { id: 'rank', label: 'Rank' },
      { id: 'fit', label: 'Fit' },
      { id: 'pack', label: 'Pack' },
    ],
    next: {
      data: 'keys',
      keys: 'query',
      query: 'rank',
      rank: 'fit',
      fit: 'pack',
    },
  },
  apply: {
    nodes: [
      { id: 'af1', label: 'AF employ' },
      { id: 'af2', label: 'AF learned' },
      { id: 'portal', label: 'Portal' },
      { id: 'honesty', label: 'No fake YOE' },
      { id: 'pack', label: 'Pack' },
    ],
    next: {
      af1: 'af2',
      af2: 'portal',
      portal: 'honesty',
      honesty: 'pack',
    },
  },
  free: {
    nodes: [
      { id: 'ask', label: 'Ask' },
      { id: 'search', label: 'Search' },
      { id: 'answer', label: 'Answer' },
      { id: 'follow', label: 'Follow-up' },
    ],
    next: {
      ask: 'search',
      search: 'answer',
      answer: 'follow',
      follow: 'ask',
    },
  },
}

export function questGraph(kind: QuestKind): QuestGraph {
  return GRAPHS[kind]
}

/** Which node is live given drawer status and thread length. */
export function activeQuestNode(
  kind: QuestKind,
  status: 'idle' | 'loading' | 'ready' | 'failed',
  turnCount: number,
): string {
  const g = GRAPHS[kind]
  const first = g.nodes[0]?.id ?? 'ask'
  if (status === 'idle' && turnCount === 0) return first
  if (kind === 'free') {
    if (status === 'loading') return turnCount <= 1 ? 'search' : 'follow'
    if (status === 'failed') return 'ask'
    return turnCount >= 2 ? 'answer' : first
  }
  if (status === 'loading') return g.nodes[1]?.id ?? first
  if (status === 'ready') return g.nodes[g.nodes.length - 1]?.id ?? first
  if (status === 'failed') return first
  return first
}

export const QUEST_KIND_CHIPS: readonly { id: QuestKind; label: string }[] = [
  { id: 'eva', label: 'EVA' },
  { id: 'control', label: 'Control graph' },
  { id: 'hunt', label: 'Hunt' },
  { id: 'apply', label: 'Apply' },
  { id: 'free', label: 'Free' },
]

/** Operator copy — keep in sync with docs/quest-flows.md */
export type QuestUsage = {
  use: string
  skip: string
  example: string
}

export const QUEST_USAGE: Record<QuestKind, QuestUsage> = {
  eva: {
    use: 'When you are unsure what to do next. It lists what we know and one cheap question.',
    skip: 'Not for opening a job link or writing an email.',
    example:
      'I am not sure I should keep searching Sweden this week. List what we know, what we do not, and one small question that would change the plan. Do not search or apply.',
  },
  control: {
    use: 'When you have a block of time and want a simple plan with a stop point.',
    skip: 'Not for writing outreach or fetching a page.',
    example:
      'I have 90 minutes. Plan the session in short steps and tell me where I should pause and decide.',
  },
  hunt: {
    use: 'When the Sweden search box is too wide. It rewrites the words to type.',
    skip: 'Web is off here. Paste a job link in Free instead.',
    example:
      'My Sweden search is too broad. Give me two searches: one from paid TypeScript and React work, one from self-taught AI. Plain words only, no OR. List titles I should skip.',
  },
  apply: {
    use: 'When ads are already on the Sweden screen and you want the next honest shortlist.',
    skip: 'Will not open a URL or draft an email. Use Free for that. Turn on Me.',
    example:
      'I already applied to two jobs. From the ads on Sweden, pick the next three. Table: where I found it, title, honest or stretch, why it is honest, what is missing.',
  },
  free: {
    use: 'When you need an answer now — email-only ads, a draft note, facts that may have changed.',
    skip: 'Not a cover-letter pack. Turn on Me (and This ad) so it uses your distilled data.',
    example:
      'This job only wants an email, not a CV. Using the attached Me context, write a short application email (subject + body). If a fact is not in context, write UNKNOWN. Do not invent years or employers.',
  },
}

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
    'A=employment-grounded (Oneflow TS/React/integrations only). B=self-learned AI/agentic — decent enough to apply. Never invent industry ML YOE. Skip research scientist.',
    'Output: better q string(s); refuse list; next search.',
  ].join(' '),
  apply: [
    'HARNESS: 3 employment-grounded + 2 self-learned AI/agentic. 2 AF + 3 portals. Honest = inferable from paid jobs only; agentic OSS is enough for B. No fabricated ML YOE.',
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
  'hunt-rails: employment vs self-learned AI keys',
  'cv-promote-guard: sidecar only',
].join('; ')

export function buildQuestPrompt(input: {
  kind: QuestKind
  question: string
  snapshot: QuestSnapshot
  followUp?: boolean
  /** Distilled packs. Re-sent on follow-up so facts stay attached. */
  contextBlock?: string
}): string {
  const q = input.question.trim() || '(empty — propose the next cheapest probe)'
  const context = (input.contextBlock || '').trim()
  // Follow-ups skip harness/snapshot but keep selected distilled packs.
  if (input.followUp) {
    return clipChars([context, 'QUESTION:', q].filter(Boolean).join('\n'), QUEST_PROMPT_CHAR_CAP)
  }
  const lead =
    input.kind === 'free'
      ? 'LOCAL QUEST (free). Answer the user now. Read-only. No file edits.'
      : 'LOCAL QUEST. Read-only. No file edits. Lead with the answer. Then ≤5 short bullets.'
  const skills = input.kind === 'free' ? '' : `SKILLS: ${SKILL_INDEX}`
  const snap = input.kind === 'free' ? '' : `SNAPSHOT:\n${formatQuestSnapshot(input.snapshot)}`
  const body = [lead, skills, HARNESS[input.kind], context, snap, 'QUESTION:', q]
    .filter(Boolean)
    .join('\n')
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
