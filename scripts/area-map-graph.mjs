#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, posix } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const areasDoc = join(root, 'docs/ops/AREAS.md')
const configPath = join(root, 'docs/ops/areas.json')

const HUBS = new Set(['shell', 'runtime', 'bridge'])
const SCREENS = new Set([
  'discover',
  'hunt',
  'xplore',
  'pipeline',
  'quest',
  'credentials',
  'packs',
  'network',
  'hire-board',
])
const GROUPS = [
  ['hubs', 'Wiring hubs', ['shell', 'runtime', 'bridge']],
  [
    'screens',
    'Screen areas: wired through all three hubs',
    ['discover', 'hunt', 'xplore', 'pipeline', 'quest', 'credentials', 'packs', 'network', 'hire-board'],
  ],
  ['rustdata', 'Rust and data only: no hub imports', ['store', 'ingest', 'profile-data', 'cv-renderer']],
  ['alone', 'Isolated: no import edges', ['ops', 'docs']],
]
const DATABASE_FILES = ['src-tauri/src/db.rs']
const SYNC_FILES = [
  'src-tauri/src/pulse.rs',
  'scripts/backup-db.sh',
  'scripts/pulse-export.mjs',
  'scripts/pulse-import.mjs',
]
const BUILD_FILES = ['package.json', 'src-tauri/Cargo.toml', 'vite.config.ts']
const LOCKFILES = new Set(['pnpm-lock.yaml', 'src-tauri/Cargo.lock'])
const SOURCE_EXT = /\.(ts|tsx|mts|mjs|js|jsx)$/
const TS_EXT = ['.ts', '.tsx', '.mts', '.mjs', '.js', '.jsx', '.json', '.css', '.md', '.txt']

function parseArgs(argv) {
  const out = { check: false }
  for (const arg of argv) {
    if (arg === '--check') out.check = true
    else {
      console.error(`unknown arg ${arg}`)
      process.exit(2)
    }
  }
  return out
}

function git(args) {
  const result = spawnSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || 'git failed').trim()
    console.error(detail)
    process.exit(result.status || 1)
  }
  return result.stdout
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

function areasFor(filePath, areas) {
  const hits = []
  for (const area of areas) {
    const excluded = (area.exclude ?? []).some((pattern) => matchGlob(filePath, pattern))
    if (excluded) continue
    if (area.include.some((pattern) => matchGlob(filePath, pattern))) hits.push(area.id)
  }
  return hits.sort((left, right) => left.localeCompare(right))
}

function readText(rel) {
  return readFileSync(join(root, rel), 'utf8')
}

function fmt(value) {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

function utcDay(daysAgo) {
  const now = new Date()
  const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  return new Date(midnight - daysAgo * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function nodeId(area) {
  return area.replaceAll('-', '_')
}

function nodeDecl(area) {
  if (area.includes('-')) return `${nodeId(area)}["${area}"]`
  return area
}

function isFolded(left, right) {
  const leftHub = HUBS.has(left)
  const rightHub = HUBS.has(right)
  if (!leftHub && !rightHub) return false
  const leftSide = leftHub || SCREENS.has(left)
  const rightSide = rightHub || SCREENS.has(right)
  return leftSide && rightSide
}

function englishList(ids) {
  const quoted = ids.map((id) => `\`${id}\``)
  if (quoted.length <= 1) return quoted[0] ?? ''
  if (quoted.length === 2) return `${quoted[0]} and ${quoted[1]}`
  return `${quoted.slice(0, -1).join(', ')}, and ${quoted[quoted.length - 1]}`
}

function stripTsComments(src) {
  let out = ''
  let i = 0
  while (i < src.length) {
    const ch = src[i]
    const next = src[i + 1]
    if (ch === '/' && next === '/') {
      const nl = src.indexOf('\n', i)
      i = nl === -1 ? src.length : nl
      continue
    }
    if (ch === '/' && next === '*') {
      const end = src.indexOf('*/', i + 2)
      i = end === -1 ? src.length : end + 2
      continue
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch
      out += src[i]
      i += 1
      while (i < src.length) {
        if (src[i] === '\\') {
          out += src[i] + (src[i + 1] ?? '')
          i += 2
          continue
        }
        out += src[i]
        if (src[i] === quote) {
          i += 1
          break
        }
        i += 1
      }
      continue
    }
    out += ch
    i += 1
  }
  return out
}

function rustIdentChar(ch) {
  return ch != null && /[A-Za-z0-9_]/.test(ch)
}

function skipRustString(src, i) {
  if (rustIdentChar(src[i - 1])) return i
  let j = i
  if ((src[j] === 'b' || src[j] === 'c') && src[j + 1] === "'") return i
  if (src[j] === 'b' || src[j] === 'c') j += 1
  let hashes = 0
  if (src[j] === 'r') {
    j += 1
    while (src[j] === '#') {
      hashes += 1
      j += 1
    }
  } else if (j !== i && src[j] !== '"') return i
  if (src[j] !== '"') return i
  if (src[i] !== 'r' && src[j - 1] !== 'r' && hashes === 0 && src[i] !== '"' && src[i] !== 'b' && src[i] !== 'c') {
    return i
  }
  if (hashes === 0 && src[j] === '"' && src[i] !== 'r' && src[Math.max(i, j - 1)] !== 'r') {
    let k = j + 1
    while (k < src.length) {
      if (src[k] === '\\') {
        k += 2
        continue
      }
      if (src[k] === '"') return k + 1
      if (src[k] === '\n') return i
      k += 1
    }
    return src.length
  }
  const closer = `"${'#'.repeat(hashes)}`
  const end = src.indexOf(closer, j + 1)
  return end === -1 ? src.length : end + closer.length
}

function skipRustChar(src, i) {
  if (src[i] !== "'") return i
  if (src[i + 1] === '\\') {
    let j = i + 2
    if (src[j] === 'u' && src[j + 1] === '{') {
      const end = src.indexOf('}', j)
      j = end === -1 ? src.length : end + 1
    } else j += 1
    return src[j] === "'" ? j + 1 : i + 1
  }
  if (src[i + 2] === "'") return i + 3
  return i + 1
}

function stripRustComments(src) {
  let out = ''
  let i = 0
  while (i < src.length) {
    const stringEnd = skipRustString(src, i)
    if (stringEnd > i) {
      out += src.slice(i, stringEnd)
      i = stringEnd
      continue
    }
    if (src.startsWith('//', i)) {
      const nl = src.indexOf('\n', i)
      out += '\n'
      i = nl === -1 ? src.length : nl + 1
      continue
    }
    if (src.startsWith('/*', i)) {
      const end = src.indexOf('*/', i + 2)
      out += ' '
      i = end === -1 ? src.length : end + 2
      continue
    }
    if (src[i] === "'") {
      const charEnd = skipRustChar(src, i)
      out += src.slice(i, charEnd)
      i = charEnd
      continue
    }
    out += src[i]
    i += 1
  }
  return out
}

function stripRustStrings(src) {
  let out = ''
  let i = 0
  while (i < src.length) {
    const stringEnd = skipRustString(src, i)
    if (stringEnd > i) {
      out += ' '
      i = stringEnd
      continue
    }
    if (src[i] === "'") {
      const charEnd = skipRustChar(src, i)
      out += ' '
      i = charEnd
      continue
    }
    out += src[i]
    i += 1
  }
  return out
}

function loadAliases() {
  const raw = readText('tsconfig.json').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const parsed = JSON.parse(raw)
  const paths = parsed.compilerOptions?.paths ?? {}
  const aliases = []
  for (const [key, targets] of Object.entries(paths)) {
    if (!key.endsWith('/*') || !Array.isArray(targets) || !targets[0]?.endsWith('/*')) continue
    aliases.push({ prefix: key.slice(0, -1), dest: targets[0].slice(0, -1) })
  }
  aliases.sort((left, right) => right.prefix.length - left.prefix.length)
  return aliases
}

function resolveSpecifier(fromFile, spec, aliases, areaByPath) {
  let rel = null
  if (spec.startsWith('.')) {
    rel = posix.normalize(posix.join(posix.dirname(fromFile), spec))
  } else {
    for (const alias of aliases) {
      if (spec.startsWith(alias.prefix)) {
        rel = posix.normalize(alias.dest + spec.slice(alias.prefix.length))
        break
      }
    }
  }
  if (!rel) return { kind: 'external' }
  if (rel.startsWith('..')) return { kind: 'missing', spec }
  const candidates = [rel]
  if (rel.endsWith('.js')) {
    const stem = rel.slice(0, -3)
    candidates.push(`${stem}.ts`, `${stem}.tsx`)
  }
  for (const ext of TS_EXT) candidates.push(rel + ext)
  for (const ext of ['.ts', '.tsx', '.js', '.mjs']) candidates.push(`${rel}/index${ext}`)
  for (const candidate of candidates) {
    if (areaByPath.has(candidate)) return { kind: 'file', file: candidate }
  }
  return { kind: 'missing', spec }
}

function tsSpecifiers(src) {
  const specs = []
  let i = 0
  while (i < src.length) {
    const ch = src[i]
    if (ch === "'" || ch === '"' || ch === '`') {
      const quoteAt = i
      let value = ''
      i += 1
      while (i < src.length) {
        if (src[i] === '\\') {
          value += src[i + 1] ?? ''
          i += 2
          continue
        }
        if (src[i] === ch) break
        value += src[i]
        i += 1
      }
      const before = src.slice(Math.max(0, quoteAt - 48), quoteAt)
      if (/\b(?:from|import)\s*$/.test(before) || /\bimport\s*\(\s*$/.test(before)) {
        specs.push(value.split(/[?#]/)[0])
      }
      i += 1
      continue
    }
    i += 1
  }
  return specs
}

function moduleDir(file) {
  if (file.endsWith('/lib.rs') || file.endsWith('/main.rs') || file.endsWith('/mod.rs')) {
    return posix.dirname(file)
  }
  return file.slice(0, -3)
}

function declaredModules(src) {
  const names = []
  const re = /^[ \t]*(?:pub(?:\([^)\n]*\))?[ \t]+)?mod[ \t]+([A-Za-z_][A-Za-z0-9_]*)[ \t]*;/gm
  let match
  while ((match = re.exec(src))) names.push(match[1])
  return names
}

function childFile(parent, name, areaByPath) {
  const base = moduleDir(parent)
  for (const candidate of [`${base}/${name}.rs`, `${base}/${name}/mod.rs`]) {
    if (areaByPath.has(candidate)) return candidate
  }
  return null
}

function buildModuleTree(areaByPath) {
  const lib = 'src-tauri/src/lib.rs'
  const children = new Map()
  const libFiles = new Set()
  function walk(file) {
    if (children.has(file)) return
    libFiles.add(file)
    const map = {}
    for (const name of declaredModules(stripRustComments(readText(file)))) {
      const next = childFile(file, name, areaByPath)
      if (!next) continue
      map[name] = next
    }
    children.set(file, map)
    for (const next of Object.values(map)) walk(next)
  }
  walk(lib)
  return { children, libFiles }
}

function resolveRustModule(rootFile, segments, children) {
  let file = rootFile
  let consumed = 0
  for (const segment of segments) {
    const next = children.get(file)?.[segment]
    if (!next) break
    file = next
    consumed += 1
  }
  return consumed === 0 ? rootFile : file
}

function rustPaths(src) {
  const paths = []
  const re = /\b(crate|collab_finder_lib)::([A-Za-z_][A-Za-z0-9_]*(?:::[A-Za-z_][A-Za-z0-9_]*)*)/g
  let match
  while ((match = re.exec(src))) {
    paths.push({ crate: match[1] === 'collab_finder_lib', segments: match[2].split('::') })
  }
  return paths
}

function includePaths(file, src) {
  const found = []
  const re = /include_str!\s*\(\s*"([^"]+)"\s*\)/g
  let match
  while ((match = re.exec(src))) {
    const rel = posix.normalize(posix.join(posix.dirname(file), match[1]))
    if (!rel.startsWith('..')) found.push(rel)
  }
  return found
}

function commandNames(src) {
  const names = []
  const re = /#\[tauri::command(?:\([^)]*\))?\]/g
  let match
  while ((match = re.exec(src))) {
    let i = match.index + match[0].length
    while (i < src.length) {
      const slice = src.slice(i)
      const ws = /^\s+/.exec(slice)
      if (ws) {
        i += ws[0].length
        continue
      }
      if (slice.startsWith('///')) {
        const nl = slice.indexOf('\n')
        i += nl === -1 ? slice.length : nl + 1
        continue
      }
      if (slice.startsWith('/*')) {
        const end = slice.indexOf('*/')
        i += end === -1 ? slice.length : end + 2
        continue
      }
      if (slice.startsWith('#[')) {
        const nl = slice.indexOf('\n')
        i += nl === -1 ? slice.length : nl + 1
        continue
      }
      break
    }
    const found = /^(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?fn\s+([A-Za-z_][A-Za-z0-9_]*)/.exec(src.slice(i))
    if (!found) {
      console.error('tauri command has no function name')
      process.exit(1)
    }
    names.push(found[1])
  }
  return names
}

function invokeNames(src) {
  const names = []
  const re = /\b(?:safeInvoke|invoke)\s*(?:<[\s\S]*?>)?\(\s*['"]([A-Za-z_][A-Za-z0-9_]*)['"]/g
  let match
  while ((match = re.exec(src))) names.push(match[1])
  return names
}

function crateRoot(file, libFiles) {
  if (libFiles.has(file)) return 'src-tauri/src/lib.rs'
  if (file.endsWith('/main.rs')) return file
  return file
}

function buildGraph(areas, areaByPath) {
  const aliases = loadAliases()
  const edgeSet = new Set()
  const fileEdgeSet = new Set()
  const missing = []
  function add(fromFile, toFile) {
    if (!areaByPath.has(fromFile) || !areaByPath.has(toFile)) return
    fileEdgeSet.add(`${fromFile} ${toFile}`)
    const fromArea = areaByPath.get(fromFile)
    const toArea = areaByPath.get(toFile)
    if (fromArea !== toArea) edgeSet.add(`${fromArea}\0${toArea}`)
  }

  for (const file of areaByPath.keys()) {
    if (!file.startsWith('src/') || !SOURCE_EXT.test(file) || file.endsWith('.verify.mjs')) continue
    const src = stripTsComments(readText(file))
    for (const spec of tsSpecifiers(src)) {
      const resolved = resolveSpecifier(file, spec, aliases, areaByPath)
      if (resolved.kind === 'missing') missing.push(`${file} ${spec}`)
      if (resolved.kind === 'file') add(file, resolved.file)
    }
  }

  const { children, libFiles } = buildModuleTree(areaByPath)
  const libModules = children.get('src-tauri/src/lib.rs') ?? {}
  for (const file of areaByPath.keys()) {
    if (!file.endsWith('.rs') || !file.startsWith('src-tauri/')) continue
    const raw = readText(file)
    for (const rel of includePaths(file, raw)) {
      if (areaByPath.has(rel)) add(file, rel)
      else missing.push(`${file} include_str ${rel}`)
    }
    const stripped = stripRustStrings(stripRustComments(raw))
    for (const path of rustPaths(stripped)) {
      const rootFile = path.crate ? 'src-tauri/src/lib.rs' : crateRoot(file, libFiles)
      add(file, resolveRustModule(rootFile, path.segments, children))
    }
    if (file === 'src-tauri/src/lib.rs') {
      const names = Object.keys(libModules)
      if (names.length) {
        const bare = new RegExp(`\\b(?:${names.map(escapeRegExp).join('|')})::`, 'g')
        let match
        while ((match = bare.exec(stripped))) {
          const name = match[0].slice(0, -2)
          const rest = stripped.slice(match.index + name.length + 2)
          const more = /^[A-Za-z_][A-Za-z0-9_]*(?:::[A-Za-z_][A-Za-z0-9_]*)*/.exec(rest)
          const segments = [name, ...(more ? more[0].split('::').filter(Boolean) : [])]
          add(file, resolveRustModule(file, segments, children))
        }
      }
    }
  }

  const owners = new Map()
  for (const file of areaByPath.keys()) {
    if (!file.endsWith('.rs') || !file.startsWith('src-tauri/')) continue
    for (const name of commandNames(stripRustComments(readText(file)))) {
      if (owners.has(name)) {
        console.error(`duplicate command ${name} in ${owners.get(name)} and ${file}`)
        process.exit(1)
      }
      owners.set(name, file)
    }
  }
  const unknown = []
  for (const file of areaByPath.keys()) {
    if (!file.startsWith('src/') || !SOURCE_EXT.test(file) || file.endsWith('.verify.mjs')) continue
    for (const name of invokeNames(stripTsComments(readText(file)))) {
      const owner = owners.get(name)
      if (!owner) {
        unknown.push(`${file} ${name}`)
        continue
      }
      add(file, owner)
    }
  }
  if (missing.length || unknown.length) {
    for (const line of missing.sort()) console.error(`unresolved ${line}`)
    for (const line of unknown.sort()) console.error(`unknown command ${line}`)
    process.exit(1)
  }

  const edges = [...edgeSet].map((pair) => pair.split('\0'))
  return { edges, owners, fileEdgeSet }
}

function parseNumstat(since) {
  const stdout = git([
    'log',
    'origin/main',
    '--no-merges',
    '--no-renames',
    '--numstat',
    `--since=${since}T00:00:00Z`,
    '--pretty=format:%x1e%H',
  ])
  const commits = []
  for (const chunk of stdout.split('\x1e')) {
    const lines = chunk.split('\n').map((line) => line.replace(/\r$/, ''))
    const hash = lines.shift()?.trim()
    if (!hash) continue
    const files = []
    for (const line of lines) {
      if (line === '') continue
      const match = /^(\d+|-)\t(\d+|-)\t(.+)$/.exec(line)
      if (!match) continue
      files.push({ added: match[1], deleted: match[2], path: match[3] })
    }
    commits.push({ hash, files })
  }
  return commits
}

function tally(since, areaByPath) {
  const byArea = new Map()
  for (const area of new Set(areaByPath.values())) byArea.set(area, { commits: 0, lines: 0 })
  let apartCommits = 0
  let apartLines = 0
  let countedLines = 0
  for (const commit of parseNumstat(since)) {
    const touched = new Set()
    let apart = false
    for (const file of commit.files) {
      if (LOCKFILES.has(file.path) || file.added === '-' || file.deleted === '-') continue
      const lines = Number(file.added) + Number(file.deleted)
      countedLines += lines
      if (!areaByPath.has(file.path)) {
        apart = true
        apartLines += lines
        continue
      }
      const area = areaByPath.get(file.path)
      byArea.get(area).lines += lines
      touched.add(area)
    }
    if (apart) apartCommits += 1
    for (const area of touched) byArea.get(area).commits += 1
  }
  let areaLines = 0
  for (const row of byArea.values()) areaLines += row.lines
  if (areaLines + apartLines !== countedLines) {
    console.error('churn lines were counted twice')
    process.exit(1)
  }
  return { byArea, apartCommits, apartLines, areaLines }
}

function degree(id, edges) {
  const adjacent = new Set()
  let inn = 0
  let out = 0
  for (const [from, to] of edges) {
    if (from === id) {
      adjacent.add(to)
      out += 1
    }
    if (to === id) {
      adjacent.add(from)
      inn += 1
    }
  }
  return { inn, out, neighbours: adjacent.size }
}

function ownsAny(id, files, areaByPath) {
  return files.some((file) => areaByPath.get(file) === id)
}

function affectsBuild(id, areaByPath) {
  if (ownsAny(id, BUILD_FILES, areaByPath)) return true
  for (const [file, area] of areaByPath) {
    if (area === id && file.startsWith('.github/workflows/')) return true
  }
  return false
}

function cadenceFor(stats) {
  const nightly =
    stats.neighbours >= 10 ||
    stats.ownsDb ||
    stats.ownsSync ||
    (stats.lines30 >= 1500 && stats.neighbours > 0)
  if (nightly) return 'Nightly'
  const quiet = stats.lines30 < 200 && stats.lines90 < 1000 && stats.neighbours <= 5 && !stats.affectsBuild
  const isolated = stats.neighbours === 0 && !stats.affectsBuild
  if (isolated || quiet) return 'Monthly'
  return 'Weekly'
}

function reasonFor(stats, cadence) {
  if (cadence === 'Nightly') {
    const parts = []
    if (stats.lines30 >= 1500 && stats.neighbours > 0) parts.push('1,500+ lines in 30 days')
    if (stats.neighbours >= 10) parts.push('10+ neighbours')
    if (stats.ownsDb) parts.push('owns the database path')
    if (stats.ownsSync) parts.push('owns the sync path')
    return parts.join('; ')
  }
  if (cadence === 'Monthly') {
    if (stats.neighbours === 0 && !stats.affectsBuild) return 'no import edges'
    return 'quiet leaf'
  }
  if (stats.neighbours === 0 && stats.affectsBuild) return 'no import edges, but it sets which checks run'
  if (stats.lines90 >= 1000) return '1,000+ lines in 90 days'
  if (stats.lines30 >= 200) return `${fmt(stats.lines30)} lines in 30 days`
  if (stats.neighbours > 5) return `${stats.neighbours} neighbours`
  return 'above a quiet leaf'
}

function kindsFrom(doc) {
  const paths = doc.split('## Paths')[1]?.split('## Cadence')[0] ?? ''
  const kinds = new Map()
  for (const line of paths.split('\n')) {
    const match = /^\| ([a-z0-9-]+) \| ([a-z]+) \|/.exec(line)
    if (match) kinds.set(match[1], match[2])
  }
  return kinds
}

function connectedPieces(ids, edges) {
  const adj = new Map(ids.map((id) => [id, new Set()]))
  for (const [from, to] of edges) {
    adj.get(from).add(to)
    adj.get(to).add(from)
  }
  const seen = new Set()
  let components = 0
  let connected = 0
  for (const id of ids) {
    if (adj.get(id).size === 0 || seen.has(id)) continue
    components += 1
    const stack = [id]
    seen.add(id)
    while (stack.length) {
      const current = stack.pop()
      connected += 1
      for (const next of adj.get(current)) {
        if (seen.has(next)) continue
        seen.add(next)
        stack.push(next)
      }
    }
  }
  return { components, connected }
}

function cycleAreas(ids, edges) {
  const adj = new Map(ids.map((id) => [id, []]))
  for (const [from, to] of edges) adj.get(from).push(to)
  const cyclic = []
  for (const start of ids) {
    const stack = [...adj.get(start)]
    const seen = new Set()
    let found = false
    while (stack.length) {
      const node = stack.pop()
      if (node === start) {
        found = true
        break
      }
      if (seen.has(node)) continue
      seen.add(node)
      for (const next of adj.get(node) ?? []) stack.push(next)
    }
    if (found) cyclic.push(start)
  }
  return cyclic
}

function graphProse(short, directed, folded, drawn, ids, edges, kinds) {
  const { components, connected } = connectedPieces(ids, edges)
  const degrees = new Map(ids.map((id) => [id, degree(id, edges)]))
  let topCount = -1
  const top = []
  for (const id of ids) {
    const count = degrees.get(id).neighbours
    if (count > topCount) {
      topCount = count
      top.length = 0
      top.push(id)
    } else if (count === topCount) top.push(id)
  }
  let dataTop = null
  for (const id of ids) {
    if (kinds.get(id) !== 'data') continue
    const inn = degrees.get(id).inn
    if (!dataTop || inn > dataTop.inn) dataTop = { id, inn }
  }
  const onlyIn = ids.filter((id) => degrees.get(id).out === 0 && degrees.get(id).inn > 0)
  const none = ids.filter((id) => degrees.get(id).neighbours === 0)
  const cycles = cycleAreas(ids, edges)
  const tree =
    components === 0
      ? 'No area has an import edge.'
      : components === 1
        ? `${connected} areas share one tree.`
        : `${connected} areas have edges across ${components} trees.`
  const topSentence =
    top.length === 1
      ? `${englishList(top)} has ${topCount} neighbours.`
      : `${englishList(top)} have ${topCount} neighbours.`
  const dataSentence = dataTop ? `${englishList([dataTop.id])} is the data area the most others depend on.` : ''
  const cycleSentence = cycles.length ? `Cycles run through ${englishList(cycles)}.` : 'No area sits on a cycle.'
  const onlySentence =
    onlyIn.length === 0
      ? ''
      : onlyIn.length === 1
        ? `${englishList(onlyIn)} only has incoming edges.`
        : `${englishList(onlyIn)} only have incoming edges.`
  const noneSentence =
    none.length === 0 ? '' : none.length === 1 ? `${englishList(none)} has none.` : `${englishList(none)} have none.`
  const opsSentence = none.includes('ops') ? '`ops` still chooses which checks run.' : ''
  const second = [tree, topSentence, dataSentence, cycleSentence, onlySentence, noneSentence, opsSentence]
    .filter(Boolean)
    .join(' ')
  return [
    `An arrow means depends on. Edges were read from TS imports, Rust paths, and IPC names on main at \`${short}\`: ${fmt(directed)} directed edges. The hub edge folds ${fmt(folded)} links (UI kit, messages, IPC). The other ${fmt(drawn)} are drawn. \`<-->\` is a two-way pair.`,
    '',
    second,
  ].join('\n')
}

function mermaidBody(edges, prose) {
  const drawOrder = GROUPS.flatMap((group) => group[2])
  const edgeSet = new Set(edges.map(([from, to]) => `${from}\0${to}`))
  const has = (from, to) => edgeSet.has(`${from}\0${to}`)
  const lines = ['```mermaid', 'flowchart LR']
  for (const [gid, title, members] of GROUPS) {
    lines.push(`  subgraph ${gid}["${title}"]`)
    for (const area of members) lines.push(`    ${nodeDecl(area)}`)
    lines.push('  end')
  }
  lines.push('')
  lines.push('  hubs <-->|"UI kit, messages, IPC"| screens')
  lines.push('')
  const emitted = new Set()
  for (const from of drawOrder) {
    for (const to of drawOrder) {
      if (from === to || (!has(from, to) && !has(to, from)) || isFolded(from, to)) continue
      const key = [from, to].sort().join('\0')
      if (emitted.has(key)) continue
      emitted.add(key)
      const left = nodeId(from)
      const right = nodeId(to)
      if (has(from, to) && has(to, from)) lines.push(`  ${left} <--> ${right}`)
      else if (has(from, to)) lines.push(`  ${left} --> ${right}`)
      else lines.push(`  ${right} --> ${left}`)
    }
  }
  lines.push('```', '', prose)
  return lines.join('\n')
}

function cadenceTable(ids, kinds, edges, window30, window90, areaByPath) {
  const rows = ids.map((id) => {
    const deg = degree(id, edges)
    const row30 = window30.byArea.get(id) ?? { commits: 0, lines: 0 }
    const row90 = window90.byArea.get(id) ?? { commits: 0, lines: 0 }
    const stats = {
      lines30: row30.lines,
      lines90: row90.lines,
      neighbours: deg.neighbours,
      ownsDb: ownsAny(id, DATABASE_FILES, areaByPath),
      ownsSync: ownsAny(id, SYNC_FILES, areaByPath),
      affectsBuild: affectsBuild(id, areaByPath),
    }
    const cadence = cadenceFor(stats)
    return {
      id,
      kind: kinds.get(id),
      commits30: row30.commits,
      lines30: row30.lines,
      commits90: row90.commits,
      lines90: row90.lines,
      inn: deg.inn,
      out: deg.out,
      neighbours: deg.neighbours,
      cadence,
      reason: reasonFor(stats, cadence),
    }
  })
  const rank = { Nightly: 0, Weekly: 1, Monthly: 2 }
  rows.sort(
    (left, right) =>
      rank[left.cadence] - rank[right.cadence] ||
      right.lines30 - left.lines30 ||
      right.lines90 - left.lines90 ||
      left.id.localeCompare(right.id),
  )
  return rows
}

function cadenceBody(rows, day30, day90, window30, window90) {
  const counts = { Nightly: 0, Weekly: 0, Monthly: 0 }
  for (const row of rows) counts[row.cadence] += 1
  const lines = [
    `Lines are added plus deleted on main from ${day30} (30 days) and ${day90} (90 days). Lockfiles and binaries are left out. A commit counts once for each area it touches. A path that is gone at the tip is counted on the apart line, not in an area row. Edges are distinct neighbours on the graph above.`,
    '',
    '| Area | Kind | 30 days: commits / lines | 90 days: commits / lines | Edges in / out (neighbours) | Cadence | Reason |',
    '|---|---|---|---|---|---|---|',
  ]
  for (const row of rows) {
    lines.push(
      `| ${row.id} | ${row.kind} | ${fmt(row.commits30)} / ${fmt(row.lines30)} | ${fmt(row.commits90)} / ${fmt(row.lines90)} | ${row.inn} / ${row.out} (${row.neighbours}) | ${row.cadence} | ${row.reason} |`,
    )
  }
  lines.push(
    '',
    `${counts.Nightly} nightly, ${counts.Weekly} weekly, ${counts.Monthly} monthly.`,
    '',
    `Apart from area rows: 30 days ${fmt(window30.apartCommits)} commits / ${fmt(window30.apartLines)} lines; 90 days ${fmt(window90.apartCommits)} commits / ${fmt(window90.apartLines)} lines.`,
  )
  return lines.join('\n')
}

function putRegion(doc, name, body, locate) {
  const startMark = `<!-- area-map-graph:${name} -->`
  const endMark = `<!-- /area-map-graph:${name} -->`
  const wrapped = `${startMark}\n${body.trim()}\n${endMark}`
  const startAt = doc.indexOf(startMark)
  const endAt = doc.indexOf(endMark)
  if (startAt !== -1 && endAt > startAt) {
    return doc.slice(0, startAt) + wrapped + doc.slice(endAt + endMark.length)
  }
  const spot = locate(doc)
  if (!spot) {
    console.error(`missing ${name} region in AREAS.md`)
    process.exit(1)
  }
  const after = doc.slice(spot.end).replace(/^\n+/, '')
  return `${doc.slice(0, spot.start)}${wrapped}\n\n${after}`
}

function locateMermaid(doc) {
  const start = doc.indexOf('```mermaid\n')
  const end = doc.indexOf('`*` stays inside one path segment.')
  if (start < 0 || end < start) return null
  return { start, end }
}

function locateCadence(doc) {
  const start = doc.indexOf('Lines are added plus deleted on main from ')
  const end = doc.indexOf('## Schedule (UTC)')
  if (start < 0 || end < start) return null
  return { start, end }
}

function renderDoc(doc, mermaid, cadence) {
  let next = putRegion(doc, 'mermaid', mermaid, locateMermaid)
  next = putRegion(next, 'cadence', cadence, locateCadence)
  next = next.replace(
    /^- \[ \] TODO: script that rebuilds the area graph/m,
    '- [x] TODO: script that rebuilds the area graph',
  )
  if (!next.endsWith('\n')) next += '\n'
  return next
}

function assertFullHistory() {
  const shallow = git(['rev-parse', '--is-shallow-repository']).trim()
  if (shallow === 'true') {
    console.error('shallow clone; refusing to rebuild churn')
    process.exit(1)
  }
  git(['rev-parse', '--verify', '--quiet', 'origin/main'])
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const mapCheck = spawnSync(process.execPath, [join(root, 'scripts/area-map.mjs')], {
    cwd: root,
    encoding: 'utf8',
  })
  if (mapCheck.status !== 0) {
    process.stderr.write(mapCheck.stdout ?? '')
    process.stderr.write(mapCheck.stderr ?? '')
    process.exit(mapCheck.status || 1)
  }
  assertFullHistory()

  const areas = JSON.parse(readText('docs/ops/areas.json')).areas
  const tracked = git(['ls-files', '-z']).split('\0').filter(Boolean)
  const areaByPath = new Map()
  for (const file of tracked) {
    const hits = areasFor(file, areas)
    if (hits.length !== 1) {
      console.error(`area ${file} ${hits.join(',') || 'unmapped'}`)
      process.exit(1)
    }
    areaByPath.set(file, hits[0])
  }
  const ids = areas.map((area) => area.id)
  const grouped = new Set(GROUPS.flatMap((group) => group[2]))
  for (const id of ids) {
    if (!grouped.has(id)) {
      console.error(`no diagram group for ${id}`)
      process.exit(1)
    }
  }

  const doc = readText('docs/ops/AREAS.md')
  const kinds = kindsFrom(doc)
  for (const id of ids) {
    if (!kinds.has(id)) {
      console.error(`AREAS.md path table has no kind for ${id}`)
      process.exit(1)
    }
  }

  const { edges, owners, fileEdgeSet } = buildGraph(areas, areaByPath)
  const folded = edges.filter(([from, to]) => isFolded(from, to)).length
  const drawn = edges.length - folded
  const day30 = utcDay(30)
  const day90 = utcDay(90)
  const window30 = tally(day30, areaByPath)
  const window90 = tally(day90, areaByPath)
  const short = git(['rev-parse', '--short=7', 'origin/main']).trim()
  const rows = cadenceTable(ids, kinds, edges, window30, window90, areaByPath)
  const next = renderDoc(
    doc,
    mermaidBody(edges, graphProse(short, edges.length, folded, drawn, ids, edges, kinds)),
    cadenceBody(rows, day30, day90, window30, window90),
  )

  const proof = [
    `directed ${edges.length} folded ${folded} drawn ${drawn}`,
    `hand-written 90 difference ${edges.length - 90}`,
    `ipc ${owners.size}`,
    `owner get_devprofile_path_cmd ${owners.get('get_devprofile_path_cmd') ?? 'missing'}`,
    `owner get_cv_home_status ${owners.get('get_cv_home_status') ?? 'missing'}`,
    `owner get_llm_route_status ${owners.get('get_llm_route_status') ?? 'missing'}`,
    `owner run_local_grok_quest ${owners.get('run_local_grok_quest') ?? 'missing'}`,
    `owner get_operator_pack_status ${owners.get('get_operator_pack_status') ?? 'missing'}`,
    `file-edge src/adapters/tauri/finder-adapter.ts src/core/domain/history.ts ${fileEdgeSet.has('src/adapters/tauri/finder-adapter.ts src/core/domain/history.ts') ? 'yes' : 'no'}`,
    `apart-30 ${window30.apartCommits} ${window30.apartLines}`,
    `apart-90 ${window90.apartCommits} ${window90.apartLines}`,
    `area-lines-30 ${window30.areaLines}`,
    `area-lines-90 ${window90.areaLines}`,
  ]
  if (args.check && next !== doc) {
    console.error('AREAS.md would change')
    for (const line of proof) console.error(line)
    process.exit(1)
  }
  if (!args.check && next !== doc) writeFileSync(areasDoc, next)
  for (const line of proof) console.log(line)
  console.log('ok')
}

main()
