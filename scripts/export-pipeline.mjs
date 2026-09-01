#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadPipelineConfig } from './load-pipeline-config.mjs'

const { dbPath, pulseDbPath, privateMirrorDir, repoRoot } = loadPipelineConfig()

function sql(query) {
  return execFileSync('sqlite3', ['-json', dbPath, query], { encoding: 'utf8' }).trim()
}

const rows = JSON.parse(
  sql(`
SELECT id, kind, status, fit_score, title, company, source_url, outcome_status, applied_at, last_updated,
  CASE WHEN notes LIKE '%export_path=%' THEN 1 ELSE 0 END AS has_pack
FROM opportunities
WHERE status IN ('prepped', 'applied', 'passed', 'archived')
   OR (status = 'analyzed' AND kind != 'mission_pull' AND COALESCE(fit_score, 0) > 0)
   OR (outcome_status IS NOT NULL AND outcome_status != '')
ORDER BY
  CASE status WHEN 'applied' THEN 1 WHEN 'prepped' THEN 2 WHEN 'analyzed' THEN 3 ELSE 4 END,
  COALESCE(applied_at, last_updated) DESC,
  id DESC
`),
)

const snapshot = {
  exported_at: new Date().toISOString(),
  source: 'collab-finder-db',
  count: rows.length,
  applied: rows.filter((row) => row.status === 'applied').length,
  waiting: rows.filter(
    (row) =>
      row.status === 'applied' && (!row.outcome_status || row.outcome_status === 'waiting'),
  ).length,
  rows,
}

const localOut = join(repoRoot, 'pipeline-export.json')
writeFileSync(localOut, JSON.stringify(snapshot, null, 2))

if (privateMirrorDir) {
  try {
    mkdirSync(privateMirrorDir, { recursive: true })
    writeFileSync(join(privateMirrorDir, 'pipeline-snapshot.json'), JSON.stringify(snapshot, null, 2))
  } catch {
    // optional private mirror
  }
}

if (pulseDbPath) {
  try {
    const applied = snapshot.applied
    const waiting = snapshot.waiting
    const snippet = `${applied} applied in pipeline SoT; ${waiting} waiting on employer reply.`
    const now = new Date().toISOString()
    execFileSync(
      'sqlite3',
      [
        pulseDbPath,
        `INSERT INTO memory_traces (nat_key, snippet, source, time, status, kind, lock)
         VALUES ('career/pipeline/applied-count', '${snippet.replace(/'/g, "''")}', 'tool:export-pipeline', '${now}', 'tool-verified', 'data', 'open')
         ON CONFLICT(nat_key) DO UPDATE SET snippet=excluded.snippet, time=excluded.time, status=excluded.status;`,
      ],
      { stdio: 'ignore' },
    )
  } catch {
    // pulse-memory optional
  }
}

console.log(`pipeline-export: ${rows.length} rows written`)
