#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const script = join(root, 'scripts/area-map.mjs')
const failures = []

function must(ok, message) {
  if (!ok) failures.push(message)
}

const AREA_IDS = [
  'shell',
  'runtime',
  'bridge',
  'discover',
  'hunt',
  'xplore',
  'pipeline',
  'quest',
  'credentials',
  'cv-renderer',
  'store',
  'packs',
  'ingest',
  'network',
  'hire-board',
  'profile-data',
  'ops',
  'docs',
]

function run(config, files) {
  const dir = mkdtempSync(join(tmpdir(), 'area-map-'))
  const configPath = join(dir, 'areas.json')
  const listPath = join(dir, 'files.txt')
  writeFileSync(configPath, JSON.stringify(config))
  writeFileSync(listPath, `${files.join('\n')}\n`)
  const child = spawnSync(process.execPath, [script, '--config', configPath, '--list', listPath], {
    cwd: root,
    encoding: 'utf8',
  })
  rmSync(dir, { recursive: true, force: true })
  return `${child.stdout ?? ''}${child.stderr ?? ''}` + `\nexit:${child.status}`
}

const single = {
  areas: [
    { id: 'shell', include: ['src/main.tsx', 'src/app/**', 'src/lib/*'] },
    { id: 'docs', include: ['**/*.md'], exclude: ['data/**'] },
  ],
}

const clean = run(single, ['src/main.tsx', 'src/app/nested/finder-app.tsx', 'src/lib/cn.ts', 'README.md'])
must(clean.endsWith('exit:0'), `unique map should pass\n${clean}`)
must(!clean.includes('unmapped'), `unique map listed a gap\n${clean}`)
must(!clean.includes('double-mapped'), `unique map listed a double\n${clean}`)

const star = run(
  { areas: [{ id: 'shell', include: ['src/app/*'] }] },
  ['src/app/finder-app.tsx', 'src/app/nested/other.tsx'],
)
must(star.includes('unmapped src/app/nested/other.tsx'), `star crossed a slash\n${star}`)
must(!star.includes('unmapped src/app/finder-app.tsx'), `star missed a sibling\n${star}`)
must(star.endsWith('exit:1'), `star case should fail\n${star}`)

const gaps = run(single, ['src/main.tsx', 'src/orphan.ts', 'src/also-missing.ts'])
must(gaps.includes('unmapped src/orphan.ts'), `missing orphan\n${gaps}`)
must(gaps.includes('unmapped src/also-missing.ts'), `missing second file\n${gaps}`)
must(gaps.endsWith('exit:1'), `unmapped should fail\n${gaps}`)

const overlap = run(
  {
    areas: [
      { id: 'runtime', include: ['src/main.tsx'] },
      { id: 'shell', include: ['src/main.tsx', 'src/**'] },
    ],
  },
  ['src/main.tsx'],
)
must(overlap.includes('double-mapped src/main.tsx runtime,shell'), `double map text\n${overlap}`)
must(overlap.endsWith('exit:1'), `double map should fail\n${overlap}`)

const sameArea = run(
  { areas: [{ id: 'shell', include: ['src/main.tsx', 'src/**'] }] },
  ['src/main.tsx'],
)
must(sameArea.endsWith('exit:0'), `two includes in one area\n${sameArea}`)

const excluded = run(
  {
    areas: [
      { id: 'docs', include: ['**/*.md'], exclude: ['data/**', 'vendor/**'] },
      { id: 'network', include: ['data/network-csv.md'] },
    ],
  },
  ['data/network-csv.md', 'README.md', 'vendor/kanithanj-cv/README.md'],
)
must(excluded.includes('unmapped vendor/kanithanj-cv/README.md'), `exclude left vendor claimed\n${excluded}`)
must(!excluded.includes('double-mapped'), `exclude still doubled\n${excluded}`)
must(!excluded.includes('unmapped data/network-csv.md'), `network file unmapped\n${excluded}`)
must(!excluded.includes('unmapped README.md'), `root markdown unmapped\n${excluded}`)

const repo = spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8' })
const repoOut = `${repo.stdout ?? ''}${repo.stderr ?? ''}`
const listed = spawnSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
must(listed.status === 0, 'git ls-files')
const tracked = listed.stdout.split('\0').filter(Boolean)
must(repo.status === 0, `repo map failed\n${repoOut}`)
must(repo.stdout.trim() === `ok ${tracked.length}`, `repo count\n${repo.stdout}`)
must((repo.stderr ?? '') === '', `repo stderr\n${repo.stderr}`)

let config = { areas: [] }
let doc = ''
try {
  config = JSON.parse(readFileSync(join(root, 'docs/ops/areas.json'), 'utf8'))
} catch (error) {
  must(false, `areas.json ${error.message}`)
}
try {
  doc = readFileSync(join(root, 'docs/ops/AREAS.md'), 'utf8')
} catch (error) {
  must(false, `AREAS.md ${error.message}`)
}
const ids = config.areas.map((area) => area.id)
must(JSON.stringify([...ids].sort()) === JSON.stringify([...AREA_IDS].sort()), `area ids ${ids.join(',')}`)
for (const area of config.areas) {
  must(doc.includes(area.id), `AREAS.md names ${area.id}`)
  for (const pattern of area.include) must(doc.includes(pattern), `AREAS.md lists ${pattern}`)
  for (const pattern of area.exclude ?? []) must(doc.includes(pattern), `AREAS.md lists exclude ${pattern}`)
}
must(doc.includes('```mermaid'), 'mermaid fence')
must(doc.includes('hire_board["hire-board"]'), 'hire-board node')
must(doc.includes('cv_renderer["cv-renderer"]'), 'cv-renderer node')
must(doc.includes('profile_data["profile-data"]'), 'profile-data node')
must(doc.includes('hubs <-->|"UI kit, messages, IPC"| screens'), 'folded hub edge')
must(doc.includes('1,500+'), 'nightly line rule')
must(doc.includes('Monday 03:30'), 'weekly clock')
must(doc.includes('02:30'), 'nightly clock')
must(doc.includes('04:30'), 'monthly clock')
must(doc.includes('laptop-1'), 'snapshot host alias')
must(/^- \[ \] TODO: script that rebuilds the area graph/m.test(doc), 'churn rebuild TODO')

let findings = ''
try {
  findings = readFileSync(join(root, 'docs/ops/FINDINGS.md'), 'utf8')
} catch (error) {
  must(false, `FINDINGS.md ${error.message}`)
}
must(
  findings.includes('| Date (UTC) | Finding | Area | Kind | Cluster | Decision | Status |'),
  'findings columns',
)
must(findings.includes('fix now'), 'decision fix now')
must(findings.includes('batch'), 'decision batch')
must(findings.includes("won't fix"), 'decision wont fix')
must(findings.includes('ask owner'), 'decision ask owner')
must(findings.includes('open'), 'status open')
must(findings.includes('in PR'), 'status in PR')
must(findings.includes('fixed'), 'status fixed')
must(findings.includes('closed'), 'status closed')
must(!/^\| 20/m.test(findings), 'findings log has a row')

if (failures.length) {
  for (const failure of failures) console.error(`FAIL ${failure}`)
  process.exit(1)
}
console.log('ok')
