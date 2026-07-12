#!/usr/bin/env node
/**
 * Drives shipped cv-packet-panel-open.ts — sticky open after forceOpen clears.
 */
import {
  cvPacketForceOpen,
  cvPacketPanelOpen,
  latchCvPacketUserOpen,
} from './cv-packet-panel-open.ts'
import { isPlausibleCvPacket } from './cv-packet.ts'

const failures = []
function must(c, m) {
  if (!c) failures.push(m)
}

// forceOpen: empty
must(cvPacketForceOpen('', false) === true, 'empty → force')
must(cvPacketForceOpen('   ', true) === true, 'whitespace → force')

// short invalid packet
const short = 'hello world not enough'
must(isPlausibleCvPacket(short) === false, 'short not plausible')
must(cvPacketForceOpen(short, isPlausibleCvPacket(short)) === true, 'short force')

// mid-edit: empty → typing toward valid must not auto-close via latch
let userOpen = false
let force = true
userOpen = latchCvPacketUserOpen(force, userOpen)
must(userOpen === true, 'latch on force')
must(cvPacketPanelOpen(force, userOpen) === true, 'open while force')

// becomes valid (≥40 plausible chars)
const valid =
  'PROFILE Senior Software Engineer with long English prose for grounding packet content here.'
must(isPlausibleCvPacket(valid) === true, 'valid plausible')
force = cvPacketForceOpen(valid, isPlausibleCvPacket(valid))
must(force === false, 'valid not force')
userOpen = latchCvPacketUserOpen(force, userOpen)
must(userOpen === true, 'sticky userOpen after force clears')
must(cvPacketPanelOpen(force, userOpen) === true, 'stays open after valid')

// user may collapse only when not forced
userOpen = false
must(cvPacketPanelOpen(false, userOpen) === false, 'user can collapse when valid')

// re-force (corrupt) re-opens via latch
userOpen = latchCvPacketUserOpen(true, userOpen)
must(userOpen === true && cvPacketPanelOpen(true, userOpen), 're-force opens')

console.log('=== cv-packet-panel-open.verify ===')
if (failures.length) {
  for (const f of failures) console.error('FAIL', f)
  process.exit(1)
}
console.log('ALL CHECKS PASSED')
