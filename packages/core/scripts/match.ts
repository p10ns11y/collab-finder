import { readFileSync } from 'node:fs';
import { parsePool } from '../src/index.ts';
import { runMatch } from '../src/surface.ts';

const args = process.argv.slice(2);
const opt = (k: string): string | undefined => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : undefined; };
const poolPath = opt('pool') ?? process.env['KANITHANJ_POOL'] ?? new URL('../fixtures/pool.sample.json', import.meta.url).pathname;
const pool = parsePool(JSON.parse(readFileSync(poolPath, 'utf8')));
if (pool.isErr()) { process.stdout.write(JSON.stringify({ ok: false, error: pool.error }) + '\n'); process.exit(2); }
const fromFlags = opt('description') !== undefined;
const input: unknown = fromFlags
  ? Object.fromEntries([['description', opt('description')], ['goal', opt('goal')], ['likes', opt('likes')], ['remote', opt('remote')],
    ['region', opt('region')?.split(',')], ['limit', opt('limit') ? Number(opt('limit')) : undefined]].filter(([, v]) => v !== undefined))
  : JSON.parse(readFileSync(0, 'utf8'));
const now = opt('now');
const out = runMatch(input, pool.value, now ? new Date(now) : undefined);
process.stdout.write(JSON.stringify(out) + '\n');
process.exit(out.ok ? 0 : 1);
