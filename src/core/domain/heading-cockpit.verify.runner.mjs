#!/usr/bin/env node
import {
  decodeWaybarChip,
  findNextDo,
  groupStagesExcludingDo,
  parseContactsActionable,
  parseMissionMap,
  stageActions,
  stageMetaLine,
} from './heading-cockpit.ts'

const failures = []
function must(condition, message) {
  if (!condition) failures.push(message)
}

const stages = [
  { id: 'do1', what: 'Submit one relevant application', class: 'Do', contact: { url: 'https://jobs.example/1' } },
  { id: 'w1', what: 'Wait for reply from Acme', class: 'Wait', contact: { followup_when: '1–2d' } },
  { id: 'd1', what: 'Sent intro mail', class: 'Done' },
  { id: 'r1', what: 'Visa timeline risk', class: 'Risk' },
  { id: 'p1', what: 'Old lead parked', class: 'Park' },
]

const map = parseMissionMap(JSON.stringify({ g: 'G42', stages }))
must(map.g === 'G42', 'parseMissionMap g')
must(map.stages?.length === 5, 'parseMissionMap stages')

const next = findNextDo(stages)
must(next?.id === 'do1', 'findNextDo picks first Do')

const groups = groupStagesExcludingDo(stages)
must(groups.wait.length === 1, 'group wait')
must(groups.done.length === 1, 'group done')
must(groups.risk.length === 1, 'group risk')
must(groups.park.length === 1, 'group park')
must(!groups.wait.some((s) => s.class?.toLowerCase() === 'do'), 'no Do in groups')

const wb = decodeWaybarChip('X ON / 2 PAUSES')
must(wb.xOn === true, 'waybar x on')
must(wb.pauseCount === 2, 'waybar pause count')
must(wb.plain.includes('X search is on'), 'waybar plain x')
must(wb.plain.includes('2 opportunities'), 'waybar plain pauses')

const wbOff = decodeWaybarChip('X OFF')
must(wbOff.xOn === false, 'waybar x off')
must(wbOff.plain.includes('off'), 'waybar off plain')

const applyActions = stageActions({ what: 'Submit application today', class: 'Do' })
must(applyActions.some((a) => a.kind === 'navigate' && a.screen === 'pipeline'), 'apply → pipeline')
must(!applyActions.some((a) => a.kind === 'open_url'), 'no fake open url')

const urlActions = stageActions({
  what: 'Apply',
  class: 'Do',
  contact: { url: 'https://jobs.example/2', email: 'hr@example.com' },
})
must(urlActions.some((a) => a.kind === 'open_url'), 'url action when present')
must(urlActions.some((a) => a.kind === 'copy_email'), 'email action when present')
must(!urlActions.some((a) => a.kind === 'navigate'), 'no pipeline when url exists')

const waitMeta = stageMetaLine(stages[1])
must(waitMeta.includes('when ready'), 'wait meta patient')

const contacts = parseContactsActionable(
  '- **Acme** — hr@acme.com\n- [Posting](https://jobs.acme.com/role)\n',
)
must(contacts.length >= 2, 'contacts parsed')
must(contacts.some((c) => c.email), 'contacts email')
must(contacts.some((c) => c.url), 'contacts url')

console.log('=== heading-cockpit.verify ===')
if (failures.length) {
  for (const f of failures) console.error('FAIL', f)
  process.exit(1)
}
console.log('ALL CHECKS PASSED')
