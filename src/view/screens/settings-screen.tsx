import * as React from 'react'
import { KeyRound, Loader2, Sparkles, Trash2 } from 'lucide-react'
import { CredentialsPanel } from '../../components/finder/credentials-panel'
import { CredentialsStorageDetails } from '../../components/finder/credentials-storage-details'
import { safeInvoke } from '../../adapters/tauri/safe-invoke'
import { activeSourceLabel } from '../../core/domain/credentials'
import {
  devprofilePanelReducer,
  initialDevprofilePanelState,
  isDevprofilePanelBusy,
} from '../../core/domain/devprofile-path-panel'
import {
  displayXaiModel,
  initialXaiPanelState,
  isXaiPanelBusy,
  isXaiPanelChecking,
  type XaiKeyStatus,
  xaiPanelReducer,
} from '../../core/domain/xai-key-panel'
import {
  DEFAULT_FIT_MODE,
  fitModeDescription,
  fitModeLabel,
  parseFitMode,
  type FitMode,
} from '../../core/domain/fit-mode'
import type { FinderViewState } from '../../core/finder/selectors'
import type { Dispatch } from '../../core/mvu/engine'
import type { FinderMsg } from '../../core/finder/msg'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { PageHeader } from '../../components/ui/page-header'
import { SectionLabel } from '../../components/ui/section-label'

type Props = {
  view: FinderViewState
  dispatch: Dispatch<FinderMsg>
}

export function SettingsScreen({ view, dispatch }: Props) {
  const { model, operatorsDocUrl, operatorsReference, strategyReference, connectionFlow } = view

  return (
    <div className="mx-auto h-full max-w-3xl overflow-auto p-4 lg:p-6">
      <PageHeader
        title="Settings"
        description="Connection, storage, and reference materials for the reactor."
      />

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
        <FitModePanel />
      </div>

      <div className="mt-4">
        <DevprofilePathPanel />
      </div>

      <div className="mt-8 space-y-3 text-xs">
        <SectionLabel>Advanced</SectionLabel>
        <details className="ui-panel p-3">
          <summary className="mb-1 cursor-pointer text-ink-muted hover:text-ink">X search operators</summary>
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
            collab-finder is separate from your public devprofile. CV suggestions use sidecar-first propose
            (no silent master write). Xplore uses official X agent patterns. Self-guards on high-stakes paths.
          </p>
        </details>
      </div>
    </div>
  )
}

/**
 * XaiKeyPanel — local Tauri form (not finder MVU).
 * State machine: src/core/domain/xai-key-panel.ts. Effect only mounts external status sync.
 */
function XaiKeyPanel() {
  const [state, dispatch] = React.useReducer(xaiPanelReducer, initialXaiPanelState)

  const { keyStatus, model, keyDraft, modelDraft, panelStatus, notice } = state

  const connected = !!keyStatus?.connected
  const displayModel = displayXaiModel(model)
  const isBusy = isXaiPanelBusy(panelStatus)
  const isChecking = isXaiPanelChecking(panelStatus)
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

/**
 * Fit mode — strict dual-fit vs relaxed simple fitness (file-backed like xai model).
 */
function FitModePanel() {
  const [mode, setMode] = React.useState<FitMode>(DEFAULT_FIT_MODE)
  const [busy, setBusy] = React.useState(false)
  const [notice, setNotice] = React.useState<string | null>(null)

  const refresh = React.useCallback(() => {
    void safeInvoke<string>('get_fit_mode_cmd', {}).then((res) => {
      if (res.ok && res.value) setMode(parseFitMode(res.value))
    })
  }, [])

  React.useEffect(() => {
    refresh()
  }, [refresh])

  const save = async (next: FitMode) => {
    setBusy(true)
    setNotice(null)
    const res = await safeInvoke<string>('set_fit_mode_cmd', { mode: next })
    setBusy(false)
    if (res.ok) {
      setMode(parseFitMode(res.value ?? next))
      setNotice(`Saved: ${fitModeLabel(parseFitMode(res.value ?? next))}`)
    } else {
      setNotice(res.error?.message || 'Failed to save fit mode')
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>Fit evaluation mode</CardTitle>
          <CardDescription>
            Strict keeps dual-fit (You↔Role + mission/life constraints). Relaxed is simple fitness
            from relevant CV experience, then preparation bundle — no robotics/ML mission veto.
          </CardDescription>
        </div>
        <Badge tone={mode === 'relaxed' ? 'accent' : 'neutral'}>{fitModeLabel(mode)}</Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-1 rounded-md border border-border-subtle p-0.5">
          {(['strict', 'relaxed'] as const).map((m) => (
            <button
              key={m}
              type="button"
              disabled={busy}
              onClick={() => void save(m)}
              className={
                mode === m
                  ? 'flex-1 rounded px-2 py-1.5 text-xs font-medium bg-accent/15 text-accent'
                  : 'flex-1 rounded px-2 py-1.5 text-xs text-ink-muted hover:text-ink'
              }
            >
              {fitModeLabel(m)}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-ink-faint leading-snug">{fitModeDescription(mode)}</p>
        {notice && <p className="text-xs text-ink-muted">{notice}</p>}
      </CardContent>
    </Card>
  )
}

/**
 * Devprofile path — status-enum reducer (no busy/error boolean soup).
 * Pure machine: src/core/domain/devprofile-path-panel.ts
 */
function DevprofilePathPanel() {
  const [state, dispatch] = React.useReducer(devprofilePanelReducer, initialDevprofilePanelState)
  const { draft, configuredPath, status, notice } = state
  const busy = isDevprofilePanelBusy(status)

  const refresh = React.useCallback(() => {
    dispatch({ type: 'LOAD_START' })
    void safeInvoke<string | null>('get_devprofile_path_cmd', {}).then((res) => {
      if (res.ok) dispatch({ type: 'LOAD_SUCCESS', path: res.value || null })
      else dispatch({ type: 'LOAD_SUCCESS', path: null })
    })
  }, [])

  // External Tauri sync on mount only.
  React.useEffect(() => {
    refresh()
  }, [refresh])

  const save = async () => {
    const path = draft.trim()
    if (!path) return
    dispatch({ type: 'SAVE_START' })
    const res = await safeInvoke<void>('set_devprofile_path_cmd', { path })
    if (res.ok) dispatch({ type: 'SAVE_SUCCESS', path })
    else dispatch({ type: 'SAVE_ERROR', message: res.error?.message || 'Save failed' })
  }

  const clear = async () => {
    dispatch({ type: 'CLEAR_START' })
    const res = await safeInvoke<void>('set_devprofile_path_cmd', { path: null })
    if (res.ok) dispatch({ type: 'CLEAR_SUCCESS' })
    else dispatch({ type: 'CLEAR_ERROR', message: res.error?.message || 'Clear failed' })
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>devprofile path</CardTitle>
          <CardDescription>
            Real CV for grounding. When set, Quick Target uses pruned cvdata.json for analyze/prep
            (textarea still overrides). Sidecar proposals read it for deltas — no auto-write.
            Generate apply CV spawns this checkout&apos;s{' '}
            <span className="font-mono">scripts/generate-apply-cv.tsx</span> (PDF only; never
            mutates master cvdata).
          </CardDescription>
        </div>
        <Badge tone={configuredPath ? 'success' : 'neutral'}>
          {configuredPath ? 'Configured' : 'Default / distilled'}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input
          value={draft}
          onChange={(e) => dispatch({ type: 'SET_DRAFT', draft: e.target.value })}
          placeholder="/home/…/devprofile or leave to use distilled"
          className="font-mono text-xs"
        />
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => void save()} disabled={busy || !draft.trim()}>
            {status === 'saving' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : null}
            Save path
          </Button>
          {configuredPath && (
            <Button size="sm" variant="ghost" onClick={() => void clear()} disabled={busy}>
              {status === 'clearing' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : null}
              Clear
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={refresh} disabled={busy}>
            Refresh
          </Button>
        </div>
        {notice && <p className="text-xs text-ink-muted">{notice}</p>}
        {configuredPath && <p className="ui-meta break-all">current: {configuredPath}</p>}
      </CardContent>
    </Card>
  )
}

