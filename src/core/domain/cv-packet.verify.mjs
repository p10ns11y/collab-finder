/**
 * Node verify for cv-packet pure helpers (no test runner required).
 * Run: node src/core/domain/cv-packet.verify.mjs
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

// Inline the pure functions (mirror of cv-packet.ts) so this runs without a TS loader.
const CJK_RE = /[\u4e00-\u9fff]/g
const PU_RE = /[\ue000-\uf8ff]/
const ANCHOR_RE = /PROFILE|Peramanathan|AGENT CONTEXT|CORE IDENTITY|Senior Software Engineer/i

function isPlausibleCvPacket(s) {
  if (s == null) return false
  const t = s.trim()
  if (t.length < 40) return false
  if (PU_RE.test(t)) return false
  const cjk = (t.match(CJK_RE) || []).length
  if (cjk / t.length > 0.12) return false
  if (ANCHOR_RE.test(t)) return true
  const asciiLetters = (t.match(/[A-Za-z]/g) || []).length
  return asciiLetters / t.length >= 0.45
}

function sanitizeCvPacket(candidate, fallback) {
  if (isPlausibleCvPacket(candidate)) {
    return { value: candidate, wasCorrupted: false, source: 'candidate' }
  }
  const wasCorrupted = candidate != null && String(candidate).trim().length > 0
  return { value: fallback, wasCorrupted, source: 'fallback' }
}

function utf16PairMojibake(english) {
  const b = Buffer.from(english, 'utf8')
  let out = ''
  for (let i = 0; i + 1 < b.length; i += 2) {
    out += String.fromCharCode(b[i] | (b[i + 1] << 8))
  }
  return out
}

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')
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

assert(isPlausibleCvPacket(good), 'real distilled packet is plausible')
assert(!isPlausibleCvPacket(bad), 'UTF-16 pair mojibake is rejected')
assert(!isPlausibleCvPacket('刷搏組啟愓愁慮桴'.repeat(20)), 'dense CJK is rejected')
assert(!isPlausibleCvPacket('short'), 'too short is rejected')
assert(!isPlausibleCvPacket(null), 'null rejected')

const s1 = sanitizeCvPacket(bad, good)
assert(s1.wasCorrupted && s1.source === 'fallback' && s1.value === good, 'sanitize recovers to fallback')
const s2 = sanitizeCvPacket(good, 'FALLBACK')
assert(!s2.wasCorrupted && s2.source === 'candidate' && s2.value === good, 'sanitize keeps good candidate')

// Mid-string marker from real mojibake of "nathan" (na/th → 慮/桴)
assert(bad.includes('慮') || bad.includes('桴') || /[\u4e00-\u9fff]/.test(bad), 'mojibake contains CJK units')

if (failed) {
  console.error(`\n${failed} assertion(s) failed`)
  process.exit(1)
}
console.log('\nall cv-packet checks passed')
