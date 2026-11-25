import { getShortestPaths } from '@xstate/graph';
import { createMachine } from 'xstate';
import type { EventType, Step } from '../src/flow.ts';

export type Edge = { from: Step; event: EventType; to: Step };

const afterResults = { EDIT: 'find', MATCHED: 'matched', MATCH_FAILED: 'find', TAILOR: 'tailored', PACK: 'pack', REQUEST_CONFIRM: 'confirming' } as const;

export const EXPECTED: Readonly<Record<Step, Partial<Record<EventType, Step>>>> = {
  loading: { POOL_LOADED: 'find', POOL_FAILED: 'failed' },
  failed: { RETRY: 'loading' },
  find: { EDIT: 'find', MATCHED: 'matched', MATCH_FAILED: 'find' },
  matched: { ...afterResults },
  tailored: { ...afterResults },
  pack: { ...afterResults },
  confirmed: { ...afterResults },
  confirming: { REQUEST_CONFIRM: 'confirming', CONFIRM: 'confirmed', CANCEL: 'matched', CONFIRM_FAILED: 'matched' },
};

export const STEPS = Object.keys(EXPECTED) as Step[];
export const EVENTS: ReadonlyArray<EventType> = ['POOL_LOADED', 'POOL_FAILED', 'RETRY', 'EDIT', 'MATCHED', 'MATCH_FAILED', 'TAILOR', 'PACK', 'REQUEST_CONFIRM', 'CONFIRM', 'CANCEL', 'CONFIRM_FAILED'];
export const LIFECYCLE: ReadonlySet<EventType> = new Set(['POOL_LOADED', 'POOL_FAILED', 'RETRY']);

export const EDGES: ReadonlyArray<Edge> = STEPS.flatMap(from => EVENTS.flatMap(event => {
  const to = EXPECTED[from][event];
  return to ? [{ from, event, to }] : [];
}));

export const model = createMachine({
  id: 'expected',
  initial: 'loading',
  states: Object.fromEntries(STEPS.map(from => [from, { on: Object.fromEntries(Object.entries(EXPECTED[from]).map(([event, to]) => [event, { target: to }])) }])),
});

const shortestPrefixes = (): ReadonlyMap<Step, ReadonlyArray<Edge>> => {
  const prefix = new Map<Step, ReadonlyArray<Edge>>();
  for (const path of getShortestPaths(model, { events: EVENTS.map(type => ({ type })) })) {
    const steps = path.steps.slice(1);
    const edges = steps.map((st, k) => ({ from: String((k ? steps[k - 1]! : path.steps[0]!).state.value) as Step, event: st.event.type as EventType, to: String(st.state.value) as Step }));
    prefix.set(String(path.state.value) as Step, edges);
  }
  return prefix;
};

export const coverPaths = (): ReadonlyArray<ReadonlyArray<Edge>> => {
  const prefix = shortestPrefixes();
  const all = EDGES.map(e => [...(prefix.get(e.from) ?? []), e]);
  const key = (p: ReadonlyArray<Edge>) => p.map(e => `${e.from}:${e.event}`).join('>');
  return all.filter(p => !all.some(q => q.length > p.length && key(q).startsWith(`${key(p)}>`)));
};

export const covered = (paths: ReadonlyArray<ReadonlyArray<Edge>>): number =>
  new Set(paths.flat().map(e => `${e.from}:${e.event}`)).size;
