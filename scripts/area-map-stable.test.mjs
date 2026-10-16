import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stableAreas } from './area-map-stable.mjs'

const doc = (sha, commits, edge) => [
  '<!-- area-map-graph:mermaid -->',
  `  ${edge}`,
  `Edges were read on main at \`${sha}\`: 88 directed edges.`,
  '<!-- /area-map-graph:mermaid -->',
  '<!-- area-map-graph:cadence -->',
  `| shell | functional | ${commits} / 636 |`,
  '<!-- /area-map-graph:cadence -->',
].join('\n')

test('a new main commit or new counts alone pass', () => {
  assert.equal(stableAreas(doc('99c54b6', 5, 'ingest --> store')), stableAreas(doc('dcb596e', 6, 'ingest --> store')))
})

test('an edge change still fails', () => {
  assert.notEqual(stableAreas(doc('99c54b6', 5, 'ingest --> store')), stableAreas(doc('99c54b6', 5, 'store --> ingest')))
})
