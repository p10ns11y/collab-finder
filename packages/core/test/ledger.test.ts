import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fc from 'fast-check';
import { ALLOWED_SIGNERS, applyRun, approvalPath, APPROVAL_NAMESPACE, fileLedger, fillResult, nextEntry, readApprovals, signerStat, stateOf, type FormDriver, type Ledger, type LedgerEntry, type LedgerStore, type OwnerApproval, type PinnedStat } from '../src/ledger.ts';
import * as ledgerApi from '../src/ledger.ts';

const keyDir = mkdtempSync(path.join(tmpdir(), 'cf-owner-key-'));
const ownerKey = path.join(keyDir, 'owner');
const signersFile = path.join(keyDir, 'allowed_signers');
if (spawnSync('ssh-keygen', ['-t', 'ed25519', '-f', ownerKey, '-N', '', '-q']).status !== 0) throw new Error('keygen');
writeFileSync(signersFile, `owner namespaces="${APPROVAL_NAMESPACE}" ${readFileSync(`${ownerKey}.pub`, 'utf8').trim()}\n`);
type PinKind = 'ok' | 'missing' | 'symlink' | 'group' | 'other' | 'user';
const pinCase = new AsyncLocalStorage<PinKind>();
const pinStat = (kind: PinKind): PinnedStat => {
  const symlink = kind === 'symlink';
  const mode = kind === 'group' ? 0o100664 : kind === 'other' ? 0o100646 : 0o100644;
  return { uid: kind === 'user' ? 1000 : 0, mode, isSymbolicLink: () => symlink, isFile: () => !symlink };
};
signerStat.lstat = (file) => {
  if (file !== ALLOWED_SIGNERS) throw new Error('signer path');
  const kind = pinCase.getStore() ?? 'ok';
  if (kind === 'missing') {
    const error = new Error('ENOENT') as NodeJS.ErrnoException;
    error.code = 'ENOENT';
    throw error;
  }
  return pinStat(kind);
};
signerStat.read = (file) => {
  if (file !== ALLOWED_SIGNERS) throw new Error('signer path');
  return readFileSync(signersFile);
};
const signBatch = (file: string, key = ownerKey): void => {
  const signed = spawnSync('ssh-keygen', ['-Y', 'sign', '-f', key, '-n', APPROVAL_NAMESPACE, file]);
  if (signed.status !== 0) throw new Error(signed.stderr.toString() || 'sign');
};

class Crash extends Error {}
const ready = fillResult([{ question: 'notice period', answer: '4 weeks' }]);
const world = (crashAt: ReadonlySet<number>) => {
  const ledger: LedgerEntry[] = [];
  const submits: string[] = [];
  const fills: string[] = [];
  let tick = 0;
  const maybeCrash = () => { tick += 1; if (crashAt.has(tick)) throw new Crash(`crash at ${tick}`); };
  const store: LedgerStore = {
    read: async () => [...ledger],
    append: async entry => { maybeCrash(); if (ledger.some(row => row.key === entry.key)) return 'exists'; ledger.push(entry); return 'inserted'; },
  };
  const driver: FormDriver = {
    fill: async id => { maybeCrash(); fills.push(id); return ready; },
    submit: async (id, approval) => { maybeCrash(); if (approval.postingId !== id) throw new Error('driver saw an unapproved submit'); submits.push(id); maybeCrash(); },
  };
  return { ledger, submits, fills, store, driver };
};
const clock = () => '2026-11-20T21:00:00Z';
const IDS = ['ashby:a1', 'greenhouse:2671957', 'lever:l9', 'ashby:b2', 'greenhouse:3700071'];
const scratch = () => mkdtempSync(path.join(tmpdir(), 'cf-ledger-'));
const batchFile = (file: string, postingIds: readonly string[], patch?: { id?: string; used?: boolean; expiresAt?: string }) => {
  const fields = {
    id: patch?.id ?? 'batch-1',
    postingIds: [...postingIds],
    approvedBy: 'owner' as const,
    approvedAt: clock(),
    expiresAt: patch?.expiresAt ?? '2026-11-27T21:00:00Z',
    used: patch?.used ?? false,
  };
  writeFileSync(file, JSON.stringify(fields));
  signBatch(file);
  return file;
};
const approvalFor = (file: string, postingId: string): OwnerApproval => {
  const loaded = readApprovals(file, clock(), []);
  assert.equal(loaded.isOk(), true);
  const approval = loaded._unsafeUnwrap().accepted.get(postingId);
  assert.ok(approval);
  return approval;
};

test('resume after a crash anywhere: no duplicate ledger entry, at most one submit per posting, only approved postings submitted', async () => {
  const dir = scratch();
  try {
    let n = 0;
    await fc.assert(fc.asyncProperty(fc.subarray(IDS, { minLength: 1 }), fc.subarray(IDS), fc.uniqueArray(fc.integer({ min: 1, max: 40 }), { maxLength: 6 }), async (ids, approvedIds, crashes) => {
      const w = world(new Set(crashes));
      const approved = new Set(approvedIds);
      const file = approved.size ? batchFile(path.join(dir, `${n++}.json`), [...approved]) : undefined;
      let crashed = 0;
      for (let attempt = 0; attempt < 20; attempt += 1) {
        try { await applyRun(ids, w.store, w.driver, clock, file); break; } catch (e) { if (!(e instanceof Crash)) throw e; crashed += 1; }
      }
      const keys = w.ledger.map(entry => entry.key);
      if (new Set(keys).size !== keys.length) return false;
      if (new Set(w.submits).size !== w.submits.length) return false;
      if (w.submits.some(id => !approved.has(id))) return false;
      return ids.every(id => {
        const s = stateOf(w.ledger, id);
        if (!approved.has(id)) return s === 'awaiting-submit';
        if (s === 'submitted') return w.submits.includes(id);
        return s === 'needs-check' && crashed > 0;
      });
    }), { numRuns: 500, seed: 20261120 });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('without an approved batch the run stops every posting at awaiting-submit and never submits', async () => {
  const w = world(new Set());
  const out = await applyRun(IDS, w.store, w.driver, clock);
  assert.deepEqual(out.map(o => o.state), IDS.map(() => 'awaiting-submit'));
  assert.deepEqual(w.submits, []);
  const again = await applyRun(IDS, w.store, w.driver, clock);
  assert.deepEqual(again.map(o => o.state), IDS.map(() => 'awaiting-submit'));
  assert.equal(w.fills.length, IDS.length);
});

test('an unconfirmed submit is terminal until the owner confirms or reconciles it', async () => {
  const dir = scratch();
  try {
    const file = batchFile(path.join(dir, 'ok.json'), ['ashby:a1']);
    const approval = approvalFor(file, 'ashby:a1');
    let ledger: Ledger = [];
    for (const state of ['drafted', 'filled', 'awaiting-submit', 'submitting', 'needs-check'] as const) {
      const entry = nextEntry(ledger, 'ashby:a1', state, clock(), state === 'submitting' ? approval : undefined)._unsafeUnwrap();
      assert.ok(entry);
      ledger = [...ledger, entry];
    }
    const back = nextEntry(ledger, 'ashby:a1', 'awaiting-submit', clock());
    assert.ok(back.isErr() && back.error.kind === 'BadTransition');
    assert.equal(nextEntry(ledger, 'ashby:a1', 'submitted', clock())._unsafeUnwrap()?.state, 'submitted');
    assert.equal(nextEntry(ledger, 'ashby:a1', 'rejected', clock())._unsafeUnwrap()?.state, 'rejected');
    const w = world(new Set());
    for (const entry of ledger) w.ledger.push(entry);
    await applyRun(['ashby:a1'], w.store, w.driver, clock, file);
    await applyRun(['ashby:a1'], w.store, w.driver, clock, file);
    assert.equal(stateOf(w.ledger, 'ashby:a1'), 'needs-check');
    assert.deepEqual(w.submits, []);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a submitting intent left by a crash goes to needs-check and is never resubmitted by a rerun', async () => {
  const dir = scratch();
  try {
    const file = batchFile(path.join(dir, 'ok.json'), ['ashby:a1'], { id: 'b' });
    const approval = approvalFor(file, 'ashby:a1');
    const w = world(new Set());
    for (const state of ['drafted', 'filled', 'awaiting-submit', 'submitting'] as const) w.ledger.push(nextEntry(w.ledger, 'ashby:a1', state, clock(), state === 'submitting' ? approval : undefined)._unsafeUnwrap()!);
    await applyRun(['ashby:a1'], w.store, w.driver, clock, file);
    await applyRun(['ashby:a1'], w.store, w.driver, clock, file);
    assert.equal(stateOf(w.ledger, 'ashby:a1'), 'needs-check');
    assert.deepEqual(w.submits, []);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('two concurrent runs append one submitting key and submit once', async () => {
  const dir = scratch();
  try {
    const file = batchFile(path.join(dir, 'ok.json'), ['ashby:a1']);
    const ledger: LedgerEntry[] = [];
    const submits: string[] = [];
    const waiters: Array<() => void> = [];
    const barrier = () => new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('submitting barrier')), 2000);
      waiters.push(() => { clearTimeout(timer); resolve(); });
      if (waiters.length === 2) for (const wake of waiters.splice(0, waiters.length)) wake();
    });
    const store: LedgerStore = {
      read: async () => [...ledger],
      append: async entry => {
        if (entry.state === 'submitting') await barrier();
        if (ledger.some(row => row.key === entry.key)) return 'exists';
        ledger.push(entry);
        return 'inserted';
      },
    };
    const driver: FormDriver = {
      fill: async () => ready,
      submit: async (id, approval) => { if (approval.postingId !== id) throw new Error('driver saw an unapproved submit'); submits.push(id); },
    };
    await Promise.all([
      applyRun(['ashby:a1'], store, driver, clock, file),
      applyRun(['ashby:a1'], store, driver, clock, file),
    ]);
    assert.deepEqual(submits, ['ashby:a1']);
    assert.equal(ledger.filter(entry => entry.state === 'submitting').length, 1);
    assert.equal(new Set(ledger.map(entry => entry.key)).size, ledger.length);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('empty answers are unanswered questions and that posting is not submitted', async () => {
  const dir = scratch();
  try {
    const file = batchFile(path.join(dir, 'ok.json'), IDS);
    const blanks = [{ question: 'visa', answer: '' }, { question: 'notice period', answer: '   ' }];
    assert.deepEqual(fillResult([]), { kind: 'Unanswered', questions: [] });
    assert.deepEqual(fillResult(blanks), { kind: 'Unanswered', questions: ['visa', 'notice period'] });
    const run = async (answers: ReadonlyArray<{ question: string; answer: string }>) => {
      const ledger: LedgerEntry[] = [];
      const submits: string[] = [];
      const store: LedgerStore = {
        read: async () => [...ledger],
        append: async entry => { if (ledger.some(row => row.key === entry.key)) return 'exists'; ledger.push(entry); return 'inserted'; },
      };
      const driver: FormDriver = {
        fill: async () => fillResult(answers),
        submit: async () => { submits.push('sent'); },
      };
      const out = await applyRun(['ashby:a1'], store, driver, clock, file);
      assert.equal(out[0]?.state, 'drafted');
      assert.equal(out[0]?.error?.kind, 'Unanswered');
      assert.deepEqual(submits, []);
      assert.equal(ledger.some(entry => entry.state !== 'drafted'), false);
    };
    await run([]);
    await run(blanks);
    await fc.assert(fc.asyncProperty(fc.subarray(IDS, { minLength: 1 }), fc.subarray(IDS, { minLength: 1 }), async (ids, blankIds) => {
      const blank = new Set(blankIds);
      const ledger: LedgerEntry[] = [];
      const submits: string[] = [];
      const store: LedgerStore = {
        read: async () => [...ledger],
        append: async entry => { if (ledger.some(row => row.key === entry.key)) return 'exists'; ledger.push(entry); return 'inserted'; },
      };
      const driver: FormDriver = {
        fill: async id => fillResult([{ question: 'visa', answer: blank.has(id) ? '' : 'yes' }]),
        submit: async id => { submits.push(id); },
      };
      await applyRun(ids, store, driver, clock, file);
      return ids.every(id => blank.has(id)
        ? stateOf(ledger, id) === 'drafted' && !submits.includes(id)
        : stateOf(ledger, id) === 'submitted' && submits.includes(id));
    }), { numRuns: 100, seed: 20261120 });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('an approved batch loads only from an owner record outside git', async () => {
  const dir = scratch();
  const inside = path.join(path.dirname(fileURLToPath(import.meta.url)), 'owner-approval.json');
  try {
    assert.equal(Object.hasOwn(ledgerApi, 'approveBatch'), false);
    assert.equal(Object.hasOwn(ledgerApi, 'ownerApprovalHash'), false);
    assert.equal(APPROVAL_NAMESPACE, 'kanithanj-approve');
    assert.equal(ALLOWED_SIGNERS, '/etc/kanithanj/allowed_signers');
    assert.equal(Object.hasOwn(ledgerApi, 'allowedSignersPath'), false);
    const outside = path.join(dir, 'owner.json');
    assert.equal(approvalPath({ KANITHANJ_APPROVALS: outside }), outside);
    assert.equal(approvalPath({ KANITHANJ_APPROVALS: outside }, { approvalPath: path.join(dir, 'cfg.json') }), path.join(dir, 'cfg.json'));
    const file = batchFile(outside, ['ashby:a1', 'lever:l9']);
    const good = world(new Set());
    const submitted = await applyRun(['ashby:a1', 'greenhouse:2671957'], good.store, good.driver, clock, file);
    assert.deepEqual(submitted.map(row => row.state), ['submitted', 'awaiting-submit']);
    assert.deepEqual(good.submits, ['ashby:a1']);
    const cases: Array<{ name: string; write: () => string; reason: 'inside-git' | 'invalid' | 'signature' | 'expired' | 'reused' }> = [
      { name: 'inside git', write: () => { writeFileSync(inside, '{"approvedBy":"owner"}'); return inside; }, reason: 'inside-git' },
      { name: 'forged unsigned', write: () => { const target = path.join(dir, 'forged.json'); writeFileSync(target, JSON.stringify({ id: 'batch-1', postingIds: ['ashby:a1'], approvedBy: 'owner', approvedAt: clock(), expiresAt: '2026-11-27T21:00:00Z', used: false })); return target; }, reason: 'signature' },
      { name: 'signed wrong shape', write: () => { const target = path.join(dir, 'shape.json'); writeFileSync(target, JSON.stringify({ id: 'batch-1', postingIds: ['ashby:a1'], approvedBy: 'automation', approvedAt: clock(), expiresAt: '2026-11-27T21:00:00Z', used: false })); signBatch(target); return target; }, reason: 'invalid' },
      { name: 'expired', write: () => batchFile(path.join(dir, 'expired.json'), ['ashby:a1'], { expiresAt: '2026-11-20T21:00:00Z' }), reason: 'expired' },
      { name: 'reused flag', write: () => batchFile(path.join(dir, 'used.json'), ['ashby:a1'], { used: true }), reason: 'reused' },
    ];
    for (const item of cases) {
      const target = item.write();
      const seen = world(new Set());
      let submitting = 0;
      const store: LedgerStore = {
        read: seen.store.read,
        append: async entry => { if (entry.state === 'submitting') submitting += 1; return seen.store.append(entry); },
      };
      const out = await applyRun(['ashby:a1'], store, seen.driver, clock, target);
      assert.equal(out[0]?.error?.kind, 'ApprovalRejected', item.name);
      if (out[0]?.error?.kind === 'ApprovalRejected') assert.equal(out[0].error.reason, item.reason, item.name);
      assert.equal(submitting, 0, item.name);
      assert.deepEqual(seen.submits, [], item.name);
    }
    const reused = world(new Set());
    await applyRun(['ashby:a1'], reused.store, reused.driver, clock, file);
    reused.ledger.push({ key: 'ashby:a1#awaiting-submit', postingId: 'ashby:a1', state: 'awaiting-submit', at: clock() });
    let submitting = 0;
    const store: LedgerStore = {
      read: async () => [...reused.ledger],
      append: async entry => { if (entry.state === 'submitting') submitting += 1; if (reused.ledger.some(row => row.key === entry.key)) return 'exists'; reused.ledger.push(entry); return 'inserted'; },
    };
    const again = await applyRun(['ashby:a1'], store, reused.driver, clock, file);
    assert.equal(again[0]?.error?.kind, 'ApprovalRejected');
    if (again[0]?.error?.kind === 'ApprovalRejected') assert.equal(again[0].error.reason, 'reused');
    assert.equal(submitting, 0);
    assert.deepEqual(reused.submits, ['ashby:a1']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(inside, { force: true });
  }
});

test('a missing allowed-signers file refuses the batch before any submit', async () => {
  const dir = scratch();
  try {
    const file = batchFile(path.join(dir, 'batch.json'), ['ashby:a1']);
    const seen = world(new Set());
    const out = await pinCase.run('missing', () => applyRun(['ashby:a1'], seen.store, seen.driver, clock, file));
    assert.equal(out[0]?.error?.kind, 'ApprovalRejected');
    if (out[0]?.error?.kind === 'ApprovalRejected') assert.equal(out[0].error.reason, 'missing-key');
    assert.deepEqual(seen.submits, []);
    assert.equal(seen.ledger.some(entry => entry.state === 'submitting'), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('an environment variable cannot select an agent key', async () => {
  const dir = scratch();
  const saved = new Map<string, string | undefined>();
  const names = ['KANITHANJ_ALLOWED_SIGNERS', 'KANITHANJ_APPROVALS', 'ALLOWED_SIGNERS', 'SSH_AUTH_SOCK'];
  try {
    const agent = path.join(dir, 'agent');
    assert.equal(spawnSync('ssh-keygen', ['-t', 'ed25519', '-f', agent, '-N', '', '-q']).status, 0);
    const agentSigners = path.join(dir, 'agent_signers');
    writeFileSync(agentSigners, `owner namespaces="${APPROVAL_NAMESPACE}" ${readFileSync(`${agent}.pub`, 'utf8').trim()}\n`);
    const file = path.join(dir, 'batch.json');
    writeFileSync(file, JSON.stringify({ id: 'agent-batch', postingIds: ['ashby:a1'], approvedBy: 'owner', approvedAt: clock(), expiresAt: '2026-11-27T21:00:00Z', used: false }));
    assert.equal(spawnSync('ssh-keygen', ['-Y', 'sign', '-f', agent, '-n', APPROVAL_NAMESPACE, file]).status, 0);
    for (const name of names) {
      saved.set(name, process.env[name]);
      process.env[name] = agentSigners;
    }
    const seen = world(new Set());
    const out = await applyRun(['ashby:a1'], seen.store, seen.driver, clock, file);
    assert.deepEqual(seen.submits, []);
    assert.equal(seen.ledger.some(entry => entry.state === 'submitting'), false);
    assert.equal(out[0]?.error?.kind, 'ApprovalRejected');
  } finally {
    for (const [name, value] of saved) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a group-writable, other-writable, non-root, or symlink pin never submits', async () => {
  for (const kind of ['group', 'other', 'user', 'symlink'] as const) {
    const dir = scratch();
    try {
      const file = batchFile(path.join(dir, 'batch.json'), ['ashby:a1']);
      const seen = world(new Set());
      const out = await pinCase.run(kind, () => applyRun(['ashby:a1'], seen.store, seen.driver, clock, file));
      assert.deepEqual(seen.submits, [], kind);
      assert.equal(seen.ledger.some(entry => entry.state === 'submitting'), false, kind);
      assert.equal(out[0]?.error?.kind, 'ApprovalRejected', kind);
      if (out[0]?.error?.kind === 'ApprovalRejected') assert.equal(out[0].error.reason, 'missing-key', kind);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
});

test('a tampered batch or a wrong key never submits', async () => {
  await fc.assert(fc.asyncProperty(fc.constantFrom('tamper', 'wrong-key'), fc.integer({ min: 0, max: 40 }), async (kind, salt) => {
    const dir = scratch();
    try {
      const file = path.join(dir, 'batch.json');
      batchFile(file, ['ashby:a1'], { id: `b-${salt}` });
      if (kind === 'tamper') {
        const raw = readFileSync(file);
        const at = raw.length - 2;
        raw[at] = raw[at] === 0x7a ? 0x79 : 0x7a;
        writeFileSync(file, raw);
      } else {
        const other = path.join(dir, 'other');
        if (spawnSync('ssh-keygen', ['-t', 'ed25519', '-f', other, '-N', '', '-q']).status !== 0) return false;
        rmSync(`${file}.sig`, { force: true });
        if (spawnSync('ssh-keygen', ['-Y', 'sign', '-f', other, '-n', APPROVAL_NAMESPACE, file]).status !== 0) return false;
      }
      const seen = world(new Set());
      const out = await applyRun(['ashby:a1'], seen.store, seen.driver, clock, file);
      const rejected = out[0]?.error?.kind === 'ApprovalRejected' && out[0].error.reason === 'signature';
      return rejected && seen.submits.length === 0 && seen.ledger.every(entry => entry.state !== 'submitting');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }), { numRuns: 20, seed: 20261120 });
});

test('real store: two concurrent appends produce exactly one submit', async () => {
  await fc.assert(fc.asyncProperty(fc.constantFrom('ashby:a1', 'lever:l9'), async (id) => {
    const dir = scratch();
    try {
      const file = batchFile(path.join(dir, 'batch.json'), [id]);
      const store = fileLedger(path.join(dir, 'ledger'));
      const submits: string[] = [];
      const driver: FormDriver = {
        fill: async () => ready,
        submit: async (postingId, approval) => { if (approval.postingId !== postingId) throw new Error('unapproved'); submits.push(postingId); },
      };
      await Promise.all([applyRun([id], store, driver, clock, file), applyRun([id], store, driver, clock, file)]);
      const rows = await store.read();
      const keys = rows.map(entry => entry.key);
      return submits.length === 1 && rows.filter(entry => entry.state === 'submitting').length === 1 && new Set(keys).size === keys.length;
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }), { numRuns: 12, seed: 20261120 });
});

test('transitions: submitting needs the posting in an approved batch; skipping states is refused', async () => {
  const dir = scratch();
  try {
    const file = batchFile(path.join(dir, 'other.json'), ['lever:l9'], { id: 'x' });
    const other = approvalFor(file, 'lever:l9');
    const ledger: Ledger = [];
    assert.equal(nextEntry(ledger, 'ashby:a1', 'submitted', clock()).isErr(), true);
    const at = (rows: Ledger, state: Parameters<typeof nextEntry>[2]) => [...rows, nextEntry(rows, 'ashby:a1', state, clock())._unsafeUnwrap()!];
    const waiting = at(at(at(ledger, 'drafted'), 'filled'), 'awaiting-submit');
    const refused = nextEntry(waiting, 'ashby:a1', 'submitting', clock(), other);
    assert.ok(refused.isErr() && refused.error.kind === 'NotInApprovedBatch');
    assert.ok(nextEntry(waiting, 'ashby:a1', 'submitting', clock()).isErr());
    assert.equal(nextEntry(waiting, 'ashby:a1', 'awaiting-submit', clock())._unsafeUnwrap(), null);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
