import { err, errAsync, ok, okAsync, Result, ResultAsync } from 'neverthrow';
import { match } from 'ts-pattern';
import type { Actor, AppError, PiiKind, Source, VisitorError, Warning } from './errors.ts';
import type { Clock, Fetch, Log, PoolStore } from './effects.ts';
import type { DecideFit, DecideGroup, DecideRefreshSwap, Fit, GroupKey, MatchInput } from './decisions.ts';
import { asResultCard, type PublicPool } from './schema.ts';
import type { CardView } from './state.ts';

const MIN_CHARS = 20;
const STALE_DAYS = 7;
type Validated = MatchInput & { readonly _v: 'validated' };
type Clean = Validated & { readonly _p: 'pii-clean' };
type Matched = { fits: ReadonlyArray<Fit>; warnings: Warning[] };
type Grouped = { groups: Record<GroupKey, Fit[]>; warnings: Warning[] };
export type Rendered = { groups: Record<GroupKey, CardView[]>; totals: Record<GroupKey, number>; warnings: Warning[] };

export const validate = (i: MatchInput): Result<Validated, VisitorError> => {
  const d = i.description.trim();
  if (!d) return err({ kind: 'InputEmpty' });
  if (d.length < MIN_CHARS) return err({ kind: 'InputTooShort', minChars: MIN_CHARS, got: d.length });
  return ok({ ...i, description: d } as Validated);
};
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]+/g, PHONE = /\+?\d[\d\s-]{7,}\d/g;
export const piiCheck = (from: Actor) => (i: Validated): Result<Clean, VisitorError> => {
  const find = (re: RegExp, pii: PiiKind) => [...i.description.matchAll(re)].map(m => ({ start: m.index, end: m.index + m[0].length, pii }));
  const spans = [...find(EMAIL, 'email'), ...find(PHONE, 'phone')];
  return spans.length ? err({ kind: 'PiiDetected', from, spans }) : ok(i as Clean);
};
export const matchStep = (fx: { pool: PoolStore; clock: Clock }, fit: DecideFit) => (i: Clean): ResultAsync<Matched, AppError> =>
  fx.pool.read().andThen(pool => {
    const warnings: Warning[] = [];
    const ageDays = Math.floor((fx.clock.now().getTime() - Date.parse(pool.checkedRange.to)) / 864e5);
    if (ageDays > STALE_DAYS) warnings.push({ kind: 'PoolStale', checkedAt: `${pool.checkedRange.from}–${pool.checkedRange.to}`, ageDays });
    return ResultAsync.combine(pool.rows.map(row => fit.decide({ input: i, row })))
      .map(fs => ({ fits: fs.filter((f): f is Fit => f !== null), warnings }));
  }).andThen(m => (m.fits.length ? okAsync(m) : errAsync<Matched, AppError>({ kind: 'ZeroResults', widen: ['region', 'seniority'] })));
export const groupStep = (g: DecideGroup, input: MatchInput) => (m: Matched): ResultAsync<Grouped, AppError> =>
  ResultAsync.combine(m.fits.map(fit => g.decide({ input, fit }).map(k => [k, fit] as const))).map(pairs => {
    const groups: Record<GroupKey, Fit[]> = { fitsNow: [], stepTowardGoal: [], stretch: [] };
    for (const [k, f] of pairs) groups[k].push(f);
    return { groups, warnings: m.warnings };
  });
export const render = (g: Grouped): Result<Rendered, AppError> => {
  const keys = Object.keys(g.groups) as GroupKey[];
  const groups = {} as Record<GroupKey, CardView[]>; const totals = {} as Record<GroupKey, number>;
  for (const k of keys) {
    const cards = Result.combine(g.groups[k].map(f => asResultCard(f.row).map(c => ({ id: c.id, title: c.title, company: c.company, url: c.url, why: f.why, lastChecked: c.status_checked_at }))));
    if (cards.isErr()) return err(cards.error);
    groups[k] = cards.value; totals[k] = cards.value.length;
  }
  return ok({ groups, totals, warnings: g.warnings });
};

export const runMatch = (fx: { pool: PoolStore; clock: Clock; log: Log }, d: { fit: DecideFit; group: DecideGroup }, from: Actor) =>
  (input: MatchInput): ResultAsync<Rendered, AppError> =>
    validate(input).andThen(piiCheck(from)).asyncAndThen(matchStep(fx, d.fit)).andThen(groupStep(d.group, input)).andThen(render)
      .map(r => (fx.log.emit({ evt: 'match', ms: 0, count: r.totals.fitsNow }), r))
      .mapErr(e => (fx.log.emit({ evt: 'match', ms: 0, errorKind: e.kind }), e));

export const refresh = (fx: { fetch: Fetch; pool: PoolStore; clock: Clock }, swap: DecideRefreshSwap, fetchAll: (f: Fetch) => ResultAsync<{ next: PublicPool; perSource: Record<Source, { before: number; after: number; ok: boolean }> }, AppError>) =>
  fetchAll(fx.fetch).andThen(({ next, perSource }) => swap.decide({ perSource }).andThen(d => (d === 'swap' ? fx.pool.swap(next).map(() => 'swapped' as const) : okAsync('kept' as const))));

export const OUT_OF_SCOPE_MSG = 'We cover software & AI engineering roles at ~510 tech companies, SE/EU/UK/US.';
export type Recovery =
  | { ui: 'out-of-scope'; msg: string } | { ui: 'inline-field-error'; msg: string } | { ui: 'redact-preview'; spans: number } | { ui: 'retry-after'; s: number }
  | { ui: 'widen-chips'; chips: ReadonlyArray<string> } | { ui: 'partial-banner-retry' } | { ui: 'recheck-queued'; id: string }
  | { ui: 'switch-to-ui-sdk-path' } | { ui: 'reload-state-and-retry'; version: number } | { ui: 'keep-old-pool'; reason: string }
  | { ui: 'block-release'; reason: string } | { ui: 'fallback-default-backend'; reason: string } | { ui: 'fix-pack'; reason: string };
export const recover = (e: AppError): Recovery => match(e)
  .with({ kind: 'InputEmpty' }, () => ({ ui: 'inline-field-error', msg: 'Describe yourself in a sentence or two.' }) as const)
  .with({ kind: 'InputTooShort' }, x => ({ ui: 'inline-field-error', msg: `At least ${x.minChars} characters.` }) as const)
  .with({ kind: 'InputAbusive' }, () => ({ ui: 'inline-field-error', msg: 'Please rephrase.' }) as const)
  .with({ kind: 'InputTooLong' }, x => ({ ui: 'inline-field-error', msg: `At most ${x.maxChars} characters.` }) as const)
  .with({ kind: 'OutOfScope' }, () => ({ ui: 'out-of-scope', msg: OUT_OF_SCOPE_MSG }) as const)
  .with({ kind: 'PiiDetected' }, x => ({ ui: 'redact-preview', spans: x.spans.length }) as const)
  .with({ kind: 'RateLimited' }, x => ({ ui: 'retry-after', s: x.retryAfterS }) as const)
  .with({ kind: 'ZeroResults' }, x => ({ ui: 'widen-chips', chips: x.widen }) as const)
  .with({ kind: 'StreamDropped' }, () => ({ ui: 'partial-banner-retry' }) as const)
  .with({ kind: 'PostingClosed' }, x => ({ ui: 'recheck-queued', id: x.postingId }) as const)
  .with({ kind: 'WebMcpUnavailable' }, () => ({ ui: 'switch-to-ui-sdk-path' }) as const)
  .with({ kind: 'StaleWrite' }, x => ({ ui: 'reload-state-and-retry', version: x.currentVersion }) as const)
  .with({ kind: 'ToolUiDrift' }, x => ({ ui: 'reload-state-and-retry', version: x.uiVersion }) as const)
  .with({ kind: 'PersonalFieldLeak' }, { kind: 'UnknownField' }, { kind: 'SchemaInvalid' }, { kind: 'PartialRefresh' }, x => ({ ui: 'keep-old-pool', reason: x.kind }) as const)
  .with({ kind: 'SurfaceDrift' }, { kind: 'VersionSkew' }, x => ({ ui: 'block-release', reason: x.kind }) as const)
  .with({ kind: 'MissingKey' }, { kind: 'ConsentDenied' }, { kind: 'ProviderShapeMismatch' }, x => ({ ui: 'fallback-default-backend', reason: x.kind }) as const)
  .with({ kind: 'PackDivergence' }, x => ({ ui: 'block-release', reason: x.kind }) as const)
  .with({ kind: 'UnsourcedClaim' }, { kind: 'UnshippedClaim' }, { kind: 'NameMismatch' }, x => ({ ui: 'fix-pack', reason: x.kind }) as const)
  .exhaustive();
