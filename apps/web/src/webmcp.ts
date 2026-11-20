import type { MatchResult, RegionPref, RemotePref } from '../../../packages/core/src/index.ts';

type Place = Exclude<RegionPref, 'any'>;
export type AgentSearch = { description?: string; goal?: string; regions?: ReadonlyArray<Place>; remote?: RemotePref; productOnly?: boolean };
export type HostAnswer = { stateVersion: number; result: MatchResult | null; verdict: string; error: string | null };
export type WebMcpHost = {
  version(): number;
  search(baseVersion: number, change: AgentSearch): HostAnswer;
  urlOf(id: string): string | null;
};
type ToolText = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };
type Tool = { name: string; description: string; inputSchema: Record<string, unknown>; annotations?: Record<string, boolean>; execute(input: Record<string, unknown>): Promise<ToolText> };
type ModelContext = { registerTool(tool: Tool): unknown };

export const modelContext = (): ModelContext | null => {
  const mc = (globalThis.navigator as unknown as { modelContext?: Partial<ModelContext> } | undefined)?.modelContext;
  return mc && typeof mc.registerTool === 'function' ? (mc as ModelContext) : null;
};

const PLACES: ReadonlyArray<Place> = ['SE', 'EU', 'UK', 'US'];
const REMOTES: ReadonlyArray<RemotePref> = ['any', 'remote', 'hybrid', 'onsite'];
const text = (v: unknown, isError = false): ToolText => ({ content: [{ type: 'text', text: JSON.stringify(v) }], ...(isError ? { isError } : {}) });
const summary = (a: HostAnswer) => a.error
  ? { stateVersion: a.stateVersion, error: a.error }
  : { stateVersion: a.stateVersion, verdict: a.verdict, groups: a.result ? Object.fromEntries(Object.entries(a.result.groups).map(([k, rows]) => [k, rows.slice(0, 10).map(r => ({ id: r.id, title: r.title, company: r.company, reasons: r.reasons }))])) : null };

export const parseSearch = (input: Record<string, unknown>): { baseVersion: number; change: AgentSearch } | string => {
  const v = input['stateVersion'];
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) return 'stateVersion (integer) is required; read it with get_state';
  const change: AgentSearch = {};
  if (typeof input['description'] === 'string') change.description = input['description'].slice(0, 2000);
  if (typeof input['goal'] === 'string') change.goal = input['goal'].slice(0, 500);
  if (Array.isArray(input['regions'])) change.regions = PLACES.filter(p => (input['regions'] as unknown[]).includes(p));
  if (typeof input['remote'] === 'string' && (REMOTES as ReadonlyArray<string>).includes(input['remote'])) change.remote = input['remote'] as RemotePref;
  if (typeof input['productOnly'] === 'boolean') change.productOnly = input['productOnly'];
  return { baseVersion: v, change };
};

const onlyFilters = ({ regions, remote, productOnly }: AgentSearch): AgentSearch =>
  ({ ...(regions ? { regions } : {}), ...(remote ? { remote } : {}), ...(productOnly !== undefined ? { productOnly } : {}) });
const FILTERS = { regions: { type: 'array', items: { enum: PLACES } }, remote: { enum: REMOTES }, productOnly: { type: 'boolean' } };
let registered = false;
export function registerWebMcp(host: WebMcpHost): boolean {
  const mc = modelContext();
  if (!mc || registered) return registered;
  registered = true;
  const write = (needsDescription: boolean) => async (input: Record<string, unknown>) => {
    const p = parseSearch(input);
    if (typeof p === 'string') return text({ error: p }, true);
    if (needsDescription && !p.change.description) return text({ error: 'description is required' }, true);
    const a = host.search(p.baseVersion, needsDescription ? p.change : onlyFilters(p.change));
    return text(summary(a), a.error !== null);
  };
  mc.registerTool({ name: 'get_state', description: 'Read the page state version. Pass it as stateVersion to any write; a write on an old version is refused.',
    inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true }, execute: async () => text({ stateVersion: host.version() }) });
  mc.registerTool({ name: 'match_roles', description: 'Fill the page form with a self-description and run the match in this browser. Nothing leaves the page.',
    inputSchema: { type: 'object', required: ['stateVersion', 'description'], properties: { stateVersion: { type: 'integer' }, description: { type: 'string' }, goal: { type: 'string' }, ...FILTERS } },
    execute: write(true) });
  mc.registerTool({ name: 'refine_search', description: 'Change regions, work mode or the product-companies filter and rerun the match.',
    inputSchema: { type: 'object', required: ['stateVersion'], properties: { stateVersion: { type: 'integer' }, ...FILTERS } }, execute: write(false) });
  mc.registerTool({ name: 'open_posting', description: 'Get the link of a posting shown on the page.', annotations: { readOnlyHint: true },
    inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
    execute: async input => { const url = typeof input['id'] === 'string' ? host.urlOf(input['id']) : null; return url ? text({ url }) : text({ error: 'not a posting shown on the page' }, true); } });
  return true;
}
