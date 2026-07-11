#!/usr/bin/env node
/** Runner loaded with --experimental-strip-types so shipped .ts is the SUT. */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '../../..')

const { isPlausibleCvPacket, sanitizeCvPacket } = await import(
  pathToFileURL(join(here, 'cv-packet.ts')).href
)

function utf16PairMojibake(english) {
  const b = Buffer.from(english, 'utf8')
  let out = ''
  for (let i = 0; i + 1 < b.length; i += 2) {
    out += String.fromCharCode(b[i] | (b[i + 1] << 8))
  }
  return out
}

const good = readFileSync(join(root, 'data/distillation/cv-packet-distilled.txt'), 'utf8')
const bad = utf16PairMojibake(good.slice(0, 400))

let failed = 0
function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed++
  } else {
    console.log('ok:', msg)
  }
}

assert(typeof isPlausibleCvPacket === 'function', 'shipped isPlausibleCvPacket export')
assert(typeof sanitizeCvPacket === 'function', 'shipped sanitizeCvPacket export')
assert(isPlausibleCvPacket(good), 'real distilled packet is plausible')
assert(!isPlausibleCvPacket(bad), 'UTF-16 pair mojibake is rejected')
assert(!isPlausibleCvPacket('刷搏組啟愓愁慮桴'.repeat(20)), 'dense CJK is rejected')
assert(!isPlausibleCvPacket('short'), 'too short is rejected')
assert(!isPlausibleCvPacket(null), 'null rejected')

const s1 = sanitizeCvPacket(bad, good)
assert(s1.wasCorrupted && s1.source === 'fallback' && s1.value === good, 'sanitize recovers to fallback')
const s2 = sanitizeCvPacket(good, 'FALLBACK')
assert(!s2.wasCorrupted && s2.source === 'candidate' && s2.value === good, 'sanitize keeps good candidate')
assert(/[\u4e00-\u9fff]/.test(bad), 'mojibake contains CJK units')

if (failed) {
  console.error(`\n${failed} assertion(s) failed`)
  process.exit(1)
}
console.log('\nall cv-packet checks passed (shipped module)')
