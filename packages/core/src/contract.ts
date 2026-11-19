// Identical-output contract: every surface is a thin adapter over one core and must return byte-equal output.
import { err, ok, type Result, type ResultAsync } from 'neverthrow';
import type { AppError, Surface, SurfaceError, Warning } from './errors.ts';
import type { GroupKey, MatchInput } from './decisions.ts';

export type MatchOutput = {
  coreVersion: string; poolVersion: string;
  groups: Record<GroupKey, ReadonlyArray<{ id: string; why: string }>>;
  totals: Record<GroupKey, number>; warnings: ReadonlyArray<Warning>;
};
export type SurfaceAdapter = (input: MatchInput) => ResultAsync<MatchOutput, AppError>;
export type Contract = { readonly [S in Surface]: SurfaceAdapter };   // missing a surface = type error

export function checkIdentical(outs: Readonly<Record<Surface, MatchOutput>>): Result<MatchOutput, SurfaceError> {
  const ref = outs.web;
  for (const s of Object.keys(outs) as Surface[]) {
    const o = outs[s];
    if (o.coreVersion !== ref.coreVersion || o.poolVersion !== ref.poolVersion)
      return err({ kind: 'VersionSkew', surface: s, core: o.coreVersion, pool: o.poolVersion });
    if (JSON.stringify(o) !== JSON.stringify(ref)) return err({ kind: 'SurfaceDrift', surface: s, firstDiffPath: 'groups' });
  }
  return ok(ref);
}
