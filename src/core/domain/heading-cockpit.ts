/**
 * Navigating cockpit — pure transforms over mission-map SoT (cash-path-now.json,
 * waybar.json, contacts.md). No I/O; heading-screen reads via heading-boot.
 */

export type MissionStage = {
  id?: string
  what?: string
  class?: string
  contact?: {
    url?: string
    email?: string
    followup_stage?: string
    followup_when?: string
    last_touch?: string
  }
}

export type MissionMap = {
  g?: string
  stages?: MissionStage[]
}

export type StageClass = 'do' | 'wait' | 'done' | 'risk' | 'park' | 'unknown'

export type StageGroups = {
  wait: MissionStage[]
  done: MissionStage[]
  risk: MissionStage[]
  park: MissionStage[]
}

export type WaybarStatus = {
  xOn: boolean | null
  pauseCount: number | null
  plain: string
}

export type StageAction =
  | { kind: 'open_url'; url: string; label: string }
  | { kind: 'copy_email'; email: string; label: string }
  | { kind: 'navigate'; screen: 'discover' | 'pipeline'; label: string }

export type ContactHint = {
  label: string
  url?: string
  email?: string
}

const STAGE_CLASS_LABEL: Record<StageClass, string> = {
  do: 'Do',
  wait: 'Wait',
  done: 'Done',
  risk: 'Risk',
  park: 'Park',
  unknown: 'Other',
}

export function normalizeStageClass(raw?: string): StageClass {
  const c = (raw || '').trim().toLowerCase()
  if (c === 'do' || c === 'wait' || c === 'done' || c === 'risk' || c === 'park') return c
  return 'unknown'
}

export function stageClassLabel(cls: StageClass): string {
  return STAGE_CLASS_LABEL[cls]
}

export function parseMissionMap(json: string): MissionMap {
  try {
    const map = JSON.parse(json || '{}') as MissionMap
    return {
      g: map.g || '',
      stages: Array.isArray(map.stages) ? map.stages : [],
    }
  } catch {
    return { g: '', stages: [] }
  }
}

/** First Do stage is the single Next Do hero. */
export function findNextDo(stages: MissionStage[]): MissionStage | null {
  return stages.find((s) => normalizeStageClass(s.class) === 'do') ?? null
}

/** Remaining stages grouped by class; all Do stages excluded (no duplicate hero). */
export function groupStagesExcludingDo(stages: MissionStage[]): StageGroups {
  const groups: StageGroups = { wait: [], done: [], risk: [], park: [] }
  for (const s of stages) {
    const cls = normalizeStageClass(s.class)
    if (cls === 'do' || cls === 'unknown') continue
    groups[cls].push(s)
  }
  return groups
}

/** Decode mm-waybar chip text into operator-readable status (no vault dump). */
export function decodeWaybarChip(text: string): WaybarStatus {
  const t = (text || '').trim()
  if (!t) {
    return { xOn: null, pauseCount: null, plain: '' }
  }

  const xMatch = t.match(/\bX\s+(ON|OFF)\b/i)
  const pauseMatch = t.match(/(\d+)\s+PAUSES?\b/i)
  const xOn = xMatch ? xMatch[1].toUpperCase() === 'ON' : null
  const pauseCount = pauseMatch ? Number.parseInt(pauseMatch[1], 10) : null

  const parts: string[] = []
  if (xOn === true) parts.push('X search is on')
  else if (xOn === false) parts.push('X search is off')
  if (pauseCount !== null && pauseCount > 0) {
    parts.push(
      pauseCount === 1
        ? '1 opportunity is on pause'
        : `${pauseCount} opportunities are on pause`,
    )
  } else if (pauseCount === 0) {
    parts.push('no pauses')
  }

  return { xOn, pauseCount, plain: parts.join(' · ') }
}

function isApplyIntent(what?: string): boolean {
  const w = (what || '').toLowerCase()
  return /\b(apply|application|submit|send\s+(cv|resume)|posting)\b/.test(w)
}

function trimUrl(url?: string): string | undefined {
  const u = (url || '').trim()
  return u.startsWith('http') ? u : undefined
}

function trimEmail(email?: string): string | undefined {
  const e = (email || '').trim()
  return e.includes('@') ? e : undefined
}

/** Actions only when SoT fields exist; apply-without-url routes to Pipeline. */
export function stageActions(stage: MissionStage): StageAction[] {
  const actions: StageAction[] = []
  const url = trimUrl(stage.contact?.url)
  const email = trimEmail(stage.contact?.email)

  if (url) {
    actions.push({ kind: 'open_url', url, label: 'Open posting' })
  }
  if (email) {
    actions.push({ kind: 'copy_email', email, label: 'Copy mail' })
  }
  if (!url && isApplyIntent(stage.what)) {
    actions.push({ kind: 'navigate', screen: 'pipeline', label: 'Open Pipeline' })
  }
  return actions
}

/** Follow-up meta for grouped stages; Wait copy stays patient (no Sweden pressure). */
export function stageMetaLine(stage: MissionStage): string {
  const cls = normalizeStageClass(stage.class)
  const bits: string[] = [stageClassLabel(cls)]
  const c = stage.contact
  if (c?.followup_stage) bits.push(c.followup_stage)
  if (c?.followup_when) {
    bits.push(cls === 'wait' ? `when ready: ${c.followup_when}` : c.followup_when)
  }
  if (c?.last_touch) bits.push(`last touch ${c.last_touch}`)
  return bits.join(' · ')
}

/** Extract actionable contact fields from contacts.md without dumping raw PII block. */
export function parseContactsActionable(md: string): ContactHint[] {
  const text = (md || '').trim()
  if (!text) return []

  const hints: ContactHint[] = []
  const seen = new Set<string>()

  const linkRe = /\[([^\]]+)\]\(([^)]+)\)/g
  let m: RegExpExecArray | null
  while ((m = linkRe.exec(text)) !== null) {
    const label = m[1].trim()
    const href = m[2].trim()
    if (href.startsWith('mailto:')) {
      const email = trimEmail(href.slice(7))
      if (email && !seen.has(email)) {
        seen.add(email)
        hints.push({ label, email })
      }
    } else if (href.startsWith('http') && !seen.has(href)) {
      seen.add(href)
      hints.push({ label, url: href })
    }
  }

  const kvRe = /^(?:[-*]\s*)?(?:\*\*)?([^:*\n]+?)(?:\*\*)?\s*[:—-]\s*(.+)$/gm
  while ((m = kvRe.exec(text)) !== null) {
    const label = m[1].trim()
    const value = m[2].trim()
    const email = trimEmail(value)
    const url = trimUrl(value)
    if (email && !seen.has(email)) {
      seen.add(email)
      hints.push({ label, email })
    } else if (url && !seen.has(url)) {
      seen.add(url)
      hints.push({ label, url })
    }
  }

  return hints.slice(0, 6)
}
