#!/usr/bin/env node
import {
  contactDetail,
  contactDisplayName,
  contactHost,
  decodeWaybarChip,
  findNextDo,
  groupStagesExcludingDo,
  isHitlPause,
  nextDoFrame,
  nextDoGlanceCount,
  NEXT_DO_BEFORE_GLANCE,
  NEXT_DO_HIDDEN_CHROME,
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

// ── People rows: no raw schema keys, human names + details (Fix 4) ────────────
const named = { label: 'Acme', email: 'hr@acme.com' }
must(contactDisplayName(named) === 'Acme', 'a real label stays the contact name')
must(contactDetail(named) === 'hr@acme.com', 'the email drops to the detail line')

// contacts.md written with bare schema keys — the source of the emailCopy/urlOpen mash.
const keyed = parseContactsActionable('- email: hr@acme.com\n- url: https://jobs.acme.com/role\n')
const keyedEmail = keyed.find((c) => c.email)
const keyedUrl = keyed.find((c) => c.url)
must(keyedEmail && contactDisplayName(keyedEmail) === 'hr@acme.com', 'a bare "email" key never shows as the name')
must(keyedUrl && contactDisplayName(keyedUrl) === 'jobs.acme.com', 'a bare "url" key falls back to the link host')
must(contactHost('https://jobs.acme.com/role?x=1') === 'jobs.acme.com', 'contactHost strips scheme and path')
must(contactDisplayName({ label: 'EMAIL', email: 'a@b.com' }) === 'a@b.com', 'schema-key match is case-insensitive')
must(contactDisplayName({ label: '', url: 'https://x.io/p' }) === 'x.io', 'a missing label falls back to the host')

const cash = [
  { id: 'do1', what: 'Submit the Legora pack', class: 'Do', contact: { url: 'https://jobs.example/legora' } },
  { id: 'captcha', what: 'Distru CAPTCHA', class: 'Park' },
  { id: 'wait', what: 'Wait on Proposales', class: 'Wait' },
  { id: 'done', what: 'Logged Neko reject', class: 'Done' },
]
const frame = nextDoFrame(cash)
must(frame.next?.id === 'do1', 'next do is the first Do')
must(frame.hitl.length === 1 && frame.hitl[0].id === 'captcha', 'CAPTCHA stays, other classes do not')
must(frame.hidden.join(',') === NEXT_DO_HIDDEN_CHROME.join(','), 'craft fleet people weather log are hidden')
must(nextDoGlanceCount(frame) <= 2, 'glance budget is the act plus pauses')
must(nextDoGlanceCount(frame) < NEXT_DO_BEFORE_GLANCE, 'fewer surfaces than the old cockpit')
must(isHitlPause({ what: 'BankID signature' }), 'bankid is a pause')
must(isHitlPause({ what: 'Pay the invoice' }), 'pay is a pause')
must(isHitlPause({ what: 'Send the application' }), 'send is a pause')
must(!isHitlPause({ what: 'Wait on Proposales' }), 'a plain wait is not a pause')
const sendHero = nextDoFrame([{ id: 'send', what: 'Send the pack', class: 'Do' }])
must(sendHero.heroIsHitl && sendHero.hitl.length === 0, 'a send act is the hero, not a second list')

console.log('=== heading-cockpit.verify ===')
if (failures.length) {
  for (const f of failures) console.error('FAIL', f)
  process.exit(1)
}
console.log('ALL CHECKS PASSED')
