#!/usr/bin/env node
/**
 * Honest gate: imports shipped safe-invoke.ts with no Tauri runtime.
 * Run: node src/adapters/tauri/safe-invoke.verify.mjs
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '../../../../../')
const child = spawnSync(
  process.execPath,
  ['--experimental-strip-types', '--no-warnings', join(here, 'safe-invoke.verify.runner.mjs')],
  { encoding: 'utf8', cwd: root, env: process.env },
)
process.stdout.write(child.stdout || '')
process.stderr.write(child.stderr || '')
process.exit(child.status ?? 1)
