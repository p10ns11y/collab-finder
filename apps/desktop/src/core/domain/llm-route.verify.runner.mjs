#!/usr/bin/env node
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const { resolveLlmRoute, parseLlmQuality, LLM_LONG_TOKEN_FLOOR } = await import(
  pathToFileURL(join(here, 'llm-route.ts')).href
)

let failed = 0
function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed++
  } else {
    console.log('ok:', msg)
  }
}

assert(parseLlmQuality('HIGH') === 'high', 'parse quality')
assert(parseLlmQuality('nope') === 'fast', 'unknown → fast')

const present = { grokPresent: true, cursorAgentPresent: true, xaiApiPresent: true }

const fast = resolveLlmRoute({ tokens: 800, quality: 'high', ...present })
assert(fast.backend === 'xai_api', 'short stays API even if quality high')
assert(fast.spawn === null, 'API has no spawn')

const high = resolveLlmRoute({ tokens: LLM_LONG_TOKEN_FLOOR, quality: 'high', ...present })
assert(high.backend === 'grok_acp', 'long+high → grok ACP')
assert(high.spawn?.cmd === 'grok' && high.spawn.args.includes('agent'), 'ACP spawn is grok agent')
assert(!high.spawn.args.some((a) => a.includes('yolo') || a.includes('always-approve')), 'no yolo')

const mid = resolveLlmRoute({ tokens: LLM_LONG_TOKEN_FLOOR, quality: 'moderate', ...present })
assert(mid.backend === 'cursor_agent', 'long+moderate → cursor-agent')

const noGrok = resolveLlmRoute({
  tokens: LLM_LONG_TOKEN_FLOOR,
  quality: 'high',
  grokPresent: false,
  cursorAgentPresent: true,
  xaiApiPresent: true,
})
assert(noGrok.backend === 'xai_api', 'high without grok falls back to API')

const noApi = resolveLlmRoute({
  tokens: 100,
  quality: 'fast',
  grokPresent: true,
  cursorAgentPresent: false,
  xaiApiPresent: false,
})
assert(noApi.backend === 'grok_headless', 'fast without key → grok -p')
assert(!JSON.stringify(noApi.spawn).includes('yolo'), 'headless no yolo')

console.log('=== llm-route.verify ===')
if (failed) process.exit(1)
console.log('ALL CHECKS PASSED')
