import { err, ok, Result } from 'neverthrow';
import type { PoolError } from './errors.ts';
import { PERSONAL_KEYS, privacyScan, PublicRowSchema, type PublicPool, type PublicRow } from './schema.ts';

const KNOWN = new Set(Object.keys(PublicRowSchema.shape));
const PERSONAL: ReadonlySet<string> = new Set(PERSONAL_KEYS);
const knownOnly = (row: unknown): unknown => {
  if (typeof row !== 'object' || row === null) return row;
  return Object.fromEntries(Object.entries(row).filter(([k]) => KNOWN.has(k) || PERSONAL.has(k)));
};

export function readPool(raw: unknown): Result<PublicPool, PoolError> {
  if (typeof raw !== 'object' || raw === null || !Array.isArray((raw as { rows?: unknown }).rows)) return parsePool(raw);
  const o = raw as { rows: unknown[] };
  return parsePool({ ...o, rows: o.rows.map(knownOnly) });
}

export const companyCount = (pool: Pick<PublicPool, 'rows'>): number => new Set(pool.rows.map(r => r.company.trim().toLowerCase())).size;

export function parsePool(raw: unknown): Result<PublicPool, PoolError> {
  if (typeof raw !== 'object' || raw === null) return err({ kind: 'SchemaInvalid', issues: ['pool: not an object'] });
  const o = raw as Record<string, unknown>;
  const cr = o['checkedRange'] as Record<string, unknown> | undefined;
  if (typeof o['version'] !== 'string' || !cr || typeof cr['from'] !== 'string' || typeof cr['to'] !== 'string' || !Array.isArray(o['rows']))
    return err({ kind: 'SchemaInvalid', issues: ['pool: needs version, checkedRange{from,to}, rows[]'] });
  const rows = Result.combine((o['rows'] as unknown[]).map((r, i) =>
    typeof r === 'object' && r !== null ? privacyScan(r as Record<string, unknown>) : err<PublicRow, PoolError>({ kind: 'SchemaInvalid', issues: [`rows.${i}: not an object`] })));
  return rows.map(rs => ({ version: o['version'] as string, checkedRange: { from: cr['from'] as string, to: cr['to'] as string }, rows: rs }));
}
