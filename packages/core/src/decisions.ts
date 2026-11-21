import { Effect } from 'effect';
import type { IntelError, PackError, PoolError, Source } from './errors.ts';
import type { PublicRow } from './schema.ts';

export type GroupKey = 'fitsNow' | 'stepTowardGoal' | 'stretch';
export type MatchInput = { description: string; region?: string; remote?: 'remote' | 'hybrid' | 'onsite' | 'any'; seniority?: string; goal?: string };
export type Fit = { row: PublicRow; score: number; why: string };

export interface PureDecide<I, O> { readonly path: 'rules' | 'learned'; decide(input: I): O }
export interface EffectDecide<I, O, E> { readonly path: 'rules' | 'learned' | 'ai'; decide(input: I): Effect.Effect<O, E> }

export type DecideFit        = PureDecide<{ input: MatchInput; row: PublicRow }, Fit | null>;
export type DecideGroup      = PureDecide<{ input: MatchInput; fit: Fit }, GroupKey>;
export type DecideRefreshSwap = EffectDecide<{ perSource: Record<Source, { before: number; after: number; ok: boolean }> }, 'swap' | 'keep', PoolError>;
export type DecideClaimOK    = PureDecide<{ claim: string; liveFeatures: ReadonlySet<string> }, 'ok' | PackError>;
export type DecideProvider   = EffectDecide<{ task: 'rank' | 'pack'; budgetUsd: number }, 'default' | 'fake' | 'xai' | 'decisions-model', IntelError>;

export const rulesFit: DecideFit = {
  path: 'rules',
  decide: ({ input, row }) => {
    if (row.status === 'closed') return null;
    const hay = `${row.title} ${row.company}`.toLowerCase();
    const words = `${input.description} ${input.goal ?? ''}`.toLowerCase().split(/[^a-z0-9+#.]+/).filter(w => w.length > 3);
    if (!words.some(w => hay.includes(w))) return null;
    const score = input.seniority !== undefined && row.seniority === input.seniority ? 85 : 62;
    return { row, score, why: row.title };
  },
};

export const rulesGroup: DecideGroup = {
  path: 'rules',
  decide: ({ fit }) => fit.score >= 80 ? 'fitsNow' : fit.score >= 60 ? 'stepTowardGoal' : 'stretch',
};

export const claimCheck: DecideClaimOK = {
  path: 'rules',
  decide: ({ claim, liveFeatures }) => {
    const named = claim.trim();
    if (!named) return { kind: 'UnsourcedClaim', claim };
    const exact = [...liveFeatures].find(feature => named === feature || named.includes(feature));
    if (exact !== undefined) return 'ok';
    const folded = [...liveFeatures].find(feature => named.toLowerCase() === feature.toLowerCase());
    if (folded !== undefined) return { kind: 'NameMismatch', expected: folded, found: named, where: 'claim' };
    return { kind: 'UnshippedClaim', claim: named, feature: named };
  },
};

export const chooseProvider: DecideProvider = {
  path: 'rules',
  decide: (input) => Effect.gen(function* () {
    if (!Number.isFinite(input.budgetUsd)) return yield* Effect.fail({ kind: 'ProviderShapeMismatch', provider: 'default', issues: ['budgetUsd'] } as const);
    if (input.budgetUsd < 0) return yield* Effect.fail({ kind: 'ConsentDenied', what: 'spend' } as const);
    if (input.task === 'pack' && input.budgetUsd === 0) return yield* Effect.fail({ kind: 'MissingKey', provider: 'decisions-model' } as const);
    if (input.task === 'pack' && input.budgetUsd > 100) return yield* Effect.fail({ kind: 'PackDivergence', packId: 'pack', firstDiffPath: 'budgetUsd' } as const);
    if (input.task === 'pack') return 'decisions-model' as const;
    if (input.budgetUsd === 0) return 'fake' as const;
    return input.budgetUsd < 1 ? 'default' as const : 'xai' as const;
  }),
};
