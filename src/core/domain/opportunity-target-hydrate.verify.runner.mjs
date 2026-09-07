#!/usr/bin/env node
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const { usableOpportunityJdText, seedDiscoverJd } = await import(
  pathToFileURL(join(here, 'opportunity-target.ts')).href
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

assert(usableOpportunityJdText('jd') === undefined, 'placeholder jd ignored')
assert(usableOpportunityJdText('  ') === undefined, 'blank jd ignored')
assert(usableOpportunityJdText('We need a fullstack engineer') === 'We need a fullstack engineer', 'real jd kept')

const seeded = seedDiscoverJd({
  jd_text: 'jd',
  company: 'Legora',
  title: 'AI Software Engineer',
  source_url: 'https://jobs.ashbyhq.com/legora/abc',
})
assert(
  seeded === 'Legora · AI Software Engineer\nhttps://jobs.ashbyhq.com/legora/abc',
  'seed falls back to company · title + url',
)

const fromStored = seedDiscoverJd({
  jd_text: 'Full JD body from DB',
  company: 'Ignored',
  title: 'Ignored',
})
assert(fromStored === 'Full JD body from DB', 'stored jd wins over company/title')

const urlOnly = seedDiscoverJd({
  jd_text: '',
  source_url: 'https://jobs.qred.com/jobs/7931564-fullstack-developer-typescript',
})
assert(
  urlOnly === 'https://jobs.qred.com/jobs/7931564-fullstack-developer-typescript',
  'url-only row still prefills JD',
)

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nall opportunity-target-hydrate checks passed')
