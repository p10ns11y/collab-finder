import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { link, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
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
export type ApprovalRejectReason = 'inside-git' | 'invalid' | 'signature' | 'expired' | 'reused' | 'missing-key';
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
export const APPROVAL_NAMESPACE = 'kanithanj-approve';
const APPROVAL_PRINCIPAL = 'owner';

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

export const allowedSignersPath = (env: Readonly<Record<string, string | undefined>>): string => env['KANITHANJ_ALLOWED_SIGNERS']?.trim() ?? '';

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
  if (typeof row['approvedAt'] !== 'string' || typeof row['expiresAt'] !== 'string') return null;
  if (typeof row['used'] !== 'boolean') return null;
  if (!Number.isFinite(stamp(row['approvedAt'])) || !Number.isFinite(stamp(row['expiresAt']))) return null;
  return { id: row['id'], postingIds, approvedBy: 'owner', approvedAt: row['approvedAt'], expiresAt: row['expiresAt'], used: row['used'] };
};

const brand = (fields: Omit<OwnerApproval, typeof approved>): OwnerApproval => ({ ...fields, [approved]: true });

const outside = (file: string): { resolved: string } | 'missing' | 'inside-git' => {
  let resolved: string;
  try { resolved = realpathSync(file); } catch { return 'missing'; }
  if (inWorkTree(path.resolve(file)) || inWorkTree(resolved)) return 'inside-git';
  return { resolved };
};

const signatureOk = (batchFile: string, signers: string): boolean => {
  const sig = `${batchFile}.sig`;
  if (!signers || !existsSync(signers) || !existsSync(batchFile) || !existsSync(sig)) return false;
  const verified = spawnSync('ssh-keygen', ['-Y', 'verify', '-f', signers, '-I', APPROVAL_PRINCIPAL, '-n', APPROVAL_NAMESPACE, '-s', sig], { input: readFileSync(batchFile) });
  return verified.status === 0;
};

export function readApprovals(file: string, now: string, ledger: Ledger, signers: string = allowedSignersPath(process.env)): Result<ApprovalRead, { reason: 'inside-git' | 'invalid' | 'signature' | 'missing-key' }> {
  if (!signers) return err({ reason: 'missing-key' });
  const pinned = outside(signers);
  if (pinned === 'missing') return err({ reason: 'missing-key' });
  if (pinned === 'inside-git') return err({ reason: 'inside-git' });
  const batch = outside(file);
  if (batch === 'missing') return err({ reason: 'invalid' });
  if (batch === 'inside-git') return err({ reason: 'inside-git' });
  if (!signatureOk(batch.resolved, pinned.resolved)) return err({ reason: 'signature' });
  let parsed: unknown;
  try { parsed = JSON.parse(readFileSync(batch.resolved, 'utf8')); } catch { return err({ reason: 'invalid' }); }
  const body = approvalBody(parsed);
  if (!body) return err({ reason: 'invalid' });
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

type StoredEntry = LedgerEntry & { readonly seq: string };

const isStored = (value: unknown): value is StoredEntry => {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return typeof row['key'] === 'string' && typeof row['postingId'] === 'string' && typeof row['state'] === 'string' && typeof row['at'] === 'string' && typeof row['seq'] === 'string';
};

let appendSeq = 0;
export const fileLedger = (dir: string): LedgerStore => ({
  async read() {
    let names: string[];
    try { names = await readdir(dir); } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
    const rows: StoredEntry[] = [];
    for (const name of names) {
      if (name.startsWith('.')) continue;
      const parsed: unknown = JSON.parse(await readFile(path.join(dir, name), 'utf8'));
      if (!isStored(parsed)) continue;
      rows.push(parsed);
    }
    rows.sort((a, b) => a.seq < b.seq ? -1 : a.seq > b.seq ? 1 : 0);
    return rows.map(row => ({ key: row.key, postingId: row.postingId, state: row.state as LedgerState, at: row.at, ...(row.batchId ? { batchId: row.batchId } : {}) }));
  },
  async append(entry) {
    if (entry.key.includes('/') || entry.key.includes('\0')) throw new Error('ledger key');
    await mkdir(dir, { recursive: true });
    const seq = `${process.hrtime.bigint().toString().padStart(20, '0')}-${process.pid}-${appendSeq += 1}`;
    const finalName = path.join(dir, encodeURIComponent(entry.key));
    const temp = path.join(dir, `.${encodeURIComponent(entry.key)}.${seq}`);
    await writeFile(temp, JSON.stringify({ ...entry, seq }));
    try {
      await link(temp, finalName);
      return 'inserted';
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') return 'exists';
      throw error;
    } finally {
      await rm(temp, { force: true });
    }
  },
});

export async function applyRun(postingIds: ReadonlyArray<string>, store: LedgerStore, driver: FormDriver, now: () => string, approvals?: string): Promise<ReadonlyArray<ApplyOutcome>> {
  const signers = allowedSignersPath(process.env);
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
      const loaded = readApprovals(approvals, now(), await store.read(), signers);
      if (loaded.isErr()) error = { kind: 'ApprovalRejected', postingId: id, reason: loaded.error.reason };
      else {
        const reason = loaded.value.rejected.get(id);
        const approval = loaded.value.accepted.get(id);
        if (reason) error = { kind: 'ApprovalRejected', postingId: id, reason };
        else if (approval) {
          const won = await advance('submitting', approval);
          if (!error && won) {
            let stillSigned = false;
            try { stillSigned = signatureOk(realpathSync(approvals), signers ? realpathSync(signers) : ''); } catch { stillSigned = false; }
            if (!stillSigned) error = { kind: 'ApprovalRejected', postingId: id, reason: signers ? 'signature' : 'missing-key' };
            else { await driver.submit(id, approval); await advance('submitted'); }
          }
        }
      }
    }
    out.push({ postingId: id, state: stateOf(await store.read(), id), ...(error ? { error } : {}) });
  }
  return out;
}
