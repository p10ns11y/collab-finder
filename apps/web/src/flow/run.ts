import { createActor } from 'xstate';
import { flow, type FlowEvent } from './machine.ts';
import { SAMPLE } from './sample.ts';

export const actor = createActor(flow).start();
export const replay = new URLSearchParams(location.search).has('replay');
let version = 0;
export const stateVersion = () => version;

export function auto(e: FlowEvent) {
  if (e.type === 'FIND') version += 1;
  actor.send(e);
  if (replay) return;
  const s = actor.getSnapshot();
  if (s.value === 'matching') actor.send({ type: 'MATCHED', roles: SAMPLE });
  const t = actor.getSnapshot();
  if (t.value === 'tailoring' && t.context.picked) actor.send({ type: 'TAILORED', outline: { roleId: t.context.picked.id, emphasize: t.context.picked.reasons } });
}
