import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { err, ok, type Result } from 'neverthrow';

export type LedgerState = 'drafted' | 'filled' | 'awaiting-submit' | 'submitting' | 'needs-check' | 'submitted' | 'rejected' | 'interview';
export type LedgerEntry = { readonly key: string; readonly postingId: string; readonly state: LedgerState; readonly at: string; readonly batchId?: string };
export type Ledger = ReadonlyArray<LedgerEntry>;
export type LedgerError =
  | { kind: 'BadTransition'; postingId: string; from: LedgerState | null; to: LedgerState }
  | { kind: 'NotInApprovedBatch'; postingId: string }
  | { kind: 'Unanswered'; postingId: string; questions: ReadonlyArray<string> }
  | { kind: 'ApprovalRejected'; postingId: string; reason: ApprovalRejectReason };
export type ApprovalRejectReason = 'inside-git' | 'invalid' | 'hash' | 'expired' | 'reused';
export type AppendResult = 'inserted' | 'exists';

const NEXT: Readonly<Record<LedgerState | 'none', ReadonlyArray<LedgerState>>> = {
  none: ['drafted'],
  drafted: ['filled'],
  filled: ['awaiting-submit'],
  'awaiting-submit': ['submitting', 'rejected'],
  submitting: ['submitted', 'needs-check'],
  'needs-check': ['submitted', 'rejected'],
  submitted: ['rejected', 'interview'],
  rejected: [],
  interview: [],
};
export const PAST_FILLED: ReadonlySet<LedgerState> = new Set(['filled', 'awaiting-submit', 'submitting', 'needs-check', 'submitted', 'rejected', 'interview']);

const approved: unique symbol = Symbol('owner-approval');
export type OwnerApproval = {
  readonly id: string;
  readonly postingId: string;
  readonly approvedBy: 'owner';
  readonly approvedAt: string;
  readonly expiresAt: string;
  readonly [approved]: true;
};
export type ApprovalRead = {
  readonly accepted: ReadonlyMap<string, OwnerApproval>;
  readonly rejected: ReadonlyMap<string, 'expired' | 'reused'>;
};
export type FormAnswer = { readonly question: string; readonly answer: string };
export type FillResult = { kind: 'Ready' } | { kind: 'Unanswered'; questions: ReadonlyArray<string> };

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const stamp = (value: string): number => ISO.test(value) ? Date.parse(value) : Number.NaN;

export const ownerApprovalHash = (fields: {
  readonly id: string;
  readonly postingIds: readonly string[];
  readonly approvedBy: 'owner';
  readonly approvedAt: string;
  readonly expiresAt: string;
  readonly used: boolean;
}): string => createHash('sha256').update(JSON.stringify({
  approvedAt: fields.approvedAt,
  approvedBy: fields.approvedBy,
  expiresAt: fields.expiresAt,
  id: fields.id,
  postingIds: [...fields.postingIds].sort(),
  used: fields.used,
})).digest('hex');

export const fillResult = (answers: ReadonlyArray<FormAnswer>): FillResult => {
  const questions = answers.filter(a => a.answer.trim() === '').map(a => a.question);
  return answers.length === 0 || questions.length > 0 ? { kind: 'Unanswered', questions } : { kind: 'Ready' };
};

export const approvalPath = (env: Readonly<Record<string, string | undefined>>, config: { readonly approvalPath?: string } = {}): string | undefined => {
  const configured = config.approvalPath?.trim();
  if (configured) return configured;
  const fromEnv = env['KANITHANJ_APPROVALS']?.trim();
  return fromEnv ? fromEnv : undefined;
};

const inWorkTree = (start: string): boolean => {
  let dir = path.resolve(start);
  for (;;) {
    if (existsSync(path.join(dir, '.git'))) return true;
    const parent = path.dirname(dir);
    if (parent === dir) return false;
    dir = parent;
  }
};

const consumed = (ledger: Ledger, postingId: string, batchId: string): boolean =>
  ledger.some(e => e.postingId === postingId && e.batchId === batchId && (e.state === 'submitting' || e.state === 'needs-check' || e.state === 'submitted'));

type ApprovalBody = {
  readonly id: string;
  readonly postingIds: readonly string[];
  readonly approvedBy: 'owner';
  readonly approvedAt: string;
  readonly expiresAt: string;
  readonly used: boolean;
  readonly hash: string;
};

const isStringList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(item => typeof item === 'string' && item.length > 0) && new Set(value).size === value.length;

const approvalBody = (value: unknown): ApprovalBody | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const postingIds = row['postingIds'];
  if (typeof row['id'] !== 'string' || row['id'].length === 0) return null;
  if (!isStringList(postingIds) || postingIds.length === 0) return null;
  if (row['approvedBy'] !== 'owner') return null;
  if (typeof row['approvedAt'] !== 'string' || typeof row['expiresAt'] !== 'string' || typeof row['hash'] !== 'string') return null;
  if (typeof row['used'] !== 'boolean') return null;
  if (!Number.isFinite(stamp(row['approvedAt'])) || !Number.isFinite(stamp(row['expiresAt']))) return null;
  return {
    id: row['id'],
    postingIds,
    approvedBy: 'owner',
    approvedAt: row['approvedAt'],
    expiresAt: row['expiresAt'],
    used: row['used'],
    hash: row['hash'],
  };
};

const brand = (fields: Omit<OwnerApproval, typeof approved>): OwnerApproval => ({ ...fields, [approved]: true });

export function readApprovals(file: string, now: string, ledger: Ledger): Result<ApprovalRead, { reason: 'inside-git' | 'invalid' | 'hash' }> {
  let resolved: string;
  try { resolved = realpathSync(file); } catch { return err({ reason: 'invalid' }); }
  if (inWorkTree(path.resolve(file)) || inWorkTree(resolved)) return err({ reason: 'inside-git' });
  let parsed: unknown;
  try { parsed = JSON.parse(readFileSync(resolved, 'utf8')); } catch { return err({ reason: 'invalid' }); }
  const body = approvalBody(parsed);
  if (!body) return err({ reason: 'invalid' });
  const { hash, ...fields } = body;
  if (hash !== ownerApprovalHash(fields)) return err({ reason: 'hash' });
  const nowMs = stamp(now);
  if (!Number.isFinite(nowMs)) return err({ reason: 'invalid' });
  const accepted = new Map<string, OwnerApproval>();
  const rejected = new Map<string, 'expired' | 'reused'>();
  const expired = stamp(body.expiresAt) <= nowMs;
  for (const postingId of body.postingIds) {
    if (expired) rejected.set(postingId, 'expired');
    else if (body.used || consumed(ledger, postingId, body.id)) rejected.set(postingId, 'reused');
    else accepted.set(postingId, brand({ id: body.id, postingId, approvedBy: 'owner', approvedAt: body.approvedAt, expiresAt: body.expiresAt }));
  }
  return ok({ accepted, rejected });
}

export const entryKey = (postingId: string, state: LedgerState): string => `${postingId}#${state}`;
export const stateOf = (ledger: Ledger, postingId: string): LedgerState | null => {
  for (let i = ledger.length - 1; i >= 0; i -= 1) if (ledger[i]!.postingId === postingId) return ledger[i]!.state;
  return null;
};

export function nextEntry(ledger: Ledger, postingId: string, to: LedgerState, at: string, approval?: OwnerApproval): Result<LedgerEntry | null, LedgerError> {
  const from = stateOf(ledger, postingId);
  if (from === to) return ok(null);
  if (!NEXT[from ?? 'none'].includes(to)) return err({ kind: 'BadTransition', postingId, from, to });
  if (to === 'submitting' && approval?.postingId !== postingId) return err({ kind: 'NotInApprovedBatch', postingId });
  return ok({ key: entryKey(postingId, to), postingId, state: to, at, ...(to === 'submitting' && approval ? { batchId: approval.id } : {}) });
}

export interface LedgerStore { read(): Promise<Ledger>; append(entry: LedgerEntry): Promise<AppendResult> }
export interface FormDriver { fill(postingId: string): Promise<FillResult>; submit(postingId: string, approval: OwnerApproval): Promise<void> }
export type ApplyOutcome = { postingId: string; state: LedgerState | null; error?: LedgerError };

export async function applyRun(postingIds: ReadonlyArray<string>, store: LedgerStore, driver: FormDriver, now: () => string, approvals?: string): Promise<ReadonlyArray<ApplyOutcome>> {
  const out: ApplyOutcome[] = [];
  for (const id of [...new Set(postingIds)]) {
    let error: LedgerError | null = null;
    const advance = async (to: LedgerState, approval?: OwnerApproval): Promise<boolean> => {
      const entry = nextEntry(await store.read(), id, to, now(), approval);
      if (entry.isErr()) { error = entry.error; return false; }
      if (!entry.value) return false;
      return (await store.append(entry.value)) === 'inserted';
    };
    let s = stateOf(await store.read(), id);
    if (s === null) { await advance('drafted'); s = stateOf(await store.read(), id); }
    if (!error && s === 'drafted') {
      const filled = await driver.fill(id);
      switch (filled.kind) {
        case 'Unanswered':
          error = { kind: 'Unanswered', postingId: id, questions: filled.questions };
          break;
        case 'Ready':
          await advance('filled');
          s = stateOf(await store.read(), id);
          break;
        default: {
          const unreachable: never = filled;
          throw new Error(unreachable);
        }
      }
    }
    if (!error && s === 'filled') { await advance('awaiting-submit'); s = stateOf(await store.read(), id); }
    if (!error && s === 'submitting') { await advance('needs-check'); s = stateOf(await store.read(), id); }
    if (!error && s === 'awaiting-submit' && approvals) {
      const loaded = readApprovals(approvals, now(), await store.read());
      if (loaded.isErr()) error = { kind: 'ApprovalRejected', postingId: id, reason: loaded.error.reason };
      else {
        const reason = loaded.value.rejected.get(id);
        const approval = loaded.value.accepted.get(id);
        if (reason) error = { kind: 'ApprovalRejected', postingId: id, reason };
        else if (approval) {
          const won = await advance('submitting', approval);
          if (!error && won) { await driver.submit(id, approval); await advance('submitted'); }
        }
      }
    }
    out.push({ postingId: id, state: stateOf(await store.read(), id), ...(error ? { error } : {}) });
  }
  return out;
}
