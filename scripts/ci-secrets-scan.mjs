#!/usr/bin/env node
/**
 * Fail on credential-shaped strings in tracked text.
 * Shape checks only — no live values belong in this file.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
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

const RULES = [
  { name: 'github-pat', re: /ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}/ },
  { name: 'aws-access-key', re: /AKIA[0-9A-Z]{16}/ },
  { name: 'private-key', re: /-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/ },
  { name: 'slack-token', re: /xox[baprs]-[A-Za-z0-9-]{10,}/ },
  { name: 'provider-key', re: /(?:sk|xai)-[A-Za-z0-9]{24,}/ },
  { name: 'bearer', re: /Bearer [A-Za-z0-9\-._~+/]{32,}/ },
]

const listed = spawnSync('git', ['ls-files', '-z', '-c', '-o', '--exclude-standard'], { cwd: root, encoding: 'utf8' })
if (listed.status !== 0) {
  console.error(listed.stderr || 'git ls-files failed')
  process.exit(listed.status ?? 1)
}

const findings = []
for (const rel of listed.stdout.split('\0').filter(Boolean)) {
  const dot = rel.lastIndexOf('.')
  const ext = dot >= 0 ? rel.slice(dot) : ''
  if (!TEXT_EXT.has(ext)) continue
  if (rel === 'pnpm-lock.yaml') continue
  let text
  try {
    text = readFileSync(join(root, rel), 'utf8')
  } catch {
    continue
  }
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    for (const rule of RULES) {
      if (rule.re.test(lines[i])) {
        findings.push(`${rel}:${i + 1} ${rule.name}`)
      }
    }
  }
}

console.log('=== ci-secrets-scan ===')
if (findings.length) {
  for (const finding of findings) console.error('FAIL', finding)
  process.exit(1)
}
console.log('ok')
