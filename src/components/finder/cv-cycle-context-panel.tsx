import * as React from 'react'
import { safeInvoke } from '../../adapters/tauri/safe-invoke'
import { describeCvCycleContext } from '../../core/domain/cv-cycle-context'
import { DEFAULT_CV_SUMMARY } from '../../core/domain/search-presets'
import { CV_USER_EDITED_LS_KEY } from '../../core/finder/model'
import {
  packHealthLabel,
  packHealthTone,
  type OperatorPackStatus,
} from '../../core/domain/operator-pack-health'
import { Badge } from '../ui/badge'
import { Panel } from '../ui/panel'
import { SectionLabel } from '../ui/section-label'

type Props = {
  cvSummary: string
  onEditOnDiscover: () => void
}

function cvUserEditedForDisplay(): boolean {
  try {
    return localStorage.getItem(CV_USER_EDITED_LS_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Read-only CV + pack context for Xplore cycles — calm tone matching Preferences pack health.
 * Full editor lives on Discover; operator packs path hint from `get_operator_pack_status`.
 */
export function CvCycleContextPanel({ cvSummary, onEditOnDiscover }: Props) {
  const [packStatus, setPackStatus] = React.useState<OperatorPackStatus | null>(null)

  const refreshPack = React.useCallback(() => {
    void safeInvoke<OperatorPackStatus>('get_operator_pack_status', {}).then((res) => {
      if (res.ok) setPackStatus(res.value)
    })
  }, [])

  React.useEffect(() => {
    refreshPack()
  }, [refreshPack])

  const ctx = describeCvCycleContext(cvSummary, {
    distilledDefault: DEFAULT_CV_SUMMARY,
    userEdited: cvUserEditedForDisplay(),
  })

  const packHealth = packStatus?.health ?? null

  return (
    <Panel dense className="space-y-2">
      <SectionLabel
        meta={
          packHealth ? (
            <Badge tone={packHealthTone(packHealth)}>{packHealthLabel(packHealth)}</Badge>
          ) : (
            <span className="text-ink-faint">…</span>
          )
        }
      >
        Cycle CV context
      </SectionLabel>

      <p className="text-[11px] leading-snug text-ink-muted">{ctx.sourceLabel}</p>

      <div className="flex items-start gap-2 text-[11px]">
        <span className="shrink-0 text-ink-faint">packet</span>
        <span className="min-w-0 flex-1 truncate font-mono text-ink-muted" title={ctx.preview}>
          {ctx.preview.slice(0, 64)}
          {ctx.preview.length > 64 ? '…' : ''}
        </span>
        <span className="shrink-0 tabular-nums text-ink-faint">{ctx.cycleChars}</span>
      </div>

      {packStatus ? (
        <p className="ui-meta break-all" title={packStatus.packs_dir}>
          packs: {packStatus.packs_dir}
        </p>
      ) : null}

      {packStatus?.seed_hint && packStatus.health !== 'healthy' ? (
        <p className="text-[10px] leading-snug text-ink-faint">{packStatus.seed_hint}</p>
      ) : null}

      <button
        type="button"
        onClick={onEditOnDiscover}
        className="text-left text-[11px] text-accent hover:underline"
      >
        Edit CV packet on Discover
      </button>
    </Panel>
  )
}
