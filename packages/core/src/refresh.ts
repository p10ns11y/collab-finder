import { Cause, Effect, Exit, Option } from 'effect';
import type { Result, ResultAsync } from 'neverthrow';
import { SOURCE_VARIANTS, type AppError, type PoolError, type Source } from './errors.ts';
import type { Clock, Fetch, PoolStore } from './effects.ts';
import type { DecideRefreshSwap } from './decisions.ts';
import { parsePool } from './pool.ts';
import type { PublicPool } from './schema.ts';

export const MAX_SOURCE_DROP = 0.3;
export type SourceRun = { source: Source; ok: boolean };
export type EvalScore = (pool: PublicPool) => Promise<number>;

const countBySource = (p: PublicPool): Map<string, number> => {
  const m = new Map<string, number>();
  for (const r of p.rows) m.set(r.source, (m.get(r.source) ?? 0) + 1);
  return m;
};

const requiredSources = (before: PublicPool, candidate: PublicPool): ReadonlyArray<string> => {
  const required = new Set<string>(SOURCE_VARIANTS);
  for (const row of before.rows) required.add(row.source);
  for (const row of candidate.rows) required.add(row.source);
  return [...required];
};

export function decideRefreshSwap(before: PublicPool, candidate: unknown, runs: ReadonlyArray<SourceRun>): Effect.Effect<PublicPool, PoolError> {
  const parsed = parsePool(candidate);
  if (parsed.isErr()) return Effect.fail(parsed.error);
  const okRun = new Map<string, boolean>();
  for (const run of runs) okRun.set(run.source, (okRun.get(run.source) ?? true) && run.ok);
  const required = requiredSources(before, parsed.value);
  const failed = required.filter(source => okRun.get(source) !== true);
  const was = countBySource(before);
  const now = countBySource(parsed.value);
  const countDrop: Partial<Record<string, number>> = {};
  for (const source of required) {
    const a = was.get(source) ?? 0;
    const b = now.get(source) ?? 0;
    if (a > 0 && (a - b) / a > MAX_SOURCE_DROP) countDrop[source] = a - b;
  }
  if (failed.length || Object.keys(countDrop).length) return Effect.fail({ kind: 'PartialRefresh', failed, countDrop });
  return Effect.succeed(parsed.value);
}

const lift = <A, E>(p: ResultAsync<A, E>): Effect.Effect<A, E> =>
  Effect.gen(function* () {
    const r: Result<A, E> = yield* Effect.promise(() => p);
    if (r.isErr()) return yield* Effect.fail(r.error);
    return r.value;
  });

export interface SwapStore { read(): Promise<PublicPool>; swap(next: PublicPool): Promise<void> }
export type RefreshOutcome = { swapped: true; version: string } | { swapped: false; error: PoolError };

const settled = async <A, E>(effect: Effect.Effect<A, E>): Promise<A> => {
  const exit = await Effect.runPromiseExit(effect);
  if (Exit.isSuccess(exit)) return exit.value;
  const error = Cause.findErrorOption(exit.cause);
  if (Option.isSome(error)) return Promise.reject(error.value);
  return Promise.reject(Cause.squash(exit.cause));
};

export async function refreshOnce(store: SwapStore, fetched: { pool: unknown; runs: ReadonlyArray<SourceRun> }, score: EvalScore): Promise<RefreshOutcome> {
  const effect = Effect.gen(function* () {
    const before = yield* Effect.promise(() => store.read());
    const next = yield* decideRefreshSwap(before, fetched.pool, fetched.runs);
    const was = yield* Effect.promise(() => score(before));
    const now = yield* Effect.promise(() => score(next));
    if (now < was) return { swapped: false as const, error: { kind: 'EvalRegressed' as const, before: was, after: now } };
    yield* Effect.promise(() => store.swap(next));
    return { swapped: true as const, version: next.version };
  });
  try {
    return await settled(effect);
  } catch (error) {
    if (error && typeof error === 'object' && 'kind' in error) return { swapped: false, error: error as PoolError };
    throw error;
  }
}

export const refresh = (fx: { fetch: Fetch; pool: PoolStore; clock: Clock }, swap: DecideRefreshSwap, fetchAll: (f: Fetch) => ResultAsync<{ next: PublicPool; perSource: Record<Source, { before: number; after: number; ok: boolean }> }, AppError>) =>
  Effect.gen(function* () {
    const fetched = yield* lift(fetchAll(fx.fetch));
    const decision = yield* swap.decide({ perSource: fetched.perSource });
    if (decision === 'keep') return 'kept' as const;
    yield* lift(fx.pool.swap(fetched.next));
    return 'swapped' as const;
  });
