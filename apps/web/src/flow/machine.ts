import { assign, setup } from 'xstate';

export type Role = { id: string; title: string; company: string; url: string; reasons: ReadonlyArray<string> };
export type Outline = { roleId: string; emphasize: ReadonlyArray<string> };
export type Pack = { roleId: string; url: string; checklist: ReadonlyArray<string>; applied: false; sent: false };

export type FlowContext = {
  poolSize: number;
  query: string;
  roles: ReadonlyArray<Role>;
  picked: Role | null;
  outline: Outline | null;
  pack: Pack | null;
  confirmed: boolean;
  applied: false;
  sent: false;
  error: string | null;
};

export type FlowEvent =
  | { type: 'POOL_LOADED'; size: number }
  | { type: 'POOL_FAILED'; error: string }
  | { type: 'RETRY' }
  | { type: 'FIND'; query: string }
  | { type: 'MATCHED'; roles: ReadonlyArray<Role> }
  | { type: 'MATCH_FAILED'; error: string }
  | { type: 'PICK'; id: string }
  | { type: 'TAILORED'; outline: Outline }
  | { type: 'PACK' }
  | { type: 'REQUEST_CONFIRM' }
  | { type: 'CONFIRM' }
  | { type: 'CANCEL' }
  | { type: 'CONFIRM_FAILED'; error: string }
  | { type: 'BACK' };

export const CHECKLIST: ReadonlyArray<string> = [
  'Read the live posting.',
  'Check that the role is still open.',
  'A person confirms before any apply or send step.',
  'This page does not apply or send for you.',
];

const initial: FlowContext = { poolSize: 0, query: '', roles: [], picked: null, outline: null, pack: null, confirmed: false, applied: false, sent: false, error: null };

export const flow = setup({
  types: { context: {} as FlowContext, events: {} as FlowEvent },
  guards: {
    hasQuery: ({ event }) => event.type === 'FIND' && event.query.trim().length > 0,
    hasRoles: ({ event }) => event.type === 'MATCHED' && event.roles.length > 0,
    knownRole: ({ context, event }) => event.type === 'PICK' && context.roles.some(r => r.id === event.id),
    tailoredPicked: ({ context, event }) => event.type === 'TAILORED' && event.outline.roleId === context.picked?.id,
  },
}).createMachine({
  id: 'collab',
  initial: 'sources',
  context: initial,
  states: {
    sources: {
      on: {
        POOL_LOADED: { target: 'find', actions: assign({ poolSize: ({ event }) => event.size, error: null }) },
        POOL_FAILED: { target: 'sourcesFailed', actions: assign({ error: ({ event }) => event.error }) },
      },
    },
    sourcesFailed: { on: { RETRY: { target: 'sources', actions: assign({ error: null }) } } },
    find: {
      on: { FIND: { guard: 'hasQuery', target: 'matching', actions: assign({ query: ({ event }) => event.query, error: null }) } },
    },
    matching: {
      on: {
        MATCHED: [
          { guard: 'hasRoles', target: 'matched', actions: assign({ roles: ({ event }) => event.roles }) },
          { target: 'find', actions: assign({ roles: [], error: 'No roles fit yet. Widen the filters or add sources.' }) },
        ],
        MATCH_FAILED: { target: 'find', actions: assign({ roles: [], error: ({ event }) => event.error }) },
      },
    },
    matched: {
      on: {
        PICK: { guard: 'knownRole', target: 'tailoring', actions: assign({ picked: ({ context, event }) => context.roles.find(r => r.id === event.id) ?? null, outline: null, pack: null }) },
        FIND: { guard: 'hasQuery', target: 'matching', actions: assign({ query: ({ event }) => event.query, picked: null }) },
      },
    },
    tailoring: { on: { TAILORED: { guard: 'tailoredPicked', target: 'tailored', actions: assign({ outline: ({ event }) => event.outline }) } } },
    tailored: {
      on: {
        PACK: { target: 'pack', actions: assign({ pack: ({ context }) => context.picked && { roleId: context.picked.id, url: context.picked.url, checklist: CHECKLIST, applied: false, sent: false } }) },
        BACK: 'matched',
      },
    },
    pack: { on: { REQUEST_CONFIRM: { target: 'confirming', actions: assign({ error: null }) }, BACK: 'matched' } },
    confirming: {
      on: {
        CONFIRM: { target: 'confirmed', actions: assign({ confirmed: true }) },
        CANCEL: { target: 'pack', actions: assign({ confirmed: false, error: 'A person cancelled. Nothing was applied or sent.' }) },
        CONFIRM_FAILED: { target: 'pack', actions: assign({ confirmed: false, error: ({ event }) => event.error }) },
      },
    },
    confirmed: { on: { BACK: { target: 'matched', actions: assign({ confirmed: false, picked: null, outline: null, pack: null }) } } },
  },
});

export type FlowState = 'sources' | 'sourcesFailed' | 'find' | 'matching' | 'matched' | 'tailoring' | 'tailored' | 'pack' | 'confirming' | 'confirmed';

export const TOOL_EVENTS = {
  find_roles: ['FIND'],
  tailor_cv: ['PICK'],
  show_apply_pack: ['PACK', 'REQUEST_CONFIRM'],
} as const satisfies Record<string, ReadonlyArray<FlowEvent['type']>>;

export const STATE_VIEW: Record<FlowState, string> = {
  sources: 'Loading sources',
  sourcesFailed: 'Sources did not load',
  find: 'Describe what you do',
  matching: 'Matching',
  matched: 'Roles that fit',
  tailoring: 'Tailoring',
  tailored: 'CV outline',
  pack: 'Apply pack',
  confirming: 'Confirm',
  confirmed: 'Confirmed. Open the posting yourself.',
};
