import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { CORE_VERSION, parsePool } from '../src/index.ts';
import { matchInputJsonSchema, runMatch } from '../src/surface.ts';

const PROTOCOL = '2025-06-18';
const poolPath = process.env['KANITHANJ_POOL'] ?? new URL('../fixtures/pool.sample.json', import.meta.url).pathname;
const pool = parsePool(JSON.parse(readFileSync(poolPath, 'utf8')));
const fixedNow = process.env['KANITHANJ_NOW'];

const TOOLS = [{
  name: 'match_roles',
  title: 'Match roles',
  description: 'Match a short self-description against the local role pool. Runs on this machine; nothing is sent anywhere. Returns three groups: fitsNow, stepTowardGoal, stretch.',
  inputSchema: matchInputJsonSchema,
  annotations: { readOnlyHint: true, openWorldHint: false },
}];

type Req = { jsonrpc: '2.0'; id?: string | number | null; method: string; params?: Record<string, unknown> };
const send = (msg: unknown): void => { process.stdout.write(JSON.stringify(msg) + '\n'); };
const reply = (id: Req['id'], result: unknown): void => send({ jsonrpc: '2.0', id, result });
const fail = (id: Req['id'], code: number, message: string): void => send({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

const handle = (req: Req): void => {
  if (req.id === undefined) return;
  switch (req.method) {
    case 'initialize': return reply(req.id, { protocolVersion: PROTOCOL, capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'kanithanj-ai', version: CORE_VERSION } });
    case 'ping': return reply(req.id, {});
    case 'tools/list': return reply(req.id, { tools: TOOLS });
    case 'tools/call': {
      if (req.params?.['name'] !== 'match_roles') return fail(req.id, -32602, 'unknown tool');
      if (pool.isErr()) return reply(req.id, { isError: true, content: [{ type: 'text', text: JSON.stringify({ ok: false, error: pool.error }) }] });
      const out = runMatch(req.params['arguments'] ?? {}, pool.value, fixedNow ? new Date(fixedNow) : undefined);
      return reply(req.id, { isError: !out.ok, content: [{ type: 'text', text: JSON.stringify(out) }], structuredContent: out });
    }
    default: return fail(req.id, -32601, 'method not found');
  }
};

createInterface({ input: process.stdin }).on('line', line => {
  if (!line.trim()) return;
  let req: Req;
  try { req = JSON.parse(line) as Req; } catch { return fail(null, -32700, 'parse error'); }
  if (typeof req !== 'object' || req === null || typeof req.method !== 'string') return fail(null, -32600, 'invalid request');
  handle(req);
});
