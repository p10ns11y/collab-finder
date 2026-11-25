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

const shown = { EDIT: 'find', MATCHED: 'matched', MATCH_FAILED: 'find', TAILOR: 'tailored', PACK: 'pack', REQUEST_CONFIRM: 'confirming' } as const;

export const TABLE: Readonly<Record<Step, Partial<Record<EventType, Step>>>> = {
  loading: { POOL_LOADED: 'find', POOL_FAILED: 'failed' },
  failed: { RETRY: 'loading' },
  find: { EDIT: 'find', MATCHED: 'matched', MATCH_FAILED: 'find' },
  matched: shown,
  tailored: shown,
  pack: shown,
  confirmed: shown,
  confirming: { REQUEST_CONFIRM: 'confirming', CONFIRM: 'confirmed', CANCEL: 'matched', CONFIRM_FAILED: 'matched' },
};

const LIFECYCLE: ReadonlySet<EventType> = new Set(['POOL_LOADED', 'POOL_FAILED', 'RETRY']);

export const START: Snap = { step: 'loading', version: 0, view: { kind: 'idle' }, outline: null, pack: null, ask: null };

export function next(s: Snap, e: FlowEvent): Snap | null {
  const step = TABLE[s.step][e.type];
  if (!step) return null;
  if ((e.type === 'MATCHED' || e.type === 'MATCH_FAILED') && (e.type === 'MATCHED') !== (e.view.kind === 'results')) return null;
  const n: Snap = { ...s, step, version: LIFECYCLE.has(e.type) ? s.version : s.version + 1 };
  switch (e.type) {
    case 'EDIT': return { ...n, view: { kind: 'idle' }, outline: null, pack: null };
    case 'MATCHED':
    case 'MATCH_FAILED': return { ...n, view: e.view, outline: null, pack: null };
    case 'TAILOR': return { ...n, outline: e.outline, pack: null };
    case 'PACK': return { ...n, pack: e.pack };
    case 'REQUEST_CONFIRM': return { ...n, ask: e.ask };
    case 'CONFIRM': return { ...n, pack: s.ask?.pack ?? null, ask: null };
    case 'CANCEL':
    case 'CONFIRM_FAILED': return { ...n, ask: null };
    default: return n;
  }
}
