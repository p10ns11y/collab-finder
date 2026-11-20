import { okAsync, type ResultAsync } from 'neverthrow';
import type { AiCall, SpendApproval } from './effects.ts';
import type { IntelError, PoolError, PackError, Source } from './errors.ts';
import type { PublicRow } from './schema.ts';

export type GroupKey = 'fitsNow' | 'stepTowardGoal' | 'stretch';
export type MatchInput = { description: string; region?: string; remote?: 'remote' | 'hybrid' | 'onsite' | 'any'; seniority?: string; goal?: string };
export type Fit = { row: PublicRow; score: number; why: string };

export interface Decide<I, O, E> { readonly path: 'rules' | 'learned' | 'ai'; decide(input: I): ResultAsync<O, E> }

export type DecideFit        = Decide<{ input: MatchInput; row: PublicRow }, Fit | null, IntelError>;
export type DecideGroup      = Decide<{ input: MatchInput; fit: Fit }, GroupKey, IntelError>;
export type DecideRefreshSwap = Decide<{ perSource: Record<Source, { before: number; after: number; ok: boolean }> }, 'swap' | 'keep', PoolError>;
export type DecideClaimOK    = Decide<{ claim: string; liveFeatures: ReadonlySet<string> }, 'ok', PackError>;
export type DecideProvider   = Decide<{ task: 'rank' | 'pack'; budgetUsd: number }, 'default' | 'fake' | 'xai' | 'decisions-model', IntelError>;

export const rulesGroup: DecideGroup = {
  path: 'rules',
  decide: ({ fit }) => okAsync(fit.score >= 80 ? 'fitsNow' : fit.score >= 60 ? 'stepTowardGoal' : 'stretch'),
};

export function aiGroup(ai: AiCall, approval: SpendApproval, parse: (raw: unknown) => ResultAsync<GroupKey, IntelError>): DecideGroup {
  return { path: 'ai', decide: ({ input, fit }) => ai.complete(`group ${fit.row.id} for goal: ${input.goal ?? ''}`, approval).andThen(parse) };
}
