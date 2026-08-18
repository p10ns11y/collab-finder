#!/usr/bin/env node
/**
 * Run all domain verify runners (pure TS machines + wiring gates).
 * Entry: *.verify.mjs wrappers, or *.verify.runner.mjs when no wrapper exists.
 */
import { readdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const srcRoot = join(root, 'src')

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    const st = statSync(path)
    if (st.isDirectory()) {
      walk(path, out)
      continue
    }
    if (name.endsWith('.verify.mjs') && !name.endsWith('.verify.runner.mjs')) {
      out.push(path)
    }
  }
  return out
}

function orphanRunners(wrappedRunners, allRunners) {
  const wrapped = new Set(
    wrappedRunners.map((p) => p.replace(/\.verify\.mjs$/, '.verify.runner.mjs')),
  )
  return allRunners.filter((p) => !wrapped.has(p))
}

function allRunners(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    const st = statSync(path)
    if (st.isDirectory()) {
      allRunners(path, out)
      continue
    }
    if (name.endsWith('.verify.runner.mjs')) {
      out.push(path)
    }
  }
  return out
}

const wrappers = walk(srcRoot).sort()
const runners = orphanRunners(wrappers, allRunners(srcRoot)).sort()
const targets = [...wrappers, ...runners]

if (targets.length === 0) {
  console.error('No verify targets found under src/')
  process.exit(1)
}

let failed = 0
for (const target of targets) {
  const label = relative(root, target)
  process.stdout.write(`\n== verify ${label}\n`)
  const child = spawnSync(process.execPath, [target], {
    cwd: root,
    encoding: 'utf8',
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (child.stdout) process.stdout.write(child.stdout)
  if (child.stderr) process.stderr.write(child.stderr)
  if ((child.status ?? 1) !== 0) {
    failed += 1
    console.error(`FAIL ${label} (exit ${child.status})`)
  }
}

console.log(`\n=== run-verify: ${targets.length - failed}/${targets.length} passed ===`)
process.exit(failed === 0 ? 0 : 1)
