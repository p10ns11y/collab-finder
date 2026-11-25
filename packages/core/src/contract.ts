import type { ResultAsync } from 'neverthrow';
import type { AppError, Surface, Warning } from './errors.ts';
import type { GroupKey, MatchInput } from './decisions.ts';

export type MatchOutput = {
  coreVersion: string; poolVersion: string;
  groups: Record<GroupKey, ReadonlyArray<{ id: string; why: string }>>;
  totals: Record<GroupKey, number>; warnings: ReadonlyArray<Warning>;
};
export type SurfaceAdapter = (input: MatchInput) => ResultAsync<MatchOutput, AppError>;
export type Contract = { readonly [S in Surface]: SurfaceAdapter };
