#!/usr/bin/env node
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const here = dirname(fileURLToPath(import.meta.url))
const child = spawnSync(
  process.execPath,
  ['--experimental-strip-types', '--no-warnings', join(here, 'opportunity-pipeline.verify.runner.mjs')],
  { encoding: 'utf8', cwd: join(here, '../../..') },
)
process.stdout.write(child.stdout || '')
process.stderr.write(child.stderr || '')
process.exit(child.status ?? 1)
