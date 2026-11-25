import { z } from 'zod';
import { transformSchema } from '@adaptate/core';

const text = (max: number) => z.string().trim().min(1).max(max);
const PLACE = z.enum(['SE', 'EU', 'UK', 'US']);
const REMOTE = z.enum(['remote', 'hybrid', 'onsite', 'unknown']);
const STATUS = z.enum(['open', 'closed', 'unknown']);

export const FindRolesBase = z.object({
  stateVersion: z.number().int().min(0).optional(),
  description: z.string().max(2000).optional(),
  goal: z.string().max(500).optional(),
  regions: z.array(PLACE).max(4).optional(),
  remote: z.enum(['any', 'remote', 'hybrid', 'onsite']).optional(),
  productOnly: z.boolean().optional(),
});

export const RolePickBase = z.object({
  id: text(200).optional(),
  apply: z.boolean().optional(),
  send: z.boolean().optional(),
});

export const RoleBase = z.object({
  id: text(200), title: text(300), company: text(200), url: z.url({ protocol: /^https?$/ }),
  location: z.string().nullable(), remote: REMOTE, status: STATUS, lastChecked: z.string(),
  score: z.number(), reasons: z.array(z.string()).max(10),
}).partial();

export const ApplyPackBase = z.object({
  roleId: text(200), title: text(300), company: text(200), url: z.url({ protocol: /^https?$/ }),
  location: z.string().nullable(), remote: REMOTE, status: STATUS,
  reasons: z.array(z.string()).max(5), checklist: z.array(z.string()).min(1), notice: text(400),
  confirmed: z.boolean(), applied: z.literal(false), sent: z.literal(false),
}).partial();

export const GapBase = z.object({
  kind: z.enum(['skill', 'level', 'region', 'remote']), detail: text(200), step: text(200),
}).partial();

export const SourceRowBase = z.object({
  id: text(200), source: text(80), company: text(200), title: text(300), url: z.url({ protocol: /^https?$/ }),
  location: z.string().nullable(), remote: REMOTE, status: STATUS, status_checked_at: z.string(),
}).partial();

const need = <K extends string>(keys: ReadonlyArray<K>) => Object.fromEntries(keys.map(k => [k, true])) as Record<K, true>;

export const CONSUMERS = {
  findRolesTool: transformSchema(FindRolesBase, need(['stateVersion'])),
  pickTool: transformSchema(RolePickBase, need(['id'])),
  matchCard: transformSchema(RoleBase, need(['id', 'title', 'company', 'reasons'])),
  tailorInput: transformSchema(RoleBase, need(['id', 'title', 'company', 'reasons'])),
  applyPackInput: transformSchema(RoleBase, need(['id', 'title', 'company', 'url', 'remote', 'status'])),
  applyPackOut: transformSchema(ApplyPackBase, need(['roleId', 'title', 'company', 'url', 'checklist', 'notice', 'applied', 'sent'])),
  gapsOut: transformSchema(GapBase, need(['kind', 'detail', 'step'])),
  sourceIngest: transformSchema(SourceRowBase, need(['id', 'source', 'company', 'title', 'url', 'status_checked_at'])),
} as const;

export type Consumer = keyof typeof CONSUMERS;
export type Checked<C extends Consumer> = z.infer<(typeof CONSUMERS)[C]>;
export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

export function check<C extends Consumer>(consumer: C, input: unknown): Parsed<Checked<C>> {
  const r = CONSUMERS[consumer].safeParse(input);
  if (r.success) return { ok: true, value: r.data as Checked<C> };
  return { ok: false, error: r.error.issues.slice(0, 3).map(i => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ') };
}

export function ingest(rows: ReadonlyArray<unknown>): { kept: ReadonlyArray<Checked<'sourceIngest'>>; dropped: number } {
  const kept: Checked<'sourceIngest'>[] = [];
  for (const row of rows) {
    const r = check('sourceIngest', row);
    if (r.ok) kept.push(r.value);
  }
  return { kept, dropped: rows.length - kept.length };
}
