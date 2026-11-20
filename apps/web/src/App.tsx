import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  poolStats, findPii, isAgencyRow, match, parsePool, recover, redactPii, MIN_CHARS, MAX_CHARS, OUT_OF_SCOPE_MSG,
  type GroupKey, type MatchResult, type MatchRow, type PublicPool, type RegionPref, type RemotePref, type VisitorError,
} from '../../../packages/core/src/index.ts';
import { Alert } from './components/ui/alert.tsx';
import { Badge } from './components/ui/badge.tsx';
import { Button } from './components/ui/button.tsx';
import { Card } from './components/ui/card.tsx';
import { Input, Label, Select, Textarea } from './components/ui/field.tsx';

type PoolState = { kind: 'loading' } | { kind: 'failed' } | { kind: 'ready'; pool: PublicPool };
type View =
  | { kind: 'idle' }
  | { kind: 'inputError'; msg: string }
  | { kind: 'piiWarning'; kinds: ReadonlyArray<string> }
  | { kind: 'outOfScope'; reason: string }
  | { kind: 'zeroResults'; widen: ReadonlyArray<string> }
  | { kind: 'results'; result: MatchResult; ms: number };

const GROUPS: ReadonlyArray<{ key: GroupKey; title: string; blurb: string }> = [
  { key: 'fitsNow', title: 'Fits now', blurb: 'Matches what you do today, at your level, open when last checked, location confirmed.' },
  { key: 'stepTowardGoal', title: 'Step toward your goal', blurb: 'Uses what you do and adds what you want to grow into.' },
  { key: 'stretch', title: 'Stretch', blurb: 'Worth a look: a level up, or a detail we could not confirm.' },
];
type Place = Exclude<RegionPref, 'any'>;
const REGIONS: ReadonlyArray<[Place, string]> = [['SE', 'Sweden'], ['EU', 'EU (includes Sweden)'], ['UK', 'United Kingdom'], ['US', 'United States']];
const REMOTES: ReadonlyArray<[RemotePref, string]> = [['any', 'Any'], ['remote', 'Remote only'], ['hybrid', 'Hybrid or remote'], ['onsite', 'On-site is fine']];
const OUT_OF_SCOPE_REASON: Readonly<Record<string, string>> = {
  'junior': 'The pool has mid-level and senior roles only, no junior, intern or graduate roles yet.',
  'outside-pool-roles': 'We do not match nursing, sales, mobile-only or management profiles yet.',
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

const displayCompany = (c: string) =>
  /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(c) ? c.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : c;

const ageLabel = (days: number) => (days === 0 ? 'today' : days === 1 ? '1 day ago' : `${days} days ago`);

export function App() {
  const [pool, setPool] = useState<PoolState>({ kind: 'loading' });
  const [description, setDescription] = useState('');
  const [goal, setGoal] = useState('');
  const [likes, setLikes] = useState('');
  const [regions, setRegions] = useState<ReadonlyArray<Place>>([]);
  const [productOnly, setProductOnly] = useState(false);
  const [remote, setRemote] = useState<RemotePref>('any');
  const [view, setView] = useState<View>({ kind: 'idle' });
  const goalRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const loadPool = useCallback(() => {
    setPool({ kind: 'loading' });
    const getJson = (path: string) => fetch(path, { credentials: 'same-origin', cache: 'default' })
      .then(r => (r.ok ? r.json() as Promise<unknown> : Promise.reject(new Error(String(r.status)))));
    getJson('/pool.json')
      .then(async (index: unknown) => {
        const head = index as { shards?: unknown; version?: unknown; checkedRange?: unknown };
        if (!Array.isArray(head.shards)) return index;
        const parts = await Promise.all(head.shards.filter((f): f is string => typeof f === 'string' && /^pool-\d+\.json$/.test(f)).map(f => getJson(`/${f}`)));
        return { version: head.version, checkedRange: head.checkedRange, rows: parts.flatMap(p => ((p as { rows?: unknown }).rows as unknown[] | undefined) ?? []) };
      })
      .then((raw: unknown) => { const p = parsePool(raw); if (p.isOk()) poolStats(p.value); setPool(p.isOk() ? { kind: 'ready', pool: p.value } : { kind: 'failed' }); })
      .catch(() => setPool({ kind: 'failed' }));
  }, []);
  useEffect(loadPool, [loadPool]);

  const livePii = useMemo(() => [...new Set(findPii(`${description}\n${goal}\n${likes}`).map(s => s.pii))], [description, goal, likes]);

  const run = useCallback((over?: { regions?: ReadonlyArray<Place>; remote?: RemotePref; productOnly?: boolean }) => {
    if (pool.kind !== 'ready') return;
    const t0 = performance.now();
    const r = match({ description, goal, likes, region: over?.regions ?? regions, remote: over?.remote ?? remote, productOnly: over?.productOnly ?? productOnly }, pool.pool);
    const ms = Math.max(1, Math.round(performance.now() - t0));
    setView(r.isOk() ? { kind: 'results', result: r.value, ms } : toView(r.error));
    requestAnimationFrame(() => resultsRef.current?.focus());
  }, [pool, description, goal, likes, regions, remote, productOnly]);

  const formChanged = () => setView({ kind: 'idle' });
  const onSubmit = (e: FormEvent) => { e.preventDefault(); run(); };
  const removePii = () => { setDescription(d => redactPii(d)); setGoal(g => redactPii(g)); setLikes(l => redactPii(l)); setView({ kind: 'idle' }); };
  const widen = (w: string) => {
    if (w === 'region') { setRegions([]); run({ regions: [] }); }
    else if (w === 'productOnly') { setProductOnly(false); run({ productOnly: false }); }
    else if (w === 'remote') { setRemote('any'); run({ remote: 'any' }); }
    else goalRef.current?.focus();
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight">kanithanj.ai</h1>
        <p className="mt-2 text-lg text-text">Describe yourself. See roles that fit now, roles that move you toward your goal, and stretch roles.</p>
        <p className="mt-2 text-sm text-text-muted">
          Matching runs in your browser. Your text never leaves this page: no account, no server, no analytics.
        </p>
      </header>

      <Alert tone="info" className="mb-6">
        <strong className="font-semibold">Scope:</strong> {OUT_OF_SCOPE_MSG}
        {pool.kind === 'ready' && (
          <span className="block mt-1">{pool.pool.rows.length.toLocaleString('en')} listed roles, of which we match only engineering ones. Status last checked {pool.pool.checkedRange.to.slice(0, 10)}.</span>
        )}
      </Alert>

      {pool.kind === 'loading' && <p role="status" className="mb-6 text-text-muted">Loading roles…</p>}
      {pool.kind === 'failed' && (
        <Alert tone="broken" className="mb-6" role="alert">
          Could not load the roles. Check your connection. <Button variant="outline" size="sm" className="ml-2" onClick={loadPool}>Try again</Button>
        </Alert>
      )}

      <form onSubmit={onSubmit} className="grid gap-4 rounded-lg border border-border bg-surface p-4 sm:p-6" noValidate>
        <div className="grid gap-2">
          <Label htmlFor="description">About you</Label>
          <Textarea id="description" name="description" value={description} maxLength={MAX_CHARS + 200}
            onChange={e => { setDescription(e.target.value); formChanged(); }}
            placeholder="e.g. Senior backend engineer, 8 years of Go and Postgres, distributed systems" aria-describedby="description-help" autoComplete="off" spellCheck />
          <p id="description-help" className="text-xs text-text-muted">At least {MIN_CHARS} characters. Skip your name, email and phone: they are not needed.</p>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="goal">Where do you want to grow? <span className="text-text-muted">(optional)</span></Label>
          <Input id="goal" ref={goalRef} name="goal" value={goal} onChange={e => { setGoal(e.target.value); formChanged(); }} placeholder="e.g. AI infrastructure" autoComplete="off" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="likes">Companies or interests you like <span className="text-text-muted">(optional)</span></Label>
          <Input id="likes" name="likes" value={likes} maxLength={MAX_CHARS} onChange={e => { setLikes(e.target.value); formChanged(); }}
            placeholder="e.g. Spotify, Einride, robotics" aria-describedby="likes-help" autoComplete="off" />
          <p id="likes-help" className="text-xs text-text-muted">Separate with commas. Roles at these companies move up; nothing is added or removed. Stays in this browser tab and is never sent or saved.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <fieldset className="grid gap-2" aria-describedby="region-help">
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
          </div>
          <div className="grid gap-2">
            <Label htmlFor="remote">Work mode</Label>
            <Select id="remote" value={remote} onChange={e => { setRemote(e.target.value as RemotePref); formChanged(); }}>
              {REMOTES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
          </div>
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" id="product-only" checked={productOnly} className="mt-0.5 size-4 accent-accent" aria-describedby="product-only-help"
            onChange={() => { setProductOnly(!productOnly); formChanged(); }} />
          <span>
            Product companies only
            <span id="product-only-help" className="block text-xs text-text-muted">Hides roles that look like agency, consultancy or freelance contracts, judged from the title and company name. Off by default.</span>
          </span>
        </label>
        {livePii.length > 0 && (
          <Alert tone="warn" role="alert" data-testid="pii-warning">
            This looks like personal details ({livePii.join(', ')}). It stays on your device, but matching does not need it.
            <Button type="button" variant="outline" size="sm" className="ml-2" onClick={removePii}>Remove them</Button>
          </Alert>
        )}
        <div><Button type="submit" disabled={pool.kind !== 'ready'}>Find roles</Button></div>
      </form>

      <div ref={resultsRef} tabIndex={-1} className="mt-8 outline-none" aria-live="polite">
        <ViewPanel view={view} onWiden={widen} onRemovePii={removePii} />
      </div>

      <footer className="mt-12 border-t border-border pt-4 text-xs text-text-muted">
        Public job facts and links only. Postings belong to the employers; always check the posting before applying.
      </footer>
    </div>
  );
}

function ViewPanel({ view, onWiden, onRemovePii }: { view: View; onWiden: (w: string) => void; onRemovePii: () => void }) {
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
    case 'results': return <Results result={view.result} ms={view.ms} />;
  }
}

function Results({ result, ms }: { result: MatchResult; ms: number }) {
  const stale = result.warnings.find(w => w.kind === 'PoolStale');
  const u = result.understood;
  const understood = [...u.roles, ...u.skills].join(', ');
  return (
    <section aria-labelledby="results-title" data-testid="results">
      <h2 id="results-title" className="text-2xl font-semibold">Your matches</h2>
      <p className="mt-1 text-sm text-text-muted">
        Matched in {ms} ms in your browser. Read as: {understood || 'general software engineering'}
        {u.seniority ? `, ${u.seniority} level` : ''}{u.goal.length ? `; goal: ${u.goal.join(', ')}` : ''}.
      </p>
      {stale && stale.kind === 'PoolStale' && (
        <Alert tone="warn" className="mt-4" data-testid="stale-banner">
          Statuses were last checked {stale.checkedAt} ({stale.ageDays} days ago). Some roles may have closed since; check the posting.
        </Alert>
      )}
      <div className="mt-6 grid gap-8">
        {GROUPS.map(g => (
          <section key={g.key} aria-labelledby={`g-${g.key}`} data-testid={`group-${g.key}`}>
            <h3 id={`g-${g.key}`} className="text-xl font-semibold">
              {g.title} <span className="text-base font-normal text-text-muted">({result.groups[g.key].length} of {result.totals[g.key]})</span>
            </h3>
            <p className="mb-3 text-sm text-text-muted">{g.blurb}</p>
            {result.groups[g.key].length === 0
              ? <p className="text-sm text-text-muted">{g.key === 'stepTowardGoal' && !u.goal.length ? 'Add a goal to fill this group.' : 'Nothing here for this search.'}</p>
              : <ul className="grid gap-3 md:grid-cols-2">{result.groups[g.key].map(r => <li key={r.id}><RoleCard row={r} /></li>)}</ul>}
          </section>
        ))}
      </div>
    </section>
  );
}

function RoleCard({ row }: { row: MatchRow }) {
  return (
    <Card className="h-full" data-posting-id={row.id}>
      <h4 className="text-base font-semibold">{row.title}</h4>
      <p className="text-sm text-text-muted">{displayCompany(row.company)}{row.location ? ` · ${row.location}` : ''}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Badge tone={row.stale ? 'warn' : 'ok'}>Last checked {ageLabel(row.ageDays)}</Badge>
        {row.status !== 'open' && <Badge tone="trap">Status unknown</Badge>}
        {row.region && row.region !== 'other' ? <Badge>{row.region}</Badge> : <Badge tone="warn">Location not confirmed</Badge>}
        {isAgencyRow(row) && <Badge>Agency or contract</Badge>}
        {row.remote !== 'unknown' && <Badge>{row.remote}</Badge>}
        {row.seniority && <Badge>{row.seniority}</Badge>}
      </div>
      <ul className="mt-3 list-disc space-y-0.5 pl-5 text-sm text-text">
        {row.reasons.map(r => <li key={r}>{r}</li>)}
      </ul>
      <a className="mt-3 inline-block text-sm font-medium text-accent underline underline-offset-2 hover:no-underline focus-visible:outline-2 focus-visible:outline-accent"
        href={row.url} target="_blank" rel="noopener noreferrer">View posting<span className="sr-only"> for {row.title} at {displayCompany(row.company)} (opens in a new tab)</span></a>
    </Card>
  );
}
