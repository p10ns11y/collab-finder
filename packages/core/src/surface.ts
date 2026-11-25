import { z } from 'zod';
import { match, MAX_CHARS, type MatchProfile, type MatchResult } from './match.ts';
import type { MatchError } from './match.ts';
import type { PublicPool } from './schema.ts';
import { WORLD_REGIONS } from './vocab.ts';

const Region = z.enum([...WORLD_REGIONS, 'any']);
export const MatchInputSchema = z.strictObject({
  description: z.string().max(MAX_CHARS * 4),
  goal: z.string().max(MAX_CHARS).optional(),
  likes: z.string().max(MAX_CHARS).optional(),
  region: z.union([Region, z.array(Region).max(WORLD_REGIONS.length + 1)]).optional(),
  remote: z.enum(['remote', 'hybrid', 'onsite', 'any']).optional(),
  productOnly: z.boolean().optional(),
  limit: z.number().int().min(1).max(200).optional(),
});
export type SurfaceInput = z.infer<typeof MatchInputSchema>;
export type SurfaceOutput =
  | { ok: true; value: MatchResult }
  | { ok: false; error: MatchError | { kind: 'InputInvalid'; issues: ReadonlyArray<string> } };

export const matchInputJsonSchema = z.toJSONSchema(MatchInputSchema);

export function runMatch(input: unknown, pool: PublicPool, now?: Date): SurfaceOutput {
  const parsed = MatchInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: { kind: 'InputInvalid', issues: parsed.error.issues.map(i => `${i.path.join('.') || 'input'}: ${i.message}`).slice(0, 10) } };
  const { limit, ...rest } = parsed.data;
  const profile = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)) as MatchProfile;
  const r = match(profile, pool, { ...(now ? { now } : {}), ...(limit ? { limit } : {}) });
  return r.isOk() ? { ok: true, value: r.value } : { ok: false, error: r.error };
}
