import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import type { Ask, FlowEvent, Snap } from '../src/flow.ts';
import type { ApplyPack } from '../src/page-tools.ts';

const source = ts.createSourceFile('App.tsx', readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const find = <T extends ts.Node>(pick: (n: ts.Node) => n is T, ok: (n: T) => boolean): T => {
  let hit: T | undefined;
  const visit = (n: ts.Node) => { if (!hit && pick(n) && ok(n)) hit = n; else ts.forEachChild(n, visit); };
  visit(source);
  assert.ok(hit);
  return hit;
};
const app = find(ts.isFunctionDeclaration, n => n.name?.text === 'App');
const attr = (element: string, name: string) => {
  const el = find((n): n is ts.JsxSelfClosingElement => ts.isJsxSelfClosingElement(n), n => n.tagName.getText(source).endsWith(element));
  const a = el.attributes.properties.find((p): p is ts.JsxAttribute => ts.isJsxAttribute(p) && p.name.getText(source) === name);
  assert.ok(a?.initializer && ts.isJsxExpression(a.initializer) && a.initializer.expression);
  return a.initializer.expression.getText(source);
};
const hostPart = (name: string) => find(ts.isPropertyAssignment, n => n.name.getText(source) === name).initializer.getText(source);
const statements = app.body?.statements ?? [];
const decls = statements.filter(ts.isVariableStatement).filter(st => (st.declarationList.flags & ts.NodeFlags.Const) !== 0).flatMap(st => [...st.declarationList.declarations]);
const callee = (d: ts.VariableDeclaration) => d.initializer && ts.isCallExpression(d.initializer) ? d.initializer : undefined;
const typeArg = (d: ts.VariableDeclaration) => callee(d)?.typeArguments?.[0]?.getText(source) ?? '';
const helpers = decls.filter(d => ts.isIdentifier(d.name) && d.initializer && (ts.isArrowFunction(d.initializer) || callee(d)?.expression.getText(source) === 'useRef'));
const states = decls.filter(d => ts.isArrayBindingPattern(d.name) && callee(d)?.expression.getText(source) === 'useState').map(d => {
  const [value, setter] = (d.name as ts.ArrayBindingPattern).elements.map(e => e.getText(source));
  return { value: value!, setter: setter!, init: callee(d)!.arguments[0]?.getText(source) ?? 'undefined', type: typeArg(d) };
});
const local = (pick: (type: string) => boolean, list: ReadonlyArray<{ name: string; type: string }>) => {
  const hit = list.filter(x => pick(x.type));
  assert.equal(hit.length, 1);
  return hit[0]!.name;
};
const flowRef = local(t => t.includes("import('./flow.ts')"), helpers.map(d => ({ name: d.name.getText(source), type: typeArg(d) })));
const snapState = local(t => /^Snap\b/.test(t), states.map(x => ({ name: x.value, type: x.type })));
const names = helpers.map(d => d.name.getText(source));
const body = `${states.map(x => `seed(${JSON.stringify(x.value)}, ${x.init});`).join('\n')}
${helpers.map(d => `const ${d.getText(source)};`).join('\n')}
return { locals: { ${names.join(', ')} },
  confirm: ${hostPart('confirmApplyOrSend')}, onConfirm: ${attr('ConfirmPane', 'onConfirm')}, onShown: ${attr('CardsPane', 'onShown')}, shownPack: () => ${attr('CardsPane', 'pack')} };`;
const js = ts.transpileModule(body, { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.Preserve }, reportDiagnostics: false }).outputText;

type Host = { locals: Record<string, { current: unknown }>; confirm: (ask: Omit<Ask, 'id'>) => Promise<string>; onConfirm: () => void; onShown: () => void; shownPack: () => ApplyPack | null };
const mount = (stubs: Record<string, unknown>) => {
  const live: Record<string, unknown> = {};
  stubs['seed'] = (name: string, v: unknown) => { live[name] = v; };
  for (const x of states) stubs[x.setter] = (v: unknown) => { live[x.value] = typeof v === 'function' ? (v as (p: unknown) => unknown)(live[x.value]) : v; };
  const scope = new Proxy(stubs, { has: (t, k) => k in t || k in live || states.some(x => x.value === k) || !(k in globalThis), get: (t, k) => (k as string) in live ? live[k as string] : t[k as string] });
  const host = new Function('scope', `with (scope) { return (() => { ${js} })(); }`)(scope) as Host;
  return { host, live };
};
const pending = Symbol('pending');
const state = <T,>(p: Promise<T>) => new Promise<T | typeof pending>(r => setTimeout(() => r(Promise.race([p, pending])), 0));

test('the App host keeps A on screen while B is pending, cancels A, and resolves B only through Confirm and shown cards', async () => {
  const pack = (roleId: string): ApplyPack => ({ roleId, title: `Engineer ${roleId}`, company: `Company ${roleId}`, url: `https://jobs.example.com/${roleId}`, location: null, remote: 'remote', status: 'open', reasons: [], checklist: [], notice: '' });
  const a = pack('A');
  const b = pack('B');
  const { host, live } = mount({ useRef: (current: unknown) => ({ current }), wantsAll: true, loadSoft: () => Promise.resolve({}) });
  host.locals[flowRef]!.current = await import('../src/flow.ts');
  const snap = () => live[snapState] as Snap;
  const send = host.locals['send'] as unknown as (e: FlowEvent) => void;
  for (const e of [{ type: 'POOL_LOADED' }, { type: 'MATCHED', view: { kind: 'results', result: {} as never, ms: 1 } }, { type: 'PACK', pack: a }] as FlowEvent[]) send(e);
  assert.equal(snap().step, 'pack');
  const first = host.confirm({ title: a.title, body: 'Review A', pack: a });
  const second = host.confirm({ title: b.title, body: 'Review B', pack: b });
  assert.equal(await state(first), 'cancelled');
  assert.equal(snap().ask?.body, 'Review B');
  assert.deepEqual(snap().ask?.pack, b);
  assert.deepEqual(host.shownPack(), a);
  assert.equal(await state(second), pending);
  host.onConfirm();
  assert.equal(snap().step, 'confirmed');
  assert.deepEqual(host.shownPack(), b);
  assert.equal(await state(second), pending);
  host.onShown();
  assert.equal(await state(second), 'confirmed');
});

test('when the page cannot show the cards, Confirm reports unshown, never confirmed', async () => {
  const pack: ApplyPack = { roleId: 'B', title: 'Engineer B', company: 'Company B', url: 'https://jobs.example.com/B', location: null, remote: 'remote', status: 'open', reasons: [], checklist: [], notice: '' };
  const { host, live } = mount({ useRef: (current: unknown) => ({ current }), wantsAll: false, loadSoft: () => Promise.resolve({}) });
  host.locals[flowRef]!.current = await import('../src/flow.ts');
  const send = host.locals['send'] as unknown as (e: FlowEvent) => void;
  for (const e of [{ type: 'POOL_LOADED' }, { type: 'MATCHED', view: { kind: 'results', result: {} as never, ms: 1 } }] as FlowEvent[]) send(e);
  const asked = host.confirm({ title: pack.title, body: 'Review B', pack });
  assert.equal((live[snapState] as Snap).step, 'confirming');
  host.onConfirm();
  assert.equal(await state(asked), 'unshown');
});
