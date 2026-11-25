import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { isAgencyRow, type GroupKey, type MatchResult, type MatchRow } from '../../../packages/core/src/index.ts';
import { writeFound, type Found } from './breadth.ts';
import { Badge } from './components/ui/badge.tsx';
import { Card } from './components/ui/card.tsx';

const WHY: ReadonlyArray<[RegExp, (m: RegExpMatchArray) => string]> = [
  [/^Title matches what you do: (.+)$/, m => `${m[1]} role`],
  [/^General software engineering title$/, () => 'general software role'],
  [/^Tagged with: (.+)$/, m => `uses ${m[1]}`],
  [/^Toward your goal: (.+)$/, m => `moves you toward ${m[1]}`],
  [/^One level above yours \((.+)\)$/, m => `a step up to ${m[1]}`],
  [/^At a company on your list$/, () => 'at a company you named'],
  [/^Matches an interest you named$/, () => 'matches an interest you named'],
  [/^In an industry you named: (.+)$/, m => `in ${(m[1] ?? '').toLowerCase()}`],
];

export const whyLine = (reasons: ReadonlyArray<string>): string => {
  const parts = reasons.flatMap(r => WHY.flatMap(([re, say]) => { const m = r.match(re); return m ? [say(m)] : []; })).slice(0, 3);
  const text = parts.length ? parts.join(', ') : 'close to what you described';
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
};

const displayCompany = (c: string) =>
  /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(c) ? c.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : c;

const ageLabel = (days: number) => (days === 1 ? '1 day ago' : `${days} days ago`);

type Proof = Found & { ids: ReadonlySet<string>; mark: (id: string, found: boolean) => void };
const ProofContext = createContext<Proof | null>(null);
export const useProof = () => useContext(ProofContext);

export function ProofProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ ids: ReadonlySet<string>; firstMs: number | null }>({ ids: new Set(), firstMs: null });
  const mark = useCallback((id: string, found: boolean) => setState(s => {
    const firstMs = s.firstMs ?? Math.round(performance.now());
    const ids = found && !s.ids.has(id) ? new Set([...s.ids, id]) : s.ids;
    if (ids === s.ids && firstMs === s.firstMs) return s;
    writeFound({ found: ids.size, firstMs });
    return { ids, firstMs };
  }), []);
  const value = useMemo(() => ({ ...state, found: state.ids.size, mark }), [state, mark]);
  return <ProofContext.Provider value={value}>{children}</ProofContext.Provider>;
}

export function RoleCard({ row, label = null, layout = 'card' }: { row: MatchRow; label?: string | null; layout?: 'card' | 'row' }) {
  const company = displayCompany(row.company);
  const proof = useProof();
  const noted = proof?.ids.has(row.id) ?? false;
  const Box = layout === 'row' ? 'article' : Card;
  return (
    <Box className={layout === 'row' ? 'grid gap-x-8 gap-y-3 py-6 sm:grid-cols-[minmax(0,1fr)_auto]' : 'h-full'} data-posting-id={row.id} data-layout={layout}>
      <div className="min-w-0">
        {label && <p className="mb-1 text-xs uppercase tracking-wider text-text-muted" data-testid="pick-label">{label}</p>}
        <h4 className="text-base font-semibold">{row.title}</h4>
        <p className="mt-1 text-sm text-text-muted">{company}{row.location ? ` · ${row.location}` : ''}</p>
        <p className="mt-2 text-sm text-text" data-testid="why">{row.summary ?? whyLine(row.reasons)}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {row.region && row.region !== 'other' ? <Badge>{row.region}</Badge> : <Badge tone="warn">Location not confirmed</Badge>}
          {row.remote !== 'unknown' && <Badge>{row.remote}</Badge>}
          {row.seniority && <Badge>{row.seniority}</Badge>}
          {row.status !== 'open' && <Badge tone="trap">Status unknown</Badge>}
          {row.stale && <Badge tone="warn">Checked {ageLabel(row.ageDays)}</Badge>}
          {isAgencyRow(row) && <Badge>Agency or contract</Badge>}
          {row.reasons.some(r => r.startsWith('Title points to a different specialty')) && <Badge tone="warn">Different specialty</Badge>}
        </div>
      </div>
      <div className="flex flex-wrap items-start gap-x-4 text-sm sm:flex-col sm:items-end">
        <a className="inline-flex min-h-11 items-center underline underline-offset-4 hover:no-underline focus-visible:outline-2 focus-visible:outline-accent"
          href={row.url} target="_blank" rel="noopener noreferrer" onClick={() => proof?.mark(row.id, false)}>View posting<span className="sr-only"> for {row.title} at {company} (opens in a new tab)</span></a>
        {proof && (
          <button type="button" aria-pressed={noted} disabled={noted} onClick={() => proof.mark(row.id, true)} data-testid="new-to-me"
            className="inline-block min-h-11 text-text-muted underline underline-offset-4 hover:text-text disabled:no-underline focus-visible:outline-2 focus-visible:outline-accent">
            {noted ? 'Interested' : 'I’m interested'}
          </button>
        )}
      </div>
    </Box>
  );
}

export const GROUPS: ReadonlyArray<{ key: GroupKey; title: string; blurb: string }> = [
  { key: 'fitsNow', title: 'Fits now', blurb: 'Matches what you do today, at your level, open when last checked, location confirmed.' },
  { key: 'stepTowardGoal', title: 'Step toward your goal', blurb: 'Uses what you do and adds what you want to grow into.' },
  { key: 'stretch', title: 'Stretch', blurb: 'Worth a look: a level up, or a detail we could not confirm.' },
];

export function Groups({ result, keys }: { result: MatchResult; keys: ReadonlyArray<GroupKey> }) {
  const shown = GROUPS.filter(g => keys.includes(g.key) && result.groups[g.key].length > 0);
  const nudge = keys.includes('stepTowardGoal') && result.groups.stepTowardGoal.length === 0 && result.understood.goal.length === 0;
  return (
    <div className="grid gap-12">
      {shown.map(g => (
        <section key={g.key} aria-labelledby={`g-${g.key}`} data-testid={`group-${g.key}`}>
          <h3 id={`g-${g.key}`} className="text-base font-semibold">
            {g.title} <span className="font-normal tabular-nums text-text-muted">({result.groups[g.key].length} of {result.totals[g.key]})</span>
          </h3>
          <p className="mt-1 text-xs text-text-muted">{g.blurb}</p>
          <ul className="mt-4 divide-y divide-border border-y border-border">{result.groups[g.key].map(r => <li key={r.id}><RoleCard row={r} layout="row" /></li>)}</ul>
        </section>
      ))}
      {nudge && <p className="text-sm text-text-muted" data-testid="goal-nudge">Add where you want to grow to see roles that move you toward it.</p>}
    </div>
  );
}
