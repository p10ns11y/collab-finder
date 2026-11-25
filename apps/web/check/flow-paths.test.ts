import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { createActor } from 'xstate';
import { STATE_VIEW, TOOL_EVENTS, flow } from '../src/flow/machine.ts';
import { flowPaths } from '../src/flow/paths.ts';

const STATES = Object.keys(flow.config.states ?? {});
const paths = flowPaths();

test('every state is reachable and has a view', () => {
  const reached = new Set(paths.map(p => String(p.state.value)));
  assert.deepEqual([...reached].sort(), [...STATES].sort());
  for (const s of STATES) assert.ok(STATE_VIEW[s as keyof typeof STATE_VIEW], s);
});

test('each WebMCP tool sends events the machine handles', () => {
  const handled = new Set(STATES.flatMap(s => Object.keys(flow.config.states?.[s]?.on ?? {})));
  for (const events of Object.values(TOOL_EVENTS)) for (const e of events) assert.ok(handled.has(e), e);
});

let passed = 0;
for (const [i, path] of paths.entries()) {
  test(`path ${i}: ${path.steps.slice(1).map(s => s.event.type).join(' > ') || 'start'}`, () => {
    const actor = createActor(flow).start();
    for (const [j, step] of path.steps.entries()) {
      if (j > 0) actor.send(step.event);
      const snap = actor.getSnapshot();
      assert.deepEqual(snap.value, step.state.value);
      assert.equal(snap.context.applied, false);
      assert.equal(snap.context.sent, false);
      if (snap.context.confirmed) {
        assert.equal(snap.value, 'confirmed');
        assert.equal(step.event.type, 'CONFIRM');
        assert.equal(path.steps[j - 1]?.state.value, 'confirming');
      }
      if (snap.value === 'confirmed') assert.equal(snap.context.confirmed, true);
    }
    actor.stop();
    passed += 1;
  });
}

test.after(() => {
  const out = process.env['FLOW_PATHS_REPORT'];
  if (out) writeFileSync(out, JSON.stringify({ generated: paths.length, passed }, null, 2));
});
