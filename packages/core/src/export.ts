import { err, ok, type Result } from 'neverthrow';
import type { PoolError } from './errors.ts';
import { exportRow, type PublicPool, type PublicRow } from './schema.ts';

export type ExportFailure = { kind: 'ExportFailedClosed'; failures: ReadonlyArray<{ id: string; error: PoolError }> };

export function toPublicPool(engineRows: ReadonlyArray<Readonly<Record<string, unknown>>>, version: string): Result<PublicPool, ExportFailure> {
  const rows: PublicRow[] = [];
  const failures: Array<{ id: string; error: PoolError }> = [];
  for (const engineRow of engineRows) {
    const exported = exportRow(engineRow);
    if (exported.isOk()) rows.push(exported.value);
    else failures.push({ id: String(engineRow['id']), error: exported.error });
  }
  const checked = rows.map(r => r.status_checked_at).sort();
  const from = checked[0];
  const to = checked[checked.length - 1];
  if (failures.length > 0 || from === undefined || to === undefined) return err({ kind: 'ExportFailedClosed', failures });
  return ok({ version, checkedRange: { from, to }, rows });
}
