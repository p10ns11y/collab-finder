import { err, ok, Result } from 'neverthrow';
import type { PoolError } from './errors.ts';
import { privacyScan, type PublicPool, type PublicRow } from './schema.ts';

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
