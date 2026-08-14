import constraintsCompact from '../../../data/distillation/curation/candidate-constraints-compact.txt?raw'
import projectsFocused from '../../../data/distillation/public-projects-focused-flatten.json'
import { clipChars } from './quest'

export type QuestContextId = 'me' | 'constraints' | 'ad' | 'projects'

export const QUEST_CONTEXT_PACKS: readonly {
  id: QuestContextId
  label: string
  hint: string
}[] = [
  { id: 'me', label: 'Me', hint: 'Paid-work facts from the distilled CV packet' },
  { id: 'constraints', label: 'Constraints', hint: 'Geo, family, deal-breakers (compact)' },
  { id: 'ad', label: 'This ad', hint: 'Selected / last opportunity on screen' },
  { id: 'projects', label: 'Projects', hint: 'Public OSS — not employment years' },
]

export const DEFAULT_QUEST_CONTEXT_IDS: QuestContextId[] = ['me']

const PACK_CAP: Record<QuestContextId, number> = {
  me: 1400,
  constraints: 700,
  ad: 400,
  projects: 700,
}

export type QuestContextSlice = { id: QuestContextId; label: string; body: string }

type ProjectRow = {
  name?: string
  description?: string
  html_url?: string
}

function employmentSlice(cv: string): string {
  const t = cv.trim()
  if (!t) return ''
  const end = t.search(/\nEDUCATION\b/)
  return (end > 0 ? t.slice(0, end) : t).trim()
}

function formatProjects(): string {
  const rows = (projectsFocused as { projects?: ProjectRow[] }).projects ?? []
  return rows
    .slice(0, 8)
    .map((p) => {
      const name = p.name || 'project'
      const url = p.html_url || ''
      const desc = (p.description || '').replace(/\s+/g, ' ').slice(0, 120)
      return `- ${name}${url ? ` ${url}` : ''}${desc ? ` — ${desc}` : ''}`
    })
    .join('\n')
}

function formatAd(input: {
  opportunityTargetUrl?: string
  lastOpp?: { title?: string; company?: string; source_url?: string; jd_text?: string }
}): string {
  const o = input.lastOpp
  const url = input.opportunityTargetUrl || o?.source_url || ''
  const lines = [
    o?.title ? `title=${o.title}` : '',
    o?.company ? `company=${o.company}` : '',
    url ? `url=${url}` : '',
    o?.jd_text ? `jd=${o.jd_text.replace(/\s+/g, ' ').slice(0, 280)}` : '',
  ].filter(Boolean)
  return lines.join('\n')
}

export function parseQuestContextIds(raw: string | undefined): QuestContextId[] {
  try {
    const arr = JSON.parse(raw || '[]') as unknown
    if (!Array.isArray(arr)) return [...DEFAULT_QUEST_CONTEXT_IDS]
    const ids = arr.filter(
      (x): x is QuestContextId =>
        x === 'me' || x === 'constraints' || x === 'ad' || x === 'projects',
    )
    return ids.length ? ids : [...DEFAULT_QUEST_CONTEXT_IDS]
  } catch {
    return [...DEFAULT_QUEST_CONTEXT_IDS]
  }
}

export function toggleQuestContextId(
  current: readonly QuestContextId[],
  id: QuestContextId,
): QuestContextId[] {
  return current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
}

/** Build selected packs from repo distillation + live screen. Empty body → pack is off or missing. */
export function resolveQuestContextPacks(input: {
  ids: readonly QuestContextId[]
  cvSummary: string
  opportunityTargetUrl?: string
  lastOpp?: { title?: string; company?: string; source_url?: string; jd_text?: string }
}): QuestContextSlice[] {
  const wanted = new Set(input.ids)
  const out: QuestContextSlice[] = []
  for (const pack of QUEST_CONTEXT_PACKS) {
    if (!wanted.has(pack.id)) continue
    let raw = ''
    if (pack.id === 'me') raw = employmentSlice(input.cvSummary)
    if (pack.id === 'constraints') raw = String(constraintsCompact || '').trim()
    if (pack.id === 'ad') raw = formatAd(input)
    if (pack.id === 'projects') raw = formatProjects()
    const body = raw
      ? clipChars(raw, PACK_CAP[pack.id])
      : `(${pack.label} not loaded — turn the chip off or open Discover)`
    out.push({ id: pack.id, label: pack.label, body })
  }
  return out
}

export function formatQuestContextBlock(slices: readonly QuestContextSlice[]): string {
  if (slices.length === 0) {
    return [
      'CONTEXT: none attached.',
      'Do not invent employers, years, metrics, or stack. Write UNKNOWN if a fact is missing.',
    ].join('\n')
  }
  const parts = slices.map((s) => `### ${s.label}\n${s.body}`)
  return [
    'CONTEXT: distilled repo packs only. Use these facts. If a fact is not here, write UNKNOWN.',
    'Paid work ≠ personal/OSS. Do not turn OSS into employment years.',
    ...parts,
  ].join('\n')
}
