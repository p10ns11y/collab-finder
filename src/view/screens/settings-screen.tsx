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

      <div className="mt-4">
        <DevprofilePathPanel />
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
type XaiKeyStatus = any; // from get_xai_key_storage

type XaiPanelStatus = 'idle' | 'loading' | 'saving-key' | 'clearing-key' | 'saving-model';

type XaiPanelState = {
  keyStatus: XaiKeyStatus | null;
  model: string;
  keyDraft: string;
  modelDraft: string;
  panelStatus: XaiPanelStatus;
  notice: string | null;
};

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
  | { type: 'CLEAR_NOTICE' };

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
      return { ...state, panelStatus: 'idle', keyDraft: '', notice: 'Saved. Status will update on refresh.' };

    case 'CLEAR_KEY_START':
      return { ...state, panelStatus: 'clearing-key', notice: null };

    case 'CLEAR_KEY_SUCCESS':
      return { ...state, panelStatus: 'idle', keyStatus: null };

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
  const [state, dispatch] = React.useReducer(xaiPanelReducer, initialXaiPanelState);

  const { keyStatus, model, keyDraft, modelDraft, panelStatus, notice } = state;

  // Derived (no extra state)
  const connected = !!keyStatus?.connected;
  const displayModel = model || 'grok-4.5';
  const isBusy = panelStatus !== 'idle';

  // Mount: load both key storage and model (external Tauri sync — justified useEffect)
  React.useEffect(() => {
    dispatch({ type: 'LOAD_START' });

    // Fire both loads; reducer coordinates the 'loading' phase
    void safeInvoke<any>('get_xai_key_storage', {}).then((res) => {
      if (res.ok) dispatch({ type: 'KEY_LOADED', value: res.value });
    });

    void safeInvoke<string>('get_xai_model_cmd', {}).then((res) => {
      if (res.ok && res.value) dispatch({ type: 'MODEL_LOADED', value: res.value });
    });
  }, []);

  const saveKey = async () => {
    const trimmed = keyDraft.trim();
    if (!trimmed) return;

    dispatch({ type: 'SAVE_KEY_START' });

    const res = await safeInvoke<void>('set_xai_key', { key: trimmed });
    if (res.ok) {
      dispatch({ type: 'SAVE_KEY_SUCCESS' });
      // Refresh key status (single source of truth)
      const s = await safeInvoke<any>('get_xai_key_storage', {});
      if (s.ok) dispatch({ type: 'KEY_LOADED', value: s.value });
    } else {
      dispatch({ type: 'OPERATION_ERROR', message: res.error?.message || 'Save failed' });
    }
  };

  const clearKey = async () => {
    dispatch({ type: 'CLEAR_KEY_START' });
    await safeInvoke<void>('clear_xai_key', {});
    dispatch({ type: 'CLEAR_KEY_SUCCESS' });
  };

  const saveModel = async (val?: string) => {
    const toSave = (val ?? modelDraft).trim();
    if (!toSave) return;

    dispatch({ type: 'SAVE_MODEL_START' });

    const res = await safeInvoke<void>('set_xai_model_cmd', { model: toSave });
    if (res.ok) {
      dispatch({ type: 'SAVE_MODEL_SUCCESS', value: toSave });
    } else {
      dispatch({ type: 'OPERATION_ERROR', message: res.error?.message || 'Failed to save model' });
    }
  };

  const quickSetModel = (m: string) => {
    dispatch({ type: 'SET_MODEL_DRAFT', draft: m });
    void saveModel(m);
  };

  return (
    <div className="border border-border-subtle rounded p-4 bg-surface-1/40">
      <div className="flex items-center justify-between mb-2">
        <div className="font-medium text-sm">xAI Intelligence key ({displayModel})</div>
        <div className="text-[10px] px-2 py-0.5 rounded border">{connected ? 'Connected' : 'Required'}</div>
      </div>
      <div className="text-[10px] text-ink-faint mb-2">
        Used for target fit analysis, CV tailoring, cover letters. Stored the same way as your X bearer (keyring + file).
      </div>

      {!connected && (
        <input
          type="password"
          value={keyDraft}
          onChange={(e) => dispatch({ type: 'SET_KEY_DRAFT', draft: e.target.value })}
          placeholder="xai-..."
          className="w-full mb-2 bg-surface-0 border border-border-subtle rounded px-3 py-1 text-sm font-mono"
        />
      )}

      <div className="flex gap-2">
        {!connected && (
          <button
            onClick={saveKey}
            disabled={isBusy || !keyDraft.trim()}
            className="text-sm px-3 py-1 border rounded hover:border-accent/60 disabled:opacity-50"
          >
            Save xAI key
          </button>
        )}
        {connected && (
          <button
            onClick={clearKey}
            disabled={isBusy}
            className="text-sm px-3 py-1 border rounded hover:border-accent/60"
          >
            Disconnect xAI key
          </button>
        )}
        <button
          onClick={() => {
            // Manual refresh of both (rare)
            dispatch({ type: 'LOAD_START' });
            void safeInvoke<any>('get_xai_key_storage', {}).then((r) => {
              if (r.ok) dispatch({ type: 'KEY_LOADED', value: r.value });
            });
            void safeInvoke<string>('get_xai_model_cmd', {}).then((r) => {
              if (r.ok && r.value) dispatch({ type: 'MODEL_LOADED', value: r.value });
            });
          }}
          disabled={isBusy}
          className="text-sm px-2 py-1 text-ink-faint"
        >
          Refresh status
        </button>
      </div>

      {notice && <div className="mt-1 text-xs text-ink-muted">{notice}</div>}

      {keyStatus && (
        <div className="mt-2 text-[10px] text-ink-faint">
          active: {keyStatus.active_source} • keyring: {keyStatus.keyring?.reachable ? 'reachable' : 'no'} • file: {keyStatus.file?.present ? 'yes' : 'no'}
        </div>
      )}

      {/* Model selection / input — still in same panel for the "xAI Intelligence" group in the image */}
      <div className="mt-3 pt-3 border-t border-border-subtle/60">
        <div className="text-[10px] uppercase tracking-wide text-ink-faint mb-1">Model</div>
        <div className="flex flex-wrap gap-2 items-center">
          <input
            value={modelDraft}
            onChange={(e) => dispatch({ type: 'SET_MODEL_DRAFT', draft: e.target.value })}
            placeholder="grok-4.5"
            className="flex-1 min-w-[140px] bg-surface-0 border border-border-subtle rounded px-2 py-1 text-sm font-mono"
          />
          <button
            onClick={() => saveModel()}
            disabled={isBusy || !modelDraft.trim()}
            className="text-sm px-3 py-1 border rounded hover:border-accent/60 disabled:opacity-50"
          >
            Save model
          </button>
          <button
            onClick={() => quickSetModel('grok-4.3')}
            disabled={isBusy}
            className="text-xs px-2 py-1 border rounded hover:border-accent/60"
          >
            grok-4.3
          </button>
          <button
            onClick={() => quickSetModel('grok-4.5')}
            disabled={isBusy}
            className="text-xs px-2 py-1 border rounded hover:border-accent/60"
          >
            grok-4.5
          </button>
        </div>
        <div className="mt-1 text-[9px] text-ink-faint">
          Current: <span className="font-mono">{displayModel}</span>. Selection or custom input supported. Takes effect for the next fit/prep call.
        </div>
      </div>
    </div>
  );
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

