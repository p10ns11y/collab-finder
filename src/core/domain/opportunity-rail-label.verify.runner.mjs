#!/usr/bin/env node
import { opportunityRailLabel } from './opportunity-rail-label.ts'

const failures = []
function must(c, m) {
  if (!c) failures.push(m)
}

must(opportunityRailLabel({ title: '  Eng  ' }) === 'Eng', 'title wins')
must(opportunityRailLabel({ title: '', company: 'Acme' }) === 'Acme', 'company when no title')
must(
  opportunityRailLabel({ urlLabel: 'jobs.example.com/x' }) === 'jobs.example.com/x',
  'urlLabel fallback',
)
must(opportunityRailLabel({}) === 'target', 'fallback target')
// title beats urlLabel
must(
  opportunityRailLabel({ title: 'T', urlLabel: 'u.example' }) === 'T',
  'title over url',
)

console.log('=== opportunity-rail-label.verify ===')
if (failures.length) {
  for (const f of failures) console.error('FAIL', f)
  process.exit(1)
}
console.log('ALL CHECKS PASSED')
