/**
 * Preferences — full-viewport app tuning (peer to Mission / Sweden).
 * Connection secrets stay on Settings; this screen is rank, fit, devprofile, references.
 */
import type { FinderViewState } from '../../core/finder/selectors'
import { PageHeader } from '../../components/ui/page-header'
import { SectionLabel } from '../../components/ui/section-label'
import {
  DevprofilePathPanel,
  FitModePanel,
  LlmRoutePanel,
  RankConfigPanel,
} from './preferences-panels'

type Props = {
  view: FinderViewState
}

export function PreferencesScreen({ view }: Props) {
  const { operatorsDocUrl, operatorsReference, strategyReference } = view

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-surface-0/40">
      <div className="shrink-0 border-b border-border-subtle px-4 py-3 lg:px-6">
        <PageHeader
          title="Preferences"
          description="Fit mode, Mission ranker packs, devprofile path, and reference docs. X / xAI keys live under Settings."
        />
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4 lg:p-6">
        <div className="mx-auto grid max-w-5xl gap-4 lg:grid-cols-2">
          <FitModePanel />
          <LlmRoutePanel />
          <div className="lg:col-span-2">
            <RankConfigPanel />
          </div>
          <div className="lg:col-span-2">
            <DevprofilePathPanel />
          </div>

          <div className="space-y-3 text-xs lg:col-span-2">
            <SectionLabel>Reference</SectionLabel>
            <details className="ui-panel p-3">
              <summary className="mb-1 cursor-pointer text-ink-muted hover:text-ink">
                X search operators
              </summary>
              <p className="mb-1 text-ink-muted">
                <a
                  href={operatorsDocUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent underline-offset-2 hover:underline"
                >
                  Official X API v2 docs
                </a>
              </p>
              <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-md border border-border-subtle bg-surface-2 p-3 text-[11px] leading-relaxed text-ink-faint">
                {operatorsReference}
              </pre>
            </details>

            <details className="ui-panel p-3">
              <summary className="mb-1 cursor-pointer text-ink-muted hover:text-ink">
                Strategy &amp; distillation
              </summary>
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-md border border-border-subtle bg-surface-2 p-3 text-[11px] leading-relaxed text-ink-faint">
                {strategyReference}
              </pre>
            </details>

            <details className="ui-panel p-3">
              <summary className="mb-1 cursor-pointer text-ink-muted hover:text-ink">About</summary>
              <p className="leading-relaxed text-ink-faint">
                collab-finder is separate from your public devprofile. CV suggestions use sidecar-first
                propose (no silent master write). Xplore uses official X agent patterns. Self-guards on
                high-stakes paths.
              </p>
            </details>
          </div>
        </div>
      </div>
    </div>
  )
}
