import { useEffect, useLayoutEffect, useRef } from 'react';
import { Button } from './components/ui/button.tsx';
import { Card } from './components/ui/card.tsx';
import type { ApplyPack, CvOutline } from './page-tools.ts';

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
      <h2 id="person-confirm-title" className="text-lg font-semibold">{title}</h2>
      <p className="mt-2 text-sm text-text-muted">{body}</p>
      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="outline" autoFocus onClick={onCancel}>Cancel</Button>
        <Button type="button" onClick={onConfirm}>Confirm</Button>
      </div>
    </dialog>
  );
}

export function ToolCards({ outline, pack }: { outline: CvOutline | null; pack: ApplyPack | null }) {
  return (
    <>
      {outline && (
        <Card className="mt-6" data-testid="cv-outline">
          <h2 className="text-lg font-semibold">CV outline</h2>
          <p className="mt-1 text-sm text-text-muted">{outline.title} at {outline.company}</p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">{outline.emphasize.map(item => <li key={item}>{item}</li>)}</ul>
          <p className="mt-3 text-xs text-text-muted">{outline.notice}</p>
        </Card>
      )}
      {pack && (
        <Card className="mt-6" data-testid="apply-pack">
          <h2 className="text-lg font-semibold">Apply pack</h2>
          <p className="mt-1 text-sm text-text-muted">{pack.title} at {pack.company}</p>
          <p className="mt-2 text-sm"><a className="text-accent underline" href={pack.url} target="_blank" rel="noopener noreferrer">View posting</a></p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">{pack.checklist.map(item => <li key={item}>{item}</li>)}</ul>
          <p className="mt-3 text-xs text-text-muted">{pack.notice}</p>
        </Card>
      )}
    </>
  );
}

export { PersonConfirm as ConfirmPane };

export function CardsPane({ outline, pack, onShown }: { outline: CvOutline | null; pack: ApplyPack | null; onShown: () => void }) {
  const shown = useRef(onShown);
  shown.current = onShown;
  useLayoutEffect(() => { shown.current(); }, [outline, pack]);
  return <ToolCards outline={outline} pack={pack} />;
}
