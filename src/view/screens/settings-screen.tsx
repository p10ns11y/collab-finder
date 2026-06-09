import * as React from 'react'
import { CredentialsPanel } from '../../components/finder/credentials-panel'
import { safeInvoke } from '../../adapters/tauri/safe-invoke'
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

      {/* xAI Intelligence key — exact same UX as X bearer */}
      <div className="mt-4">
        <XaiKeyPanel />
      </div>

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

/** Minimal xAI key panel (mirrors CredentialsPanel UX using direct invoke).
 * Full integration into MVU model/flows comes in polish.
 */
function XaiKeyPanel() {
  const [draft, setDraft] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [status, setStatus] = React.useState<any>(null)
  const [notice, setNotice] = React.useState<string | null>(null)

  const refresh = async () => {
    const res = await safeInvoke<any>('get_xai_key_storage', {})
    if (res.ok) setStatus(res.value)
  }

  React.useEffect(() => { void refresh() }, [])

  const save = async () => {
    if (!draft.trim()) return
    setBusy(true)
    setNotice(null)
    const res = await safeInvoke<void>('set_xai_key', { key: draft })
    if (res.ok) {
      setDraft('')
      setNotice('Saved. Opening Settings again will show updated status (heal).')
      await refresh()
    } else {
      setNotice(res.error?.message || 'Save failed')
    }
    setBusy(false)
  }

  const clear = async () => {
    setBusy(true)
    await safeInvoke<void>('clear_xai_key', {})
    await refresh()
    setBusy(false)
  }

  const connected = !!status?.connected

  return (
    <div className="border border-border-subtle rounded p-4 bg-surface-1/40">
      <div className="flex items-center justify-between mb-2">
        <div className="font-medium text-sm">xAI Intelligence key (grok-4.3)</div>
        <div className="text-[10px] px-2 py-0.5 rounded border">{connected ? 'Connected' : 'Required'}</div>
      </div>
      <div className="text-[10px] text-ink-faint mb-2">
        Used for target fit analysis, CV tailoring, cover letters. Stored the same way as your X bearer (keyring + file).
      </div>

      {!connected && (
        <input
          type="password"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="xai-..."
          className="w-full mb-2 bg-surface-0 border border-border-subtle rounded px-3 py-1 text-sm font-mono"
        />
      )}

      <div className="flex gap-2">
        {!connected && (
          <button onClick={save} disabled={busy || !draft.trim()} className="text-sm px-3 py-1 border rounded hover:border-accent/60 disabled:opacity-50">
            Save xAI key
          </button>
        )}
        {connected && (
          <button onClick={clear} disabled={busy} className="text-sm px-3 py-1 border rounded hover:border-accent/60">Disconnect xAI key</button>
        )}
        <button onClick={refresh} className="text-sm px-2 py-1 text-ink-faint">Refresh status</button>
      </div>
      {notice && <div className="mt-1 text-xs text-ink-muted">{notice}</div>}
      {status && (
        <div className="mt-2 text-[10px] text-ink-faint">
          active: {status.active_source} • keyring: {status.keyring?.reachable ? 'reachable' : 'no'} • file: {status.file?.present ? 'yes' : 'no'}
        </div>
      )}
    </div>
  )
}

