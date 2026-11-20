import { err, ok, type Result } from 'neverthrow';
import { SOURCE_VARIANTS, type PoolError, type Source } from './errors.ts';
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

export function decideRefreshSwap(before: PublicPool, candidate: unknown, runs: ReadonlyArray<SourceRun>): Result<PublicPool, PoolError> {
  const parsed = parsePool(candidate);
  if (parsed.isErr()) return err(parsed.error);
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
  if (failed.length || Object.keys(countDrop).length) return err({ kind: 'PartialRefresh', failed, countDrop });
  return ok(parsed.value);
}

export interface SwapStore { read(): Promise<PublicPool>; swap(next: PublicPool): Promise<void> }
export type RefreshOutcome = { swapped: true; version: string } | { swapped: false; error: PoolError };

export async function refreshOnce(store: SwapStore, fetched: { pool: unknown; runs: ReadonlyArray<SourceRun> }, score: EvalScore): Promise<RefreshOutcome> {
  const before = await store.read();
  const decided = decideRefreshSwap(before, fetched.pool, fetched.runs);
  if (decided.isErr()) return { swapped: false, error: decided.error };
  const [was, now] = [await score(before), await score(decided.value)];
  if (now < was) return { swapped: false, error: { kind: 'EvalRegressed', before: was, after: now } };
  await store.swap(decided.value);
  return { swapped: true, version: decided.value.version };
}
