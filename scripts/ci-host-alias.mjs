#!/usr/bin/env node
/**
 * Fail when tracked text names a private host, an OS home directory,
 * a Tailscale CGNAT address, or a VNC login.
 * Public aliases: laptop-1, laptop-2, mac-mini.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const HOME_ALLOW = new Set(['user', 'username', 'ubuntu', 'runner'])
const TEXT_EXT = new Set([
  '.md',
  '.mjs',
  '.js',
  '.cjs',
  '.ts',
  '.tsx',
  '.rs',
  '.json',
  '.yml',
  '.yaml',
  '.sh',
  '.toml',
  '.txt',
  '.html',
  '.css',
])

/** Split so this file does not itself contain a live hostname. */
const PRIVATE_HOSTS = ['mza' + 'pan']

const listed = spawnSync('git', ['ls-files', '-z', '-c', '-o', '--exclude-standard'], { cwd: root, encoding: 'utf8' })
if (listed.status !== 0) {
  console.error(listed.stderr || 'git ls-files failed')
  process.exit(listed.status ?? 1)
}

const files = listed.stdout.split('\0').filter(Boolean)
const findings = []

function consider(path, lineNo, rule, excerpt) {
  findings.push(`${path}:${lineNo} ${rule}: ${excerpt.trim().slice(0, 160)}`)
}

for (const rel of files) {
  const dot = rel.lastIndexOf('.')
  const ext = dot >= 0 ? rel.slice(dot) : ''
  if (!TEXT_EXT.has(ext)) continue
  if (rel === 'scripts/ci-host-alias.mjs') continue
  let text
  try {
    text = readFileSync(join(root, rel), 'utf8')
  } catch {
    continue
  }
  if (text.includes('\0')) continue
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const lower = line.toLowerCase()
    for (const host of PRIVATE_HOSTS) {
      if (lower.includes(host)) consider(rel, i + 1, 'private-host', line)
    }
    for (const match of line.matchAll(/\/(?:home|Users)\/([A-Za-z0-9._-]+)/g)) {
      const name = match[1]
      if (!HOME_ALLOW.has(name)) consider(rel, i + 1, 'home-dir', line)
    }
    for (const match of line.matchAll(/\b100\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\b/g)) {
      const second = Number(match[1])
      if (second >= 64 && second <= 127) consider(rel, i + 1, 'tailscale-cgnat', line)
    }
    if (/vnc:\/\/[^\s]*@/i.test(line) || /\bvnc(?:viewer|passwd)\b[^\n]{0,80}\b(?:pass|login|user)\b/i.test(line)) {
      consider(rel, i + 1, 'vnc-login', line)
    }
  }
}

console.log('=== ci-host-alias ===')
if (findings.length) {
  for (const finding of findings) console.error('FAIL', finding)
  process.exit(1)
}
console.log(`ok (${files.length} tracked paths)`)
