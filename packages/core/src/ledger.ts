import { err, ok, type Result } from 'neverthrow';

export type LedgerState = 'drafted' | 'filled' | 'awaiting-submit' | 'submitting' | 'needs-check' | 'submitted' | 'rejected' | 'interview';
export type LedgerEntry = { readonly key: string; readonly postingId: string; readonly state: LedgerState; readonly at: string; readonly batchId?: string };
export type Ledger = ReadonlyArray<LedgerEntry>;
export type LedgerError =
  | { kind: 'BadTransition'; postingId: string; from: LedgerState | null; to: LedgerState }
  | { kind: 'NotInApprovedBatch'; postingId: string };

const NEXT: Readonly<Record<LedgerState | 'none', ReadonlyArray<LedgerState>>> = {
  none: ['drafted'],
  drafted: ['filled'],
  filled: ['awaiting-submit'],
  'awaiting-submit': ['submitting', 'rejected'],
  submitting: ['submitted', 'needs-check'],
  'needs-check': ['submitted', 'awaiting-submit'],
  submitted: ['rejected', 'interview'],
  rejected: [],
  interview: [],
};
export const PAST_FILLED: ReadonlySet<LedgerState> = new Set(['filled', 'awaiting-submit', 'submitting', 'needs-check', 'submitted', 'rejected', 'interview']);

declare const approved: unique symbol;
export type ApprovedBatch = { readonly id: string; readonly postingIds: ReadonlySet<string>; readonly approvedBy: 'owner'; readonly approvedAt: string; readonly [approved]: true };
export const approveBatch = (id: string, postingIds: Iterable<string>, approvedAt: string): ApprovedBatch =>
  ({ id, postingIds: new Set(postingIds), approvedBy: 'owner', approvedAt }) as unknown as ApprovedBatch;

export const entryKey = (postingId: string, state: LedgerState): string => `${postingId}#${state}`;
export const stateOf = (ledger: Ledger, postingId: string): LedgerState | null => {
  for (let i = ledger.length - 1; i >= 0; i -= 1) if (ledger[i]!.postingId === postingId) return ledger[i]!.state;
  return null;
};

export function nextEntry(ledger: Ledger, postingId: string, to: LedgerState, at: string, batch?: ApprovedBatch): Result<LedgerEntry | null, LedgerError> {
  const from = stateOf(ledger, postingId);
  if (from === to) return ok(null);
  if (!NEXT[from ?? 'none'].includes(to)) return err({ kind: 'BadTransition', postingId, from, to });
  if (to === 'submitting' && !batch?.postingIds.has(postingId)) return err({ kind: 'NotInApprovedBatch', postingId });
  return ok({ key: entryKey(postingId, to), postingId, state: to, at, ...(to === 'submitting' && batch ? { batchId: batch.id } : {}) });
}

export interface LedgerStore { read(): Promise<Ledger>; append(e: LedgerEntry): Promise<void> }
export interface FormDriver { fill(postingId: string): Promise<void>; submit(postingId: string, batch: ApprovedBatch): Promise<void> }
export type ApplyOutcome = { postingId: string; state: LedgerState | null; error?: LedgerError };

export async function applyRun(postingIds: ReadonlyArray<string>, store: LedgerStore, driver: FormDriver, now: () => string, batch?: ApprovedBatch): Promise<ReadonlyArray<ApplyOutcome>> {
  const out: ApplyOutcome[] = [];
  for (const id of [...new Set(postingIds)]) {
    const step = async (to: LedgerState): Promise<LedgerError | null> => {
      const e = nextEntry(await store.read(), id, to, now(), batch);
      if (e.isErr()) return e.error;
      if (e.value) await store.append(e.value);
      return null;
    };
    let s = stateOf(await store.read(), id);
    let error: LedgerError | null = null;
    if (s === null) { error = await step('drafted'); s = 'drafted'; }
    if (!error && s === 'drafted') { await driver.fill(id); error = await step('filled'); s = 'filled'; }
    if (!error && s === 'filled') { error = await step('awaiting-submit'); s = 'awaiting-submit'; }
    if (!error && s === 'submitting') { error = await step('needs-check'); s = 'needs-check'; }
    if (!error && s === 'awaiting-submit' && batch?.postingIds.has(id)) {
      error = await step('submitting');
      if (!error) { await driver.submit(id, batch); error = await step('submitted'); }
    }
    out.push({ postingId: id, state: stateOf(await store.read(), id), ...(error ? { error } : {}) });
  }
  return out;
}
