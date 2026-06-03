import { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'

type Tweet = { id: string; text: string; author_id?: string; created_at?: string }
type Decision = { action: string; confidence: number; rationale: string; guards_triggered: any[]; next_steps: string[] }
type ReactorState = { leads: any[]; current_cost: number; x_rate_remaining: number; pauses: string[] }

function App() {
  const [query, setQuery] = useState('(hiring OR "we are hiring" OR collab OR "build with me") (react OR typescript OR rust OR ai) min_faves:1 -is:retweet')
  const [bearer, setBearer] = useState('')
  const [cvSummary, setCvSummary] = useState('Senior TS/React/Rust engineer, Oneflow leadership, energy-efficient systems, agentic tools, open to collabs in Stockholm or remote.')
  const [results, setResults] = useState<Tweet[]>([])
  const [decision, setDecision] = useState<Decision | null>(null)
  const [reactorState, setReactorState] = useState<ReactorState | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pauses, setPauses] = useState<string[]>([])
  const [showPalette, setShowPalette] = useState(false)

  async function doSearch() {
    if (!bearer.trim()) {
      setError('Provide a temporary X Bearer token for the first searches (will move to secure OS store). Get from X developer portal app keys.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const tweets = await invoke<Tweet[]>('search_x_recent', { query, bearer: bearer.trim(), maxResults: 8 })
      setResults(tweets)
    } catch (e: any) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  async function runAutonomousCycle() {
    if (!bearer.trim()) {
      setError('Bearer required for guarded cycle.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const dec = await invoke<Decision>('run_hunter_cycle', { query, bearer: bearer.trim(), cvSummary })
      setDecision(dec)
      if (dec.guards_triggered && dec.guards_triggered.length > 0) {
        const pauseMsg = `PAUSED on guards: ${JSON.stringify(dec.guards_triggered)}. Review and intervene (per agentic-reactor self-guards).`
        setPauses(p => [...p, pauseMsg])
        setError(pauseMsg)
      }
      // Refresh state
      const state = await invoke<ReactorState>('get_reactor_state')
      setReactorState(state)
    } catch (e: any) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  async function doPromote() {
    try {
      const msg = await invoke<string>('promote_lead', { leadId: 'latest' })
      setPauses(p => [...p, `CV Promote: ${msg} (sidecar-first per cv-promote-guard. User confirm required.)`])
    } catch (e: any) {
      setError(String(e))
    }
  }

  // Simple command palette (agent interface per tauri-agentic)
  const commands = [
    { label: 'Search X (live)', action: doSearch },
    { label: 'Run Autonomous Cycle (guarded)', action: runAutonomousCycle },
    { label: 'Promote Insights (guarded)', action: doPromote },
    { label: 'Refresh Reactor State', action: async () => { const s = await invoke<ReactorState>('get_reactor_state'); setReactorState(s) } },
  ]

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200 font-sans">
      <header className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-orange-500" />
          <div>
            <div className="font-semibold tracking-tight">collab-finder</div>
            <div className="text-[10px] text-zinc-500 -mt-1">X + xAI • agentic-reactor (self-guarded, pauses on intervention points)</div>
          </div>
        </div>
        <div className="text-xs text-zinc-500">v0.1 • Tauri • MCP-ready • X resources loaded</div>
        <button onClick={() => setShowPalette(!showPalette)} className="px-3 py-1 text-xs border border-zinc-700 rounded hover:bg-zinc-900">⌘K Palette (agent cmds)</button>
      </header>

      {showPalette && (
        <div className="fixed inset-0 bg-black/50 flex items-start justify-center pt-20 z-50" onClick={() => setShowPalette(false)}>
          <div className="bg-zinc-900 border border-zinc-700 rounded w-96 p-2" onClick={e => e.stopPropagation()}>
            {commands.map((c, i) => (
              <button key={i} onClick={() => { c.action(); setShowPalette(false) }} className="block w-full text-left px-3 py-2 hover:bg-zinc-800 rounded text-sm">{c.label}</button>
            ))}
            <div className="text-[10px] text-zinc-500 px-3 pt-2">Agent interface: calls guarded reactor (per tauri-agentic + hunter-reactor skills)</div>
          </div>
        </div>
      )}

      <div className="p-6 max-w-6xl mx-auto space-y-6">
        {/* Guard Dashboard (self-guards visible) */}
        <div className="border border-zinc-800 rounded p-3 text-xs bg-zinc-900/50">
          <div className="font-medium mb-1">Reactor Guards Status (autonomous with pauses)</div>
          <div className="grid grid-cols-2 gap-2">
            <div>Cost: {reactorState?.current_cost || 0} / 10k tokens <span className="text-orange-400">(guard active)</span></div>
            <div>X Rate: {reactorState?.x_rate_remaining || 450} remaining <span className="text-green-400">(ok)</span></div>
            <div>Pauses logged: {pauses.length} (user/agent intervene here)</div>
            <div>CV Promote: sidecar-first only (cv-promote-guard)</div>
          </div>
          {reactorState?.pauses?.length > 0 && <div className="mt-1 text-orange-400">Active pauses: {reactorState.pauses.join('; ')}</div>}
        </div>

        <div style={{ marginBottom: 8, fontSize: 12, color: '#a1a1aa' }}>
          X Bearer (temp): <input value={bearer} onChange={e=>setBearer(e.target.value)} placeholder="AAAA..." style={{ width: 280, background:'#18181b', border:'1px solid #27272a', color:'#e4e4e7', fontFamily:'monospace', fontSize:11, padding:'1px 6px' }} />
          <br />CV Summary (pruned packet for xAI, per fission): <input value={cvSummary} onChange={e=>setCvSummary(e.target.value)} style={{ width: '100%', marginTop:4, background:'#18181b', border:'1px solid #27272a', color:'#e4e4e7', fontSize:11, padding:'2px' }} />
        </div>

        <div className="flex gap-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-orange-500/50"
            placeholder="X search query (fully editable — tune anytime; agentic-reactor uses full control + X skill.md context)"
          />
          <button onClick={doSearch} disabled={loading} className="px-4 py-2 rounded bg-zinc-700 hover:bg-zinc-600 text-sm font-medium disabled:opacity-60">Search X (low-level)</button>
          <button onClick={runAutonomousCycle} disabled={loading} className="px-4 py-2 rounded bg-orange-600 hover:bg-orange-500 active:bg-orange-700 text-sm font-medium disabled:opacity-60">Run Autonomous Cycle (guarded, pauses on guards)</button>
        </div>

        <div className="text-sm text-zinc-400">
          Presets (X resources aware): <span className="underline cursor-pointer" onClick={() => setQuery('(hiring OR "open role") (senior OR staff) (react OR typescript) min_faves:2')}>Jobs</span> · <span className="underline cursor-pointer" onClick={() => setQuery('collab OR cofounder OR "build with me" (indie OR agent OR rust)')}>Collabs</span> · <span className="underline cursor-pointer" onClick={() => setQuery('"side project" OR "side hustle" (react OR ai OR rust)')}>Side Hustles</span> · <span className="underline cursor-pointer" onClick={() => setQuery('"build in public" OR "join me" community OR together')}>Community</span>
          <span className="ml-2 text-orange-500">← Full query tuning (x-agent-resources principle)</span>
        </div>

        {error && <div className="bg-red-950 border border-red-900 text-red-400 px-3 py-2 rounded text-xs">{error} <button onClick={() => setError(null)} className="ml-2 underline">Clear</button></div>}

        {/* Decision / Pause UI (intervention point) */}
        {decision && (
          <div className="border border-zinc-700 rounded p-4 bg-zinc-900">
            <div className="font-medium">Latest Decision (smart xAI-structured, guards evaluated)</div>
            <div className="text-sm mt-1">Action: <span className="font-mono text-orange-400">{decision.action}</span> (conf {decision.confidence}%) | Guards: {decision.guards_triggered.length ? JSON.stringify(decision.guards_triggered) : 'none'}</div>
            <div className="text-xs text-zinc-400 mt-1">{decision.rationale}</div>
            <div className="mt-2 flex gap-2">
              <button onClick={runAutonomousCycle} className="text-xs px-2 py-1 border border-zinc-600 rounded">Re-run with tweak</button>
              <button onClick={doPromote} className="text-xs px-2 py-1 border border-zinc-600 rounded">Promote Insights (guarded)</button>
            </div>
          </div>
        )}

        {pauses.length > 0 && (
          <div className="border border-orange-900 bg-orange-950/30 rounded p-3 text-xs">
            <div className="font-medium text-orange-400">Pauses / Interventions (user or outer agent only here)</div>
            {pauses.map((p,i) => <div key={i} className="mt-1">• {p}</div>)}
          </div>
        )}

        {results.length > 0 && (
          <div className="border border-zinc-800 rounded overflow-hidden text-sm">
            {results.map((t, i) => (
              <div key={i} className="p-3 border-t border-zinc-800 first:border-t-0 whitespace-pre-wrap">
                <div className="text-orange-400 text-xs mb-1">id:{t.id} {t.created_at ? '· '+t.created_at : ''}</div>
                {t.text}
              </div>
            ))}
          </div>
        )}

        <div className="border border-zinc-800 rounded p-4 text-xs text-zinc-500">
          Agentic reactor live (per hunter-reactor/agentic-reactor/tauri-agentic skills): guarded cycle with X skill.md context, cost/rate/fit/CV guards, pauses for intervention, MCP tools (run_hunter_cycle etc), sidecar CV promote. X resources loaded from .agents/x-resources/. Next: real xAI (with pruned CV + X skill prefix), full prep artifacts, background autonomous mode.
          <br />Query fully tunable. Presets respect official X capabilities.
        </div>
      </div>

      <footer className="text-[10px] text-zinc-600 px-6 py-4 border-t border-zinc-800 mt-auto">
        Separate from devprofile. CV grounding + promote via cv-promote-guard (sidecar + preview + confirm). X via x-agent-resources (skill.md/llms/MCP/xurl). Self-guards &amp; pauses everywhere. Surplus after every cycle.
      </footer>
    </div>
  )
}

export default App

