import type {} from 'webmcp-types';
import { check } from '../../../../packages/core/src/flow-schema.ts';
import { actor, auto, stateVersion } from './run.ts';

type Ctx = { registerTool(tool: object): Promise<void> | void };
const ctx = (): Ctx | null => {
  const c = (document as unknown as { modelContext?: Ctx }).modelContext ?? (navigator as unknown as { modelContext?: Ctx }).modelContext;
  return c && typeof c.registerTool === 'function' ? c : null;
};

const now = () => actor.getSnapshot();
const fail = (error: string) => ({ error, stateVersion: stateVersion(), applied: false, sent: false });

const cards = () => now().context.roles.flatMap(r => { const c = check('matchCard', r); return c.ok ? [c.value] : []; });

function pick(id: string): string | null {
  const s = now();
  if (s.context.picked?.id === id && ['tailored', 'pack'].includes(String(s.value))) return null;
  if (!['matched', 'tailored', 'pack', 'confirmed'].includes(String(s.value))) return 'Find roles first.';
  if (s.value !== 'matched') auto({ type: 'BACK' });
  auto({ type: 'PICK', id });
  return now().value === 'tailored' ? null : 'not a role shown on the page';
}

function packOut() {
  if (now().value === 'tailored') auto({ type: 'PACK' });
  const { picked, pack } = now().context;
  return check('applyPackOut', picked && pack && { roleId: picked.id, title: picked.title, company: picked.company, url: picked.url, checklist: pack.checklist, notice: 'A person confirms in the page. This page does not apply or send.', applied: false, sent: false });
}

const personConfirm = (): Promise<boolean> => new Promise(resolve => {
  auto({ type: 'REQUEST_CONFIRM' });
  const sub = actor.subscribe(s => {
    if (s.value === 'confirming') return;
    sub.unsubscribe();
    resolve(s.value === 'confirmed' && s.context.confirmed);
  });
});

export async function registerFlowTools(): Promise<void> {
  if (!ctx()) await import('@w3c/webmcp-polyfill').then(m => { if (!ctx()) m.installWebMCP(); }).catch(() => undefined);
  const mc = ctx();
  if (!mc) return;
  await Promise.all([
    mc.registerTool({
      name: 'find_roles', title: 'Find roles',
      description: 'Match the sample source pool against a self-description in this browser. Nothing leaves the page.',
      inputSchema: { type: 'object', required: ['stateVersion'], properties: { stateVersion: { type: 'integer' }, description: { type: 'string' } } },
      execute: (input: Record<string, unknown>) => {
        const p = check('findRolesTool', input);
        if (!p.ok) return fail(p.error);
        if (p.value.stateVersion !== stateVersion()) return fail(`StaleWrite: pass stateVersion ${stateVersion()}`);
        if (!['find', 'matched'].includes(String(now().value))) auto({ type: 'BACK' });
        auto({ type: 'FIND', query: p.value.description ?? '' });
        return now().value === 'matched' ? { stateVersion: stateVersion(), roles: cards() } : fail(now().context.error ?? 'A description is required.');
      },
    }),
    mc.registerTool({
      name: 'tailor_cv', title: 'Tailor CV', annotations: { readOnlyHint: true },
      description: 'Show a local outline of what to emphasize for a role on the page. Nothing is sent.',
      inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      execute: (input: Record<string, unknown>) => {
        const p = check('pickTool', input);
        if (!p.ok) return fail(p.error);
        const e = pick(p.value.id ?? '');
        if (e) return fail(e);
        return { stateVersion: stateVersion(), roleId: p.value.id, emphasize: now().context.outline?.emphasize ?? [] };
      },
    }),
    mc.registerTool({
      name: 'show_apply_pack', title: 'Show apply pack', annotations: { readOnlyHint: true },
      description: 'Show the apply pack for a role on the page. With apply or send, a person must confirm in the page; the page still never applies or sends.',
      inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string' }, apply: { type: 'boolean' }, send: { type: 'boolean' } } },
      execute: async (input: Record<string, unknown>) => {
        const p = check('pickTool', input);
        if (!p.ok) return fail(p.error);
        const e = pick(p.value.id ?? '');
        if (e) return fail(e);
        const out = packOut();
        if (!out.ok) return fail(out.error);
        if (p.value.apply !== true && p.value.send !== true) return { stateVersion: stateVersion(), ...out.value };
        if (!await personConfirm()) return fail('A person did not confirm. Nothing was applied or sent.');
        return { stateVersion: stateVersion(), confirmed: true, ...out.value };
      },
    }),
  ]);
}
