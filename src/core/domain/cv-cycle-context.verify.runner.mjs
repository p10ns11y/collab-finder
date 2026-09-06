#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describeCvCycleContext } from './cv-cycle-context.ts'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '../../..')
const distilled = readFileSync(join(root, 'data/distillation/cv-packet-distilled.txt'), 'utf8').trim()

const failures = []
function must(cond, msg) {
  if (!cond) failures.push(msg)
}

const empty = describeCvCycleContext('', { distilledDefault: distilled, userEdited: false })
must(empty.source === 'empty', 'empty textarea → empty source')

const defaultOnly = describeCvCycleContext(distilled, {
  distilledDefault: distilled,
  userEdited: false,
})
must(defaultOnly.source === 'distilled-default', 'distilled default without edit → distilled-default')

const userEdited = describeCvCycleContext(`${distilled}\nExtra line`, {
  distilledDefault: distilled,
  userEdited: true,
})
must(userEdited.source === 'user-edited', 'userEdited flag → user-edited')

const corrupt = describeCvCycleContext('刷搏組啟愓愁慮桴'.repeat(20), {
  distilledDefault: distilled,
  userEdited: false,
})
must(corrupt.source === 'corrupt', 'dense CJK → corrupt')

console.log('=== cv-cycle-context.verify ===')
if (failures.length) {
  for (const f of failures) console.error('FAIL', f)
  process.exit(1)
}
console.log('ALL CHECKS PASSED')
