import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { Button } from './components/ui/button.tsx';
import { Card } from './components/ui/card.tsx';
import type { ApplyPack, CvOutline } from './page-tools.ts';
import type { Step } from './flow.ts';

export function PersonConfirm({ title, body, onConfirm, onCancel }: { title: string; body: string; onConfirm: () => void; onCancel: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      onCancel();
    };
    const onDialogCancel = (event: Event) => { event.preventDefault(); settle(); };
    const onDialogClose = () => { settle(); };
    el.addEventListener('cancel', onDialogCancel);
    el.addEventListener('close', onDialogClose);
    if (!el.open) el.showModal();
    return () => {
      settled = true;
      el.removeEventListener('cancel', onDialogCancel);
      el.removeEventListener('close', onDialogClose);
      if (el.open) el.close();
    };
  }, []);
  return (
    <dialog ref={ref} aria-labelledby="person-confirm-title" data-testid="person-confirm"
      className="fixed inset-0 z-50 m-auto h-fit w-[min(32rem,calc(100%-2rem))] rounded-lg border border-border bg-surface p-0 text-text shadow-lg backdrop:bg-bg/80 backdrop:backdrop-blur-sm">
      <div className="p-6">
        <p className="text-xs uppercase tracking-wider text-text-muted">Your call</p>
        <h2 id="person-confirm-title" className="mt-2 text-xl font-semibold tracking-tight text-balance">{title}</h2>
        <p className="mt-3 text-sm leading-6 text-text-muted text-pretty">{body}</p>
      </div>
      <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
        <Button type="button" variant="outline" autoFocus onClick={onCancel}>Cancel</Button>
        <Button type="button" onClick={onConfirm}>Confirm</Button>
      </div>
    </dialog>
  );
}

const eyebrow = 'text-xs uppercase tracking-wider text-text-muted';
const label = 'text-xs uppercase tracking-wider text-text-muted';

function OutlinePanel({ outline }: { outline: CvOutline }) {
  return (
    <Card className="grid gap-6 p-6 md:grid-cols-[13rem_minmax(0,1fr)] md:gap-10 md:p-10" data-testid="cv-outline">
      <div>
        <p className={eyebrow}>CV outline</p>
        <h2 className="mt-3 text-xl font-semibold tracking-tight text-balance">{outline.title}<span className="sr-only"> at {outline.company}</span></h2>
        <p className="mt-1 text-sm text-text-muted" aria-hidden="true">{outline.company}</p>
      </div>
      <section aria-label="Lead your CV with">
        <h3 className={label}>Lead with</h3>
        <p className="mt-4 border-y border-border py-3 text-base" data-testid="lead-line">{outline.lead}</p>
      </section>
    </Card>
  );
}

type Phase = 'ready' | 'waiting' | 'confirmed';
const PHASE_LINE: Record<Exclude<Phase, 'ready'>, string> = {
  waiting: 'Waiting for your call in the dialog.',
  confirmed: '✓ Confirmed. Open the posting when you are ready.',
};

function PackPanel({ pack, outline, phase }: { pack: ApplyPack; outline: CvOutline | null; phase: Phase }) {
  const facts: Array<[string, string]> = [['Location', pack.location ?? 'See posting'], ['Work mode', pack.remote], ['Status', pack.status]];
  const lead = outline?.roleId === pack.roleId ? outline.lead : '';
  const where = [pack.company, pack.location].filter(Boolean).join(' · ');
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (phase === 'confirmed') heading.current?.focus(); }, [phase]);
  return (
    <Card className="p-0" data-testid="apply-pack" data-phase={phase}>
      <header className="flex flex-wrap items-end justify-between gap-6 border-b border-border p-6 md:p-10">
        <div className="min-w-0">
          <p className={eyebrow}>Apply pack</p>
          <h2 ref={heading} tabIndex={-1} className="mt-3 text-3xl font-semibold tracking-tight text-balance outline-none">{pack.title}<span className="sr-only"> at {pack.company}</span></h2>
          <p className="mt-2 text-sm text-text-muted" aria-hidden="true">{where}</p>
          {phase !== 'ready' && <p className={phase === 'confirmed' ? 'mt-4 text-sm font-semibold text-ok-text' : 'mt-4 text-sm text-text-muted'} data-testid={phase} role="status">{PHASE_LINE[phase]}</p>}
        </div>
        <a className="inline-flex h-11 items-center rounded-md bg-accent px-5 text-sm font-semibold text-text-on-accent hover:bg-accent/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          href={pack.url} target="_blank" rel="noopener noreferrer">Open posting ↗<span className="sr-only"> for {pack.title} at {pack.company} (opens in a new tab)</span></a>
      </header>
      <div className="grid gap-10 p-6 md:grid-cols-3 md:p-10">
        <section>
          <h3 className={label}>Facts</h3>
          <dl className="mt-4 grid gap-4 text-sm">{facts.map(([k, v]) => <div key={k}><dt className="text-xs text-text-muted">{k}</dt><dd className="mt-1 capitalize">{v}</dd></div>)}</dl>
        </section>
        <section>
          <h3 className={label}>{lead ? 'Lead with' : 'Why it fits'}</h3>
          {lead ? <p className="mt-4 border-y border-border py-3 text-sm">{lead}</p>
            : <ul className="mt-4 divide-y divide-border border-y border-border text-sm">{pack.reasons.map(r => <li key={r} className="py-3">{r}</li>)}</ul>}
        </section>
        <section>
          <h3 className={label}>Before you apply</h3>
          <ol className="mt-4 grid list-decimal gap-2 pl-5 text-sm text-text-muted">{pack.checklist.map(item => <li key={item}>{item}</li>)}</ol>
        </section>
      </div>
    </Card>
  );
}

type PanelProps = { outline: CvOutline | null; pack: ApplyPack | null; step: Step };
const PHASE: Partial<Record<Step, Phase>> = { confirming: 'waiting', confirmed: 'confirmed' };
const PANELS = {
  outline: ({ outline }: PanelProps) => outline && <OutlinePanel outline={outline} />,
  pack: ({ pack, outline, step }: PanelProps) => pack && <PackPanel pack={pack} outline={outline} phase={PHASE[step] ?? 'ready'} />,
} satisfies Record<string, (p: PanelProps) => ReactNode>;
const panelFor = (p: PanelProps): keyof typeof PANELS | null => (p.pack ? 'pack' : p.outline ? 'outline' : null);

export { PersonConfirm as ConfirmPane };

export function CardsPane({ onShown, ...props }: PanelProps & { onShown: () => void }) {
  const shown = useRef(onShown);
  shown.current = onShown;
  const ref = useRef<HTMLDivElement>(null);
  const kind = panelFor(props);
  const panel = kind ? PANELS[kind](props) : null;
  useLayoutEffect(() => {
    shown.current();
    if (panel) ref.current?.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [props.outline, props.pack, props.step]);
  return <div ref={ref} className="mb-12 scroll-mt-6">{panel}</div>;
}
