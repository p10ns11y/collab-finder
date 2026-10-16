import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stableAreas } from './area-map-stable.mjs'

const base = {
  sha: '99c54b6',
  edges: 88,
  edge: 'credentials --> runtime',
  day: '2026-09-16',
  rows: [
    '| hunt | functional | 4 / 2,891 | 28 / 8,765 | 4 / 8 (8) | Nightly | 1,500+ lines in 30 days |',
    '| shell | functional | 5 / 636 | 23 / 4,747 | 11 / 10 (11) | Nightly | 10+ neighbours |',
    '| ops | ops | 2 / 40 | 9 / 300 | 0 / 0 (0) | Weekly | no import edges, but it sets which checks run |',
  ],
  apart: '30 days 3 commits / 1,751 lines',
}

const doc = (o = {}) => {
  const d = { ...base, ...o }
  return [
    '<!-- area-map-graph:mermaid -->',
    `  ${d.edge}`,
    `Edges were read on main at \`${d.sha}\`: ${d.edges} directed edges.`,
    '<!-- /area-map-graph:mermaid -->',
    '<!-- area-map-graph:cadence -->',
    `Lines on main from ${d.day} (30 days).`,
    '| Area | Kind | 30 | 90 | Edges | Cadence | Reason |',
    '|---|---|---|---|---|---|---|',
    ...d.rows,
    '',
    `Apart from area rows: ${d.apart}.`,
    '<!-- /area-map-graph:cadence -->',
  ].join('\n')
}

const same = (o) => assert.equal(stableAreas(doc(o)), stableAreas(doc()))
const differs = (o) => assert.notEqual(stableAreas(doc(o)), stableAreas(doc()))

test('a new main SHA alone passes', () => same({ sha: 'dcb596e' }))

test('new counts, dates and row order alone pass', () =>
  same({
    day: '2026-09-17',
    apart: '30 days 4 commits / 1,900 lines',
    rows: [
      '| shell | functional | 6 / 723 | 24 / 4,834 | 11 / 10 (11) | Nightly | 10+ neighbours |',
      '| hunt | functional | 4 / 2,891 | 28 / 8,765 | 4 / 8 (8) | Nightly | 1,500+ lines in 30 days |',
      base.rows[2],
    ],
  }))

test('an edge change still fails', () => differs({ edge: 'runtime --> credentials' }))

test('the edge count still fails', () => differs({ edges: 89 }))

test('a per-area in/out change fails', () =>
  differs({ rows: [base.rows[0], base.rows[1].replace('11 / 10 (11)', '11 / 11 (11)'), base.rows[2]] }))

test('an ownership band change fails', () =>
  differs({ rows: [base.rows[0], base.rows[1], base.rows[2].replace('| Weekly | no import edges, but it sets which checks run |', '| Nightly | owns the backup path |')] }))
