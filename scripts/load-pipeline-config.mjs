#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const localConfigPath = join(repoRoot, 'data/pipeline/config.local.json')

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function resolveOptionalPath(value) {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  return resolve(trimmed)
}

/** @returns {{ dbPath: string, backupDir?: string, pulseDbPath?: string, privateMirrorDir?: string, repoRoot: string }} */
export function loadPipelineConfig() {
  if (!existsSync(localConfigPath)) {
    throw new Error(
      `Missing ${localConfigPath}. Copy data/pipeline/config.example.json → config.local.json and set db_path (gitignored).`,
    )
  }

  const fileConfig = readJson(localConfigPath)
  const dbPath =
    process.env.COLLAB_FINDER_DB?.trim() ||
    resolveOptionalPath(fileConfig.db_path)
  if (!dbPath) {
    throw new Error('pipeline config: set db_path in config.local.json or COLLAB_FINDER_DB')
  }
  if (!existsSync(dbPath)) {
    throw new Error(`pipeline config: database not found at configured path`)
  }

  const backupDir =
    process.env.COLLAB_FINDER_BACKUP_DIR?.trim() ||
    resolveOptionalPath(fileConfig.backup_dir)
  const pulseDbPath =
    process.env.PULSE_MEMORY_DB?.trim() ||
    resolveOptionalPath(fileConfig.pulse_db_path)
  const privateMirrorDir =
    process.env.PIPELINE_PRIVATE_MIRROR?.trim() ||
    resolveOptionalPath(fileConfig.private_mirror_dir)

  return { dbPath, backupDir, pulseDbPath, privateMirrorDir, repoRoot }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const config = loadPipelineConfig()
  process.stdout.write(`${JSON.stringify(config)}\n`)
}
