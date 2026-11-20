import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { findPii, parsePool, PERSONAL_KEYS, PublicRowSchema } from '../../../packages/core/src/index.ts';

const SAMPLE = new URL('../../../packages/core/fixtures/pool.sample.json', import.meta.url).pathname;
const poolPath = resolve(process.env['POOL_PATH'] ?? SAMPLE);
const text = readFileSync(poolPath, 'utf8');
const SHARD_ROWS = 8000;
type RawPool = { version?: unknown; checkedRange?: unknown; rows?: Array<Record<string, unknown>>; shards?: string[] };
const loaded = JSON.parse(text) as RawPool;
const raw: RawPool = loaded.shards
  ? { version: loaded.version, checkedRange: loaded.checkedRange, rows: loaded.shards.flatMap(f => (JSON.parse(readFileSync(join(dirname(poolPath), f), 'utf8')) as { rows: Array<Record<string, unknown>> }).rows) }
  : loaded;
const parsed = parsePool(raw);
if (parsed.isErr()) { console.error(`POOL REJECTED: ${parsed.error.kind}`); process.exit(1); }
const allowed = new Set(Object.keys(PublicRowSchema.shape));
const EMAIL_ANYWHERE = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;
const findings = { personalKeys: 0, unknownKeys: 0, emails: 0, phones: 0, idNumbers: 0 };
for (const row of raw.rows ?? []) {
  for (const k of Object.keys(row)) {
    if ((PERSONAL_KEYS as ReadonlyArray<string>).includes(k)) findings.personalKeys++;
    else if (!allowed.has(k)) findings.unknownKeys++;
  }
  for (const [k, v] of Object.entries(row)) {
    const values = Array.isArray(v) ? v : [v];
    for (const s of values) {
      if (typeof s !== 'string') continue;
      if (k === 'url' || k === 'id') { if (EMAIL_ANYWHERE.test(s.replace(/^mailto:/, ''))) findings.emails++; continue; }
      for (const span of findPii(s)) {
        if (span.pii === 'email') findings.emails++;
        else if (span.pii === 'phone') findings.phones++;
        else findings.idNumbers++;
      }
    }
  }
}
const total = Object.values(findings).reduce((a, b) => a + b, 0);
const bundled = JSON.stringify(parsed.value);
const shardCount = Math.ceil(parsed.value.rows.length / SHARD_ROWS);
const sha = createHash('sha256').update(bundled).digest('hex');
const kind = parsed.value.version.includes('synthetic') ? 'synthetic' : 'real';
const report = { kind, version: parsed.value.version, rows: parsed.value.rows.length, checkedRange: parsed.value.checkedRange, sha256: sha, findings };
console.log(JSON.stringify(report));
if (total > 0) { console.error('POOL SCAN FAILED: deploy aborted'); process.exit(1); }
if (process.env['SCAN_ONLY'] === '1') process.exit(0);
const out = new URL('../public/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });
for (const f of (await import('node:fs')).readdirSync(out)) if (/^pool(-\d+)?\.json$/.test(f)) (await import('node:fs')).rmSync(`${out}${f}`);
if (shardCount <= 1) writeFileSync(`${out}pool.json`, bundled);
else {
  const shards = Array.from({ length: shardCount }, (_, i) => `pool-${i}.json`);
  shards.forEach((f, i) => writeFileSync(`${out}${f}`, JSON.stringify({ rows: parsed.value.rows.slice(i * SHARD_ROWS, (i + 1) * SHARD_ROWS) })));
  writeFileSync(`${out}pool.json`, JSON.stringify({ version: parsed.value.version, checkedRange: parsed.value.checkedRange, shards }));
}
writeFileSync(new URL('../pool-scan.json', import.meta.url), JSON.stringify(report, null, 1) + '\n');
