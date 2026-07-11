#!/usr/bin/env node
/** One-off maintainer script: prune raw GitHub API dump → agent-friendly public-projects.json */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const path = join(root, 'data/distillation/public-projects.json')

const PRIORITY = new Set([
  'arch-machine',
  'premflow',
  'collab-finder',
  'thepulimaangani',
  'devprofile',
  'elomaxz',
  'grok-daily-productivity-extensions',
  'learning-with-grok',
  'prototype-it-to-explain-itself',
  'skills',
  'agent-prompt-tuning-lab',
  'babel-plugin-react-intl-messages-generator',
  'rust-wasm-bindgen-app',
  'adaptate',
  'interestellar-ai-explorer',
  'latex-cv',
  'tauri',
])

function trim(s, n = 220) {
  if (!s) return null
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > n ? `${t.slice(0, n - 1)}…` : t
}

function slimRepo(r) {
  return {
    name: r.name,
    url: r.html_url,
    description: trim(r.description),
    language: r.language || null,
    topics: (r.topics || []).slice(0, 8),
    stars: r.stargazers_count ?? 0,
    pushed_at: r.pushed_at?.slice(0, 10) ?? null,
    homepage: r.homepage || null,
    archived: !!r.archived,
    fork: !!r.fork,
    priority: PRIORITY.has(r.name),
  }
}

const raw = JSON.parse(readFileSync(path, 'utf8'))
const entry = Array.isArray(raw) ? raw[0] : raw

// Already pruned — idempotent
if (entry.schemaVersion === 1 && entry.repos?.[0]?.url && !entry.repos[0].forks_url) {
  console.log('Already pruned:', entry.repoCount ?? entry.repos.length, 'repos')
  process.exit(0)
}

const sourceRepos = Array.isArray(raw) ? raw[0].repos : entry.repos || []
const now = Date.now()
const twoYearsAgo = now - 2 * 365 * 24 * 60 * 60 * 1000

const selected = new Map()

for (const r of sourceRepos) {
  if (PRIORITY.has(r.name)) {
    selected.set(r.name, r)
    continue
  }
  if (r.fork || r.archived) continue
  const pushed = r.pushed_at ? new Date(r.pushed_at).getTime() : 0
  const stars = r.stargazers_count || 0
  const recent = pushed > twoYearsAgo
  if (stars >= 1 || (recent && r.description)) {
    selected.set(r.name, r)
  }
}

const repos = [...selected.values()]
  .map(slimRepo)
  .sort((a, b) => {
    if (a.priority !== b.priority) return a.priority ? -1 : 1
    return b.stars - a.stars || (b.pushed_at || '').localeCompare(a.pushed_at || '')
  })

const out = {
  schemaVersion: 1,
  purpose: 'Pruned public GitHub repos for CV grounding and agent context (not raw API dump).',
  username: entry.username || 'p10ns11y',
  profile: {
    name: entry.user?.name ?? null,
    location: entry.user?.location ?? null,
    bio: trim(entry.user?.bio, 160),
    blog: entry.user?.blog ?? null,
    html_url: entry.user?.html_url ?? null,
    public_repos: entry.user?.public_repos ?? sourceRepos.length,
  },
  fetchedAt: entry.fetchedAt ?? Date.now(),
  repoCount: repos.length,
  repos,
}

writeFileSync(path, `${JSON.stringify(out, null, 2)}\n`)
console.log(`Pruned ${sourceRepos.length} → ${repos.length} repos (${readFileSync(path).length} bytes)`)
