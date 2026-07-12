#!/usr/bin/env node
/**
 * Honest gate: imports shipped cv-packet.ts (no reimplementation).
 * Run: node --experimental-strip-types src/core/domain/cv-packet.verify.mjs
 *   or: node src/core/domain/cv-packet.verify.mjs  (this wrapper loads .ts)
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '../../..')

// Prefer strip-types so we load the real .ts module under test.
const child = spawnSync(
  process.execPath,
  [
    '--experimental-strip-types',
    '--no-warnings',
    join(here, 'cv-packet.verify.runner.mjs'),
  ],
  { encoding: 'utf8', cwd: root, env: process.env },
)
process.stdout.write(child.stdout || '')
process.stderr.write(child.stderr || '')
process.exit(child.status ?? 1)
