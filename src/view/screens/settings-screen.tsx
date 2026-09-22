import * as React from 'react'
import { useMachine } from '@xstate/react'
import { KeyRound, Loader2, Sparkles, Trash2 } from 'lucide-react'
import { CredentialsPanel } from '../../components/finder/credentials-panel'
import { CredentialsStorageDetails } from '../../components/finder/credentials-storage-details'
import { safeInvoke } from '../../adapters/tauri/safe-invoke'
import { activeSourceLabel } from '../../core/domain/credentials'
import { parseXaiModelField, parseXaiSettingsForm } from '../../core/domain/xai-key-form'
import {
  displayXaiModel,
  isXaiPanelBusy,
  isXaiPanelChecking,
  type XaiKeyStatus,
  type XaiPanelStatus,
  xaiPanelMachine,
} from '../../core/domain/xai-key-panel'
import type { FinderViewState } from '../../core/finder/selectors'
import type { Dispatch } from '../../core/mvu/engine'
import type { FinderMsg } from '../../core/finder/msg'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { PageHeader } from '../../components/ui/page-header'

type Props = {
  view: FinderViewState
  dispatch: Dispatch<FinderMsg>
}

export function SettingsScreen({ view, dispatch }: Props) {
  const { model, connectionFlow } = view

  return (
    <div className="mx-auto h-full max-w-3xl overflow-auto p-4 lg:p-6">
      <PageHeader
        title="Settings"
        description="X bearer and xAI API credentials only. Fit, rank packs, and devprofile are under Preferences."
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

      <div className="mt-4">
        <XaiKeyPanel />
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>App preferences</CardTitle>
          <CardDescription>
            Fit evaluation mode, Mission ranker packs, devprofile path, evaluate route, and reference
            docs — full viewport, separate from credential storage.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="primary"
            size="sm"
            onClick={() => dispatch({ type: 'ScreenChanged', screen: 'preferences' })}
          >
            Open Preferences
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

/**
 * XaiKeyPanel — local Tauri form (not finder MVU).
 * Machine: src/core/domain/xai-key-panel.ts. Form seam: src/core/domain/xai-key-form.ts.
 */
function XaiKeyPanel() {
  const [snapshot, send] = useMachine(xaiPanelMachine)
  const { keyStatus, model, keyDraft, modelDraft, notice } = snapshot.context
  const panelStatus = snapshot.value as XaiPanelStatus

  const connected = !!keyStatus?.connected
  const displayModel = displayXaiModel(model)
  const isBusy = isXaiPanelBusy(panelStatus)
  const isChecking = isXaiPanelChecking(panelStatus)
  const activeLabel = keyStatus ? activeSourceLabel(keyStatus.active_source) : null

  const refreshStatus = React.useCallback(() => {
    send({ type: 'LOAD_START' })
    void safeInvoke<XaiKeyStatus>('get_xai_key_storage', {}).then((res) => {
      if (res.ok) send({ type: 'KEY_LOADED', value: res.value })
      else send({ type: 'KEY_LOADED', value: null })
    })
    void safeInvoke<string>('get_xai_model_cmd', {}).then((res) => {
      if (res.ok && res.value) send({ type: 'MODEL_LOADED', value: res.value })
    })
  }, [send])

  React.useEffect(() => {
    refreshStatus()
  }, [refreshStatus])

  const saveKey = async () => {
    const parsed = parseXaiSettingsForm({ key: keyDraft, model: modelDraft })
    if (!parsed.success || !parsed.data.key || !parsed.data.model) {
      send({ type: 'OPERATION_ERROR', message: 'Key and model are required.' })
      return
    }

    send({ type: 'SAVE_KEY_START' })

    const res = await safeInvoke<void>('set_xai_key', { key: parsed.data.key })
    if (res.ok) {
      send({ type: 'SAVE_KEY_SUCCESS' })
      const s = await safeInvoke<XaiKeyStatus>('get_xai_key_storage', {})
      if (s.ok) send({ type: 'KEY_LOADED', value: s.value })
    } else {
      send({ type: 'OPERATION_ERROR', message: res.error?.message || 'Save failed' })
    }
  }

  const clearKey = async () => {
    send({ type: 'CLEAR_KEY_START' })
    const res = await safeInvoke<void>('clear_xai_key', {})
    if (res.ok) {
      send({ type: 'CLEAR_KEY_SUCCESS' })
      const s = await safeInvoke<XaiKeyStatus>('get_xai_key_storage', {})
      if (s.ok) send({ type: 'KEY_LOADED', value: s.value })
      else send({ type: 'KEY_LOADED', value: null })
    } else {
      send({ type: 'OPERATION_ERROR', message: res.error?.message || 'Disconnect failed' })
    }
  }

  const saveModel = async (val?: string) => {
    const parsed = parseXaiModelField(val ?? modelDraft)
    if (!parsed.success || !parsed.data.model) {
      send({ type: 'OPERATION_ERROR', message: 'Model is required.' })
      return
    }
    const toSave = parsed.data.model

    send({ type: 'SAVE_MODEL_START' })

    const res = await safeInvoke<void>('set_xai_model_cmd', { model: toSave })
    if (res.ok) {
      send({ type: 'SAVE_MODEL_SUCCESS', value: toSave })
    } else {
      send({ type: 'OPERATION_ERROR', message: res.error?.message || 'Failed to save model' })
    }
  }

  const quickSetModel = (modelName: string) => {
    send({ type: 'SET_MODEL_DRAFT', draft: modelName })
    void saveModel(modelName)
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
          envVarHint="XAI_API_KEY"
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
              onChange={(e) => send({ type: 'SET_KEY_DRAFT', draft: e.target.value })}
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
            <Button variant="ghost" size="sm" onClick={() => void clearKey()} disabled={isBusy}>
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
              onChange={(e) => send({ type: 'SET_MODEL_DRAFT', draft: e.target.value })}
              placeholder="grok-4.6"
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
            <Button variant="ghost" size="sm" onClick={() => quickSetModel('grok-4.6')} disabled={isBusy}>
              grok-4.6
            </Button>
            <Button variant="ghost" size="sm" onClick={() => quickSetModel('grok-4.5')} disabled={isBusy}>
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
