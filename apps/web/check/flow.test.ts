import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { match, parsePool } from '../../../packages/core/src/index.ts';
import { next, START, type EventType, type FlowEvent, type Snap, type Step } from '../src/flow.ts';
import { buildApplyPack, buildCvOutline } from '../src/page-tools.ts';
import { EDGES, EVENTS, EXPECTED, LIFECYCLE, STEPS, coverPaths, covered, model } from '../tests/flow-model.ts';

const pool = parsePool(JSON.parse(readFileSync(new URL('../../../packages/core/fixtures/pool.sample.json', import.meta.url), 'utf8')))._unsafeUnwrap();
const result = match({ description: 'Senior backend engineer with Go and Postgres, distributed systems' }, pool, { now: new Date('2026-11-19T20:00:00Z') })._unsafeUnwrap();
const row = Object.values(result.groups).flat()[0]!;
const pack = buildApplyPack(row);

const payload = (type: EventType): FlowEvent => {
  switch (type) {
    case 'MATCHED': return { type, view: { kind: 'results', result, ms: 1 } };
    case 'MATCH_FAILED': return { type, view: { kind: 'outOfScope', reason: 'sample' } };
    case 'TAILOR': return { type, outline: buildCvOutline('Go and Postgres', row) };
    case 'PACK': return { type, pack };
    case 'REQUEST_CONFIRM': return { type, ask: { id: 1, title: 'Person confirm needed', body: 'sample', pack } };
    default: return { type } as FlowEvent;
  }
};

const shows = (s: Snap, n: Snap, ev: FlowEvent) => {
  const results = n.view.kind === 'results';
  if (n.step === 'loading' || n.step === 'failed') assert.equal(n.view.kind, 'idle');
  else if (n.step === 'find') assert.ok(!results && n.outline === null && n.pack === null && n.ask === null, 'find shows no results or cards');
  else assert.ok(results, `${n.step} shows results`);
  if (n.step === 'tailored') assert.ok(ev.type === 'TAILOR' && n.outline === ev.outline && n.pack === null, 'tailored shows only the new outline');
  if (n.step === 'pack') assert.ok(ev.type === 'PACK' && n.pack === ev.pack, 'pack shows the new pack');
  if (n.step === 'confirming') assert.ok(ev.type === 'REQUEST_CONFIRM' && n.ask === ev.ask, 'confirming holds the newest ask');
  if (n.step === 'confirmed') assert.ok(n.ask === null && n.pack !== null && n.pack === s.ask?.pack, 'confirmed shows the asked pack');
  if (n.step !== 'confirming') assert.equal(n.ask, null);
  if (ev.type === 'MATCHED') assert.ok(n.outline === null && n.pack === null && n.view === ev.view);
  if (ev.type === 'MATCH_FAILED') assert.equal(n.view, ev.view);
};

const paths = coverPaths();
const at = new Map<Step, Snap>([['loading', START]]);
let passed = 0;

for (const [i, path] of paths.entries()) {
  test(`path ${i}: ${path.map(e => e.event).join(' > ')}`, () => {
    let s = START;
    for (const edge of path) {
      assert.equal(s.step, edge.from);
      const ev = payload(edge.event);
      const n = next(s, ev);
      assert.ok(n, `${edge.from} --${edge.event}--> rejected, expected ${edge.to}`);
      assert.equal(n.step, edge.to, `${edge.from} --${edge.event}-->`);
      assert.equal(n.version, s.version + (LIFECYCLE.has(edge.event) ? 0 : 1));
      shows(s, n, ev);
      if (!at.has(n.step)) at.set(n.step, n);
      s = n;
    }
    passed += 1;
  });
}

test('every expected transition is covered by a path', () => {
  assert.equal(covered(paths), EDGES.length);
  assert.deepEqual(Object.keys(model.config.states ?? {}).sort(), [...STEPS].sort());
});

test('every other event is refused and leaves the version alone', () => {
  for (const step of STEPS) {
    const s = at.get(step);
    assert.ok(s, `no snapshot for ${step}`);
    for (const type of EVENTS) {
      if (EXPECTED[step][type]) continue;
      assert.equal(next(s, payload(type)), null, `${step} accepted ${type}`);
    }
  }
});

test('a match event must carry the matching view kind', () => {
  const find = at.get('find')!;
  assert.equal(next(find, { type: 'MATCHED', view: { kind: 'idle' } }), null);
  assert.equal(next(find, { type: 'MATCH_FAILED', view: { kind: 'results', result, ms: 1 } }), null);
});

test.after(() => {
  const out = process.env['FLOW_REPORT'];
  if (out) writeFileSync(out, JSON.stringify({ paths: paths.length, transitions: EDGES.length, covered: covered(paths), passed }, null, 2));
});
