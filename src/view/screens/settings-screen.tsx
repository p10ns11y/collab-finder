import * as React from 'react'
import { KeyRound, Loader2, Sparkles, Trash2 } from 'lucide-react'
import { CredentialsPanel } from '../../components/finder/credentials-panel'
import { CredentialsStorageDetails } from '../../components/finder/credentials-storage-details'
import { safeInvoke } from '../../adapters/tauri/safe-invoke'
import type { BearerStorageStatus } from '../../core/domain/credentials'
import { activeSourceLabel } from '../../core/domain/credentials'
import type { FinderViewState } from '../../core/finder/selectors'
import type { Dispatch } from '../../core/mvu/engine'
import type { FinderMsg } from '../../core/finder/msg'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'

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

      <div className="mt-4">
        <DevprofilePathPanel />
      </div>

      <div className="mt-6 space-y-3 text-xs">
        <div className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">Advanced</div>
        <details>
          <summary className="cursor-pointer text-ink-muted mb-1 hover:text-ink">X search operators</summary>
          <p className="mb-1 text-ink-muted">
            <a href={operatorsDocUrl} target="_blank" rel="noreferrer" className="text-accent underline-offset-2 hover:underline">
              Official X API v2 docs
            </a>
          </p>
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-lg border border-border-subtle bg-surface-2 p-3 text-[11px] leading-relaxed text-ink-faint">
            {operatorsReference}
          </pre>
        </details>

        <details>
          <summary className="cursor-pointer text-ink-muted mb-1 hover:text-ink">Strategy &amp; distillation</summary>
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg border border-border-subtle bg-surface-2 p-3 text-[11px] leading-relaxed text-ink-faint">
            {strategyReference}
          </pre>
        </details>

        <details>
          <summary className="cursor-pointer text-ink-muted mb-1 hover:text-ink">About</summary>
          <p className="text-ink-faint leading-relaxed">
            collab-finder is separate from your public devprofile. CV suggestions use sidecar-first propose
            (no silent master write). Xplore uses official X agent patterns. Self-guards on high-stakes paths.
          </p>
        </details>
      </div>
    </div>
  )
}

/** XaiKeyPanel — client component for xAI key + model config (Tauri direct invokes).
 *
 * Per react-client-expert + react-best-practices:
 * - Interconnected async UI (key status + model + drafts + busy phases + notices) uses a single useReducer + status enum.
 * - No scattered useState + useEffect soup for "forms".
 * - Derive connected/displayModel during render.
 * - Effects only for mount-time sync with external Tauri storage (justified).
 * - Status enum prevents impossible states (e.g. saving while loading).
 * - Handlers dispatch; logic lives in reducer.
 */
/** Mirrors Rust `XaiKeyStorageStatus` (same shape as bearer for UI reuse). */
type XaiKeyStatus = BearerStorageStatus

type XaiPanelStatus = 'idle' | 'loading' | 'saving-key' | 'clearing-key' | 'saving-model'

type XaiPanelState = {
  keyStatus: XaiKeyStatus | null
  model: string
  keyDraft: string
  modelDraft: string
  panelStatus: XaiPanelStatus
  notice: string | null
}

type XaiPanelAction =
  | { type: 'LOAD_START' }
  | { type: 'KEY_LOADED'; value: XaiKeyStatus | null }
  | { type: 'MODEL_LOADED'; value: string }
  | { type: 'SET_KEY_DRAFT'; draft: string }
  | { type: 'SET_MODEL_DRAFT'; draft: string }
  | { type: 'SAVE_KEY_START' }
  | { type: 'SAVE_KEY_SUCCESS' }
  | { type: 'CLEAR_KEY_START' }
  | { type: 'CLEAR_KEY_SUCCESS' }
  | { type: 'SAVE_MODEL_START' }
  | { type: 'SAVE_MODEL_SUCCESS'; value: string }
  | { type: 'OPERATION_ERROR'; message: string }
  | { type: 'CLEAR_NOTICE' }

const initialXaiPanelState: XaiPanelState = {
  keyStatus: null,
  model: 'grok-4.5',
  keyDraft: '',
  modelDraft: 'grok-4.5',
  panelStatus: 'idle',
  notice: null,
};

function xaiPanelReducer(state: XaiPanelState, action: XaiPanelAction): XaiPanelState {
  switch (action.type) {
    case 'LOAD_START':
      return { ...state, panelStatus: 'loading', notice: null };

    case 'KEY_LOADED':
      return {
        ...state,
        keyStatus: action.value,
        panelStatus: state.panelStatus === 'loading' ? 'idle' : state.panelStatus,
      };

    case 'MODEL_LOADED':
      return {
        ...state,
        model: action.value || 'grok-4.5',
        modelDraft: action.value || 'grok-4.5',
        panelStatus: state.panelStatus === 'loading' ? 'idle' : state.panelStatus,
      };

    case 'SET_KEY_DRAFT':
      return { ...state, keyDraft: action.draft };

    case 'SET_MODEL_DRAFT':
      return { ...state, modelDraft: action.draft };

    case 'SAVE_KEY_START':
      return { ...state, panelStatus: 'saving-key', notice: null };

    case 'SAVE_KEY_SUCCESS':
      return {
        ...state,
        panelStatus: 'idle',
        keyDraft: '',
        notice: 'Saved. Key is not kept in React state after save.',
      }

    case 'CLEAR_KEY_START':
      return { ...state, panelStatus: 'clearing-key', notice: null }

    case 'CLEAR_KEY_SUCCESS':
      return {
        ...state,
        panelStatus: 'idle',
        keyDraft: '',
        notice: 'Disconnected. Analyze/prep will require a key again.',
      }

    case 'SAVE_MODEL_START':
      return { ...state, panelStatus: 'saving-model', notice: null };

    case 'SAVE_MODEL_SUCCESS':
      return {
        ...state,
        panelStatus: 'idle',
        model: action.value,
        modelDraft: action.value,
        notice: `Model set to ${action.value}. Used on next analyze/prep.`,
      };

    case 'OPERATION_ERROR':
      return { ...state, panelStatus: 'idle', notice: action.message };

    case 'CLEAR_NOTICE':
      return { ...state, notice: null };

    default:
      return state;
  }
}

function XaiKeyPanel() {
  const [state, dispatch] = React.useReducer(xaiPanelReducer, initialXaiPanelState)

  const { keyStatus, model, keyDraft, modelDraft, panelStatus, notice } = state

  const connected = !!keyStatus?.connected
  const displayModel = model || 'grok-4.5'
  const isBusy = panelStatus !== 'idle'
  const isChecking = panelStatus === 'loading'
  const activeLabel = keyStatus ? activeSourceLabel(keyStatus.active_source) : null

  const refreshStatus = React.useCallback(() => {
    dispatch({ type: 'LOAD_START' })
    void safeInvoke<XaiKeyStatus>('get_xai_key_storage', {}).then((res) => {
      if (res.ok) dispatch({ type: 'KEY_LOADED', value: res.value })
      else dispatch({ type: 'KEY_LOADED', value: null })
    })
    void safeInvoke<string>('get_xai_model_cmd', {}).then((res) => {
      if (res.ok && res.value) dispatch({ type: 'MODEL_LOADED', value: res.value })
    })
  }, [])

  React.useEffect(() => {
    refreshStatus()
  }, [refreshStatus])

  const saveKey = async () => {
    const trimmed = keyDraft.trim()
    if (!trimmed) return

    dispatch({ type: 'SAVE_KEY_START' })

    const res = await safeInvoke<void>('set_xai_key', { key: trimmed })
    if (res.ok) {
      dispatch({ type: 'SAVE_KEY_SUCCESS' })
      const s = await safeInvoke<XaiKeyStatus>('get_xai_key_storage', {})
      if (s.ok) dispatch({ type: 'KEY_LOADED', value: s.value })
    } else {
      dispatch({ type: 'OPERATION_ERROR', message: res.error?.message || 'Save failed' })
    }
  }

  const clearKey = async () => {
    dispatch({ type: 'CLEAR_KEY_START' })
    const res = await safeInvoke<void>('clear_xai_key', {})
    if (res.ok) {
      dispatch({ type: 'CLEAR_KEY_SUCCESS' })
      const s = await safeInvoke<XaiKeyStatus>('get_xai_key_storage', {})
      if (s.ok) dispatch({ type: 'KEY_LOADED', value: s.value })
      else dispatch({ type: 'KEY_LOADED', value: null })
    } else {
      dispatch({ type: 'OPERATION_ERROR', message: res.error?.message || 'Disconnect failed' })
    }
  }

  const saveModel = async (val?: string) => {
    const toSave = (val ?? modelDraft).trim()
    if (!toSave) return

    dispatch({ type: 'SAVE_MODEL_START' })

    const res = await safeInvoke<void>('set_xai_model_cmd', { model: toSave })
    if (res.ok) {
      dispatch({ type: 'SAVE_MODEL_SUCCESS', value: toSave })
    } else {
      dispatch({ type: 'OPERATION_ERROR', message: res.error?.message || 'Failed to save model' })
    }
  }

  const quickSetModel = (m: string) => {
    dispatch({ type: 'SET_MODEL_DRAFT', draft: m })
    void saveModel(m)
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-accent" aria-hidden />
            xAI Intelligence
          </CardTitle>
          <CardDescription>
            API key for fit analysis, CV tailoring, and cover letters. Stored in Rust (keyring +
            file fallback) — never kept in React state after save. Model defaults to {displayModel}.
          </CardDescription>
        </div>
        <Badge tone={connected ? 'success' : isChecking ? 'neutral' : 'warning'}>
          {isChecking ? 'Checking…' : connected ? 'Connected' : 'Required'}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <CredentialsStorageDetails
          storage={keyStatus}
          checking={isChecking && !keyStatus}
          readPurpose="Analyze/prep read the key from Rust only — never from this UI after save."
        />

        {!connected && !isChecking && (
          <div className="space-y-2">
            <Label htmlFor="xai-key">xAI API key</Label>
            <Input
              id="xai-key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="Paste from console.x.ai → API keys"
              value={keyDraft}
              onChange={(e) => dispatch({ type: 'SET_KEY_DRAFT', draft: e.target.value })}
              className="font-mono text-xs"
            />
          </div>
        )}

        {connected && activeLabel && (
          <p className="text-xs text-success">
            Connected — analyze/prep use <strong className="font-medium">{activeLabel}</strong>.
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          {!connected && !isChecking && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => void saveKey()}
              disabled={isBusy || !keyDraft.trim()}
            >
              {panelStatus === 'saving-key' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : null}
              Save credentials
            </Button>
          )}
          {connected && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void clearKey()}
              disabled={isBusy}
            >
              {panelStatus === 'clearing-key' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              )}
              Disconnect
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={refreshStatus} disabled={isBusy}>
            {isChecking ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <KeyRound className="h-3.5 w-3.5" aria-hidden />
            )}
            Refresh status
          </Button>
        </div>

        {notice && <p className="text-xs text-ink-muted">{notice}</p>}

        <div className="space-y-2 border-t border-border-subtle pt-3">
          <Label htmlFor="xai-model">Model</Label>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              id="xai-model"
              value={modelDraft}
              onChange={(e) => dispatch({ type: 'SET_MODEL_DRAFT', draft: e.target.value })}
              placeholder="grok-4.5"
              className="min-w-[140px] flex-1 font-mono text-xs"
              spellCheck={false}
              autoComplete="off"
            />
            <Button
              variant="primary"
              size="sm"
              onClick={() => void saveModel()}
              disabled={isBusy || !modelDraft.trim()}
            >
              {panelStatus === 'saving-model' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : null}
              Save model
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => quickSetModel('grok-4.3')}
              disabled={isBusy}
            >
              grok-4.3
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => quickSetModel('grok-4.5')}
              disabled={isBusy}
            >
              grok-4.5
            </Button>
          </div>
          <p className="text-[11px] text-ink-faint">
            Current: <span className="font-mono text-ink-muted">{displayModel}</span>. Selection or
            custom id supported. Takes effect on the next fit/prep call.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

/** Devprofile path config (for real CV grounding + sidecar proposals).
 * Per plan checklist + skeptic fix: expose in Settings UI (not only manual txt).
 * Uses direct safeInvoke (mirrors XaiKeyPanel).
 */
function DevprofilePathPanel() {
  const [draft, setDraft] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [status, setStatus] = React.useState<string | null>(null)
  const [notice, setNotice] = React.useState<string | null>(null)

  const refresh = async () => {
    const res = await safeInvoke<string | null>('get_devprofile_path_cmd', {})
    if (res.ok) setStatus(res.value || null)
  }

  React.useEffect(() => { void refresh() }, [])

  const save = async () => {
    if (!draft.trim()) return
    setBusy(true)
    setNotice(null)
    const res = await safeInvoke<void>('set_devprofile_path_cmd', { path: draft.trim() })
    if (res.ok) {
      setDraft('')
      setNotice('Saved. Will be used on next analyze/prep (no restart required).')
      await refresh()
    } else {
      setNotice(res.error?.message || 'Save failed')
    }
    setBusy(false)
  }

  const clear = async () => {
    setBusy(true)
    await safeInvoke<void>('set_devprofile_path_cmd', { path: null })
    await refresh()
    setBusy(false)
  }

  return (
    <div className="border border-border-subtle rounded p-4 bg-surface-1/40">
      <div className="flex items-center justify-between mb-2">
        <div className="font-medium text-sm">devprofile path (real CV for grounding)</div>
        <div className="text-[10px] px-2 py-0.5 rounded border">{status ? 'Configured' : 'Using default/distilled'}</div>
      </div>
      <div className="text-[10px] text-ink-faint mb-2">
        When set to ~/Work/personal/devprofile, Quick Target uses pruned cvdata.json for analyze/prep (textarea still overrides if provided). Sidecar proposals read it for deltas (no auto-write).
      </div>

      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="/home/.../devprofile or leave to use distilled"
        className="w-full mb-2 bg-surface-0 border border-border-subtle rounded px-3 py-1 text-sm font-mono"
      />

      <div className="flex gap-2">
        <button onClick={save} disabled={busy || !draft.trim()} className="text-sm px-3 py-1 border rounded hover:border-accent/60 disabled:opacity-50">
          Save path
        </button>
        {status && (
          <button onClick={clear} disabled={busy} className="text-sm px-3 py-1 border rounded hover:border-accent/60">Clear</button>
        )}
        <button onClick={refresh} className="text-sm px-2 py-1 text-ink-faint">Refresh</button>
      </div>
      {notice && <div className="mt-1 text-xs text-ink-muted">{notice}</div>}
      {status && (
        <div className="mt-2 text-[10px] text-ink-faint break-all">current: {status}</div>
      )}
    </div>
  )
}

