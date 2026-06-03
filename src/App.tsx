import { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'

type Tweet = { id: string; text: string; author_id?: string; created_at?: string }

function App() {
  const [query, setQuery] = useState('(hiring OR "we are hiring" OR collab OR "build with me") (react OR typescript OR rust OR ai) min_faves:1 -is:retweet')
  const [bearer, setBearer] = useState('')
  const [results, setResults] = useState<Tweet[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200">
      <header className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-orange-500" />
          <div>
            <div className="font-semibold tracking-tight">collab-finder</div>
            <div className="text-[10px] text-zinc-500 -mt-1">X + xAI • personal opportunity reactor</div>
          </div>
        </div>
        <div className="text-xs text-zinc-500">v0.1 • Tauri • live X search</div>
      </header>

      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div style={{ marginBottom: 8, fontSize: 12, color: '#a1a1aa' }}>
          X Bearer (temp for scaffold): <input value={bearer} onChange={e=>setBearer(e.target.value)} placeholder="AAAA..." style={{ width: 280, background:'#18181b', border:'1px solid #27272a', color:'#e4e4e7', fontFamily:'monospace', fontSize:11, padding:'1px 6px' }} />
        </div>

        <div className="flex gap-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-orange-500/50"
            placeholder="X search query (fully editable — tune anytime)"
          />
          <button
            onClick={doSearch}
            disabled={loading}
            className="px-4 py-2 rounded bg-orange-600 hover:bg-orange-500 active:bg-orange-700 text-sm font-medium disabled:opacity-60"
          >
            {loading ? 'Searching…' : 'Search X (live)'}
          </button>
        </div>

        <div className="text-sm text-zinc-400">
          Presets: <span className="underline cursor-pointer" onClick={() => setQuery('(hiring OR "open role") (senior OR staff) (react OR typescript) min_faves:2')}>Jobs</span> · <span className="underline cursor-pointer" onClick={() => setQuery('collab OR cofounder OR "build with me" (indie OR agent OR rust)')}>Collabs</span> · <span className="underline cursor-pointer" onClick={() => setQuery('"side project" OR "side hustle" (react OR ai OR rust)')}>Side Hustles</span> · <span className="underline cursor-pointer" onClick={() => setQuery('"build in public" OR "join me" community OR together')}>Community</span>
          <span className="ml-2 text-orange-500">← edit the box for full control</span>
        </div>

        {error && <div className="bg-red-950 border border-red-900 text-red-400 px-3 py-2 rounded text-xs">{error}</div>}

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
          Live X recent search is wired (full query passthrough for your tuning + arena/manual lists). Next: persist leads, xAI (CV-pruned analysis + letter + delta), sidecar export, tracker, promote to devprofile cvdata.
        </div>
      </div>

      <footer className="text-[10px] text-zinc-600 px-6 py-4 border-t border-zinc-800 mt-auto">
        Separate from devprofile portfolio. Reads CV for grounding. Always produces sidecars. Promote is explicit + diff-previewed. xurl / xmcp / xdk are great companions for query dev &amp; agents.
      </footer>
    </div>
  )
}

export default App

