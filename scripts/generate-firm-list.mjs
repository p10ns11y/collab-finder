#!/usr/bin/env node
/**
 * Regenerate data/mission-firms/FIRM-LIST.md from data/durability/universe.v1.json.
 * Run: pnpm firm-list
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const universePath = join(root, 'data/durability/universe.v1.json')
const outPath = join(root, 'data/mission-firms/FIRM-LIST.md')

const uni = JSON.parse(readFileSync(universePath, 'utf8'))

function deriveStatus(firm) {
  if (firm.status) return firm.status
  if (
    firm.theater_saas ||
    firm.hiring_signal === 0 ||
    firm.fortress < 2 ||
    firm.product_moat < 2
  ) {
    return 'excluded'
  }
  if (firm.hiring_signal === 1) return 'watch'
  return 'active'
}

function cashSnapshot(firm) {
  const c = firm.cash
  if (c?.note) return c.note.replace(/\|/g, '/').replace(/\n/g, ' ')
  if (firm.note) return firm.note.replace(/\|/g, '/').replace(/\n/g, ' ')
  if (!c) return '—'
  if (c.note) return c.note.replace(/\|/g, '/').replace(/\n/g, ' ')
  const parts = []
  if (c.revenue != null) parts.push(`rev ${c.revenue} ${c.currency ?? '?'}b`)
  if (c.profit != null) parts.push(`${c.profit_kind ?? 'profit'} ${c.profit}`)
  if (c.fcf != null) parts.push(`fcf ${c.fcf}`)
  if (c.net_cash != null) parts.push(`net cash ${c.net_cash}`)
  if (parts.length) return `FY${c.fy ?? '?'} ${parts.join(' · ')}`
  return `FY${c.fy ?? '?'} numbers not pulled`
}

function esc(s) {
  return String(s ?? '').replace(/\|/g, '/')
}

const rows = uni.firms
  .map((f) => ({
    id: f.id,
    name: f.name,
    fortress: f.fortress,
    hiring: f.hiring_signal,
    economic: cashSnapshot(f),
    status: deriveStatus(f),
    note: f.note ?? '',
  }))
  .sort((a, b) => a.id.localeCompare(b.id))

const lines = [
  '# Mission firm list',
  '',
  `Maintained from [\`universe.v1.json\`](../durability/universe.v1.json). Scored at **${uni.scored_at}**.`,
  '',
  'Edit the universe file for stability (`fortress`), hire climate (`hiring_signal`), and economic notes (`cash.note`, `note`). Do not re-LLM the whole registry.',
  '',
  '| id | name | fortress | hiring | cash / economic note | status | updated |',
  '| --- | --- | ---: | ---: | --- | --- | --- |',
  ...rows.map(
    (r) =>
      `| ${esc(r.id)} | ${esc(r.name)} | ${r.fortress} | ${r.hiring} | ${esc(r.economic)} | ${r.status} | ${uni.scored_at} |`,
  ),
  '',
  '**Status:** `active` passes gates; `watch` admitted with weak hire signal or operator flag; `pause` operator hold; `excluded` fails durability gates.',
  '',
  'Regenerate: `pnpm firm-list`',
  '',
]

writeFileSync(outPath, lines.join('\n'))
console.log(`Wrote ${outPath} (${rows.length} firms)`)
