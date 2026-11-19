#!/usr/bin/env node
/**
 * Read the operator first and last name from the distilled CV packet.
 * The literals are not stored in this file.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

export function operatorPersonalNames(root = join(here, '..')) {
  const packet = readFileSync(join(root, 'data/distillation/cv-packet-distilled.txt'), 'utf8')
  const lines = packet.split('\n')
  const heading = lines.findIndex((line) => /^PROFILE\b/.test(line.trim()))
  const next = heading >= 0 ? lines.slice(heading + 1).find((line) => line.trim()) : undefined
  const match = next?.match(/^([A-Za-z][A-Za-z'-]*)\s+([A-Za-z][A-Za-z'-]*)\s+—/)
  if (!match) return []
  return [match[1], match[2]]
}
