#!/usr/bin/env node
/**
 * pinact-style: GitHub Actions `uses:` must be a full commit SHA, not a floating tag.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const workflowDir = join(root, '.github/workflows')
const sha = /^[0-9a-f]{40}$/i
const findings = []

for (const name of readdirSync(workflowDir)) {
  if (!name.endsWith('.yml') && !name.endsWith('.yaml')) continue
  const rel = `.github/workflows/${name}`
  const lines = readFileSync(join(workflowDir, name), 'utf8').split('\n')
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^\s*-?\s*uses:\s*(\S+)/)
    if (!match) continue
    const spec = match[1]
    if (spec.startsWith('./') || spec.startsWith('docker://')) continue
    const at = spec.lastIndexOf('@')
    if (at < 0) {
      findings.push(`${rel}:${i + 1} unpinned action: ${spec}`)
      continue
    }
    const ref = spec.slice(at + 1)
    if (!sha.test(ref)) {
      findings.push(`${rel}:${i + 1} floating action ref @${ref}: ${spec}`)
    }
  }
}

console.log('=== ci-action-pin ===')
if (findings.length) {
  for (const finding of findings) console.error('FAIL', finding)
  process.exit(1)
}
console.log('ok')
