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
      className="fixed inset-0 z-50 m-auto h-fit w-[min(32rem,calc(100%-2rem))] rounded-lg border border-border bg-surface p-6 text-text shadow-lg backdrop:bg-black/40">
      <p className="text-xs font-medium uppercase tracking-wider text-text-muted">Your call</p>
      <h2 id="person-confirm-title" className="mt-2 text-xl font-semibold text-balance">{title}</h2>
      <p className="mt-3 text-sm text-text-muted text-pretty">{body}</p>
      <div className="mt-6 flex justify-end gap-2">
        <Button type="button" variant="outline" autoFocus onClick={onCancel}>Cancel</Button>
        <Button type="button" onClick={onConfirm}>Confirm</Button>
      </div>
    </dialog>
  );
}

const eyebrow = 'text-xs font-medium uppercase tracking-wider text-text-muted';
const label = 'text-sm font-semibold';

function Role({ title, company }: { title: string; company: string }) {
  return <h2 className="mt-2 text-2xl font-semibold text-balance sm:text-3xl">{title} <span className="block text-lg font-normal text-text-muted">at {company}</span></h2>;
}

function OutlinePanel({ outline }: { outline: CvOutline }) {
  return (
    <Card className="p-6 sm:p-8" data-testid="cv-outline">
      <p className={eyebrow}>CV outline</p>
      <Role title={outline.title} company={outline.company} />
      <h3 className={`mt-6 ${label}`}>Lead with</h3>
      <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        {outline.emphasize.map(item => <li key={item} className="rounded-md border border-border bg-surface-alt px-3 py-2">{item}</li>)}
      </ul>
    </Card>
  );
}

function PackPanel({ pack, outline, confirmed }: { pack: ApplyPack; outline: CvOutline | null; confirmed: boolean }) {
  const facts: Array<[string, string]> = [['Location', pack.location ?? 'See posting'], ['Work mode', pack.remote], ['Status', pack.status]];
  const lead = outline?.roleId === pack.roleId ? outline.emphasize.filter(item => !pack.reasons.includes(item)) : [];
  return (
    <Card className="p-6 sm:p-8" data-testid="apply-pack">
      <div className="grid gap-8 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div>
          <p className={eyebrow}>Apply pack</p>
          <Role title={pack.title} company={pack.company} />
          <dl className="mt-6 grid grid-cols-3 gap-4 border-t border-border pt-4 text-sm">
            {facts.map(([k, v]) => <div key={k}><dt className="text-xs text-text-muted">{k}</dt><dd className="mt-1 capitalize">{v}</dd></div>)}
          </dl>
          {confirmed && <p className="mt-6 flex items-center gap-2 text-sm text-ok-text" data-testid="confirmed"><span aria-hidden="true" className="size-2 rounded-full bg-ok-stroke" />Confirmed. Apply on the employer's page.</p>}
          <a className="mt-6 inline-flex h-11 items-center rounded-md bg-accent px-5 text-sm font-semibold text-text-on-accent hover:bg-accent/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            href={pack.url} target="_blank" rel="noopener noreferrer">Open posting<span className="sr-only"> for {pack.title} at {pack.company} (opens in a new tab)</span></a>
        </div>
        <div className="grid content-start gap-6 md:border-l md:border-border md:pl-8">
          <section>
            <h3 className={label}>Why it fits</h3>
            <ul className="mt-3 grid gap-2 text-sm">{pack.reasons.map(r => <li key={r} className="border-b border-border pb-2 last:border-0">{r}</li>)}</ul>
          </section>
          {lead.length > 0 && (
            <section>
              <h3 className={label}>Lead with</h3>
              <p className="mt-3 flex flex-wrap gap-2">{lead.map(item => <span key={item} className="rounded-pill border border-border bg-surface-alt px-3 py-1 text-xs">{item}</span>)}</p>
            </section>
          )}
          <section>
            <h3 className={label}>Before you apply</h3>
            <ol className="mt-3 grid list-decimal gap-1.5 pl-5 text-sm text-text-muted">{pack.checklist.map(item => <li key={item}>{item}</li>)}</ol>
          </section>
        </div>
      </div>
    </Card>
  );
}

type PanelProps = { outline: CvOutline | null; pack: ApplyPack | null; step: Step };
const PANELS = {
  outline: ({ outline }: PanelProps) => outline && <OutlinePanel outline={outline} />,
  pack: ({ pack, outline, step }: PanelProps) => pack && <PackPanel pack={pack} outline={outline} confirmed={step === 'confirmed'} />,
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
  return <div ref={ref} className="mb-8 scroll-mt-6">{panel}</div>;
}
