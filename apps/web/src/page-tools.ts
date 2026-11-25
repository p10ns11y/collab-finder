import { isLocationPart, type MatchResult, type MatchRow, type RegionPref, type RemotePref } from '../../../packages/core/src/index.ts';

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

const GENERIC = new Set(['senior', 'staff', 'junior', 'lead', 'principal', 'mid', 'mid-level', 'engineer', 'engineers', 'engineering', 'developer', 'software', 'years', 'year', 'experience', 'i', 'am', 'a', 'an', 'the', 'my', 'of', 'on', 'working', 'building', 'who', 'writes', 'every', 'day', 'based', 'remote', 'hybrid']);
const PHRASE_SPLIT = /[,;.\n()]|\b(?:and|with|in|at|using|plus)\b/i;
const words = (s: string) => s.toLowerCase().match(/[a-z0-9][a-z0-9+#.-]*/g) ?? [];
export const FACT = /^(?:Region|Open when|Level fits|Posting level|One level above|Seniority not stated|Location not confirmed|Remote policy|Work mode|Status unknown|Also listed)/;

export function typedPhrases(description: string): ReadonlyArray<string> {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of description.split(PHRASE_SPLIT)) {
    let run: string[] = [];
    const flush = () => {
      const phrase = run.join(' ').replace(/[^\p{L}\p{N}+#.\- ]/gu, '').trim();
      run = [];
      const key = phrase.toLowerCase();
      if (!phrase || seen.has(key) || isLocationPart(phrase)) return;
      seen.add(key);
      out.push(phrase.charAt(0).toUpperCase() + phrase.slice(1));
    };
    for (const w of part.trim().split(/\s+/)) {
      if (!w || GENERIC.has(w.toLowerCase()) || /^\d+\+?$/.test(w)) flush(); else run.push(w);
    }
    flush();
  }
  return out;
}

export function buildCvOutline(description: string, row: MatchRow): CvOutline {
  const posting = new Set(words([row.title, row.summary ?? '', ...row.reasons.filter(r => !FACT.test(r))].join(' ')));
  const phrases = typedPhrases(description);
  const hits = phrases.filter(p => words(p).some(w => posting.has(w)));
  const emphasize = [...hits, ...phrases.filter(p => !hits.includes(p))].slice(0, 5);
  return {
    roleId: row.id,
    title: row.title,
    company: row.company,
    emphasize,
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
    reasons: row.reasons.filter(r => !FACT.test(r)).slice(0, 5),
    checklist: [
      'Read the live posting end to end.',
      'Check that the role is still open.',
      'Lead with the points that fit, in your own words.',
      'Apply on the employer\'s page.',
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

export function confirmUnavailable(stateVersion: number): { stateVersion: number; error: string; applied: false; sent: false } {
  return { stateVersion, error: 'the confirm step could not be shown', applied: false, sent: false };
}

export function panelUnavailable(stateVersion: number, panel: string): { stateVersion: number; error: string } {
  return { stateVersion, error: `the ${panel} could not be shown` };
}

export function confirmedButNotSent(stateVersion: number, url: string): { stateVersion: number; confirmed: true; applied: false; sent: false; url: string; notice: string } {
  return { stateVersion, confirmed: true, applied: false, sent: false, url, notice: APPLY_SEND_NOTICE };
}

export function confirmPending(stateVersion: number): { stateVersion: number; error: string } {
  return { stateVersion, error: 'confirm pending: a person has not answered the open confirm step yet' };
}
