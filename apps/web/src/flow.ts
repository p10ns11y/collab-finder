import { assertEvent, assign, initialTransition, setup, transition, type SnapshotFrom } from 'xstate';
import type { MatchResult } from '../../../packages/core/src/index.ts';
import type { ApplyPack, CvOutline } from './page-tools.ts';

export type View =
  | { kind: 'idle' }
  | { kind: 'inputError'; msg: string }
  | { kind: 'piiWarning'; kinds: ReadonlyArray<string> }
  | { kind: 'outOfScope'; reason: string }
  | { kind: 'zeroResults'; widen: ReadonlyArray<string> }
  | { kind: 'results'; result: MatchResult; ms: number };

export type Ask = { id: number; title: string; body: string; pack: ApplyPack };
export type Step = 'loading' | 'failed' | 'find' | 'matched' | 'tailored' | 'pack' | 'confirming' | 'confirmed';
export type FlowEvent =
  | { type: 'POOL_LOADED' | 'POOL_FAILED' | 'RETRY' | 'EDIT' | 'CONFIRM' | 'CANCEL' | 'CONFIRM_FAILED' }
  | { type: 'MATCHED' | 'MATCH_FAILED'; view: View }
  | { type: 'TAILOR'; outline: CvOutline }
  | { type: 'PACK'; pack: ApplyPack }
  | { type: 'REQUEST_CONFIRM'; ask: Ask };
export type EventType = FlowEvent['type'];
export type Snap = { step: Step; version: number; view: View; outline: CvOutline | null; pack: ApplyPack | null; ask: Ask | null };

type Context = Omit<Snap, 'step'>;

const flowSetup = setup({
  types: { context: {} as Context, events: {} as FlowEvent },
  guards: {
    hasResults: ({ event }) => event.type === 'MATCHED' && event.view.kind === 'results',
    noResults: ({ event }) => event.type === 'MATCH_FAILED' && event.view.kind !== 'results',
  },
  actions: {
    bump: assign({ version: ({ context }) => context.version + 1 }),
    edit: assign({ view: { kind: 'idle' }, outline: null, pack: null }),
    show: assign({ view: ({ event }) => { assertEvent(event, ['MATCHED', 'MATCH_FAILED']); return event.view; }, outline: null, pack: null }),
    tailor: assign(({ event }) => { assertEvent(event, 'TAILOR'); return { outline: event.outline, pack: null }; }),
    showPack: assign({ pack: ({ event }) => { assertEvent(event, 'PACK'); return event.pack; } }),
    ask: assign({ ask: ({ event }) => { assertEvent(event, 'REQUEST_CONFIRM'); return event.ask; } }),
    confirm: assign(({ context }) => ({ pack: context.ask?.pack ?? null, ask: null })),
    close: assign({ ask: null }),
  },
});

const shown = {
  EDIT: { target: 'find', actions: ['bump', 'edit'] },
  MATCHED: { target: 'matched', guard: 'hasResults', actions: ['bump', 'show'] },
  MATCH_FAILED: { target: 'find', guard: 'noResults', actions: ['bump', 'show'] },
  TAILOR: { target: 'tailored', actions: ['bump', 'tailor'] },
  PACK: { target: 'pack', actions: ['bump', 'showPack'] },
  REQUEST_CONFIRM: { target: 'confirming', actions: ['bump', 'ask'] },
} as const;

export const flowMachine = flowSetup.createMachine({
  id: 'flow',
  initial: 'loading',
  context: { version: 0, view: { kind: 'idle' }, outline: null, pack: null, ask: null },
  states: {
    loading: { on: { POOL_LOADED: 'find', POOL_FAILED: 'failed' } },
    failed: { on: { RETRY: 'loading' } },
    find: { on: { EDIT: shown.EDIT, MATCHED: shown.MATCHED, MATCH_FAILED: shown.MATCH_FAILED } },
    matched: { on: shown },
    tailored: { on: shown },
    pack: { on: shown },
    confirmed: { on: shown },
    confirming: { on: {
      REQUEST_CONFIRM: shown.REQUEST_CONFIRM,
      CONFIRM: { target: 'confirmed', actions: ['bump', 'confirm'] },
      CANCEL: { target: 'matched', actions: ['bump', 'close'] },
      CONFIRM_FAILED: { target: 'matched', actions: ['bump', 'close'] },
    } },
  },
});

const snapOf = (m: SnapshotFrom<typeof flowMachine>): Snap => ({ step: m.value as Step, ...m.context });

export const START: Snap = snapOf(initialTransition(flowMachine)[0]);

export function next(s: Snap, e: FlowEvent): Snap | null {
  const { step, ...context } = s;
  const at = flowMachine.resolveState({ value: step, context });
  if (!at.can(e)) return null;
  return snapOf(transition(flowMachine, at, e)[0]);
}
