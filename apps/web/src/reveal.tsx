import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_LIMIT, findPii, industriesOfText, match, redactPii, MIN_CHARS, MAX_CHARS, type MatchResult, type PublicPool, type Understood } from '../../../packages/core/src/index.ts';
import { label } from '../../../packages/core/src/vocab.ts';
import { breadth, fieldIndex, fieldLabel, firstThree, trim, type Home } from './breadth.ts';
import { Alert } from './components/ui/alert.tsx';
import { Button } from './components/ui/button.tsx';
import { Input, Textarea } from './components/ui/field.tsx';
import { Groups, RoleCard, useProof } from './cards.tsx';

const ROLES: ReadonlyArray<[string, string]> = [
  ['backend engineer', 'Back-end systems'], ['frontend engineer', 'Websites and screens'], ['fullstack engineer', 'Whole products, end to end'],
  ['platform engineer working on DevOps', 'Servers, cloud and operations'], ['data engineer', 'Data and reporting'], ['machine learning engineer', 'Machine learning'],
  ['security engineer', 'Security'], ['engineering manager', 'Leading a tech team'],
];
const TENURE: ReadonlyArray<[string, string]> = [['5+', '5+ years'], ['10+', '10+ years'], ['15+', '15+ years']];
const HOMES: ReadonlyArray<[Home, string]> = [
  ['SE', 'Sweden'], ['EU', 'Elsewhere in the EU'], ['UK', 'United Kingdom'], ['US', 'United States'],
  ['CA', 'Canada'], ['LATAM', 'Latin America'], ['APAC', 'Asia-Pacific'], ['MEA', 'Middle East and Africa'], ['other', 'Somewhere else'],
];
const GROWTH: ReadonlyArray<[string, string]> = [
  ['AI infrastructure, machine learning', 'AI and machine learning'], ['platform engineering, infrastructure', 'Platform and infrastructure'],
  ['engineering manager', 'Leading a team'], ['product engineering', 'Product engineering'],
];
const STRENGTH: Readonly<Record<string, string>> = {
  backend: 'building reliable systems', frontend: 'making software easy to use',
  fullstack: 'taking a product from screen to database', platform: 'keeping important systems running', infra: 'keeping important systems running',
  data: 'turning data into something people trust', ml: 'making models useful in real work', ai: 'putting AI to practical use',
  security: 'protecting systems and people', leadership: 'leading people through change',
};
const STEPS = ['Your options', 'Your strengths', 'Your fits', 'Your growth'];

const list = (xs: ReadonlyArray<string>) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const article = (w: string) => (/^[aeiou]/i.test(w) ? 'an' : 'a');
const n = (x: number) => x.toLocaleString('en');

export const describe = (roles: ReadonlyArray<string>, tenure: string | null, free: string): string => {
  const years = tenure ? ` with ${tenure} years of experience` : '';
  const head = roles.length ? `${roles.join(' and ')}${years}` : free.trim() && tenure ? `${tenure} years of experience` : '';
  const text = [head, free.trim()].filter(Boolean).join(roles.length ? '. ' : ', ');
  return text.length >= MIN_CHARS || !roles.length ? text : `I work as ${article(head)} ${text}`;
};

export const readBack = (u: Understood, tenure: string | null, fields: ReadonlyArray<string>): string => {
  const strengths = [...new Set(u.roles.flatMap(r => (STRENGTH[r] ? [STRENGTH[r]] : [])))].slice(0, 2);
  const skills = u.skills.slice(0, 3).map(label);
  const parts = [...(tenure ? [`${tenure} years of seeing work through`] : []), ...(strengths.length ? strengths : ['solving problems with software']), ...(skills.length ? [`hands-on with ${list(skills)}`] : [])];
  const named = fields.slice(0, 2).map(f => f.toLowerCase());
  const more = fields.length - named.length;
  const where = fields.length >= 2 ? ` Here they are wanted in ${named.join(', ')}${more > 0 ? ` and ${more} more field${more === 1 ? '' : 's'}` : ''}.` : '';
  return `Your strengths carry across fields: ${list(parts)}.${where}`;
};


function Chips({ name, options, chosen, onPick }: { name: string; options: ReadonlyArray<[string, string]>; chosen: ReadonlyArray<string>; onPick: (v: string) => void }) {
  return (
    <div role="group" aria-label={name} className="flex flex-wrap gap-2">
      {options.map(([v, l]) => (
        <button key={v} type="button" aria-pressed={chosen.includes(v)} onClick={() => onPick(v)}
          className="min-h-11 rounded-pill border border-border bg-surface px-4 text-sm transition-colors hover:border-text-muted aria-pressed:border-text aria-pressed:bg-text aria-pressed:text-bg focus-visible:outline-2 focus-visible:outline-accent">
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
        <li key={s} title={s} className={`size-2.5 rounded-full ${i < step ? 'bg-text' : 'bg-border'}`}><span className="sr-only">{s}{i < step ? ' unlocked' : ''}</span></li>
      ))}
    </ol>
  );
}

function Count({ roles, fields, countries }: { roles: number; fields: number; countries: number }) {
  const [seen, setSeen] = useState({ n: roles, prev: roles });
  useEffect(() => { setSeen(s => (s.n === roles ? s : { n: roles, prev: s.n })); }, [roles]);
  const delta = seen.n - seen.prev;
  const span = [...(fields >= 2 ? [`across ${n(fields)} fields`] : []), ...(countries >= 1 ? [`in ${n(countries)} ${countries === 1 ? 'country' : 'countries'}`] : [])].join(' ');
  return (
    <p className="reveal sticky top-0 z-10 -mx-4 bg-bg/95 px-4 py-2 text-lg backdrop-blur-sm" data-testid="live-count" aria-live="polite">
      <span key={seen.n} className="pop text-4xl font-semibold tabular-nums">{n(seen.n)}</span> roles {span ? `${span} worldwide` : 'open to you worldwide'}
      {delta !== 0 && <span className="ml-2 text-sm text-text-muted">{delta > 0 ? '+' : '−'}{n(Math.abs(delta))}</span>}
    </p>
  );
}

const Question = ({ id, children }: { id: string; children: string }) => <h2 id={id} className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">{children}</h2>;

export function Reveal({ pool }: { pool: PublicPool }) {
  const [roles, setRoles] = useState<ReadonlyArray<string>>([]);
  const [free, setFree] = useState('');
  const [tenure, setTenure] = useState<string | null>(null);
  const [home, setHome] = useState<Home | null>(null);
  const [goal, setGoal] = useState('');
  const [growth, setGrowth] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const proof = useProof();
  const fields = useMemo(() => fieldIndex(pool), [pool]);
  const description = useDeferredValue(describe(roles, tenure, free));
  const deferredGoal = useDeferredValue(goal || (growth && growth !== 'skip' ? growth : ''));
  const pii = useMemo(() => [...new Set(findPii(`${free}\n${goal}`).map(s => s.pii))], [free, goal]);
  const live = useMemo(() => (description.length < MIN_CHARS || pii.length ? null
    : match({ description, goal: deferredGoal, likes: '', region: [], remote: 'any', productOnly: false }, pool, { limit: pool.rows.length })), [description, deferredGoal, pii.length, pool]);
  const fresh = live?.isOk() ? live.value : null;
  const lastOk = useRef<MatchResult | null>(null);
  if (fresh) lastOk.current = fresh;
  const none = live?.isErr() === true && live.error.kind === 'ZeroResults';
  const ok = fresh ?? (none ? lastOk.current : null);
  const wide = useMemo(() => (fresh ? breadth(fresh, fields) : { roles: 0, fields: [], countries: 0 }), [fresh, fields]);
  const homeFields = useMemo(() => industriesOfText(free), [free]);
  const picks = useMemo(() => (fresh ? firstThree(fresh, fields, home, homeFields) : []), [fresh, fields, home, homeFields]);
  const shown = useMemo(() => (fresh ? trim(fresh, DEFAULT_LIMIT) : null), [fresh]);
  const step = !ok ? 0 : !home ? 1 : !(growth || goal.trim()) ? 3 : 4;
  const pickRole = (v: string) => setRoles(rs => (rs.includes(v) ? rs.filter(r => r !== v) : [...rs, v].slice(-2)));
  const toggle = <T,>(set: (f: (x: T | null) => T | null) => void, v: T) => set(x => (x === v ? null : v));

  return (
    <section aria-labelledby="q-role" className="grid gap-8" data-testid="reveal">
      <div className="flex items-center justify-between gap-4"><Dots step={step} /><a className="text-sm text-text-muted underline" href="#all">Show all options</a></div>
      {ok && <Count roles={fresh ? wide.roles : 0} fields={fresh ? wide.fields.length : 0} countries={fresh ? wide.countries : 0} />}
      <div className="grid gap-4">
        <Question id="q-role">What have you been doing these last years?</Question>
        <Chips name="What have you been doing these last years?" options={ROLES} chosen={roles} onPick={pickRole} />
        <div className="grid gap-2">
          <p className="text-sm text-text-muted" id="q-tenure">For how long? (optional)</p>
          <Chips name="For how long?" options={TENURE} chosen={tenure ? [tenure] : []} onPick={v => toggle(setTenure, v)} />
        </div>
        <label className="grid gap-1 text-sm text-text-muted">
          Or say it in your own words
          <Textarea value={free} maxLength={MAX_CHARS + 200} rows={2} onChange={e => setFree(e.target.value)} placeholder="e.g. Java and SQL for a bank" autoComplete="off" spellCheck data-testid="free-text" />
        </label>
        {pii.length > 0 && (
          <Alert tone="warn" role="alert" data-testid="pii-warning">
            This looks like personal details ({pii.join(', ')}). Matching does not need it, so it paused.
            <Button type="button" variant="outline" size="sm" className="ml-2" onClick={() => { setFree(f => redactPii(f)); setGoal(g => redactPii(g)); }}>Remove them</Button>
          </Alert>
        )}
        {live?.isErr() && live.error.kind === 'OutOfScope' && <Alert tone="trap" data-testid="out-of-scope">For now we list software and AI engineering roles at tech companies.</Alert>}
      </div>

      {none && <p className="text-sm text-text-muted" data-testid="none-there">Nothing matches that exact mix yet. Try one choice fewer.</p>}

      {step >= 1 && ok && (
        <div className="reveal grid gap-3">
          <Question id="q-home">Where do you live now?</Question>
          <Chips name="Where do you live now?" options={HOMES} chosen={home ? [home] : []} onPick={v => toggle(setHome, v as Home)} />
        </div>
      )}

      {step >= 3 && ok && (
        <div className="reveal grid gap-3">
          <p className="text-xl font-medium text-balance" data-testid="read-back">{readBack(ok.understood, tenure, wide.fields.map(fieldLabel))}</p>
        </div>
      )}

      {step >= 3 && ok && (
        <div className="reveal reveal-late grid gap-4">
          <h2 className="text-xl font-semibold">Your first 3 fits</h2>
          {fresh && <ul className="grid gap-3 md:grid-cols-3" data-testid="first-fits">{picks.map(p => <li key={p.row.id}><RoleCard row={p.row} label={p.label} /></li>)}</ul>}
          <Question id="q-grow">Where do you want to grow?</Question>
          <Chips name="Where do you want to grow?" options={[...GROWTH, ['skip', 'Not sure yet']]} chosen={growth ? [growth] : []} onPick={v => toggle(setGrowth, v)} />
          <Input aria-label="Or name it" value={goal} onChange={e => setGoal(e.target.value)} placeholder="Or name it, e.g. robotics" autoComplete="off" />
        </div>
      )}

      {step >= 4 && shown && (
        <div className="reveal grid gap-4" data-testid="results">
          {all ? <Groups result={shown} keys={['fitsNow', 'stepTowardGoal', 'stretch']} /> : (
            <>
              <Groups result={shown} keys={['stepTowardGoal', 'stretch']} />
              {shown.totals.fitsNow > 3 && <div><Button variant="outline" onClick={() => setAll(true)}>Show all {n(shown.totals.fitsNow)} that fit now</Button></div>}
            </>
          )}
          {proof && proof.found > 0 && proof.firstMs !== null && (
            <p className="text-sm font-medium" data-testid="found-line">You found {proof.found} new {proof.found === 1 ? 'option' : 'options'} in {Math.max(1, Math.round(proof.firstMs / 1000))} seconds.</p>
          )}
        </div>
      )}
    </section>
  );
}
