import { test } from 'node:test';
import fc from 'fast-check';
import { applyWrite, type StateVersion, type Versioned } from '../src/state.ts';
import type { Actor } from '../src/errors.ts';

type Op = { by: Actor; lag: number; add: string };
test('stale write: a write on an old version is refused, every accepted write bumps the version by one, no update is lost', () => {
  fc.assert(fc.property(fc.array(fc.record({ by: fc.constantFrom<Actor>('human', 'agent'), lag: fc.nat({ max: 3 }), add: fc.string({ maxLength: 3 }) }), { maxLength: 40 }), (ops: Op[]) => {
    let cur: Versioned<ReadonlyArray<string>> = { version: 0 as StateVersion, by: 'human', value: [] };
    const accepted: string[] = [];
    for (const op of ops) {
      const base = Math.max(0, cur.version - op.lag) as StateVersion;
      const r = applyWrite(cur, { baseVersion: base, by: op.by, next: v => [...v, op.add] });
      if (r.isOk()) {
        if (op.lag > 0 && cur.version > 0) return false;
        if (r.value.version !== cur.version + 1 || r.value.by !== op.by) return false;
        cur = r.value;
        accepted.push(op.add);
      } else if (r.error.kind !== 'StaleWrite' || base === cur.version) return false;
    }
    return cur.version === accepted.length && JSON.stringify(cur.value) === JSON.stringify(accepted);
  }), { numRuns: 500, seed: 20261120 });
});
