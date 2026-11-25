import { getShortestPaths } from '@xstate/graph';
import { transition } from 'xstate';
import { flowMachine, type EventType, type FlowEvent, type Step } from '../src/flow.ts';

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

const probe = (type: EventType): FlowEvent => {
  switch (type) {
    case 'MATCHED': return { type, view: { kind: 'results', result: {} as never, ms: 0 } };
    case 'MATCH_FAILED': return { type, view: { kind: 'outOfScope', reason: 'probe' } };
    case 'TAILOR': return { type, outline: {} as never };
    case 'PACK': return { type, pack: {} as never };
    case 'REQUEST_CONFIRM': return { type, ask: { id: 0, title: '', body: '', pack: {} as never } };
    default: return { type } as FlowEvent;
  }
};
const PROBES = EVENTS.map(probe);
const stepOf = (value: unknown) => String(value) as Step;

const graph = getShortestPaths(flowMachine, { events: PROBES, serializeState: s => stepOf(s.value) });

export const MACHINE_STEPS: ReadonlyArray<Step> = graph.map(p => stepOf(p.state.value));

export const EDGES: ReadonlyArray<Edge> = graph.flatMap(p => PROBES.flatMap(ev => {
  if (!p.state.can(ev)) return [];
  return [{ from: stepOf(p.state.value), event: ev.type, to: stepOf(transition(flowMachine, p.state, ev)[0].value) }];
}));

export const ORACLE_EDGES: ReadonlyArray<Edge> = STEPS.flatMap(from => EVENTS.flatMap(event => {
  const to = EXPECTED[from][event];
  return to ? [{ from, event, to }] : [];
}));

const prefixes = new Map<Step, ReadonlyArray<Edge>>(graph.map(p => {
  const steps = p.steps.slice(1);
  return [stepOf(p.state.value), steps.map((st, k) => ({ from: stepOf((k ? steps[k - 1]! : p.steps[0]!).state.value), event: st.event.type as EventType, to: stepOf(st.state.value) }))];
}));

export const coverPaths = (): ReadonlyArray<ReadonlyArray<Edge>> => {
  const all = EDGES.map(e => [...(prefixes.get(e.from) ?? []), e]);
  const key = (p: ReadonlyArray<Edge>) => p.map(e => `${e.from}:${e.event}`).join('>');
  return all.filter(p => !all.some(q => q.length > p.length && key(q).startsWith(`${key(p)}>`)));
};

export const covered = (paths: ReadonlyArray<ReadonlyArray<Edge>>): number =>
  new Set(paths.flat().map(e => `${e.from}:${e.event}`)).size;
