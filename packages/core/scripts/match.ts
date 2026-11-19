// Eval/CLI entry over the same core: node scripts/match.ts --pool <file> [--now ISO] [--limit N] < profile.json
import { readFileSync } from 'node:fs';
import { match, parsePool } from '../src/index.ts';

const args = process.argv.slice(2);
const opt = (k: string): string | undefined => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : undefined; };
const poolPath = opt('pool') ?? new URL('../fixtures/pool.sample.json', import.meta.url).pathname;
const pool = parsePool(JSON.parse(readFileSync(poolPath, 'utf8')));
if (pool.isErr()) { process.stdout.write(JSON.stringify({ ok: false, error: pool.error }) + '\n'); process.exit(2); }
const profile = JSON.parse(readFileSync(0, 'utf8'));
const now = opt('now'); const limit = opt('limit');
const r = match(profile, pool.value, { ...(now ? { now: new Date(now) } : {}), ...(limit ? { limit: Number(limit) } : {}) });
process.stdout.write(JSON.stringify(r.isOk() ? { ok: true, value: r.value } : { ok: false, error: r.error }) + '\n');
