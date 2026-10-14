#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function argValue(argv, index) {
  const value = argv[index + 1]
  if (!value || value.startsWith('--')) {
    console.error(`missing value for ${argv[index]}`)
    process.exit(2)
  }
  return value
}

function parseArgs(argv) {
  const out = { config: join(root, 'docs/ops/areas.json'), list: null }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--config') {
      out.config = resolve(argValue(argv, i))
      i += 1
    } else if (arg === '--list') {
      out.list = resolve(argValue(argv, i))
      i += 1
    } else {
      console.error(`unknown arg ${arg}`)
      process.exit(2)
    }
  }
  return out
}

function escapeRegExp(value) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&')
}

function matchSegment(segment, pattern) {
  const body = pattern.split('*').map(escapeRegExp).join('[^/]*')
  return new RegExp(`^${body}$`).test(segment)
}

function matchParts(pathParts, patternParts) {
  if (patternParts.length === 0) return pathParts.length === 0
  if (patternParts[0] === '**') {
    if (matchParts(pathParts, patternParts.slice(1))) return true
    if (pathParts.length === 0) return false
    return matchParts(pathParts.slice(1), patternParts)
  }
  if (pathParts.length === 0) return false
  if (!matchSegment(pathParts[0], patternParts[0])) return false
  return matchParts(pathParts.slice(1), patternParts.slice(1))
}

function matchGlob(filePath, pattern) {
  return matchParts(filePath.split('/'), pattern.split('/'))
}

function loadConfig(path) {
  let raw
  try {
    raw = readFileSync(path, 'utf8')
  } catch {
    console.error(`missing config ${path}`)
    process.exit(1)
  }
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    console.error(`invalid config ${path}`)
    process.exit(1)
  }
  if (!parsed || !Array.isArray(parsed.areas) || parsed.areas.length === 0) {
    console.error('config areas must be a non-empty array')
    process.exit(1)
  }
  const seen = new Set()
  for (const area of parsed.areas) {
    if (!area || typeof area.id !== 'string' || area.id === '') {
      console.error('area id missing')
      process.exit(1)
    }
    if (seen.has(area.id)) {
      console.error(`duplicate area ${area.id}`)
      process.exit(1)
    }
    seen.add(area.id)
    if (!Array.isArray(area.include) || area.include.length === 0) {
      console.error(`area ${area.id} has no include`)
      process.exit(1)
    }
    if (area.exclude != null && !Array.isArray(area.exclude)) {
      console.error(`area ${area.id} exclude must be an array`)
      process.exit(1)
    }
  }
  return parsed.areas
}

function trackedFiles() {
  const listed = spawnSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
  if (listed.status !== 0) {
    console.error(listed.stderr || 'git ls-files failed')
    process.exit(listed.status || 1)
  }
  return listed.stdout.split('\0').filter(Boolean)
}

function listedFiles(path) {
  return readFileSync(path, 'utf8')
    .split('\n')
    .map((line) => line.replace(/\r$/, ''))
    .filter((line) => line !== '')
}

function areasFor(filePath, areas) {
  const hits = []
  for (const area of areas) {
    const excluded = (area.exclude ?? []).some((pattern) => matchGlob(filePath, pattern))
    if (excluded) continue
    if (area.include.some((pattern) => matchGlob(filePath, pattern))) hits.push(area.id)
  }
  return hits.sort((left, right) => left.localeCompare(right))
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const areas = loadConfig(args.config)
  const files = args.list ? listedFiles(args.list) : trackedFiles()
  const unmapped = []
  const doubled = []
  for (const filePath of files) {
    const hits = areasFor(filePath, areas)
    if (hits.length === 0) unmapped.push(filePath)
    else if (hits.length > 1) doubled.push(`${filePath} ${hits.join(',')}`)
  }
  unmapped.sort()
  doubled.sort()
  if (unmapped.length || doubled.length) {
    for (const filePath of unmapped) console.error(`unmapped ${filePath}`)
    for (const line of doubled) console.error(`double-mapped ${line}`)
    process.exit(1)
  }
  console.log(`ok ${files.length}`)
}

main()
