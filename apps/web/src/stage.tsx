import { lazy, Suspense } from 'react';
import { OUT_OF_SCOPE_MSG, type MatchResult } from '../../../packages/core/src/index.ts';
import type { View, Step } from './flow.ts';
import { Groups } from './cards.tsx';
import { Alert } from './components/ui/alert.tsx';
import { Button } from './components/ui/button.tsx';

const SdkResults = lazy(() => import('./sdk-path.tsx').then(m => ({ default: m.SdkResults })));
const WIDEN_LABEL: Readonly<Record<string, string>> = { region: 'Search anywhere', remote: 'Any work mode', productOnly: 'Include agencies and freelance', goal: 'Add a goal', seniority: 'Any level' };
const STAGES = { loading: 0, failed: 0, find: 0, matched: 1, tailored: 2, pack: 3, confirming: 3, confirmed: 4 } satisfies Record<Step, number>;
const STEP_TITLES = ['Find', 'Matches', 'CV outline', 'Apply pack', 'Confirmed'];
export function StepRail({ step }: { step: Step }) {
  const active = STAGES[step];
  return (
    <div className="sticky top-0 z-10 mb-8 border-b border-border bg-bg py-3 text-xs text-text-muted sm:static sm:pb-4 sm:pt-0">
      <p className="sm:hidden" data-testid="step-line">Step {active + 1} of {STEP_TITLES.length} · <span className="font-semibold text-text">{STEP_TITLES[active]}</span></p>
      <ol aria-label="Your progress" className="hidden flex-wrap gap-x-6 gap-y-2 sm:flex">{STEP_TITLES.map((title, i) => <li key={title} aria-current={i === active ? 'step' : undefined} className={i === active ? 'font-semibold text-text' : ''}><span className="mr-2 tabular-nums">{i < active ? '✓' : i + 1}</span>{title}</li>)}</ol>
    </div>
  );
}

export function ViewPanel({ view, onWiden, onRemovePii, sdkPath }: { view: View; onWiden: (w: string) => void; onRemovePii: () => void; sdkPath: boolean }) {
  switch (view.kind) {
    case 'idle': return <section className="py-6 lg:py-12" aria-labelledby="find-title">
      <p className="text-xs uppercase tracking-wider text-text-muted">Your next chapter</p>
      <h2 id="find-title" className="mt-3 text-xl font-semibold tracking-tight text-balance">Find your next role</h2>
      <p className="mt-4 max-w-prose text-sm text-text-muted">Start with the work you do well. We’ll find the roles that fit it, and a few that help you grow.</p>
      <ol className="mt-10 divide-y divide-border text-sm">{[['01', 'Fits now', 'Build on what you already know.'], ['02', 'Step toward your goal', 'Bring your skills into something new.'], ['03', 'Stretch', 'Explore a bigger step, with the trade-offs in view.']].map(([n, title, body]) => <li key={n} className="flex gap-6 py-6"><span className="text-xs tabular-nums text-text-muted">{n}</span><div><h3 className="text-base font-semibold">{title}</h3><p className="mt-1 text-text-muted">{body}</p></div></li>)}</ol>
    </section>;
    case 'inputError': return <Alert tone="trap" data-testid="input-error">{view.msg}</Alert>;
    case 'piiWarning': return (
      <Alert tone="warn" data-testid="pii-blocked">
        We did not match yet: your text contains {view.kinds.join(', ')}.
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
          {view.widen.map((w, i) => <Button key={w} variant={i ? 'outline' : 'default'} size="sm" onClick={() => onWiden(w)}>{WIDEN_LABEL[w] ?? w}</Button>)}
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
      <h2 id="results-title" className="text-xl font-semibold tracking-tight">Your matches</h2>
      {result.likesMiss && <p className="mt-2 text-sm text-text-muted" data-testid="likes-miss">None of those words matched.</p>}
      <p className="mt-2 text-xs text-text-muted">
        Matched in {ms} ms in your browser. Read as: {understood || 'general software engineering'}
        {u.seniority ? `, ${u.seniority} level` : ''}{u.goal.length ? `; goal: ${u.goal.join(', ')}` : ''}.
      </p>
      {stale && stale.kind === 'PoolStale' && (
        <Alert tone="warn" className="mt-4" data-testid="stale-banner">
          Statuses were last checked {stale.checkedAt} ({stale.ageDays} days ago). Some roles may have closed since; check the posting.
        </Alert>
      )}
      <div className="mt-10"><Groups result={result} keys={['fitsNow', 'stepTowardGoal', 'stretch']} /></div>
    </section>
  );
}
