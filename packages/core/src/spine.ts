import type { Source } from './errors.ts';
import { normalizedTitle } from './match.ts';
import type { PublicPool, PublicRow } from './schema.ts';
import { tokensOf } from './relevance.ts';

const URL_IDS: ReadonlyArray<[Source, RegExp]> = [
  ['greenhouse', /^https?:\/\/(?:job-)?boards(?:\.eu)?\.greenhouse\.io\/[^/?#]+\/jobs\/(\d+)/i],
  ['greenhouse', /^https?:\/\/[^?#]+[?&]gh_jid=(\d+)/i],
  ['lever', /^https?:\/\/jobs(?:\.eu)?\.lever\.co\/[^/?#]+\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i],
  ['ashby', /^https?:\/\/jobs\.ashbyhq\.com\/[^/?#]+\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i],
  ['platsbanken', /^https?:\/\/(?:www\.)?arbetsformedlingen\.se\/platsbanken\/annonser\/(\d+)/i],
];
export const postingIdFromUrl = (url: string): string | null => {
  for (const [source, re] of URL_IDS) { const m = re.exec(url.trim()); if (m?.[1]) return `${source}:${m[1].toLowerCase()}`; }
  return null;
};

const words = (s: string): string[] => s.toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '').split(/[^a-z0-9]+/).filter(Boolean);
export const sameCompany = (a: string, b: string): boolean => {
  const [x, y] = [words(a), words(b)];
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.length > 0 && short.every((w, i) => long[i] === w);
};

export type TrackerRecord = { url?: string; company: string; title: string };
export type Link =
  | { postingId: string; how: 'url-id' | 'company-title'; confidence: number; inPool: boolean }
  | { postingId: null; reason: 'no-id-in-url-and-no-title-match' | 'ambiguous-title' };

export function linkRecord(r: TrackerRecord, pool: PublicPool): Link {
  const fromUrl = r.url ? postingIdFromUrl(r.url) : null;
  const inPool = (id: string) => pool.rows.some(x => x.id === id);
  if (fromUrl) return { postingId: fromUrl, how: 'url-id', confidence: inPool(fromUrl) ? 1 : 0.9, inPool: inPool(fromUrl) };
  const title = normalizedTitle(r.title);
  const hits = pool.rows.filter(x => sameCompany(x.company, r.company) && normalizedTitle(x.title) === title);
  if (hits.length === 1) return { postingId: hits[0]!.id, how: 'company-title', confidence: 0.8, inPool: true };
  return { postingId: null, reason: hits.length ? 'ambiguous-title' : 'no-id-in-url-and-no-title-match' };
}

export const linkRate = (records: ReadonlyArray<TrackerRecord>, pool: PublicPool): { linked: number; total: number; duplicates: number } => {
  const ids = records.map(r => linkRecord(r, pool).postingId).filter((x): x is string => x !== null);
  return { linked: ids.length, total: records.length, duplicates: ids.length - new Set(ids).size };
};

export const EMAIL_LINK_THRESHOLD = 0.8;
export type EmailSignal = { company: string; subject: string; receivedAt: string; outcome: 'rejected' | 'interview' | 'other' };
export type Applied = { postingId: string; company: string; title: string; submittedAt: string };
export type EmailLink = { postingId: string; confidence: number; auto: boolean } | { postingId: null; confidence: number; auto: false };

const DAY = 864e5;
export function linkEmail(e: EmailSignal, applied: ReadonlyArray<Applied>): EmailLink {
  const subject = new Set(tokensOf(e.subject));
  const scored = applied.filter(a => sameCompany(a.company, e.company)).map(a => {
    const t = new Set(tokensOf(a.title));
    const overlap = t.size ? [...t].filter(x => subject.has(x)).length / t.size : 0;
    const days = (Date.parse(e.receivedAt) - Date.parse(a.submittedAt)) / DAY;
    const timely = Number.isFinite(days) && days >= 0 && days <= 90;
    return { postingId: a.postingId, confidence: Math.round((0.5 + 0.4 * overlap + (timely ? 0.1 : 0)) * 100) / 100 };
  }).sort((a, b) => b.confidence - a.confidence || (a.postingId < b.postingId ? -1 : 1));
  const [best, next] = scored;
  if (!best) return { postingId: null, confidence: 0, auto: false };
  const clear = !next || best.confidence - next.confidence >= 0.1;
  return { postingId: best.postingId, confidence: best.confidence, auto: clear && best.confidence >= EMAIL_LINK_THRESHOLD };
}

export type StatusSource = { kind: 'live-ats'; status: PublicRow['status']; at: string } | { kind: 'pool'; status: PublicRow['status']; at: string } | { kind: 'email'; outcome: EmailSignal['outcome']; at: string };
export type Decided = { forEveryone: PublicRow['status']; forOwner: 'rejected' | 'interview' | null; from: 'live-ats' | 'pool' };
export function decideSource(sources: ReadonlyArray<StatusSource>): Decided {
  const live = sources.find((s): s is Extract<StatusSource, { kind: 'live-ats' }> => s.kind === 'live-ats');
  const cached = sources.find((s): s is Extract<StatusSource, { kind: 'pool' }> => s.kind === 'pool');
  const mail = sources.filter((s): s is Extract<StatusSource, { kind: 'email' }> => s.kind === 'email' && s.outcome !== 'other').sort((a, b) => (a.at < b.at ? 1 : -1))[0];
  const base = live ?? cached;
  return { forEveryone: base?.status ?? 'unknown', forOwner: mail ? (mail.outcome as 'rejected' | 'interview') : null, from: live ? 'live-ats' : 'pool' };
}
