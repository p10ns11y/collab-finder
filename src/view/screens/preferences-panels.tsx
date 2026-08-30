import * as React from 'react'
import { Loader2 } from 'lucide-react'
import { safeInvoke } from '../../adapters/tauri/safe-invoke'
import {
  devprofilePanelReducer,
  initialDevprofilePanelState,
  isDevprofilePanelBusy,
} from '../../core/domain/devprofile-path-panel'
import {
  DEFAULT_FIT_MODE,
  fitModeDescription,
  fitModeLabel,
  parseFitMode,
  type FitMode,
} from '../../core/domain/fit-mode'
import { parseLlmQuality, type LlmQuality } from '../../core/domain/llm-route'
import { Badge } from '../../components/ui/badge'
import { Chip } from '../../components/ui/chip'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'
import { Input } from '../../components/ui/input'

type LlmRouteStatus = {
  quality: string
  grok_bin: string | null
  cursor_agent_bin: string | null
  xai_key_present: boolean
  short_backend: string
  long_high_backend: string
  long_moderate_backend: string
}

/** Quality-tier route: Grok ACP / cursor-agent / xAI API. No yolo spawn. */
export function LlmRoutePanel() {
  const [status, setStatus] = React.useState<LlmRouteStatus | null>(null)
  const [notice, setNotice] = React.useState<string | null>(null)
  const quality = parseLlmQuality(status?.quality)

  const refresh = React.useCallback(() => {
    void safeInvoke<LlmRouteStatus>('get_llm_route_status', {}).then((res) => {
      if (res.ok) setStatus(res.value)
      else setNotice(res.error?.message || 'Route status failed')
    })
  }, [])

  React.useEffect(() => {
    refresh()
  }, [refresh])

  const setQuality = (next: LlmQuality) => {
    void safeInvoke<void>('set_llm_route_quality', { quality: next }).then((res) => {
      if (res.ok) {
        setNotice(null)
        refresh()
      } else {
        setNotice(res.error?.message || 'Save failed')
      }
    })
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle>Evaluate route</CardTitle>
        <CardDescription>
          Evaluate and Prepare stay on the xAI API (grok-4.6 structured JSON). Local Grok Build
          ACP/stdio is for long agent work with tools — not these two one-shot schemas. Preference
          below is stored for a later headless <span className="font-mono">grok -p</span> path, not
          used to spawn ACP from Evaluate.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-1">
          {(['fast', 'moderate', 'high'] as const).map((q) => (
            <Chip key={q} active={quality === q} onClick={() => setQuality(q)}>
              {q === 'high' ? 'High · Grok ACP' : q === 'moderate' ? 'Moderate · cursor-agent' : 'Fast · API'}
            </Chip>
          ))}
        </div>
        <p className="ui-meta">
          Grok {status?.grok_bin ? 'found' : 'missing'} · cursor-agent{' '}
          {status?.cursor_agent_bin ? 'found' : 'missing'} · xAI key{' '}
          {status?.xai_key_present ? 'present' : 'absent'}
        </p>
        <p className="ui-meta">
          Short → {status?.short_backend ?? '…'} · Long high → {status?.long_high_backend ?? '…'} ·
          Long moderate → {status?.long_moderate_backend ?? '…'}
        </p>
        {notice ? <p className="text-xs text-ink-muted">{notice}</p> : null}
      </CardContent>
    </Card>
  )
}

/** Fit mode — strict dual-fit vs relaxed simple fitness (file-backed like xai model). */
export function FitModePanel() {
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

type RankConfigDto = {
  profile: 'operator' | 'custom'
  weights: {
    spacexai: number
    fortress: number
    ai_tsunami: number
    product_moat: number
    hiring: number
  }
  place_weights: {
    economic: number
    ethics: number
    character: number
    social: number
    family: number
    self_fit: number
  }
  gates: { theater_saas: boolean; fortress_min: number; product_moat_min: number }
  pack_dirs: string[]
}

type RankConfigView = {
  config: RankConfigDto
  config_path: string
  pack_files: string[]
}

export function RankConfigPanel() {
  const [view, setView] = React.useState<RankConfigView | null>(null)
  const [notice, setNotice] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  const refresh = React.useCallback(() => {
    void safeInvoke<RankConfigView>('get_rank_config', {}).then((res) => {
      if (res.ok) setView(res.value)
      else setNotice(res.error?.message || 'Rank config failed')
    })
  }, [])

  React.useEffect(() => {
    refresh()
  }, [refresh])

  const persist = (next: RankConfigDto) => {
    setBusy(true)
    void safeInvoke<RankConfigView>('save_rank_config', { config: next }).then((res) => {
      setBusy(false)
      if (res.ok) {
        setView(res.value)
        setNotice('Saved. Mission will recompute on next open (or Next 10).')
        void safeInvoke('list_durable_firms', { refresh: true })
      } else {
        setNotice(res.error?.message || 'Save failed')
      }
    })
  }

  if (!view) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Rank packs & metrics</CardTitle>
          <CardDescription>Loading…</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const cfg = view.config
  const setWeight = (key: keyof RankConfigDto['weights'], raw: string) => {
    const n = Number(raw)
    if (!Number.isFinite(n)) return
    persist({ ...cfg, weights: { ...cfg.weights, [key]: Math.max(0, Math.min(16, Math.round(n))) } })
  }
  const setPlace = (key: keyof RankConfigDto['place_weights'], raw: string) => {
    const n = Number(raw)
    if (!Number.isFinite(n)) return
    persist({
      ...cfg,
      place_weights: { ...cfg.place_weights, [key]: Math.max(0, Math.min(16, Math.round(n))) },
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Rank packs & metrics</CardTitle>
        <CardDescription>
          You first: operator pack is the compiled fortress/places fallback. Drop extra JSON in the
          packs folder. Custom profile uses only those files (anybody else).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="ui-meta break-all">config: {view.config_path}</p>
        <div className="flex gap-1 rounded-md border border-border-subtle p-0.5">
          {(['operator', 'custom'] as const).map((p) => (
            <button
              key={p}
              type="button"
              disabled={busy}
              onClick={() => persist({ ...cfg, profile: p })}
              className={
                cfg.profile === p
                  ? 'flex-1 rounded px-2 py-1.5 text-xs font-medium bg-accent/15 text-accent'
                  : 'flex-1 rounded px-2 py-1.5 text-xs text-ink-muted hover:text-ink'
              }
            >
              {p === 'operator' ? 'Operator (you)' : 'Custom (packs only)'}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={cfg.gates.theater_saas}
            disabled={busy}
            onChange={(e) =>
              persist({ ...cfg, gates: { ...cfg.gates, theater_saas: e.target.checked } })
            }
          />
          Gate theatre software-as-a-service
        </label>
        <div className="grid grid-cols-2 gap-2 text-xs">
          {(
            [
              ['spacexai', cfg.weights.spacexai],
              ['fortress', cfg.weights.fortress],
              ['ethics', cfg.place_weights.ethics],
              ['social', cfg.place_weights.social],
              ['family', cfg.place_weights.family],
              ['location/econ', cfg.place_weights.economic],
            ] as const
          ).map(([label, val]) => (
            <label key={label} className="flex items-center justify-between gap-2">
              <span className="text-ink-muted">{label}</span>
              <input
                type="number"
                min={0}
                max={16}
                className="w-16 rounded border border-border-subtle bg-surface-2 px-1 py-0.5"
                defaultValue={val}
                disabled={busy}
                onBlur={(e) => {
                  if (label === 'spacexai' || label === 'fortress') {
                    setWeight(label, e.target.value)
                  } else if (label === 'ethics') setPlace('ethics', e.target.value)
                  else if (label === 'social') setPlace('social', e.target.value)
                  else if (label === 'family') setPlace('family', e.target.value)
                  else setPlace('economic', e.target.value)
                }}
              />
            </label>
          ))}
        </div>
        <p className="text-[11px] text-ink-faint">
          Packs: drop <code>universe.json</code> / <code>places.json</code> under the packs dir next
          to rank.json. Same firm/place id overrides the operator file.
        </p>
        {view.pack_files.length > 0 ? (
          <ul className="ui-meta list-disc pl-4">
            {view.pack_files.map((f) => (
              <li key={f} className="truncate">
                {f}
              </li>
            ))}
          </ul>
        ) : (
          <p className="ui-meta">No extra pack JSON yet.</p>
        )}
        {notice ? <p className="text-xs text-ink-muted">{notice}</p> : null}
      </CardContent>
    </Card>
  )
}

type CvHomeStatus = {
  installed: boolean
  home_path: string | null
  cli_path: string | null
  script_present: boolean
  cvdata_present: boolean
  bun_present: boolean
}

/** Devprofile path + kanithanj.cv install — status-enum reducer for path; local state for CV home. */
export function DevprofilePathPanel() {
  const [state, dispatch] = React.useReducer(devprofilePanelReducer, initialDevprofilePanelState)
  const { draft, configuredPath, status, notice } = state
  const busy = isDevprofilePanelBusy(status)
  const [cvHome, setCvHome] = React.useState<CvHomeStatus | null>(null)
  const [cvInstallBusy, setCvInstallBusy] = React.useState(false)
  const [cvNotice, setCvNotice] = React.useState<string | null>(null)

  const refreshCvHome = React.useCallback(() => {
    void safeInvoke<CvHomeStatus>('get_cv_home_status', {}).then((res) => {
      if (res.ok) setCvHome(res.value)
    })
  }, [])

  const refresh = React.useCallback(() => {
    dispatch({ type: 'LOAD_START' })
    void safeInvoke<string | null>('get_devprofile_path_cmd', {}).then((res) => {
      if (res.ok) dispatch({ type: 'LOAD_SUCCESS', path: res.value || null })
      else dispatch({ type: 'LOAD_SUCCESS', path: null })
    })
    refreshCvHome()
  }, [refreshCvHome])

  React.useEffect(() => {
    refresh()
  }, [refresh])

  const installKanithanjCv = async () => {
    setCvInstallBusy(true)
    setCvNotice(null)
    const res = await safeInvoke<CvHomeStatus>('install_kanithanj_cv', {})
    setCvInstallBusy(false)
    if (res.ok) {
      setCvHome(res.value)
      setCvNotice('kanithanj.cv installed — Generate apply CV uses ~/.local/bin/kanithanj.cv')
    } else {
      setCvNotice(res.error?.message || 'Install failed')
    }
  }

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
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle>kanithanj.cv</CardTitle>
            <CardDescription>
              Apply-CV PDF maker. Install once. Generate apply CV runs{" "}
              <span className="font-mono">~/.local/bin/kanithanj.cv</span>. Facts live at{" "}
              <span className="font-mono">~/.config/kanithanj.cv/cvdata.json</span> (GitHub pull on
              install and <span className="font-mono">kanithanj.cv sync</span>). Never mutates the
              site master.
            </CardDescription>
          </div>
          <Badge tone={cvHome?.installed ? 'success' : 'neutral'}>
            {cvHome?.installed ? 'Installed' : 'Not installed'}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => void installKanithanjCv()}
              disabled={cvInstallBusy || busy}
            >
              {cvInstallBusy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : null}
              Install kanithanj.cv
            </Button>
            <Button size="sm" variant="ghost" onClick={refreshCvHome} disabled={busy || cvInstallBusy}>
              Refresh status
            </Button>
          </div>
          {cvNotice ? <p className="text-xs text-ink-muted">{cvNotice}</p> : null}
          {cvHome ? (
            <ul className="ui-meta space-y-1 break-all">
              {cvHome.home_path ? <li>home: {cvHome.home_path}</li> : null}
              {cvHome.cli_path ? <li>cli: {cvHome.cli_path}</li> : null}
              <li>
                cvdata:{' '}
                {cvHome.cvdata_present
                  ? 'present (~/.config/kanithanj.cv/cvdata.json or CVDATA_SRC)'
                  : 'missing — run kanithanj.cv sync, or write ~/.config/kanithanj.cv/cvdata.json'}
              </li>
              <li>bun: {cvHome.bun_present ? 'found' : 'not found'}</li>
            </ul>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle>devprofile path</CardTitle>
            <CardDescription>
              Optional checkout for Quick Target analyze/prep (textarea still overrides). Sidecar
              proposals read it for deltas — no auto-write. Not the CLI facts file. If this path is
              set, Preferences Install still passes it as <span className="font-mono">CVDATA_SRC</span>{" "}
              (override). Clear it to keep the GitHub config file.
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
    </div>
  )
}
