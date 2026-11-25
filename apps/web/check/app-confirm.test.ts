import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { next, START, type FlowEvent, type Snap } from '../src/flow.ts';
import type { Ask } from '../src/flow.ts';
import type { ApplyPack } from '../src/page-tools.ts';

const source = ts.createSourceFile('App.tsx', readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let callback: ts.Expression | undefined;
const visit = (node: ts.Node) => {
  if (ts.isPropertyAssignment(node) && node.name.getText(source) === 'confirmApplyOrSend') callback = node.initializer;
  ts.forEachChild(node, visit);
};
visit(source);
assert.ok(callback);
const js = ts.transpileModule(`const confirm = ${callback.getText(source)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

test('the App host replaces the entire pending request and Confirm uses B', async () => {
  const pack = (roleId: string): ApplyPack => ({ roleId, title: `Engineer ${roleId}`, company: `Company ${roleId}`, url: `https://jobs.example.com/${roleId}`, location: null, remote: 'remote', status: 'open', reasons: [], checklist: [], notice: '' });
  const a = pack('A');
  const b = pack('B');
  const snapRef: { current: Snap } = { current: { ...START, step: 'matched' } };
  const send = (e: FlowEvent) => { const s = next(snapRef.current, e); assert.ok(s); snapRef.current = s; };
  const confirmRef = { current: null as null | ((s: string) => void) };
  const confirmId = { current: 0 };
  const loadSoft = () => Promise.resolve({});
  const setSoftRef = { current: () => undefined };
  const confirm = new Function('send', 'confirmRef', 'confirmId', 'snapRef', 'loadSoft', 'setSoftRef', 'settleConfirm', `${js}; return confirm;`)(send, confirmRef, confirmId, snapRef, loadSoft, setSoftRef, () => assert.fail('unexpected load failure')) as (ask: Omit<Ask, 'id'>) => Promise<string>;
  const first = confirm({ title: a.title, body: 'Review A', pack: a });
  const second = confirm({ title: b.title, body: 'Review B', pack: b });
  assert.equal(await first, 'cancelled');
  assert.equal(snapRef.current.ask?.body, 'Review B');
  assert.deepEqual(snapRef.current.ask?.pack, b);
  send({ type: 'CONFIRM' });
  assert.deepEqual(snapRef.current.pack, b);
  confirmRef.current?.('confirmed');
  assert.equal(await second, 'confirmed');
});
