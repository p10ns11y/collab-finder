/**
 * Quality-tier routing for *future* long agent jobs.
 * Evaluate + Prepare bundle stay on the xAI API (grok-4.6 structured JSON).
 * Do not send those one-shot schemas through grok agent stdio / ACP.
 * Never spawn --always-approve / --yolo.
 */

export type LlmQuality = 'high' | 'moderate' | 'fast'
export type LlmBackend = 'grok_acp' | 'cursor_agent' | 'xai_api' | 'grok_headless' | 'cursor_cli'

export const LLM_LONG_TOKEN_FLOOR = 6000

export type LlmRouteInput = {
  tokens: number
  quality: LlmQuality
  grokPresent: boolean
  cursorAgentPresent: boolean
  xaiApiPresent: boolean
}

export type LlmRoute = {
  backend: LlmBackend
  reason: string
  /** Suggested local spawn — ask-mode / no yolo. Empty when API. */
  spawn: { cmd: string; args: string[] } | null
}

export function parseLlmQuality(raw: string | null | undefined): LlmQuality {
  const t = (raw ?? '').trim().toLowerCase()
  if (t === 'high' || t === 'moderate' || t === 'fast') return t
  return 'fast'
}

export function resolveLlmRoute(input: LlmRouteInput): LlmRoute {
  const long = input.tokens >= LLM_LONG_TOKEN_FLOOR
  const quality = parseLlmQuality(input.quality)

  if (!long || quality === 'fast') {
    if (input.xaiApiPresent) {
      return { backend: 'xai_api', reason: 'short or fast → xAI structured API', spawn: null }
    }
    if (input.grokPresent) {
      return {
        backend: 'grok_headless',
        reason: 'no API key → grok -p (no tools)',
        spawn: { cmd: 'grok', args: ['-p', '--disallowed-tools', 'run_terminal_cmd,search_replace,web_search,web_fetch'] },
      }
    }
    if (input.cursorAgentPresent) {
      return {
        backend: 'cursor_cli',
        reason: 'no API key → cursor-agent -p ask',
        spawn: { cmd: 'cursor-agent', args: ['-p', '--mode', 'ask', '--output-format', 'json'] },
      }
    }
    return { backend: 'xai_api', reason: 'no backend present; Settings must connect xAI or CLI', spawn: null }
  }

  if (quality === 'high') {
    if (input.grokPresent) {
      return {
        backend: 'grok_acp',
        reason: 'long + high → grok agent stdio (ACP)',
        spawn: { cmd: 'grok', args: ['agent', 'stdio'] },
      }
    }
    if (input.xaiApiPresent) {
      return { backend: 'xai_api', reason: 'Grok ACP missing → xAI API fallback', spawn: null }
    }
  }

  if (input.cursorAgentPresent) {
    return {
      backend: 'cursor_agent',
      reason: 'long + moderate → cursor-agent ACP / ask',
      spawn: { cmd: 'cursor-agent', args: ['acp'] },
    }
  }
  if (input.xaiApiPresent) {
    return { backend: 'xai_api', reason: 'cursor-agent missing → xAI API fallback', spawn: null }
  }
  if (input.grokPresent) {
    return {
      backend: 'grok_acp',
      reason: 'cursor-agent missing → grok ACP',
      spawn: { cmd: 'grok', args: ['agent', 'stdio'] },
    }
  }
  return { backend: 'xai_api', reason: 'no backend present', spawn: null }
}
