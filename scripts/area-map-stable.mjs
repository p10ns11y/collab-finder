// Normalises the parts of AREAS.md that move on every merge: the main SHA,
// the window dates, and the 30/90-day commit and line counts. Row order in
// the cadence table follows those counts, so rows are sorted by area.
// Edges, per-area in/out, cadence class and reason stay in the comparison.
const CADENCE = /(<!-- area-map-graph:cadence -->)([\s\S]*?)(<!-- \/area-map-graph:cadence -->)/g

function stableCadence(body) {
  const lines = body.split('\n')
  const rows = []
  const out = []
  for (const line of lines) {
    const cells = line.split('|')
    const isRow = cells.length === 9 && line.startsWith('| ') && !line.startsWith('| Area ') && !line.startsWith('|---')
    if (isRow) {
      cells[3] = ' <n> '
      cells[4] = ' <n> '
      rows.push(cells.join('|'))
      if (rows.length === 1) out.push('<rows>')
      continue
    }
    out.push(
      line
        .replace(/\d{4}-\d{2}-\d{2}/g, '<day>')
        .replace(/^(Apart from area rows:).*$/, '$1 <n>'),
    )
  }
  rows.sort()
  return out.join('\n').replace('<rows>', rows.join('\n'))
}

export function stableAreas(text) {
  return text
    .replace(/on main at `[0-9a-f]{7,40}`/g, 'on main at `<sha>`')
    .replace(CADENCE, (_, open, body, close) => open + stableCadence(body) + close)
}
