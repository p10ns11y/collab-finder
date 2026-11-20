import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { parsePool } from '../src/index.ts';
import { runMatch } from '../src/surface.ts';
import { GOLDEN_INPUTS } from './golden-inputs.ts';

const NOW = '2026-11-19T20:00:00Z';
const poolPath = new URL('../fixtures/pool.sample.json', import.meta.url).pathname;
const pool = parsePool(JSON.parse(readFileSync(poolPath, 'utf8')))._unsafeUnwrap();
const script = (name: string) => new URL(`../scripts/${name}`, import.meta.url).pathname;


const viaCli = (input: unknown): unknown => {
  const r = spawnSync(process.execPath, [script('match.ts'), '--pool', poolPath, '--now', NOW], { input: JSON.stringify(input), encoding: 'utf8' });
  return JSON.parse(r.stdout);
};

const viaMcp = async (inputs: ReadonlyArray<unknown>): Promise<unknown[]> => {
  const child = spawn(process.execPath, [script('mcp.ts')], { env: { ...process.env, KANITHANJ_POOL: poolPath, KANITHANJ_NOW: NOW }, stdio: ['pipe', 'pipe', 'inherit'] });
  const lines: string[] = [];
  let buf = '';
  const want = inputs.length + 2;
  const done = new Promise<void>(resolve => child.stdout.on('data', (d: Buffer) => {
    buf += d.toString('utf8');
    const parts = buf.split('\n');
    buf = parts.pop() ?? '';
    lines.push(...parts.filter(Boolean));
    if (lines.length >= want) resolve();
  }));
  const send = (m: unknown) => child.stdin.write(JSON.stringify(m) + '\n');
  send({ jsonrpc: '2.0', id: 'init', method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } } });
  send({ jsonrpc: '2.0', method: 'notifications/initialized' });
  send({ jsonrpc: '2.0', id: 'list', method: 'tools/list' });
  inputs.forEach((a, i) => send({ jsonrpc: '2.0', id: i, method: 'tools/call', params: { name: 'match_roles', arguments: a } }));
  await done;
  child.kill();
  const byId = new Map(lines.map(l => JSON.parse(l) as { id: unknown; result: { structuredContent?: unknown; tools?: Array<{ name: string }> } }).map(m => [m.id, m]));
  assert.deepEqual(byId.get('list')?.result.tools?.map(t => t.name), ['match_roles']);
  return inputs.map((_, i) => byId.get(i)?.result.structuredContent);
};

test('identical output on every golden input across core, CLI and MCP', async () => {
  const direct = GOLDEN_INPUTS.map(i => runMatch(i, pool, new Date(NOW)));
  const mcp = await viaMcp(GOLDEN_INPUTS);
  GOLDEN_INPUTS.forEach((input, i) => {
    const want = JSON.parse(JSON.stringify(direct[i]));
    assert.deepEqual(viaCli(input), want, `cli ${i}`);
    assert.deepEqual(mcp[i], want, `mcp ${i}`);
  });
  assert.ok(direct.filter(d => d.ok).length >= 5);
  assert.ok(direct.some(d => !d.ok && d.error.kind === 'InputInvalid'));
});

test('the MCP server answers malformed lines with JSON-RPC errors and keeps serving', async () => {
  const child = spawn(process.execPath, [script('mcp.ts')], { env: { ...process.env, KANITHANJ_POOL: poolPath }, stdio: ['pipe', 'pipe', 'inherit'] });
  const out: string[] = [];
  const done = new Promise<void>(resolve => child.stdout.on('data', (d: Buffer) => { out.push(...d.toString('utf8').split('\n').filter(Boolean)); if (out.length >= 3) resolve(); }));
  child.stdin.write('not json\n');
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'nope' }) + '\n');
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'ping' }) + '\n');
  await done;
  child.kill();
  const msgs = out.map(l => JSON.parse(l) as { id: unknown; error?: { code: number }; result?: unknown });
  assert.equal(msgs[0]?.error?.code, -32700);
  assert.equal(msgs[1]?.error?.code, -32601);
  assert.deepEqual(msgs[2]?.result, {});
});
