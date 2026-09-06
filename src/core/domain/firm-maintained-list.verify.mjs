#!/usr/bin/env node
/**
 * Preferences Mission firm list — TS helpers + IPC/universe contract.
 * Run: pnpm verify  (via scripts/run-verify.mjs)
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '../../..')

const child = spawnSync(
  process.execPath,
  [
    '--experimental-strip-types',
    '--no-warnings',
    join(here, 'firm-maintained-list.verify.runner.mjs'),
  ],
  { encoding: 'utf8', cwd: root, env: process.env },
)
process.stdout.write(child.stdout || '')
process.stderr.write(child.stderr || '')
process.exit(child.status ?? 1)
