// Drops the parts of AREAS.md that move on every merge: the main commit
// in the graph prose and the whole cadence block (history counts).
// --check compares what is left: edges and area ownership.
export function stableAreas(text) {
  return text
    .replace(/on main at `[0-9a-f]{7,40}`/g, 'on main at `<sha>`')
    .replace(
      /<!-- area-map-graph:cadence -->[\s\S]*?<!-- \/area-map-graph:cadence -->/g,
      '<!-- area-map-graph:cadence --><!-- /area-map-graph:cadence -->',
    )
}
