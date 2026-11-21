import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Cause, Effect, Exit, Option } from 'effect';
import { claimCheck, chooseProvider, rulesFit, rulesGroup } from '../src/decisions.ts';
import { decideRefreshSwap, refreshOnce, type SwapStore } from '../src/refresh.ts';
import { asResultCard, asWebMcpResult, parseRefineInput, type PublicPool, type PublicRow } from '../src/schema.ts';

const row = (over: Partial<PublicRow> = {}): PublicRow => ({
  id: 'ashby:1', source: 'ashby', company: 'pixel-labs', title: 'Senior Backend Engineer',
  url: 'https://jobs.example.com/ashby/1', location: null, remote: 'remote', region: 'SE', role_tags: [],
  seniority: 'senior', posted_at: null, status: 'open', status_checked_at: '2026-11-20T06:00:00Z', ...over,
});

const run = async <A, E>(effect: Effect.Effect<A, E>) => {
  const exit = await Effect.runPromiseExit(effect);
  if (Exit.isSuccess(exit)) return { ok: true as const, value: exit.value };
  const error = Cause.findErrorOption(exit.cause);
  if (Option.isSome(error)) return { ok: false as const, error: error.value };
  throw Cause.squash(exit.cause);
};

test('fit and grouping stay pure: a closed row and a miss are null, a hit lands in one group', () => {
  const open = row();
  assert.equal(rulesFit.decide({ input: { description: 'backend engineer in stockholm' }, row: row({ status: 'closed' }) }), null);
  assert.equal(rulesFit.decide({ input: { description: 'pastry chef' }, row: open }), null);
  const fit = rulesFit.decide({ input: { description: 'Senior backend engineer, Go', seniority: 'senior' }, row: open });
  assert.ok(fit && fit.score === 85 && rulesGroup.decide({ input: { description: 'x' }, fit }) === 'fitsNow');
  assert.equal(rulesGroup.decide({ input: { description: 'x' }, fit: { row: open, score: 60, why: 't' } }), 'stepTowardGoal');
  assert.equal(rulesGroup.decide({ input: { description: 'x' }, fit: { row: open, score: 59, why: 't' } }), 'stretch');
});

test('claim check error paths: blank, unknown, and a differently cased name', () => {
  const live = new Set(['Go', 'Postgres']);
  const blank = claimCheck.decide({ claim: '  ', liveFeatures: live });
  const unknown = claimCheck.decide({ claim: 'Rust', liveFeatures: live });
  assert.ok(blank !== 'ok' && blank.kind === 'UnsourcedClaim');
  assert.ok(unknown !== 'ok' && unknown.kind === 'UnshippedClaim');
  assert.deepEqual(claimCheck.decide({ claim: 'go', liveFeatures: live }), { kind: 'NameMismatch', expected: 'Go', found: 'go', where: 'claim' });
  assert.equal(claimCheck.decide({ claim: 'Ships Go and Postgres', liveFeatures: live }), 'ok');
});

test('provider choice error paths: bad budget, refused spend, missing key, pack divergence', async () => {
  const kind = async (task: 'rank' | 'pack', budgetUsd: number) => {
    const out = await run(chooseProvider.decide({ task, budgetUsd }));
    assert.equal(out.ok, false);
    if (out.ok) return 'ok';
    return out.error.kind;
  };
  assert.equal(await kind('rank', Number.NaN), 'ProviderShapeMismatch');
  assert.equal(await kind('rank', -1), 'ConsentDenied');
  assert.equal(await kind('pack', 0), 'MissingKey');
  assert.equal(await kind('pack', 101), 'PackDivergence');
  const value = async (task: 'rank' | 'pack', budgetUsd: number) => {
    const out = await run(chooseProvider.decide({ task, budgetUsd }));
    assert.equal(out.ok, true);
    if (!out.ok) return 'err';
    return out.value;
  };
  assert.equal(await value('rank', 0), 'fake');
  assert.equal(await value('rank', 0.5), 'default');
  assert.equal(await value('rank', 2), 'xai');
  assert.equal(await value('pack', 1), 'decisions-model');
});

test('refresh swap effect fails closed on a partial source and on a worse eval', async () => {
  const before: PublicPool = { version: 'v1', checkedRange: { from: '2026-11-20', to: '2026-11-20' }, rows: [row()] };
  const partial = await run(decideRefreshSwap(before, { ...before, version: 'v2' }, []));
  assert.equal(partial.ok, false);
  if (!partial.ok) assert.equal(partial.error.kind, 'PartialRefresh');
  let live = before;
  const store: SwapStore = { read: async () => live, swap: async next => { live = next; } };
  const runs = [{ source: 'ashby' as const, ok: true }, { source: 'greenhouse' as const, ok: true }, { source: 'lever' as const, ok: true }, { source: 'platsbanken' as const, ok: true }];
  const regressed = await refreshOnce(store, { pool: { ...before, version: 'v2' }, runs }, async pool => pool.version === 'v1' ? 1 : 0);
  assert.deepEqual(regressed, { swapped: false, error: { kind: 'EvalRegressed', before: 1, after: 0 } });
  assert.equal(live.version, 'v1');
});

test('boundary schemas: result card, WebMCP payload, and agent-only stateVersion', () => {
  const open = row();
  assert.equal(asResultCard(open).isOk(), true);
  assert.equal(asResultCard({ ...open, url: 'not-a-url' })._unsafeUnwrapErr().kind, 'SchemaInvalid');
  assert.equal(asWebMcpResult(open).isOk(), true);
  const { remote: _remote, ...noRemote } = open;
  assert.equal(asWebMcpResult(noRemote)._unsafeUnwrapErr().kind, 'SchemaInvalid');
  const human = parseRefineInput({ actor: 'human', region: 'SE' });
  assert.equal(human.isOk(), true);
  assert.equal(human._unsafeUnwrap().stateVersion, undefined);
  assert.equal(parseRefineInput({ region: 'SE' }).isErr(), true);
  const agent = parseRefineInput({ actor: 'agent', region: 'SE' });
  assert.equal(agent.isErr(), true);
  assert.match(agent._unsafeUnwrapErr().issues.join(' '), /stateVersion/);
  assert.equal(parseRefineInput({ actor: 'agent', stateVersion: 1.5 })._unsafeUnwrapErr().kind, 'SchemaInvalid');
  assert.equal(parseRefineInput({ actor: 'agent', stateVersion: 4, remote: 'remote' })._unsafeUnwrap().stateVersion, 4);
});
