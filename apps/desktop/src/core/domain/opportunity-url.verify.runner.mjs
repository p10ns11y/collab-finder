#!/usr/bin/env node
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const { normalizeOpportunityUrl, displayOpportunityUrl } = await import(
  pathToFileURL(join(here, 'opportunity-url.ts')).href
)

let failed = 0
function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed++
  } else {
    console.log('ok:', msg)
  }
}

const job =
  'https://job-boards.greenhouse.io/xai/jobs/4956028007'
assert(typeof normalizeOpportunityUrl === 'function', 'shipped normalizeOpportunityUrl')
assert(typeof displayOpportunityUrl === 'function', 'shipped displayOpportunityUrl')
assert(normalizeOpportunityUrl(job) === job, 'https job URL normalizes identity')
assert(normalizeOpportunityUrl('') === null, 'empty -> null')
assert(normalizeOpportunityUrl(null) === null, 'null -> null')
assert(normalizeOpportunityUrl(undefined) === null, 'undefined -> null')
assert(
  normalizeOpportunityUrl('job-boards.greenhouse.io/xai/jobs/1') ===
    'https://job-boards.greenhouse.io/xai/jobs/1',
  'bare host/path gets https://',
)
assert(
  normalizeOpportunityUrl('jobs.qred.com/jobs/7931564-fullstack-developer-typescript') ===
    'https://jobs.qred.com/jobs/7931564-fullstack-developer-typescript',
  'qred bare host/path gets https:// (builder-error paste case)',
)
assert(normalizeOpportunityUrl('not a url') === null, 'non-url prose -> null')

const shown = displayOpportunityUrl(job, 40)
assert(shown.includes('job-boards.greenhouse.io'), 'display includes host')
assert(shown.length <= 40, 'display respects maxLen')
assert(displayOpportunityUrl('') === '', 'display empty -> empty string')
assert(displayOpportunityUrl(null) === '', 'display null -> empty string')

// Truncation: very short maxLen must end with ellipsis when longer than max
const short = displayOpportunityUrl(job, 20)
assert(short.length <= 20, 'display maxLen 20')
assert(short.endsWith('…') || short.length < 20, 'truncates or fits')

if (failed) {
  console.error(`\n${failed} assertion(s) failed`)
  process.exit(1)
}
console.log('\nall opportunity-url checks passed (shipped module)')
