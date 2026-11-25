import { Component, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Reveal } from './reveal.tsx';
import {
  poolStats, findPii, INDUSTRIES, INDUSTRY_IDS, match, mostlyNonLatin, readPool, recover, companyCount, redactPii, MIN_CHARS, MAX_CHARS, OUT_OF_SCOPE_MSG,
  type MatchResult, type PublicPool, type RemotePref, type VisitorError,
} from '../../../packages/core/src/index.ts';
import { Alert } from './components/ui/alert.tsx';
import { Button } from './components/ui/button.tsx';
import { Input, Label, Select, Textarea } from './components/ui/field.tsx';
import type { AgentSearch, ConfirmOutcome, WebMcpHost } from './webmcp.ts';
import type { FlowEvent, Snap, View } from './flow.ts';
import { REGIONS, type Place } from './regions.ts';
import { uiSdkFlag } from './ui-sdk-flag.ts';

const INDUSTRY_LABELS = INDUSTRY_IDS.map(id => INDUSTRIES[id].label.toLowerCase()).join(', ');
const REMOVAL_URL = 'https://github.com/p10ns11y/collab-finder/issues/new?template=remove-listing.yml';

const SdkRegion = lazy(() => import('./sdk-path.tsx').then(m => ({ default: m.SdkRegion })));

const retrying = <T,>(first: () => Promise<T>, again: () => Promise<unknown>) => {
  let tries = 0;
  return () => {
    const i = tries;
    return (i ? again() as Promise<T> : first()).catch((err: unknown) => {
      if (tries === i && i < 1) tries += 1;
      return Promise.reject(err);
    });
  };
};
const loadSoft = retrying(() => import('./person-confirm.tsx'), () => import('./person-confirm.tsx?r=1'));
const loadFlow = retrying(() => import('./flow.ts'), () => import('./flow.ts?r=1'));
const loadStage = retrying(() => import('./stage.tsx'), () => import('./stage.tsx?r=1'));

class SoftBoundary extends Component<{ onError?: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onError?.(); }
  render() { return this.state.failed ? null : this.props.children; }
}

const SEARCHED: ReadonlySet<string> = new Set(['matched', 'tailored', 'pack', 'confirming', 'confirmed']);
const REMOTES: ReadonlyArray<[RemotePref, string]> = [['any', 'Any'], ['remote', 'Remote only'], ['hybrid', 'Hybrid or remote'], ['onsite', 'On-site is fine']];
const OUT_OF_SCOPE_REASON: Readonly<Record<string, string>> = {
  'junior': 'The pool has mid-level and senior roles only, no junior, intern or graduate roles yet.',
  'outside-pool-roles': 'We do not match nursing, sales or mobile-only profiles yet.',
  'no-engineering-terms': 'We could not find a software or AI engineering skill or role in your description.',
};

const toView = (e: VisitorError): View => {
  const r = recover(e);
  if (e.kind === 'PiiDetected') return { kind: 'piiWarning', kinds: [...new Set(e.spans.map(s => s.pii))] };
  if (e.kind === 'OutOfScope') return { kind: 'outOfScope', reason: OUT_OF_SCOPE_REASON[e.reason] ?? '' };
  if (e.kind === 'ZeroResults') return { kind: 'zeroResults', widen: e.widen };
  return { kind: 'inputError', msg: 'msg' in r ? r.msg : 'Please check your input.' };
};

const wantsAll = () => window.location.hash === '#all' || new URLSearchParams(window.location.search).has('all');

export function App() {
  const [pool, setPool] = useState<PublicPool | null>(null);
  const [snap, setSnap] = useState<Snap | null>(null);
  const [stage, setStage] = useState<typeof import('./stage.tsx') | null>(null);
  const [down, setDown] = useState(false);
  const snapRef = useRef<Snap | null>(null);
  const flowMod = useRef<typeof import('./flow.ts') | null>(null);
  const send = (e: FlowEvent) => {
    const m = flowMod.current;
    const n = m && m.next(snapRef.current ?? m.START, e);
    if (!n) return;
    snapRef.current = n;
    setSnap(n);
  };
  const step = snap?.step ?? (down ? 'failed' : 'loading');
  const view: View = snap?.view ?? { kind: 'idle' };
  const [description, setDescription] = useState('');
  const [goal, setGoal] = useState('');
  const [likes, setLikes] = useState('');
  const [regions, setRegions] = useState<ReadonlyArray<Place>>([]);
  const [productOnly, setProductOnly] = useState(false);
  const [remote, setRemote] = useState<RemotePref>('any');
  const [showAll, setShowAll] = useState(wantsAll);
  const goalRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const loadPool = useCallback(() => {
    setDown(false);
    send({ type: 'RETRY' });
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
    const flow = Promise.all([loadFlow(), loadStage()]).then(([m, st]) => { flowMod.current = m; setStage(st); });
    const data = attempt('').catch(() => { void refreshWorker(); return attempt(`?r=${Date.now()}`); });
    Promise.all([flow, data]).then(([, p]) => { poolStats(p); setPool(p); send({ type: 'POOL_LOADED' }); }, () => flowMod.current ? send({ type: 'POOL_FAILED' }) : setDown(true));
  }, []);
  useEffect(loadPool, [loadPool]);

  const livePii = useMemo(() => [...new Set(findPii(`${description}\n${goal}\n${likes}`).map(s => s.pii))], [description, goal, likes]);
  const nonLatin = useMemo(() => mostlyNonLatin(`${description}\n${goal}\n${likes}`), [description, goal, likes]);

  const run = useCallback((over?: AgentSearch) => {
    if (!pool) return null;
    const t0 = performance.now();
    const r = match({ description: over?.description ?? description, goal: over?.goal ?? goal, likes, region: over?.regions ?? regions, remote: over?.remote ?? remote, productOnly: over?.productOnly ?? productOnly }, pool);
    const ms = Math.max(1, Math.round(performance.now() - t0));
    send(r.isOk() ? { type: 'MATCHED', view: { kind: 'results', result: r.value, ms } } : { type: 'MATCH_FAILED', view: toView(r.error) });
    requestAnimationFrame(() => resultsRef.current?.focus());
    return r;
  }, [pool, description, goal, likes, regions, remote, productOnly]);

  const latest = useRef({ run, description });
  latest.current = { run, description };
  const confirmRef = useRef<((outcome: ConfirmOutcome) => void) | null>(null);
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
  const showPanel = (e: FlowEvent) => new Promise<boolean>(resolve => {
    cardsWaiter.current?.(false);
    cardsWaiter.current = resolve;
    send(e);
    if (!showAllRef.current) settleCards(false);
    else void loadSoft().then(m => setSoftRef.current(m), () => settleCards(false));
  });
  const settleConfirm = (outcome: ConfirmOutcome) => {
    const resolve = confirmRef.current;
    if (!resolve) return;
    confirmRef.current = null;
    if (outcome === 'confirmed') void showPanel({ type: 'CONFIRM' }).then(ok => resolve(ok ? outcome : 'unshown'));
    else { send({ type: outcome === 'cancelled' ? 'CANCEL' : 'CONFIRM_FAILED' }); resolve(outcome); }
  };
  useEffect(() => {
    const registration = new AbortController();
    const host: WebMcpHost = {
      snap: () => snapRef.current,
      search: change => {
        if (change.description !== undefined) { setDescription(change.description); latest.current.description = change.description; }
        if (change.goal !== undefined) setGoal(change.goal);
        if (change.regions) setRegions(change.regions);
        if (change.remote) setRemote(change.remote);
        if (change.productOnly !== undefined) setProductOnly(change.productOnly);
        const r = latest.current.run(change);
        return { stateVersion: snapRef.current?.version ?? 0, result: r?.isOk() ? r.value : null, verdict: r === null ? 'refused' : r.isErr() ? r.error.kind : 'results', error: r === null ? 'pool not loaded' : null };
      },
      showAllOptions: () => {
        setShowAll(true);
        if (!wantsAll()) window.location.hash = 'all';
      },
      description: () => latest.current.description,
      confirmApplyOrSend: ask => new Promise(resolve => {
        const older = confirmRef.current;
        send({ type: 'REQUEST_CONFIRM', ask: { ...ask, id: confirmId.current += 1 } });
        confirmRef.current = resolve;
        older?.('cancelled');
        void loadSoft().then(m => setSoftRef.current(m), () => settleConfirm('unavailable'));
      }),
      showCvOutline: outline => showAllRef.current ? showPanel({ type: 'TAILOR', outline }) : Promise.resolve(false),
      showApplyPack: pack => showAllRef.current ? showPanel({ type: 'PACK', pack }) : Promise.resolve(false),
    };
    void import('./webmcp.ts').then(m => m.registerWebMcp(host, registration.signal)).catch(() => undefined);
    return () => {
      registration.abort();
      settleCards(false);
      confirmRef.current?.('cancelled');
      confirmRef.current = null;
    };
  }, []);

  useEffect(() => { const on = () => setShowAll(wantsAll()); window.addEventListener('hashchange', on); return () => window.removeEventListener('hashchange', on); }, []);
  const formChanged = () => { send({ type: 'EDIT' }); };
  useEffect(() => { if (!showAll) settleCards(false); }, [showAll]);
  const sdkPath = uiSdkFlag();
  const onSubmit = (e: FormEvent) => { e.preventDefault(); run(); };
  const removePii = () => { setDescription(d => redactPii(d)); setGoal(g => redactPii(g)); setLikes(l => redactPii(l)); formChanged(); };
  const widen = (w: string) => {
    if (w === 'region') { setRegions([]); run({ regions: [] }); }
    else if (w === 'productOnly') { setProductOnly(false); run({ productOnly: false }); }
    else if (w === 'remote') { setRemote('any'); run({ remote: 'any' }); }
    else goalRef.current?.focus();
  };

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-12 lg:py-12 xl:px-16" data-step={step}>
      <header className="mb-6 lg:mb-12">
        <h1 className="text-sm font-semibold tracking-tight text-text-muted">kanithanj.ai</h1>
        <p className="mt-1 text-xs text-text-muted" data-testid="freshness">
          {pool
            ? `${pool.rows.length.toLocaleString('en')} engineering roles at ${companyCount(pool).toLocaleString('en')} tech companies, checked ${pool.checkedRange.to.slice(0, 10)}. `
            : `${OUT_OF_SCOPE_MSG} `}
          Matching runs in your browser; nothing you type leaves this page.
        </p>
      </header>

      {step === 'loading' && <p role="status" className="mb-6 text-text-muted">Loading roles…</p>}
      {step === 'failed' && (
        <Alert tone="broken" className="mb-6" role="alert">
          Could not load the roles. Check your connection. <Button variant="outline" size="sm" className="ml-2" onClick={loadPool}>Try again</Button>
        </Alert>
      )}

      {!showAll && pool && <Reveal pool={pool} />}

      {showAll && <div className="grid items-start gap-10 lg:grid-cols-[20rem_minmax(0,1fr)] lg:gap-16">
      <div>
      <h2 className="mb-6 text-3xl font-semibold tracking-tight">Describe yourself</h2>
      <form toolname="find_roles_form" tooldescription="Describe your experience and find matching roles." onSubmit={onSubmit} className="grid gap-6" noValidate>
        <div className="grid gap-2">
          <Label htmlFor="description">About you</Label>
          <Textarea id="description" name="description" toolparamdescription="A short self-description of the work you do, without your name, email or phone" value={description} maxLength={MAX_CHARS + 200}
            onChange={e => { setDescription(e.target.value); formChanged(); }}
            placeholder="e.g. Senior backend engineer, 8 years of Go and Postgres, distributed systems" aria-describedby="description-help" autoComplete="off" spellCheck />
          <p id="description-help" className="text-xs text-text-muted">At least {MIN_CHARS} characters. Skip your name, email and phone: they are not needed.</p>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="goal">Where do you want to grow? <span className="text-text-muted">(optional)</span></Label>
          <Input id="goal" ref={goalRef} name="goal" toolparamdescription="Optional area you want to grow into" value={goal} onChange={e => { setGoal(e.target.value); formChanged(); }} placeholder="e.g. developer tools" autoComplete="off" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="likes">Companies or interests you like <span className="text-text-muted">(optional)</span></Label>
          <Input id="likes" name="likes" toolparamdescription="Optional companies or interests, separated by commas. Stays in this tab." value={likes} maxLength={MAX_CHARS} onChange={e => { setLikes(e.target.value); formChanged(); }}
            placeholder="e.g. Spotify, fintech, robotics" aria-describedby="likes-help" autoComplete="off" />
          <p id="likes-help" className="text-xs text-text-muted">Separate with commas. Matching companies, titles and industries move up. Industries: {INDUSTRY_LABELS}.</p>
        </div>
        <div className="grid gap-6 border-t border-border pt-6">
          <div className="grid gap-2">
            {sdkPath ? (
              <Suspense fallback={<p role="status">Loading regions…</p>}>
                <SdkRegion value={regions} onValueChange={next => { setRegions(next); formChanged(); }} />
              </Suspense>
            ) : (
              <fieldset className="grid gap-2" aria-describedby="region-help" toolparamdescription="Optional regions to keep. None picked means anywhere.">
                <legend className="text-sm font-semibold">Regions</legend>
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {REGIONS.map(([v, l]) => (
                    <label key={v} className="flex min-h-11 items-center gap-2 text-sm lg:min-h-0">
                      <input type="checkbox" name="region" value={v} checked={regions.includes(v)} className="size-4 accent-text focus-visible:outline-accent"
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
        <label className="flex min-h-11 items-center gap-2 text-sm lg:min-h-0 lg:items-start">
          <input type="checkbox" id="product-only" name="productOnly" toolparamdescription="If set, hide agency, consultancy or freelance-looking roles" checked={productOnly} className="mt-0.5 size-4 accent-text focus-visible:outline-accent" aria-describedby="product-only-help"
            onChange={() => { setProductOnly(!productOnly); formChanged(); }} />
          <span>
            Product companies only
            <span id="product-only-help" className="block text-xs text-text-muted">Hides roles that look like agency, consultancy or freelance contracts, judged from the title and company name.</span>
          </span>
        </label>
        {nonLatin && <p className="text-sm text-text-muted" data-testid="language-hint">Works best in English or Swedish.</p>}
        {livePii.length > 0 && (
          <Alert tone="warn" role="alert" data-testid="pii-warning">
            This looks like personal details ({livePii.join(', ')}). It stays on your device, but matching does not need it.
            <Button type="button" variant="outline" size="sm" className="ml-2" onClick={removePii}>Remove them</Button>
          </Alert>
        )}
        <div><Button type="submit" className="w-full transition-none" variant={SEARCHED.has(step) ? 'outline' : 'default'} data-testid="find-roles" disabled={!pool}>Find roles</Button></div>
      </form>
      </div>
      <div ref={resultsRef} data-testid="flow-stage" tabIndex={-1} className="min-w-0 outline-none" aria-live="polite">
        {stage && <stage.StepRail step={step} />}
        {snap && (snap.outline || snap.pack) && soft && <SoftBoundary onError={() => settleCards(false)}><soft.CardsPane outline={snap.outline} pack={snap.pack} step={snap.step} onShown={() => settleCards(true)} /></SoftBoundary>}
        {stage && <stage.ViewPanel view={view} onWiden={widen} onRemovePii={removePii} sdkPath={sdkPath} />}
      </div>
      </div>}

      {snap?.ask && soft && (
        <SoftBoundary key={snap.ask.id} onError={() => settleConfirm('unavailable')}>
          <soft.ConfirmPane
            title={snap.ask.title}
            body={snap.ask.body}
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

