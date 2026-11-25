import { useEffect, useLayoutEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';
import type { ApplyPack, CvOutline } from './page-tools.ts';

let confirmChunkTry = 0;
const confirmLoaders = [
  () => import('./person-confirm.tsx'),
  () => import('./person-confirm.tsx?r=1'),
  () => import('./person-confirm.tsx?r=2'),
  () => import('./person-confirm.tsx?r=3'),
  () => import('./person-confirm.tsx?r=4'),
  () => import('./person-confirm.tsx?r=5'),
];
const loadConfirmChunk = () => confirmLoaders[Math.min(confirmChunkTry, confirmLoaders.length - 1)]!();

function useConfirmChunk<T>(pick: (mod: typeof import('./person-confirm.tsx')) => T, onUnavailable: () => void) {
  const [value, setValue] = useState<T | null>(null);
  const fail = useRef(onUnavailable);
  fail.current = onUnavailable;
  useEffect(() => {
    let live = true;
    const n = confirmChunkTry;
    loadConfirmChunk().then(
      mod => { if (live) setValue(() => pick(mod)); },
      () => {
        if (confirmChunkTry === n) confirmChunkTry += 1;
        if (live) fail.current();
      },
    );
    return () => { live = false; };
  }, [pick]);
  return value;
}

const pickConfirm = (m: typeof import('./person-confirm.tsx')) => m.PersonConfirm;
const pickCards = (m: typeof import('./person-confirm.tsx')) => m.ToolCards;

function NotifyShown({ onShown, children }: { onShown: () => void; children: ReactNode }) {
  useLayoutEffect(() => { onShown(); });
  return children;
}

export function ConfirmPane({ title, body, onConfirm, onCancel, onUnavailable }: {
  title: string; body: string; onConfirm: () => void; onCancel: () => void; onUnavailable: () => void;
}) {
  const Pane = useConfirmChunk(pickConfirm, onUnavailable);
  if (!Pane) return null;
  return <Pane title={title} body={body} onConfirm={onConfirm} onCancel={onCancel} />;
}

export function CardsPane({ outline, pack, onShown, onUnavailable }: {
  outline: CvOutline | null; pack: ApplyPack | null; onShown: () => void; onUnavailable: () => void;
}) {
  const Pane = useConfirmChunk(pickCards, onUnavailable);
  if (!Pane) return null;
  return <NotifyShown onShown={onShown}><Pane outline={outline} pack={pack} /></NotifyShown>;
}
