#!/usr/bin/env node
/**
 * Fail when tracked text holds private data: phone numbers, email addresses,
 * Windows home paths, Swedish personnummer, or debt amounts.
 * Unix home paths (/home/<name>, /Users/<name>) are already checked by ci-host-alias.mjs.
 * PDFs are scanned through pdftotext when it is installed; skipped otherwise.
 * Prints file:line and category only, never the matched value.
 * Tests: node --test scripts/ci-private-data.test.mjs
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Allowed email domains (public placeholders only), each with a reason:
 * - example.com / .org / .net: reserved for documentation (RFC 2606).
 * - users.noreply.github.com: GitHub commit no-reply addresses.
 * - acme.com, b.com: one- and two-letter synthetic addresses in verify runner fixtures.
 * Reserved test TLDs (.test, .example, .invalid, .localhost) are always allowed.
 */
const EMAIL_ALLOW_DOMAINS = ['example.com', 'example.org', 'example.net', 'users.noreply.github.com', 'acme.com', 'b.com']
const EMAIL_ALLOW_TLDS = /\.(test|example|invalid|localhost)$/i
/** Asset names such as icon@2x.png look like addresses; they are not. */
const ASSET_TLDS = /\.(png|jpe?g|svg|webp|gif|ico)$/i
/** Placeholder numbers: ending in a run of zeros, or holding the 1234567 counting run. */
function placeholderPhone(text) {
  const digits = text.replace(/\D/g, '')
  return /0{5,}$/.test(digits) || digits.includes('1234567')
}
const EMAIL_ALLOW_LOCAL = /^(no-?reply|noreply\+.*)$/i
/** Placeholder user names that are not people. */
const HOME_ALLOW = new Set(['user', 'username', 'runner', 'public', 'default'])
/**
 * Tracked files skipped on purpose, each with a reason. Keep this short.
 * scripts/ci-private-data.test.mjs builds fake values at runtime only, but is skipped to keep the scan simple.
 */
const SKIP_FILES = new Set(['scripts/ci-private-data.test.mjs'])

const EMAIL = /[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+\.)+[A-Za-z]{2,}/g
const PHONES = [
  /(?<![\w+])(?:\+|00)46[\s-]?\(?0?\)?[\s-]?\d{1,3}(?:[\s-]?\d{2,4}){2,3}(?!\d)/g,
  /(?<![\w+.-])\+(?:[1-9]\d{0,2})[\s-]\(?\d{2,4}\)?[\s-]\d{3,4}[\s-]?\d{2,4}(?!\d)/g,
  /(?<![\w.-])07[02369][\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}(?![\w.-])/g,
]
const PNR = /(?<![\w.-])(?:19|20)?(\d{2})(\d{2})(\d{2})[-+](\d{4})(?![\w-])/g
const WIN_HOME = /[A-Za-z]:\\{1,2}Users\\{1,2}([A-Za-z0-9._-]+)/gi
const DEBT_WORD = /\b(skuld\w*|debt\w*|kronofogden\w*|inkasso\w*|owe|owed|owes|owing)\b/i
const MONEY = /(\d[\d .,]{1,}\d\s?(?:kr|sek|kronor)\b)|(\b(?:sek|kr)\s?\d[\d .,]*\d)/i

export function luhnOk(digits) {
  let sum = 0
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[i]) * (i % 2 === 0 ? 2 : 1)
    sum += d > 9 ? d - 9 : d
  }
  return sum % 10 === 0
}

function emailAllowed(addr) {
  const [local, domain] = addr.toLowerCase().split('@')
  if (EMAIL_ALLOW_LOCAL.test(local) || EMAIL_ALLOW_TLDS.test(domain) || ASSET_TLDS.test(domain)) return true
  return EMAIL_ALLOW_DOMAINS.some((d) => domain === d || domain.endsWith('.' + d))
}

function plausibleDate(mm, dd) {
  const m = Number(mm)
  const d = Number(dd)
  const day = d > 60 ? d - 60 : d // samordningsnummer adds 60 to the day
  return m >= 1 && m <= 12 && day >= 1 && day <= 31
}

function hasEmail(line) {
  return [...line.matchAll(EMAIL)].some((m) => !emailAllowed(m[0]))
}

function hasPhone(line) {
  return PHONES.some((re) => [...line.matchAll(re)].some((m) => !placeholderPhone(m[0])))
}

function hasPnr(line) {
  return [...line.matchAll(PNR)].some(([, yy, mm, dd, tail]) => plausibleDate(mm, dd) && luhnOk(yy + mm + dd + tail))
}

function hasWinHome(line) {
  return [...line.matchAll(WIN_HOME)].some((m) => !HOME_ALLOW.has(m[1].toLowerCase()))
}

function hasDebt(line) {
  return DEBT_WORD.test(line) && MONEY.test(line)
}

const DETECTORS = [
  ['email', hasEmail],
  ['phone', hasPhone],
  ['personnummer', hasPnr],
  ['home-path', hasWinHome],
  ['debt-amount', hasDebt],
]

/** Returns [{ line, category }] — never the matched text. */
export function scanText(text) {
  const findings = []
  text.split('\n').forEach((line, i) => {
    for (const [category, hit] of DETECTORS) {
      if (hit(line)) findings.push({ line: i + 1, category })
    }
  })
  return findings
}

function trackedFiles(root) {
  const listed = spawnSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
  if (listed.status !== 0) throw new Error(listed.stderr || 'git ls-files failed')
  return listed.stdout.split('\0').filter((f) => f && !SKIP_FILES.has(f))
}

function readText(path) {
  try {
    const text = readFileSync(path, 'utf8')
    return text.includes('\0') ? null : text
  } catch {
    return null
  }
}

/** Extracted PDF text via pdftotext; null when the tool is missing (scan skips PDFs then). */
export function pdfText(path, run = spawnSync) {
  const res = run('pdftotext', ['-q', path, '-'], { encoding: 'utf8' })
  if (res.error || res.status !== 0) return null
  return res.stdout
}

function fileText(path) {
  return path.toLowerCase().endsWith('.pdf') ? pdfText(path) : readText(path)
}

function main() {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const out = []
  for (const rel of trackedFiles(root)) {
    const text = fileText(join(root, rel))
    if (text === null) continue
    for (const f of scanText(text)) out.push(`${rel}:${f.line} ${f.category}`)
  }
  if (out.length) {
    console.error(`ci-private-data: ${out.length} finding(s) (values not printed):`)
    for (const line of out) console.error(`  ${line}`)
    process.exit(1)
  }
  console.log('== OK: no private data in tracked files')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
