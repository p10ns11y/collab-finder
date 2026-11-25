import type {} from 'webmcp-types';
import type { MatchResult, MatchRow } from '../../../packages/core/src/index.ts';
import {
  APPLY_SEND_NOTICE,
  buildApplyPack,
  buildCvOutline,
  confirmedButNotSent,
  declinedConfirm,
  needsPersonConfirm,
  parseFindRoles,
  parseRolePick,
  summarizeRoles,
  type ApplyPack,
  type CvOutline,
  type FindRolesChange,
} from './page-tools.ts';

export type AgentSearch = FindRolesChange;
export type HostAnswer = { stateVersion: number; result: MatchResult | null; verdict: string; error: string | null };
export type WebMcpHost = {
  version(): number;
  search(baseVersion: number, change: AgentSearch): HostAnswer;
  showAllOptions(): void;
  rowOf(id: string): MatchRow | null;
  description(): string;
  confirmApplyOrSend(detail: { id: string; title: string; url: string }): Promise<boolean>;
  showCvOutline(outline: CvOutline): void;
  showApplyPack(pack: ApplyPack): void;
};

type AnyContext = { registerTool(tool: object, options?: { signal?: AbortSignal }): Promise<void> };

export const modelContext = (): AnyContext | null => {
  const doc = globalThis.document?.modelContext;
  if (doc && typeof doc.registerTool === 'function') return doc;
  const nav = (globalThis.navigator as unknown as { modelContext?: AnyContext | undefined }).modelContext;
  return nav && typeof nav.registerTool === 'function' ? nav : null;
};

const afterFirstPaint = (signal: AbortSignal): Promise<boolean> => new Promise(resolve => {
  if (signal.aborted) { resolve(false); return; }
  let idleId: number | undefined;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let settled = false;
  const finish = (ok: boolean) => {
    if (settled) return;
    settled = true;
    signal.removeEventListener('abort', onAbort);
    if (idleId !== undefined && typeof cancelIdleCallback === 'function') cancelIdleCallback(idleId);
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    resolve(ok);
  };
  const onAbort = () => finish(false);
  const armIdle = () => {
    if (signal.aborted) { finish(false); return; }
    if (typeof requestIdleCallback === 'function') idleId = requestIdleCallback(() => finish(true));
    else timeoutId = setTimeout(() => finish(true), 0);
  };
  signal.addEventListener('abort', onAbort, { once: true });
  requestAnimationFrame(() => {
    if (signal.aborted) { finish(false); return; }
    requestAnimationFrame(armIdle);
  });
});

let polyfill: Promise<void> | undefined;

export async function ensureWebMcp(signal: AbortSignal): Promise<AnyContext | null> {
  const current = modelContext();
  if (current) return current;
  if (!await afterFirstPaint(signal)) return null;
  const again = modelContext();
  if (again) return again;
  polyfill ??= import('@w3c/webmcp-polyfill').then(mod => { if (!modelContext()) mod.installWebMCP(); });
  try { await polyfill; }
  catch { polyfill = undefined; return null; }
  if (signal.aborted) return null;
  return modelContext();
}

const FILTERS = {
  regions: { type: 'array', items: { enum: ['SE', 'EU', 'UK', 'US'] } },
  remote: { enum: ['any', 'remote', 'hybrid', 'onsite'] },
  productOnly: { type: 'boolean' },
};

const rolePickSchema = {
  type: 'object',
  required: ['id'],
  properties: {
    id: { type: 'string', description: 'Id of a role already shown on the page' },
    apply: { type: 'boolean', description: 'If true, a person must confirm in the page. The page still does not apply.' },
    send: { type: 'boolean', description: 'If true, a person must confirm in the page. The page still does not send.' },
  },
};

export async function registerWebMcp(host: WebMcpHost, signal: AbortSignal): Promise<void> {
  const mc = await ensureWebMcp(signal);
  if (!mc || signal.aborted) return;
  const opts = { signal };
  const afterConfirm = async (id: string) => {
    const row = host.rowOf(id);
    if (!row) return { stateVersion: host.version(), error: 'not a role shown on the page' };
    const ok = await host.confirmApplyOrSend({ id: row.id, title: row.title, url: row.url });
    if (!ok) return declinedConfirm(host.version());
    const pack = buildApplyPack(row);
    host.showApplyPack(pack);
    return { ...confirmedButNotSent(host.version(), row.url), pack };
  };
  try {
  await Promise.all([
    mc.registerTool({
      name: 'find_roles',
      title: 'Find roles',
      description: 'Fill the page form with a self-description and show matching roles in this browser. Nothing leaves the page. Does not apply or send.',
      inputSchema: {
        type: 'object',
        required: ['stateVersion'],
        properties: { stateVersion: { type: 'integer' }, description: { type: 'string' }, goal: { type: 'string' }, ...FILTERS },
      },
      execute: (input: Record<string, unknown>) => {
        const parsed = parseFindRoles(input);
        if (!parsed.ok) return { error: parsed.error, stateVersion: host.version() };
        host.showAllOptions();
        const answer = host.search(parsed.value.baseVersion, parsed.value.change);
        return summarizeRoles(answer);
      },
    }, opts),
    mc.registerTool({
      name: 'tailor_cv',
      title: 'Tailor CV',
      description: 'Show a local outline of what to emphasize for a role already on the page, built from the text in the form and public posting facts. Nothing is sent. This is not a submitted CV.',
      annotations: { readOnlyHint: true },
      inputSchema: rolePickSchema,
      execute: async (input: Record<string, unknown>) => {
        const parsed = parseRolePick(input);
        if (!parsed.ok) return { error: parsed.error, stateVersion: host.version() };
        if (needsPersonConfirm(parsed.value)) return afterConfirm(parsed.value.id);
        const row = host.rowOf(parsed.value.id);
        if (!row) return { error: 'not a role shown on the page', stateVersion: host.version() };
        const outline = buildCvOutline(host.description(), row);
        host.showCvOutline(outline);
        return { stateVersion: host.version(), ...outline };
      },
    }, opts),
    mc.registerTool({
      name: 'show_apply_pack',
      title: 'Show apply pack',
      description: `Show a local apply pack for a role already on the page: public facts, the posting link, and a checklist. ${APPLY_SEND_NOTICE}`,
      annotations: { readOnlyHint: true },
      inputSchema: rolePickSchema,
      execute: async (input: Record<string, unknown>) => {
        const parsed = parseRolePick(input);
        if (!parsed.ok) return { error: parsed.error, stateVersion: host.version() };
        if (needsPersonConfirm(parsed.value)) return afterConfirm(parsed.value.id);
        const row = host.rowOf(parsed.value.id);
        if (!row) return { error: 'not a role shown on the page', stateVersion: host.version() };
        const pack = buildApplyPack(row);
        host.showApplyPack(pack);
        return { stateVersion: host.version(), ...pack };
      },
    }, opts),
  ]);
  } catch { return; }
}
