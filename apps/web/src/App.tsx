import { Component, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Groups } from './cards.tsx';
import { Reveal } from './reveal.tsx';
import {
  poolStats, findPii, INDUSTRIES, INDUSTRY_IDS, match, mostlyNonLatin, readPool, recover, companyCount, redactPii, MIN_CHARS, MAX_CHARS, OUT_OF_SCOPE_MSG,
  type MatchResult, type PublicPool, type RegionPref, type RemotePref, type VisitorError,
} from '../../../packages/core/src/index.ts';
import { Alert } from './components/ui/alert.tsx';
import { Button } from './components/ui/button.tsx';
import { Input, Label, Select, Textarea } from './components/ui/field.tsx';
import type { AgentSearch, ConfirmOutcome, WebMcpHost } from './webmcp.ts';
import type { ApplyPack, CvOutline } from './page-tools.ts';
import { REGIONS, type Place } from './regions.ts';
import { uiSdkFlag } from './ui-sdk-flag.ts';

const INDUSTRY_LABELS = INDUSTRY_IDS.map(id => INDUSTRIES[id].label.toLowerCase()).join(', ');
const REMOVAL_URL = 'https://github.com/p10ns11y/collab-finder/issues/new?template=remove-listing.yml';

const SdkRegion = lazy(() => import('./sdk-path.tsx').then(m => ({ default: m.SdkRegion })));
const SdkResults = lazy(() => import('./sdk-path.tsx').then(m => ({ default: m.SdkResults })));

let softTry = 0;
const loadSoft = () => {
  const i = softTry;
  return (i ? import('./person-confirm.tsx?r=1') : import('./person-confirm.tsx')).then(
    m => m as typeof import('./person-confirm.tsx'),
    (err: unknown) => {
      if (softTry === i && i < 1) softTry += 1;
      return Promise.reject(err);
    },
  );
};

class SoftBoundary extends Component<{ onError?: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onError?.(); }
  render() { return this.state.failed ? null : this.props.children; }
}

type PoolState = { kind: 'loading' } | { kind: 'failed' } | { kind: 'ready'; pool: PublicPool };
type View =
  | { kind: 'idle' }
  | { kind: 'inputError'; msg: string }
  | { kind: 'piiWarning'; kinds: ReadonlyArray<string> }
  | { kind: 'outOfScope'; reason: string }
  | { kind: 'zeroResults'; widen: ReadonlyArray<string> }
  | { kind: 'results'; result: MatchResult; ms: number };

const REMOTES: ReadonlyArray<[RemotePref, string]> = [['any', 'Any'], ['remote', 'Remote only'], ['hybrid', 'Hybrid or remote'], ['onsite', 'On-site is fine']];
const OUT_OF_SCOPE_REASON: Readonly<Record<string, string>> = {
  'junior': 'The pool has mid-level and senior roles only, no junior, intern or graduate roles yet.',
  'outside-pool-roles': 'We do not match nursing, sales or mobile-only profiles yet.',
  'no-engineering-terms': 'We could not find a software or AI engineering skill or role in your description.',
};
const WIDEN_LABEL: Readonly<Record<string, string>> = { region: 'Search anywhere', remote: 'Any work mode', productOnly: 'Include agencies and freelance', goal: 'Add a goal', seniority: 'Any level' };

const toView = (e: VisitorError): View => {
  const r = recover(e);
  if (e.kind === 'PiiDetected') return { kind: 'piiWarning', kinds: [...new Set(e.spans.map(s => s.pii))] };
  if (e.kind === 'OutOfScope') return { kind: 'outOfScope', reason: OUT_OF_SCOPE_REASON[e.reason] ?? '' };
  if (e.kind === 'ZeroResults') return { kind: 'zeroResults', widen: e.widen };
  return { kind: 'inputError', msg: 'msg' in r ? r.msg : 'Please check your input.' };
};

const wantsAll = () => window.location.hash === '#all' || new URLSearchParams(window.location.search).has('all');

export function App() {
  const [pool, setPool] = useState<PoolState>({ kind: 'loading' });
  const [description, setDescription] = useState('');
  const [goal, setGoal] = useState('');
  const [likes, setLikes] = useState('');
  const [regions, setRegions] = useState<ReadonlyArray<Place>>([]);
  const [productOnly, setProductOnly] = useState(false);
  const [remote, setRemote] = useState<RemotePref>('any');
  const [view, setView] = useState<View>({ kind: 'idle' });
  const [showAll, setShowAll] = useState(wantsAll);
  const goalRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const loadPool = useCallback(() => {
    setPool({ kind: 'loading' });
    const getJson = (path: string, bust: string) => fetch(`${path}${bust}`, { credentials: 'same-origin', cache: bust ? 'reload' : 'default' })
      .then(r => (r.ok ? r.json() as Promise<unknown> : Promise.reject(new Error(String(r.status)))));
    const attempt = (bust: string): Promise<PublicPool> => getJson('/pool.json', bust)
      .then(async (index: unknown) => {
        const head = index as { shards?: unknown; version?: unknown; checkedRange?: unknown };
        if (!Array.isArray(head.shards)) return index;
        const parts = await Promise.all(head.shards.filter((f): f is string => typeof f === 'string' && /^pool-\d+\.json$/.test(f)).map(f => getJson(`/${f}`, bust)));
        return { version: head.version, checkedRange: head.checkedRange, rows: parts.flatMap(p => ((p as { rows?: unknown }).rows as unknown[] | undefined) ?? []) };
      })
      .then((raw: unknown) => { const p = readPool(raw); return p.isOk() ? p.value : Promise.reject(new Error(p.error.kind)); });
    const refreshWorker = () => navigator.serviceWorker?.getRegistration().then(reg => reg?.update()).catch(() => undefined);
    attempt('')
      .catch(() => { void refreshWorker(); return attempt(`?r=${Date.now()}`); })
      .then(p => { poolStats(p); setPool({ kind: 'ready', pool: p }); }, () => setPool({ kind: 'failed' }));
  }, []);
  useEffect(loadPool, [loadPool]);

  const livePii = useMemo(() => [...new Set(findPii(`${description}\n${goal}\n${likes}`).map(s => s.pii))], [description, goal, likes]);
  const nonLatin = useMemo(() => mostlyNonLatin(`${description}\n${goal}\n${likes}`), [description, goal, likes]);

  const run = useCallback((over?: AgentSearch) => {
    if (pool.kind !== 'ready') return null;
    const t0 = performance.now();
    const r = match({ description: over?.description ?? description, goal: over?.goal ?? goal, likes, region: over?.regions ?? regions, remote: over?.remote ?? remote, productOnly: over?.productOnly ?? productOnly }, pool.pool);
    const ms = Math.max(1, Math.round(performance.now() - t0));
    setView(r.isOk() ? { kind: 'results', result: r.value, ms } : toView(r.error));
    requestAnimationFrame(() => resultsRef.current?.focus());
    return r;
  }, [pool, description, goal, likes, regions, remote, productOnly]);

  const version = useRef(0);
  const latest = useRef({ run, view, description });
  latest.current = { run, view, description };
  const [outline, setOutline] = useState<CvOutline | null>(null);
  const [pack, setPack] = useState<ApplyPack | null>(null);
  const [confirmAsk, setConfirmAsk] = useState<{ id: number; title: string; body: string; resolve: (outcome: ConfirmOutcome) => void } | null>(null);
  const confirmRef = useRef<{ resolve: (outcome: ConfirmOutcome) => void } | null>(null);
  const confirmId = useRef(0);
  const [soft, setSoft] = useState<typeof import('./person-confirm.tsx') | null>(null);
  const setSoftRef = useRef(setSoft);
  setSoftRef.current = setSoft;
  const showAllRef = useRef(showAll);
  showAllRef.current = showAll;
  const cardsWaiter = useRef<((shown: boolean) => void) | null>(null);
  const settleCards = (shown: boolean) => {
    const wait = cardsWaiter.current;
    cardsWaiter.current = null;
    wait?.(shown);
  };
  const settleConfirm = (outcome: ConfirmOutcome) => {
    const ask = confirmRef.current;
    if (!ask) return;
    confirmRef.current = null;
    setConfirmAsk(null);
    ask.resolve(outcome);
  };
  const showPanel = (apply: () => void) => {
    if (!showAllRef.current) return Promise.resolve(false);
    return new Promise<boolean>(resolve => {
      cardsWaiter.current?.(false);
      cardsWaiter.current = resolve;
      apply();
      void loadSoft().then(m => setSoftRef.current(m), () => settleCards(false));
    });
  };
  useEffect(() => {
    const registration = new AbortController();
    const rowOf = (id: string) => {
      const v = latest.current.view;
      return v.kind === 'results' ? (Object.values(v.result.groups).flat().find(r => r.id === id) ?? null) : null;
    };
    const host: WebMcpHost = {
      version: () => version.current,
      search: (base, change) => {
        if (base !== version.current) return { stateVersion: version.current, result: null, verdict: 'refused', error: `StaleWrite: base ${base}, current ${version.current}` };
        if (change.description !== undefined) { setDescription(change.description); latest.current.description = change.description; }
        if (change.goal !== undefined) setGoal(change.goal);
        if (change.regions) setRegions(change.regions);
        if (change.remote) setRemote(change.remote);
        if (change.productOnly !== undefined) setProductOnly(change.productOnly);
        version.current += 1;
        const r = latest.current.run(change);
        return { stateVersion: version.current, result: r?.isOk() ? r.value : null, verdict: r === null ? 'refused' : r.isErr() ? r.error.kind : 'results', error: r === null ? 'pool not loaded' : null };
      },
      showAllOptions: () => {
        setShowAll(true);
        if (!wantsAll()) window.location.hash = 'all';
      },
      rowOf,
      description: () => latest.current.description,
      confirmApplyOrSend: detail => new Promise(resolve => {
        confirmRef.current?.resolve('cancelled');
        const ask = {
          id: confirmId.current += 1,
          title: 'Person confirm needed',
          body: `A tool asked to apply or send for ${detail.title}. This page will not apply or send. Confirm only if you want the posting link shown so you can open it yourself.`,
          resolve,
        };
        confirmRef.current = ask;
        setConfirmAsk(ask);
        void loadSoft().then(m => setSoftRef.current(m), () => settleConfirm('unavailable'));
      }),
      showCvOutline: next => showPanel(() => { setOutline(next); setPack(null); }),
      showApplyPack: next => showPanel(() => { setPack(next); }),
    };
    void import('./webmcp.ts').then(m => m.registerWebMcp(host, registration.signal)).catch(() => undefined);
    return () => {
      registration.abort();
      settleConfirm('cancelled');
    };
  }, []);

  useEffect(() => { const on = () => setShowAll(wantsAll()); window.addEventListener('hashchange', on); return () => window.removeEventListener('hashchange', on); }, []);
  const formChanged = () => { version.current += 1; setView({ kind: 'idle' }); };
  useEffect(() => { if (!showAll || view.kind !== 'results') { setOutline(null); setPack(null); settleCards(false); } }, [view, showAll]);
  const sdkPath = uiSdkFlag();
  const onSubmit = (e: FormEvent) => { e.preventDefault(); run(); };
  const removePii = () => { setDescription(d => redactPii(d)); setGoal(g => redactPii(g)); setLikes(l => redactPii(l)); formChanged(); };
  const widen = (w: string) => {
    version.current += 1;
    if (w === 'region') { setRegions([]); run({ regions: [] }); }
    else if (w === 'productOnly') { setProductOnly(false); run({ productOnly: false }); }
    else if (w === 'remote') { setRemote('any'); run({ remote: 'any' }); }
    else goalRef.current?.focus();
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <h1 className="text-sm font-semibold tracking-tight text-text-muted">kanithanj.ai</h1>
        <p className="mt-1 text-xs text-text-muted" data-testid="freshness">
          {pool.kind === 'ready'
            ? `${pool.pool.rows.length.toLocaleString('en')} engineering roles at ${companyCount(pool.pool).toLocaleString('en')} tech companies, checked ${pool.pool.checkedRange.to.slice(0, 10)}. `
            : `${OUT_OF_SCOPE_MSG} `}
          Matching runs in your browser; nothing you type leaves this page.
        </p>
      </header>

      {pool.kind === 'loading' && <p role="status" className="mb-6 text-text-muted">Loading roles…</p>}
      {pool.kind === 'failed' && (
        <Alert tone="broken" className="mb-6" role="alert">
          Could not load the roles. Check your connection. <Button variant="outline" size="sm" className="ml-2" onClick={loadPool}>Try again</Button>
        </Alert>
      )}

      {!showAll && pool.kind === 'ready' && <Reveal pool={pool.pool} />}

      {showAll && <>
      <h2 className="mb-4 text-2xl font-semibold">Describe yourself</h2>
      <form toolname="find_roles_form" tooldescription="Fill this form with a self-description and show matching roles in this browser. Nothing leaves the page. Does not apply or send." onSubmit={onSubmit} className="grid gap-4 rounded-lg border border-border bg-surface p-4 sm:p-6" noValidate>
        <div className="grid gap-2">
          <Label htmlFor="description">About you</Label>
          <Textarea id="description" name="description" toolparamdescription="A short self-description of the work you do, without your name, email or phone" value={description} maxLength={MAX_CHARS + 200}
            onChange={e => { setDescription(e.target.value); formChanged(); }}
            placeholder="e.g. Senior backend engineer, 8 years of Go and Postgres, distributed systems" aria-describedby="description-help" autoComplete="off" spellCheck />
          <p id="description-help" className="text-xs text-text-muted">At least {MIN_CHARS} characters. Skip your name, email and phone: they are not needed.</p>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="goal">Where do you want to grow? <span className="text-text-muted">(optional)</span></Label>
          <Input id="goal" ref={goalRef} name="goal" toolparamdescription="Optional area you want to grow into" value={goal} onChange={e => { setGoal(e.target.value); formChanged(); }} placeholder="e.g. AI infrastructure" autoComplete="off" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="likes">Companies or interests you like <span className="text-text-muted">(optional)</span></Label>
          <Input id="likes" name="likes" toolparamdescription="Optional companies or interests, separated by commas. Stays in this tab." value={likes} maxLength={MAX_CHARS} onChange={e => { setLikes(e.target.value); formChanged(); }}
            placeholder="e.g. Spotify, fintech, robotics" aria-describedby="likes-help" autoComplete="off" />
          <p id="likes-help" className="text-xs text-text-muted">Separate with commas. Matching companies, titles and industries move up; nothing is added or removed. Industries we can tell from a company's own postings: {INDUSTRY_LABELS}. Stays in this browser tab and is never sent or saved.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            {sdkPath ? (
              <Suspense fallback={<p role="status">Loading regions…</p>}>
                <SdkRegion value={regions} onValueChange={next => { setRegions(next); formChanged(); }} />
              </Suspense>
            ) : (
              <fieldset className="grid gap-2" aria-describedby="region-help" toolparamdescription="Optional regions to keep. None picked means anywhere.">
                <legend className="text-sm font-medium">Regions</legend>
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {REGIONS.map(([v, l]) => (
                    <label key={v} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="region" value={v} checked={regions.includes(v)} className="size-4 accent-accent"
                        onChange={() => { setRegions(regions.includes(v) ? regions.filter(x => x !== v) : [...regions, v]); formChanged(); }} />
                      {l}
                    </label>
                  ))}
                </div>
                <p id="region-help" className="text-xs text-text-muted">Pick any. None picked means anywhere.</p>
              </fieldset>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="remote">Work mode</Label>
            <Select id="remote" name="remote" toolparamdescription="Preferred work mode" value={remote} onChange={e => { setRemote(e.target.value as RemotePref); formChanged(); }}>
              {REMOTES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
          </div>
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" id="product-only" name="productOnly" toolparamdescription="If set, hide agency, consultancy or freelance-looking roles" checked={productOnly} className="mt-0.5 size-4 accent-accent" aria-describedby="product-only-help"
            onChange={() => { setProductOnly(!productOnly); formChanged(); }} />
          <span>
            Product companies only
            <span id="product-only-help" className="block text-xs text-text-muted">Hides roles that look like agency, consultancy or freelance contracts, judged from the title and company name. Off by default.</span>
          </span>
        </label>
        {nonLatin && <p className="text-sm text-text-muted" data-testid="language-hint">Works best in English or Swedish.</p>}
        {livePii.length > 0 && (
          <Alert tone="warn" role="alert" data-testid="pii-warning">
            This looks like personal details ({livePii.join(', ')}). It stays on your device, but matching does not need it.
            <Button type="button" variant="outline" size="sm" className="ml-2" onClick={removePii}>Remove them</Button>
          </Alert>
        )}
        <div><Button type="submit" disabled={pool.kind !== 'ready'}>Find roles</Button></div>
      </form>

      <div ref={resultsRef} tabIndex={-1} className="mt-8 outline-none" aria-live="polite">
        <ViewPanel view={view} onWiden={widen} onRemovePii={removePii} sdkPath={sdkPath} />
        {(outline || pack) && soft && <SoftBoundary onError={() => settleCards(false)}><soft.CardsPane outline={outline} pack={pack} onShown={() => settleCards(true)} /></SoftBoundary>}
      </div>
      </>}

      {confirmAsk && soft && (
        <SoftBoundary key={confirmAsk.id} onError={() => settleConfirm('unavailable')}>
          <soft.ConfirmPane
            title={confirmAsk.title}
            body={confirmAsk.body}
            onCancel={() => settleConfirm('cancelled')}
            onConfirm={() => settleConfirm('confirmed')}
          />
        </SoftBoundary>
      )}

      <footer className="mt-12 border-t border-border pt-4 text-xs text-text-muted">
        <p>Public job facts and links only. Postings belong to the employers; always check the posting before applying.</p>
        <p className="mt-2">Sources: employers' public job boards on Greenhouse, Ashby, Lever and Workable, Platsbanken (JobTech, CC0) and Teamtailor career pages. No posting text is copied.</p>
        <p className="mt-2">
          <a className="underline" href={REMOVAL_URL} rel="noopener noreferrer" target="_blank">Ask to remove a listing</a>
          {' · '}<a className="underline" href="/privacy">Privacy and terms</a>
        </p>
      </footer>
    </div>
  );
}

function ViewPanel({ view, onWiden, onRemovePii, sdkPath }: { view: View; onWiden: (w: string) => void; onRemovePii: () => void; sdkPath: boolean }) {
  switch (view.kind) {
    case 'idle': return null;
    case 'inputError': return <Alert tone="trap" data-testid="input-error">{view.msg}</Alert>;
    case 'piiWarning': return (
      <Alert tone="warn" data-testid="pii-blocked">
        We did not match yet: your text contains {view.kinds.join(', ')}. Nothing was sent anywhere.
        <Button variant="outline" size="sm" className="ml-2" onClick={onRemovePii}>Remove them</Button>
      </Alert>
    );
    case 'outOfScope': return (
      <Alert tone="trap" data-testid="out-of-scope">
        <strong className="font-semibold">Outside what we cover.</strong> {OUT_OF_SCOPE_MSG} {view.reason}
      </Alert>
    );
    case 'zeroResults': return (
      <Alert tone="trap" data-testid="zero-results">
        No roles match all of your filters.
        <span className="mt-2 flex flex-wrap gap-2">
          {view.widen.map(w => <Button key={w} variant="outline" size="sm" onClick={() => onWiden(w)}>{WIDEN_LABEL[w] ?? w}</Button>)}
        </span>
      </Alert>
    );
    case 'results': return sdkPath
      ? <Suspense fallback={<p role="status">Loading matches…</p>}><SdkResults result={view.result} ms={view.ms} /></Suspense>
      : <Results result={view.result} ms={view.ms} />;
  }
}

function Results({ result, ms }: { result: MatchResult; ms: number }) {
  const stale = result.warnings.find(w => w.kind === 'PoolStale');
  const u = result.understood;
  const understood = [...u.roles, ...u.skills].join(', ');
  return (
    <section aria-labelledby="results-title" data-testid="results">
      <h2 id="results-title" className="text-2xl font-semibold">Your matches</h2>
      {result.likesMiss && <p className="mt-2 text-sm text-text-muted" data-testid="likes-miss">None of those words matched.</p>}
      <p className="mt-1 text-sm text-text-muted">
        Matched in {ms} ms in your browser. Read as: {understood || 'general software engineering'}
        {u.seniority ? `, ${u.seniority} level` : ''}{u.goal.length ? `; goal: ${u.goal.join(', ')}` : ''}.
      </p>
      {stale && stale.kind === 'PoolStale' && (
        <Alert tone="warn" className="mt-4" data-testid="stale-banner">
          Statuses were last checked {stale.checkedAt} ({stale.ageDays} days ago). Some roles may have closed since; check the posting.
        </Alert>
      )}
      <div className="mt-6"><Groups result={result} keys={['fitsNow', 'stepTowardGoal', 'stretch']} /></div>
    </section>
  );
}
