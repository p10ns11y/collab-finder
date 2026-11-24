import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { scanDir } from './ci-client-leak.mjs'

const script = join(dirname(fileURLToPath(import.meta.url)), 'ci-client-leak.mjs')

function fakeBuild(extra = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'client-leak-'))
  const files = {
    'index.html': '<!doctype html><script type="module" src="/assets/index-abc.js"></script>',
    'assets/index-abc.js': 'const e={firm:"Northwind Labs",start:1};export{e as default};',
    'assets/index-abc.js.map': '{"version":3,"sources":["../src/main.tsx"],"mappings":"AAAA"}',
    'sw.js': 'self.addEventListener("fetch",()=>{});',
    'manifest.json': '{"name":"demo"}',
    ...extra,
  }
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true })
    writeFileSync(join(dir, rel), text)
  }
  return dir
}

const run = (dir) => spawnSync(process.execPath, [script, dir], { encoding: 'utf8' })

test('clean build passes', () => {
  const dir = fakeBuild()
  assert.deepEqual(scanDir(dir), [])
  assert.equal(run(dir).status, 0)
})

test('STANDING_ANSWERS identifier fails', () => {
  const dir = fakeBuild({ 'assets/vendor-def.js': 'const STANDING_ANSWERS={};export{STANDING_ANSWERS};' })
  assert.match(scanDir(dir).map((f) => f.marker).join('\n'), /STANDING_ANSWERS identifier/)
  assert.equal(run(dir).status, 1)
})

test('object with schema keys fails', () => {
  const dir = fakeBuild({
    'assets/answers-ghi.js': 'const a={office_days_ok:"x",filler_policy:"x",self_ratings:{x:"x"},relocation:"x"};',
  })
  assert.match(scanDir(dir).map((f) => f.marker).join('\n'), /schema keys/)
  assert.equal(run(dir).status, 1)
})

test('schema keys quoted inside a source map fail', () => {
  const dir = fakeBuild({
    'assets/answers-jkl.js.map': '{"sourcesContent":["{\\"pack_defaults\\": \\"x\\", \\"start_date\\": \\"x\\", \\"flag_reviewed\\": true}"]}',
  })
  assert.match(scanDir(dir).map((f) => f.marker).join('\n'), /schema keys/)
})

test('two schema keys alone stay under the threshold', () => {
  const dir = fakeBuild({ 'assets/form-mno.js': 'const f={relocation:"x",start_date:"x"};' })
  assert.deepEqual(scanDir(dir), [])
})

test('standing-answers.local.json reference fails', () => {
  const dir = fakeBuild({ 'sw.js': 'const precache=["/index.html","/standing-answers.local.json"];' })
  assert.match(scanDir(dir).map((f) => f.marker).join('\n'), /standing-answers path/)
  assert.equal(run(dir).status, 1)
})

test('missing build dir fails', () => {
  assert.equal(run(join(tmpdir(), 'client-leak-missing-dir')).status, 1)
})
