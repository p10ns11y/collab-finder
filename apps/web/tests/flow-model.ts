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

const shortestPrefixes = (): ReadonlyMap<Step, ReadonlyArray<Edge>> => {
  const prefix = new Map<Step, ReadonlyArray<Edge>>([['loading', []]]);
  const queue: Step[] = ['loading'];
  while (queue.length > 0) {
    const from = queue.shift()!;
    for (const e of EDGES.filter(x => x.from === from)) {
      if (prefix.has(e.to)) continue;
      prefix.set(e.to, [...prefix.get(from)!, e]);
      queue.push(e.to);
    }
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
