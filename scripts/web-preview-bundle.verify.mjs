#!/usr/bin/env node
/**
 * Honest gate: default and Tauri 2 desktop builds keep real operator files;
 * only an explicit web-preview build swaps in the demo fixtures.
 * Run: node scripts/web-preview-bundle.verify.mjs
 */
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const desktop = join(root, 'apps/desktop')
const viteBin = join(desktop, 'node_modules/vite/bin/vite.js')
const fixtureMarks = ['Northwind Labs', 'Contoso Robotics']
const realFiles = [
  'data/distillation/curation/profile-and-strategy.md',
  'data/distillation/curation/candidate-constraints-compact.txt',
  'data/distillation/public-projects-focused-flatten.json',
]

let failed = 0
function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed += 1
  } else {
    console.log('ok:', msg)
  }
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path, out)
    else out.push(path)
  }
  return out
}

function bundleText(dir) {
  return walk(dir)
    .filter((p) => /\.(js|css|html|json|txt)$/.test(p))
    .map((p) => readFileSync(p, 'utf8'))
    .join('\n')
}

function distinctiveRealNeedle(rel) {
  const real = readFileSync(join(root, rel), 'utf8')
  const fixtures = join(root, 'apps/desktop/src/web/fixtures')
  const fixtureText = readdirSync(fixtures)
    .map((name) => readFileSync(join(fixtures, name), 'utf8'))
    .join('\n')
  const skip = /Northwind|Contoso|Rivermark|web preview|example\.com/i
  const values = [...real.matchAll(/"([^"]{16,120})"/g)].map((m) => m[1])
  const hit = values.find((value) => !fixtureText.includes(value) && !skip.test(value))
  if (hit) return hit
  return real
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length >= 40 && !skip.test(line) && !fixtureText.includes(line))
}

function viteBuild(outDir, { env = {}, args = [] } = {}) {
  const child = spawnSync(process.execPath, [viteBin, 'build', '--outDir', outDir, '--emptyOutDir', ...args], {
    cwd: desktop,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  })
  if (child.status !== 0) {
    throw new Error(`vite build failed (${args.join(' ') || 'default'}): ${child.stderr || child.stdout}`)
  }
}

const realMarkers = realFiles.map((rel) => {
  const line = distinctiveRealNeedle(rel)
  if (!line) throw new Error(`no distinctive real line in ${rel}`)
  return { rel, line }
})

const work = mkdtempSync(join(tmpdir(), 'web-preview-bundle-'))
try {
  const defaultDir = join(work, 'default')
  const tauriDir = join(work, 'tauri')
  const previewDir = join(work, 'preview')

  viteBuild(defaultDir, { env: { WEB_PREVIEW: '', TAURI_ENV_PLATFORM: '', TAURI_PLATFORM: '' } })
  const defaultText = bundleText(defaultDir)
  for (const mark of fixtureMarks) {
    assert(!defaultText.includes(mark), `default build has no ${mark}`)
  }
  for (const { rel, line } of realMarkers) {
    assert(defaultText.includes(line), `default build includes real text from ${rel}`)
  }

  viteBuild(tauriDir, {
    env: { WEB_PREVIEW: '', TAURI_ENV_PLATFORM: 'linux', TAURI_PLATFORM: '' },
  })
  const tauriText = bundleText(tauriDir)
  for (const mark of fixtureMarks) {
    assert(!tauriText.includes(mark), `TAURI_ENV_PLATFORM build has no ${mark}`)
  }
  for (const { rel, line } of realMarkers) {
    assert(tauriText.includes(line), `TAURI_ENV_PLATFORM build includes real text from ${rel}`)
  }

  viteBuild(previewDir, { env: { WEB_PREVIEW: '' }, args: ['--mode', 'web-preview'] })
  const previewText = bundleText(previewDir)
  for (const mark of fixtureMarks) {
    assert(previewText.includes(mark), `web-preview build includes ${mark}`)
  }
  for (const { rel, line } of realMarkers) {
    assert(!previewText.includes(line), `web-preview build omits real text from ${rel}`)
  }
} catch (err) {
  assert(false, err instanceof Error ? err.message : String(err))
} finally {
  rmSync(work, { recursive: true, force: true })
}

if (failed > 0) process.exit(1)
console.log('web-preview-bundle: all checks passed')
