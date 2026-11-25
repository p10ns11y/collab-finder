import { StrictMode, useSyncExternalStore, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { createActor } from 'xstate';
import { STATE_VIEW, flow, type FlowEvent, type FlowState } from './machine.ts';
import { SAMPLE } from './sample.ts';
import './flow.css';

const actor = createActor(flow).start();
const subscribe = (fn: () => void) => { const s = actor.subscribe(fn); return () => s.unsubscribe(); };
const send = (e: FlowEvent) => actor.send(e);
const replay = new URLSearchParams(location.search).has('replay');

if (replay) Object.assign(window, { kanithanjFlow: { send, state: () => String(actor.getSnapshot().value) } });
else send({ type: 'POOL_LOADED', size: SAMPLE.length });

const Button = ({ onClick, children }: { onClick: () => void; children: ReactNode }) => (
  <button type="button" className="rounded-md border border-white/20 px-3 py-1.5 hover:bg-white/10" onClick={onClick}>{children}</button>
);

function auto(e: FlowEvent) {
  send(e);
  if (replay) return;
  const s = actor.getSnapshot();
  if (s.value === 'matching') send({ type: 'MATCHED', roles: SAMPLE });
  if (s.value === 'tailoring' && s.context.picked) send({ type: 'TAILORED', outline: { roleId: s.context.picked.id, emphasize: s.context.picked.reasons } });
}

const VIEWS: Record<FlowState, () => ReactNode> = {
  sources: () => <p>Reading the source pool.</p>,
  sourcesFailed: () => <Button onClick={() => auto({ type: 'RETRY' })}>Try again</Button>,
  find: () => (
    <form className="grid gap-2" onSubmit={e => { e.preventDefault(); auto({ type: 'FIND', query: String(new FormData(e.currentTarget).get('q') ?? '') }); }}>
      <label htmlFor="q">What you do</label>
      <input id="q" name="q" className="rounded-md bg-white/5 px-3 py-2" />
      <div><button type="submit" className="rounded-md border border-white/20 px-3 py-1.5">Find roles</button></div>
    </form>
  ),
  matching: () => <p>Matching in your browser.</p>,
  matched: () => (
    <ul className="grid gap-2">
      {actor.getSnapshot().context.roles.map(r => (
        <li key={r.id} className="flex items-center justify-between gap-4 rounded-md bg-white/5 p-3">
          <span>{r.title} · {r.company}</span>
          <Button onClick={() => auto({ type: 'PICK', id: r.id })}>Tailor for {r.company}</Button>
        </li>
      ))}
    </ul>
  ),
  tailoring: () => <p>Building the CV outline.</p>,
  tailored: () => (
    <div className="grid gap-2">
      <p>Lead with: {actor.getSnapshot().context.outline?.emphasize.join(', ')}</p>
      <div className="flex gap-2"><Button onClick={() => auto({ type: 'PACK' })}>Show apply pack</Button><Button onClick={() => auto({ type: 'BACK' })}>Back</Button></div>
    </div>
  ),
  pack: () => (
    <div className="grid gap-2">
      <ul className="list-disc pl-5">{actor.getSnapshot().context.pack?.checklist.map(c => <li key={c}>{c}</li>)}</ul>
      <div className="flex gap-2"><Button onClick={() => auto({ type: 'REQUEST_CONFIRM' })}>Apply</Button><Button onClick={() => auto({ type: 'BACK' })}>Back</Button></div>
    </div>
  ),
  confirming: () => (
    <div role="dialog" aria-label="Person confirm" className="grid gap-2 rounded-md border border-white/20 p-3">
      <p>Confirm that you will open the posting and apply yourself. Nothing is sent from this page.</p>
      <div className="flex gap-2"><Button onClick={() => auto({ type: 'CONFIRM' })}>I confirm</Button><Button onClick={() => auto({ type: 'CANCEL' })}>Cancel</Button></div>
    </div>
  ),
  confirmed: () => (
    <div className="grid gap-2">
      <a className="underline" href={actor.getSnapshot().context.pack?.url} rel="noreferrer noopener" target="_blank">Open the posting</a>
      <Button onClick={() => auto({ type: 'BACK' })}>Back to roles</Button>
    </div>
  ),
};

function Flow() {
  const state = useSyncExternalStore(subscribe, () => actor.getSnapshot());
  const value = String(state.value) as FlowState;
  return (
    <main className="mx-auto grid max-w-2xl gap-4 p-6" data-state={value}>
      <p className="text-sm opacity-70">Sample data only. Sources · find · match · tailor · apply pack · person confirm.</p>
      <h1 className="text-2xl font-semibold">{STATE_VIEW[value]}</h1>
      {state.context.error && <p role="status">{state.context.error}</p>}
      {VIEWS[value]()}
      <p className="text-sm opacity-70">Applied: no · Sent: no</p>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><Flow /></StrictMode>);
