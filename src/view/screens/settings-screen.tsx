import { CredentialsPanel } from '../../components/finder/credentials-panel'
import type { FinderViewState } from '../../core/finder/selectors'
import type { Dispatch } from '../../core/mvu/engine'
import type { FinderMsg } from '../../core/finder/msg'

type Props = {
  view: FinderViewState
  dispatch: Dispatch<FinderMsg>
}

export function SettingsScreen({ view, dispatch }: Props) {
  const { model, operatorsDocUrl, operatorsReference, strategyReference, connectionFlow } = view

  return (
    <div className="h-full overflow-auto p-4 max-w-3xl mx-auto">
      <div className="mb-4">
        <div className="text-lg font-semibold tracking-tight">Settings</div>
        <p className="text-xs text-ink-faint">Connection, storage, and reference materials</p>
      </div>

      <CredentialsPanel
        flow={connectionFlow}
        draft={model.credentials.draft}
        notice={model.credentials.notice}
        busy={model.credentials.busy}
        storage={model.credentials.storage}
        checking={model.credentials.checking}
        onDraftChange={(draft) => dispatch({ type: 'CredentialsDraftChanged', draft })}
        onSave={() => dispatch({ type: 'CredentialsSaveRequested' })}
        onClear={() => dispatch({ type: 'CredentialsClearRequested' })}
      />

      <div className="mt-6 space-y-4 text-xs">
        <details open>
          <summary className="cursor-pointer uppercase tracking-wide text-ink-faint mb-1 hover:text-ink">X search operators</summary>
          <p className="mb-1 text-ink-muted">
            <a href={operatorsDocUrl} target="_blank" rel="noreferrer" className="text-accent underline-offset-2 hover:underline">
              Official X API v2 docs
            </a>
          </p>
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg border border-border-subtle bg-surface-2 p-3 text-[10px] leading-relaxed text-ink-faint">
            {operatorsReference}
          </pre>
        </details>

        <details open>
          <summary className="cursor-pointer uppercase tracking-wide text-ink-faint mb-1 hover:text-ink">Strategy &amp; distillation (profile + apply)</summary>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-border-subtle bg-surface-2 p-3 text-[10px] leading-relaxed text-ink-faint">
            {strategyReference}
          </pre>
        </details>
      </div>

      <div className="mt-8 text-[11px] text-ink-faint border-t border-border-subtle pt-4">
        CV changes use sidecar + explicit confirm (cv-promote-guard). X via official resources. All paths have self-guards.
      </div>
    </div>
  )
}
