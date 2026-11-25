import { Button } from './components/ui/button.tsx';

export function PersonConfirm({ title, body, onConfirm, onCancel }: { title: string; body: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <dialog open aria-modal="true" aria-labelledby="person-confirm-title" data-testid="person-confirm"
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
