import type { MatchResult, MatchRow, RegionPref, RemotePref } from '../../../packages/core/src/index.ts';

export type Place = Exclude<RegionPref, 'any'>;
export const PLACES: ReadonlyArray<Place> = ['SE', 'EU', 'UK', 'US'];
export const REMOTES: ReadonlyArray<RemotePref> = ['any', 'remote', 'hybrid', 'onsite'];
export const TOOL_NAMES = ['find_roles', 'show_apply_pack', 'tailor_cv'] as const;

export type FindRolesChange = {
  description?: string;
  goal?: string;
  regions?: ReadonlyArray<Place>;
  remote?: RemotePref;
  productOnly?: boolean;
};

export type FindRolesInput = { baseVersion: number; change: FindRolesChange };
export type RolePickInput = { id: string; apply?: boolean; send?: boolean };

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

export const APPLY_SEND_NOTICE =
  'This page never applies or sends on your behalf. A person must confirm, then open the posting themselves.';

export function parseFindRoles(input: Record<string, unknown>): Parsed<FindRolesInput> {
  const v = input['stateVersion'];
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
    return { ok: false, error: 'stateVersion (integer) is required; pass 0 on the first call, or the value returned by the last find_roles call' };
  }
  const change: FindRolesChange = {};
  if (typeof input['description'] === 'string') change.description = input['description'].slice(0, 2000);
  if (typeof input['goal'] === 'string') change.goal = input['goal'].slice(0, 500);
  if (Array.isArray(input['regions'])) change.regions = PLACES.filter(p => (input['regions'] as unknown[]).includes(p));
  if (typeof input['remote'] === 'string' && (REMOTES as ReadonlyArray<string>).includes(input['remote'])) {
    change.remote = input['remote'] as RemotePref;
  }
  if (typeof input['productOnly'] === 'boolean') change.productOnly = input['productOnly'];
  return { ok: true, value: { baseVersion: v, change } };
}

export function parseRolePick(input: Record<string, unknown>): Parsed<RolePickInput> {
  const id = input['id'];
  if (typeof id !== 'string' || id.length === 0) return { ok: false, error: 'id is required and must match a role shown on the page' };
  const value: RolePickInput = { id };
  if (input['apply'] === true) value.apply = true;
  if (input['send'] === true) value.send = true;
  return { ok: true, value };
}

export const needsPersonConfirm = (input: RolePickInput): boolean => input.apply === true || input.send === true;

export type CvOutline = {
  roleId: string;
  title: string;
  company: string;
  emphasize: ReadonlyArray<string>;
  notice: string;
};

const STOP = new Set(['the', 'and', 'for', 'with', 'you', 'your', 'this', 'that', 'from', 'into', 'a', 'an', 'of', 'to', 'in', 'on', 'or', 'at']);
const tokens = (s: string): ReadonlyArray<string> => (s.toLowerCase().match(/[a-z][a-z0-9+.#-]{1,}/g) ?? []).filter(w => !STOP.has(w));

export function buildCvOutline(description: string, row: MatchRow): CvOutline {
  const named = new Set(tokens(description));
  const overlap = [...new Set(tokens(`${row.title} ${row.company}`).filter(w => named.has(w)))].slice(0, 8);
  const emphasize = [...overlap, ...row.reasons.slice(0, 5)].slice(0, 8);
  return {
    roleId: row.id,
    title: row.title,
    company: row.company,
    emphasize: emphasize.length ? emphasize : row.reasons.slice(0, 5),
    notice: 'This outline is built in your browser from the text on this page and public posting facts. It is not a submitted CV and nothing is sent.',
  };
}

export type ApplyPack = {
  roleId: string;
  title: string;
  company: string;
  url: string;
  location: string | null;
  remote: string;
  status: string;
  reasons: ReadonlyArray<string>;
  checklist: ReadonlyArray<string>;
  notice: string;
};

export function buildApplyPack(row: MatchRow): ApplyPack {
  return {
    roleId: row.id,
    title: row.title,
    company: row.company,
    url: row.url,
    location: row.location,
    remote: row.remote,
    status: row.status,
    reasons: row.reasons.slice(0, 5),
    checklist: [
      'Read the live posting; this page only keeps public facts and a link.',
      'Check that the role is still open.',
      'A person must confirm before any apply or send step.',
      'This page does not apply or send for you.',
    ],
    notice: APPLY_SEND_NOTICE,
  };
}

export type RoleSummary = {
  stateVersion: number;
  verdict: string;
  error: string | null;
  groups: Record<string, Array<{ id: string; title: string; company: string; reasons: ReadonlyArray<string> }>> | null;
};

export function summarizeRoles(answer: { stateVersion: number; result: MatchResult | null; verdict: string; error: string | null }): RoleSummary {
  return {
    stateVersion: answer.stateVersion,
    verdict: answer.verdict,
    error: answer.error,
    groups: answer.result
      ? Object.fromEntries(Object.entries(answer.result.groups).map(([k, rows]) => [k, rows.slice(0, 10).map(r => ({ id: r.id, title: r.title, company: r.company, reasons: r.reasons }))]))
      : null,
  };
}

export function declinedConfirm(stateVersion: number): { stateVersion: number; error: string; applied: false; sent: false } {
  return { stateVersion, error: 'A person cancelled the confirm step. Nothing was applied or sent.', applied: false, sent: false };
}

export function confirmedButNotSent(stateVersion: number, url: string): { stateVersion: number; confirmed: true; applied: false; sent: false; url: string; notice: string } {
  return { stateVersion, confirmed: true, applied: false, sent: false, url, notice: APPLY_SEND_NOTICE };
}
