#!/usr/bin/env node
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const {
  activeQuestNode,
  buildQuestPrompt,
  clipChars,
  parseQuestKind,
  questGraph,
  QUEST_PROMPT_CHAR_CAP,
  snapshotFromFinder,
} = await import(pathToFileURL(join(here, 'quest.ts')).href)

let failed = 0
function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed++
  } else {
    console.log('ok:', msg)
  }
}

assert(parseQuestKind('eva') === 'eva', 'parse eva')
assert(parseQuestKind('nope') === 'eva', 'unknown → eva')
assert(clipChars('abcd', 3) === 'ab…', 'clip')

const prompt = buildQuestPrompt({
  kind: 'eva',
  question: 'Why is hunt 6/10?',
  snapshot: {
    screen: 'sweden',
    rail: 'honest',
    query: 'senior fullstack TypeScript',
    municipality: 'Stockholm',
    harvested: ['fullstack engineer'],
  },
})
assert(prompt.includes('eva-emptiness'), 'eva harness')
assert(prompt.includes('senior fullstack TypeScript'), 'snapshot q')
assert(prompt.includes('Why is hunt 6/10?'), 'question')
const free = buildQuestPrompt({
  kind: 'free',
  question: 'Workday legal situation?',
  snapshot: { screen: 'discover', query: 'senior fullstack TypeScript' },
})
assert(free.includes('Answer the question now') || free.includes('Answer the user now'), 'free answers now')
assert(!free.includes('dual-rail'), 'free is not hunt harness')
const follow = buildQuestPrompt({
  kind: 'free',
  question: 'and in Sweden?',
  snapshot: { screen: 'discover' },
  followUp: true,
})
assert(follow.includes('and in Sweden?'), 'follow-up keeps question')
assert(!follow.includes('HARNESS'), 'follow-up skips harness')
assert(!prompt.includes('--yolo'), 'harness must not contain --yolo')
assert(!prompt.includes('--always-approve'), 'harness must not contain always-approve')
assert(!prompt.includes('OR engineer'), 'no OR soup')
assert(prompt.length <= QUEST_PROMPT_CHAR_CAP, 'under cap')

const huge = buildQuestPrompt({
  kind: 'free',
  question: 'x'.repeat(8000),
  snapshot: { screen: 'sweden' },
})
assert(huge.length <= QUEST_PROMPT_CHAR_CAP, 'hard cap on huge question')

const snap = snapshotFromFinder({
  activeScreen: 'sweden',
  huntRail: 'stretch',
  platsbankenQ: 'AI product engineer',
  huntHarvested: [{ key: 'intelligence architect' }],
})
assert(snap.rail === 'stretch' && snap.harvested?.[0] === 'intelligence architect', 'snapshot from model')

const eva = questGraph('eva')
assert(eva.nodes[0].id === 'prior' && eva.next.score === 'actorask', 'eva graph')
assert(activeQuestNode('free', 'idle', 0) === 'ask', 'free idle → ask')
assert(activeQuestNode('free', 'loading', 1) === 'search', 'free loading → search')
assert(activeQuestNode('eva', 'ready', 2) === 'actorask', 'eva ready → ActOrAsk')

console.log('=== quest.verify ===')
if (failed) process.exit(1)
console.log('ALL CHECKS PASSED')
