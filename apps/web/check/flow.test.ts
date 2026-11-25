import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { match, parsePool } from '../../../packages/core/src/index.ts';
import { next, START, type EventType, type FlowEvent, type Snap, type Step } from '../src/flow.ts';
import { buildApplyPack, buildCvOutline } from '../src/page-tools.ts';
import { EDGES, EVENTS, EXPECTED, LIFECYCLE, STEPS, coverPaths, covered, MACHINE_STEPS, ORACLE_EDGES } from '../tests/flow-model.ts';

const pool = parsePool(JSON.parse(readFileSync(new URL('../../../packages/core/fixtures/pool.sample.json', import.meta.url), 'utf8')))._unsafeUnwrap();
const result = match({ description: 'Senior backend engineer with Go and Postgres, distributed systems' }, pool, { now: new Date('2026-11-19T20:00:00Z') })._unsafeUnwrap();
const label = (r: { title: string; company: string }) => `${r.title} at ${r.company}`;
const rows = Object.values(result.groups).flat().filter((r, i, all) => all.findIndex(x => label(x) === label(r)) === i).slice(0, 2);
const roles = rows.map(row => ({ row, pack: buildApplyPack(row) }));
let asks = 0;

const payload = (type: EventType, k = 0): FlowEvent => {
  const { row, pack } = roles[k % 2]!;
  switch (type) {
    case 'MATCHED': return { type, view: { kind: 'results', result, ms: 1 } };
    case 'MATCH_FAILED': return { type, view: { kind: 'outOfScope', reason: 'sample' } };
    case 'TAILOR': return { type, outline: buildCvOutline('Go and Postgres', row) };
    case 'PACK': return { type, pack };
    case 'REQUEST_CONFIRM': return { type, ask: { id: asks += 1, title: 'Person confirm needed', body: `apply for ${label(row)}`, pack } };
    default: return { type } as FlowEvent;
  }
};

const shows = (n: Snap, ev: FlowEvent, newest: { body: string; url: string } | null) => {
  const results = n.view.kind === 'results';
  if (n.step === 'loading' || n.step === 'failed') assert.equal(n.view.kind, 'idle');
  else if (n.step === 'find') assert.ok(!results && n.outline === null && n.pack === null && n.ask === null, 'find shows no results or cards');
  else assert.ok(results, `${n.step} shows results`);
  if (n.step === 'tailored') assert.ok(ev.type === 'TAILOR' && n.outline?.roleId === ev.outline.roleId && n.pack === null, 'tailored shows only the new outline');
  if (n.step === 'pack') assert.ok(ev.type === 'PACK' && n.pack?.url === ev.pack.url, 'pack shows the new pack');
  if (n.step === 'confirming') assert.ok(n.ask?.body === newest?.body && n.ask?.pack.url === newest?.url, 'confirming holds the newest request');
  if (n.step === 'confirmed') assert.ok(n.ask === null && n.pack?.url === newest?.url, 'confirmed shows the newest request\'s pack');
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
    let newest: { body: string; url: string } | null = null;
    for (const [k, edge] of path.entries()) {
      assert.equal(s.step, edge.from);
      const ev = payload(edge.event, k);
      if (ev.type === 'REQUEST_CONFIRM') newest = { body: ev.ask.body, url: ev.ask.pack.url };
      const n = next(s, ev);
      assert.ok(n, `${edge.from} --${edge.event}--> rejected, expected ${edge.to}`);
      assert.equal(n.step, edge.to, `${edge.from} --${edge.event}-->`);
      assert.equal(n.version, s.version + (LIFECYCLE.has(edge.event) ? 0 : 1));
      shows(n, ev, newest);
      if (n.step === 'confirming') assert.equal(n.pack, s.pack, 'a pending request leaves the visible pack alone');
      if (!at.has(n.step)) at.set(n.step, n);
      s = n;
    }
    passed += 1;
  });
}

test('two distinct roles drive the paths', () => {
  assert.equal(roles.length, 2);
  assert.notEqual(roles[0]!.pack.url, roles[1]!.pack.url);
  assert.notEqual(label(roles[0]!.row), label(roles[1]!.row));
});

for (const [name, first] of [['confirm A then B', 'REQUEST_CONFIRM'], ['pack A then confirm B', 'PACK']] as const) {
  test(`${name}: Confirm shows B's pack, never A's`, () => {
    const start = [{ type: 'POOL_LOADED' }, payload('MATCHED')] as FlowEvent[];
    let s = start.reduce((a: Snap, e) => next(a, e)!, START);
    s = next(s, payload(first, 0))!;
    const shownPack = s.pack;
    const b = payload('REQUEST_CONFIRM', 1);
    s = next(s, b)!;
    assert.equal(s.step, 'confirming');
    assert.ok(b.type === 'REQUEST_CONFIRM');
    assert.equal(s.pack, shownPack, 'pending request cannot change the visible pack');
    assert.notEqual(s.pack?.url, b.ask.pack.url, 'B stays hidden before Confirm');
    assert.equal(s.ask?.body, b.ask.body);
    assert.equal(s.ask?.pack.url, roles[1]!.pack.url);
    s = next(s, { type: 'CONFIRM' })!;
    assert.equal(s.step, 'confirmed');
    assert.equal(s.pack?.url, roles[1]!.pack.url);
    assert.notEqual(s.pack?.url, roles[0]!.pack.url);
  });
}

test('every expected transition is covered by a path', () => {
  assert.equal(covered(paths), EDGES.length);
  assert.deepEqual([...MACHINE_STEPS].sort(), [...STEPS].sort());
  const key = (e: { from: string; event: string; to: string }) => `${e.from}:${e.event}:${e.to}`;
  assert.deepEqual(EDGES.map(key).sort(), ORACLE_EDGES.map(key).sort());
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
