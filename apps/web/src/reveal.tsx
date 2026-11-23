import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { findPii, match, redactPii, MIN_CHARS, MAX_CHARS, type MatchResult, type PublicPool, type RegionPref, type RemotePref, type Understood } from '../../../packages/core/src/index.ts';
import { Alert } from './components/ui/alert.tsx';
import { Button } from './components/ui/button.tsx';
import { Input, Textarea } from './components/ui/field.tsx';
import { Groups, RoleCard } from './cards.tsx';

type Place = Exclude<RegionPref, 'any'>;
const ROLES: ReadonlyArray<[string, string]> = [
  ['backend engineer', 'Backend'], ['frontend engineer', 'Frontend'], ['fullstack engineer', 'Fullstack'],
  ['platform engineer working on DevOps', 'Platform or DevOps'], ['data engineer', 'Data'], ['machine learning engineer', 'Machine learning'],
  ['security engineer', 'Security'], ['engineering manager', 'Engineering manager'],
];
const LEVELS: ReadonlyArray<[string, string]> = [['mid-level', 'Mid-level'], ['senior', 'Senior'], ['staff', 'Staff or principal'], ['lead', 'Lead']];
const PLACES: ReadonlyArray<[string, string, ReadonlyArray<Place>, RemotePref]> = [
  ['SE', 'Sweden', ['SE'], 'any'], ['EU', 'Anywhere in the EU', ['EU'], 'any'], ['UK', 'United Kingdom', ['UK'], 'any'],
  ['US', 'United States', ['US'], 'any'], ['remote', 'Remote only', [], 'remote'], ['any', 'Anywhere', [], 'any'],
];
const GROWTH: ReadonlyArray<[string, string]> = [
  ['AI infrastructure, machine learning', 'AI and machine learning'], ['platform engineering, infrastructure', 'Platform and infrastructure'],
  ['engineering manager', 'Leading a team'], ['product engineering', 'Product engineering'],
];
const PLACE_NAME: Readonly<Record<string, string>> = { SE: 'Sweden', EU: 'the EU', UK: 'the UK', US: 'the US' };
const ROLE_NAME: Readonly<Record<string, string>> = { infra: 'infrastructure', ml: 'machine learning', leadership: 'engineering leadership' };
const SKILL_NAME: Readonly<Record<string, string>> = { typescript: 'TypeScript', javascript: 'JavaScript', sql: 'SQL', aws: 'AWS', gcp: 'GCP', llm: 'LLMs', ml: 'machine learning', css: 'CSS', ios: 'iOS', graphql: 'GraphQL', postgres: 'Postgres' };
const NOWHERE: ReadonlyArray<Place> = [];
const STEPS = ['Your count', 'Your read', 'Your fits', 'Your growth'];

const skillName = (k: string) => SKILL_NAME[k] ?? `${k.charAt(0).toUpperCase()}${k.slice(1)}`;
const list = (xs: ReadonlyArray<string>) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const article = (w: string) => (/^[aeiou]/i.test(w) ? 'an' : 'a');

export const describe = (roles: ReadonlyArray<string>, level: string | null, free: string): string => {
  const head = roles.length ? `${level ? `${level} ` : ''}${roles.join(' and ')}` : level && free.trim() ? level : '';
  const text = [head, free.trim()].filter(Boolean).join(roles.length ? '. ' : ' ');
  return text.length >= MIN_CHARS || !roles.length ? text : `I work as ${article(head)} ${text}`;
};

export const readBack = (u: Understood, regions: ReadonlyArray<string>, remote: RemotePref): string => {
  const kinds = u.roles.map(r => ROLE_NAME[r] ?? r);
  const lead = kinds.includes('engineering leadership');
  const what = lead ? 'engineering leader' : `${kinds.length ? `${list(kinds.slice(0, 2))} ` : 'software '}engineer`;
  const who = `${u.seniority && u.seniority !== 'mid' ? `${u.seniority} ` : u.seniority === 'mid' ? 'mid-level ' : ''}${what}`;
  const skills = u.skills.length ? ` who works with ${list(u.skills.slice(0, 3).map(skillName))}` : '';
  const at = regions.length ? ` looking in ${list(regions.map(r => PLACE_NAME[r] ?? r))}` : remote === 'remote' ? ' who wants to work remotely' : u.places.length ? ` around ${list(u.places.map(r => PLACE_NAME[r] ?? r))}` : '';
  return `You sound like ${article(who)} ${who}${skills}${skills && at ? ',' : ''}${at}.`;
};

const total = (r: MatchResult) => r.totals.fitsNow + r.totals.stepTowardGoal + r.totals.stretch;
const topThree = (r: MatchResult) => [...r.groups.fitsNow, ...r.groups.stretch].slice(0, 3);

function Chips({ name, options, chosen, onPick }: { name: string; options: ReadonlyArray<[string, string]>; chosen: ReadonlyArray<string>; onPick: (v: string) => void }) {
  return (
    <div role="group" aria-label={name} className="flex flex-wrap gap-2">
      {options.map(([v, l]) => (
        <button key={v} type="button" aria-pressed={chosen.includes(v)} onClick={() => onPick(v)}
          className="min-h-11 rounded-pill border border-border bg-surface px-4 text-sm transition-colors hover:border-accent aria-pressed:border-accent aria-pressed:bg-accent aria-pressed:text-bg focus-visible:outline-2 focus-visible:outline-accent">
          {l}
        </button>
      ))}
    </div>
  );
}

function Dots({ step }: { step: number }) {
  return (
    <ol className="flex items-center gap-2" aria-label={`${step} of ${STEPS.length} unlocked`} data-testid="progress">
      {STEPS.map((s, i) => (
        <li key={s} title={s} className={`size-2.5 rounded-full ${i < step ? 'bg-accent' : 'bg-border'}`}><span className="sr-only">{s}{i < step ? ' unlocked' : ''}</span></li>
      ))}
    </ol>
  );
}

function Count({ n }: { n: number }) {
  const [seen, setSeen] = useState({ n, prev: n });
  useEffect(() => { setSeen(s => (s.n === n ? s : { n, prev: s.n })); }, [n]);
  const delta = seen.n - seen.prev;
  return (
    <p className="reveal text-lg" data-testid="live-count" aria-live="polite">
      <span key={seen.n} className="pop text-4xl font-semibold tabular-nums text-accent">{seen.n.toLocaleString('en')}</span> roles fit so far
      {delta !== 0 && <span className="ml-2 text-sm text-text-muted">{delta > 0 ? '+' : '−'}{Math.abs(delta).toLocaleString('en')}</span>}
    </p>
  );
}

const Question = ({ id, children }: { id: string; children: string }) => <h2 id={id} className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">{children}</h2>;

export function Reveal({ pool }: { pool: PublicPool }) {
  const [roles, setRoles] = useState<ReadonlyArray<string>>([]);
  const [free, setFree] = useState('');
  const [level, setLevel] = useState<string | null>(null);
  const [place, setPlace] = useState<string | null>(null);
  const [goal, setGoal] = useState('');
  const [growth, setGrowth] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const description = useDeferredValue(describe(roles, level, free));
  const deferredGoal = useDeferredValue(goal || (growth && growth !== 'skip' ? growth : ''));
  const chosenPlace = PLACES.find(p => p[0] === place);
  const regions = chosenPlace?.[2] ?? NOWHERE;
  const remote = chosenPlace?.[3] ?? 'any';
  const pii = useMemo(() => [...new Set(findPii(`${free}\n${goal}`).map(s => s.pii))], [free, goal]);
  const live = useMemo(() => (description.length < MIN_CHARS || pii.length ? null
    : match({ description, goal: deferredGoal, likes: '', region: [...regions], remote, productOnly: false }, pool)), [description, deferredGoal, regions, remote, pii.length, pool]);
  const fresh = live?.isOk() ? live.value : null;
  const lastOk = useRef<MatchResult | null>(null);
  if (fresh) lastOk.current = fresh;
  const none = live?.isErr() === true && live.error.kind === 'ZeroResults';
  const ok = fresh ?? (none ? lastOk.current : null);
  const count = fresh ? total(fresh) : 0;
  const inferredPlace = ok && !place && ok.understood.places.length > 0;
  const step = !ok ? 0 : !(level || ok.understood.seniority) ? 1 : !(place || inferredPlace) ? 2 : !(growth || goal.trim()) ? 3 : 4;
  const pickRole = (v: string) => setRoles(rs => (rs.includes(v) ? rs.filter(r => r !== v) : [...rs, v].slice(-2)));

  return (
    <section aria-labelledby="q-role" className="grid gap-8" data-testid="reveal">
      <div className="flex items-center justify-between gap-4"><Dots step={step} /><a className="text-sm text-text-muted underline" href="#all">Show all options</a></div>
      <div className="grid gap-4">
        <Question id="q-role">What do you do today?</Question>
        <Chips name="What do you do today?" options={ROLES} chosen={roles} onPick={pickRole} />
        <label className="grid gap-1 text-sm text-text-muted">
          Or say it in your own words
          <Textarea value={free} maxLength={MAX_CHARS + 200} rows={2} onChange={e => setFree(e.target.value)} placeholder="e.g. 6 years of Go and Postgres, payments APIs" autoComplete="off" spellCheck data-testid="free-text" />
        </label>
        {pii.length > 0 && (
          <Alert tone="warn" role="alert" data-testid="pii-warning">
            This looks like personal details ({pii.join(', ')}). Matching does not need it, so it paused.
            <Button type="button" variant="outline" size="sm" className="ml-2" onClick={() => { setFree(f => redactPii(f)); setGoal(g => redactPii(g)); }}>Remove them</Button>
          </Alert>
        )}
        {live?.isErr() && live.error.kind === 'OutOfScope' && <Alert tone="trap" data-testid="out-of-scope">We cover software and AI engineering roles at tech companies for now.</Alert>}
      </div>

      {ok && <Count n={count} />}
      {none && <p className="text-sm text-text-muted" data-testid="none-there">No roles match that yet. Try a wider choice.</p>}

      {step >= 1 && ok && (
        <div className="reveal grid gap-3">
          <Question id="q-level">How senior are you?</Question>
          <Chips name="How senior are you?" options={LEVELS} chosen={level ? [level] : []} onPick={v => setLevel(l => (l === v ? null : v))} />
          {!level && ok.understood.seniority && <p className="text-sm text-text-muted">Read from your words: {ok.understood.seniority}.</p>}
        </div>
      )}

      {step >= 2 && ok && (
        <div className="reveal grid gap-3">
          <p className="text-xl font-medium text-balance" data-testid="read-back">{readBack(ok.understood, regions, remote)}</p>
          <p className="text-xs text-text-muted">Read only from what you typed and tapped, here in your browser.</p>
          <Question id="q-place">Where do you want to work?</Question>
          <Chips name="Where do you want to work?" options={PLACES.map(([v, l]) => [v, l] as [string, string])} chosen={place ? [place] : []} onPick={v => setPlace(p => (p === v ? null : v))} />
        </div>
      )}

      {step >= 3 && ok && (
        <div className="reveal grid gap-4">
          <h2 className="text-xl font-semibold">Your first 3 fits</h2>
          {fresh && <ul className="grid gap-3 md:grid-cols-3" data-testid="first-fits">{topThree(fresh).map(r => <li key={r.id} className="reveal reveal-late"><RoleCard row={r} /></li>)}</ul>}
          <Question id="q-grow">Where do you want to grow?</Question>
          <Chips name="Where do you want to grow?" options={[...GROWTH, ['skip', 'Not sure yet']]} chosen={growth ? [growth] : []} onPick={v => setGrowth(g => (g === v ? null : v))} />
          <Input aria-label="Or name it" value={goal} onChange={e => setGoal(e.target.value)} placeholder="Or name it, e.g. robotics" autoComplete="off" />
        </div>
      )}

      {step >= 4 && fresh && (
        <div className="reveal grid gap-4" data-testid="results">
          <p className="text-sm text-text-muted">Unlocked: roles toward your goal and stretch roles.</p>
          {all ? <Groups result={fresh} keys={['fitsNow', 'stepTowardGoal', 'stretch']} /> : (
            <>
              <Groups result={fresh} keys={['stepTowardGoal', 'stretch']} />
              {fresh.groups.fitsNow.length > 3 && <div><Button variant="outline" onClick={() => setAll(true)}>Show all {fresh.totals.fitsNow.toLocaleString('en')} that fit now</Button></div>}
            </>
          )}
        </div>
      )}
    </section>
  );
}
