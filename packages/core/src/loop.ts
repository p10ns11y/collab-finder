import { match, WEIGHTS, type MatchProfile, type Weights } from './match.ts';
import type { PublicPool } from './schema.ts';

export type Outcome = { postingId: string; result: 'rejected' | 'interview' | 'no-reply' };
export type EvalCase = { profile: MatchProfile; applied: ReadonlyArray<Outcome> };
export type EvalReport = { hits: number; total: number; found: ReadonlyArray<string> };
export const TOP = 30;

export function recallAt(cases: ReadonlyArray<EvalCase>, pool: PublicPool, weights: Weights, now: Date): EvalReport {
  const found: string[] = [];
  let total = 0;
  for (const c of cases) {
    total += c.applied.length;
    const r = match(c.profile, pool, { now, limit: TOP, weights });
    if (r.isErr()) continue;
    const shown = new Set(Object.values(r.value.groups).flat().flatMap(x => [x.id, ...x.alsoIds]));
    for (const o of c.applied) if (shown.has(o.postingId)) found.push(o.postingId);
  }
  return { hits: found.length, total, found: found.sort() };
}

export type Proposal = {
  readonly weight: keyof Weights; readonly from: number; readonly to: number;
  readonly evalBefore: EvalReport; readonly evalAfter: EvalReport;
  readonly gained: ReadonlyArray<string>; readonly lost: ReadonlyArray<string>;
};
export const STEPS: ReadonlyArray<number> = [-10, -5, 5, 10];

export function proposeRules(cases: ReadonlyArray<EvalCase>, pool: PublicPool, now: Date, base: Weights = WEIGHTS): ReadonlyArray<Proposal> {
  const before = recallAt(cases, pool, base, now);
  const out: Proposal[] = [];
  for (const weight of Object.keys(base).sort() as Array<keyof Weights>) {
    for (const step of STEPS) {
      const to = base[weight] + step;
      if (to < 0) continue;
      const after = recallAt(cases, pool, { ...base, [weight]: to }, now);
      if (after.hits <= before.hits) continue;
      const lost = before.found.filter(x => !after.found.includes(x));
      if (lost.length) continue;
      out.push({ weight, from: base[weight], to, evalBefore: before, evalAfter: after, gained: after.found.filter(x => !before.found.includes(x)), lost });
    }
  }
  return out.sort((a, b) => b.evalAfter.hits - a.evalAfter.hits || Math.abs(a.to - a.from) - Math.abs(b.to - b.from) || (a.weight < b.weight ? -1 : 1));
}

declare const approval: unique symbol;
export type OwnerApproval = { readonly approvedBy: 'owner'; readonly proposal: Proposal; readonly at: string; readonly [approval]: true };
export const approveProposal = (proposal: Proposal, at: string): OwnerApproval => ({ approvedBy: 'owner', proposal, at }) as unknown as OwnerApproval;
export const adopt = (base: Weights, a: OwnerApproval): Weights =>
  base[a.proposal.weight] === a.proposal.from ? Object.freeze({ ...base, [a.proposal.weight]: a.proposal.to }) : base;
