import { z } from 'zod';
import { transformSchema } from '@adaptate/core';
import { err, ok, Result } from 'neverthrow';
import type { PoolError } from './errors.ts';

export const PERSONAL_KEYS = ['fit_score', 'fit_reasons', 'eu_moat', 'prior_application', 'work_rights', 'work_rights_reason', 'role_match'] as const;
export type PersonalKey = (typeof PERSONAL_KEYS)[number];

export const PublicRowSchema = z.strictObject({
  id: z.string(), source: z.string(), company: z.string(), title: z.string(), url: z.url({ protocol: /^https?$/ }),
  location: z.string().nullable(), remote: z.enum(['remote', 'hybrid', 'onsite', 'unknown']),
  region: z.string().nullable(), role_tags: z.array(z.string()), seniority: z.string().nullable(),
  posted_at: z.string().nullable(), status: z.enum(['open', 'closed', 'unknown']), status_checked_at: z.string(),
});
type Row = z.infer<typeof PublicRowSchema>;

export type PublicRow = Row & { readonly [K in PersonalKey]?: never };
export type PublicPool = { version: string; checkedRange: { from: string; to: string }; rows: ReadonlyArray<PublicRow> };

const ALLOW = Object.keys(PublicRowSchema.shape) as ReadonlyArray<keyof Row>;

export function exportRow(engineRow: Readonly<Record<string, unknown>>): Result<PublicRow, PoolError> {
  const picked = Object.fromEntries(ALLOW.filter(k => k in engineRow).map(k => [k, engineRow[k]]));
  return privacyScan(picked);
}
export function privacyScan(candidate: Record<string, unknown>): Result<PublicRow, PoolError> {
  const leaked = PERSONAL_KEYS.filter(k => k in candidate);
  if (leaked.length) return err({ kind: 'PersonalFieldLeak', keys: leaked });
  const r = PublicRowSchema.safeParse(candidate);
  if (r.success) return ok(r.data);
  const unknown = r.error.issues.filter(i => i.code === 'unrecognized_keys').flatMap(i => ('keys' in i ? i.keys : []));
  return unknown.length ? err({ kind: 'UnknownField', keys: unknown }) : err({ kind: 'SchemaInvalid', issues: r.error.issues.map(i => `${i.path.join('.')}: ${i.message}`) });
}

type WithRequired<T, K extends keyof T> = Partial<T> & { [P in K]-?: NonNullable<T[P]> };
const OptionalRow = PublicRowSchema.partial();
export function consumerSchema<K extends keyof Row>(keys: ReadonlyArray<K>) {
  const config = Object.fromEntries(keys.map(k => [k, true]));
  const s = transformSchema(OptionalRow, config);
  return (data: unknown): Result<WithRequired<Row, K>, PoolError> => {
    const r = s.safeParse(data);
    return r.success ? ok(r.data as WithRequired<Row, K>) : err({ kind: 'SchemaInvalid', issues: r.error.issues.map(i => `${i.path.join('.')}: ${i.message}`) });
  };
}
export const asResultCard   = consumerSchema(['id', 'title', 'company', 'url', 'status_checked_at']);
export const asWebMcpResult = consumerSchema(['id', 'title', 'company', 'url', 'remote', 'status', 'status_checked_at']);
export const asRefreshRow   = consumerSchema(['id', 'source', 'url', 'status', 'status_checked_at']);

import { makeConditionalSchemaTransformer } from '@adaptate/core';
export const RefineInputSchema = z.object({
  actor: z.enum(['human', 'agent']).optional(), stateVersion: z.number().int().optional(),
  region: z.string().optional(), remote: z.enum(['remote', 'hybrid', 'onsite', 'any']).optional(), seniority: z.string().optional(),
});
export type RefineInput = z.infer<typeof RefineInputSchema>;
export function parseRefineInput(data: unknown): Result<RefineInput, PoolError> {
  const run = Result.fromThrowable(
    () => makeConditionalSchemaTransformer(data)(RefineInputSchema, { actor: true, stateVersion: { requiredIf: (d: RefineInput) => d.actor === 'agent' } }).run() as RefineInput,
    (e): PoolError => ({ kind: 'SchemaInvalid', issues: [e instanceof Error ? e.message.slice(0, 200) : 'invalid'] }),
  );
  return run();
}
