#!/usr/bin/env node
/**
 * Honest gate: imports shipped quest.ts (no reimplementation).
 * Run: node --experimental-strip-types src/core/domain/quest.verify.mjs
 *   or: node src/core/domain/quest.verify.mjs  (this wrapper loads .ts)
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
    join(here, 'quest.verify.runner.mjs'),
  ],
  { encoding: 'utf8', cwd: root, env: process.env },
)
process.stdout.write(child.stdout || '')
process.stderr.write(child.stderr || '')
process.exit(child.status ?? 1)
