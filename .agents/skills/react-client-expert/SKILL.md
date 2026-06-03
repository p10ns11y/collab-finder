---
name: react-client-expert
description: >-
  Senior client-side React (no RSC for UI): minimal state, deliberate effects,
  use() + Suspense and TanStack Query for data, XState for complex flows, refs,
  restrained Context. Use for components, hooks, fetching, effects, or client
  refactors in .tsx files.
---

# React client expert

**Scope:** Client components only (`"use client"` where Next requires it). **Do not** use **async Server Components** or server `async` pages for interactive UI state — that is RSC. **Do** use client hooks (`use`, TanStack Query, etc.) for data that drives client UI.

**Lint:** This repo disables Biome `useExhaustiveDependencies`. Do **not** “fix” effects by stuffing the dependency array to silence tooling. Fix the **model** (derive, ref, extract, query, state machine) per sections below.

---

## Data fetching: not the same as RSC

React supports **two different** “async component” ideas. Do not conflate them.

| Mechanism | Where | What it is |
|-----------|--------|------------|
| **`async function` Server Component** | Server only (no `"use client"`) | RSC: await on server, HTML/stream to client. **Out of scope** for interactive client logic in this skill. |
| **`use(promise)` / `use(context)`** | **Client** components (React 19+) | Read a Promise (or context) **during render**; suspend to nearest `<Suspense>` until settled. Valid, simple client fetch flow. |
| **TanStack Query** (`useQuery`, `useMutation`, …) | **Client** | Cache, dedupe, background refetch, invalidation, optimistic updates. Default for non-trivial client data. |
| **`useEffect` + `fetch` + `useState`** | Client | Legacy pattern — avoid for load-by-key; use Query or `use()` instead. |

**Mental model:** RSC fetches on the **server** before/at stream time. `use()` fetches/suspends on the **client** render path. React Query owns **client cache + lifecycle** on top of either.

### `use(promise)` + Suspense (simple client flow)

Good when: one-shot read, promise created **outside** the child (or passed as prop), tree already has Suspense, no shared cache/invalidation needs yet.

```tsx
"use client";

import { Suspense, use } from "react";

function UserDetails({ userPromise }: { userPromise: Promise<User> }) {
  const user = use(userPromise); // suspends until resolved
  return <p>{user.name}</p>;
}

export function UserPanel({ userPromise }: { userPromise: Promise<User> }) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <UserDetails userPromise={userPromise} />
    </Suspense>
  );
}
```

Rules:

- **Must** have a `<Suspense>` boundary above (or route-level fallback in frameworks that wire it).
- Prefer passing a **stable promise** (started once per key), not `use(fetch())` inline every render without caching — that refires work.
- For **errors**, use an error boundary or Query’s `isError` — `use()` throws the promise’s rejection to the boundary.
- Pair with **event-driven refetch** by bumping a `key` or passing a **new** promise when inputs change — or graduate to React Query.

### TanStack Query (default for real apps)

Prefer **`@tanstack/react-query`** when you need any of:

- Same data in multiple components (shared cache)
- `staleTime` / `gcTime`, background refetch, window focus refetch
- Mutations + `invalidateQueries` after POST/PATCH
- Pagination, infinite scroll, parallel `useQueries`
- Devtools and predictable loading/error flags without custom effect soup

```tsx
"use client";

import { useQuery } from "@tanstack/react-query";

function Projects() {
  const { data, isPending, isError, error } = useQuery({
    queryKey: ["projects"],
    queryFn: () => fetch("/api/projects").then((r) => r.json()),
  });
  if (isPending) return <p>Loading…</p>;
  if (isError) return <p>{error.message}</p>;
  return <ul>{data.map((p) => <li key={p.id}>{p.name}</li>)}</ul>;
}
```

Wrap the app (or feature subtree) in `QueryClientProvider` once. **No `useEffect` for the initial fetch.**

### Combining `use()` and React Query

Common split:

1. **Server / loader** (or parent) starts work and passes `userPromise` for fast first paint + `use()` in a Suspense child.
2. **Client** uses `useQuery` for refreshes, filters, and mutations after hydration.

Or: `queryFn` only inside React Query and skip `use()` — simplest mental model for agents unless there is an explicit streaming/promise prop contract.

### What to avoid

```tsx
// ❌ Manual fetch state machine
const [data, setData] = useState(null);
const [loading, setLoading] = useState(true);
useEffect(() => {
  fetch(url).then(setData).finally(() => setLoading(false));
}, [url]);

// ✅ useQuery — or use(promise) + Suspense for a single suspendable read
```

```tsx
// ❌ Using async function component on the client for “hooks-style” fetch
// async function ClientPage() { const x = await fetch(...); } // not valid client pattern

// ✅ "use client" + use() or useQuery
```

---

## Mental model (how React actually runs)

1. **Render = pure function of props + state + context** for that component. Same inputs → same output. Side effects do not belong in render.
2. **Commit** applies DOM updates. `useLayoutEffect` runs before paint; `useEffect` after paint.
3. **Re-render** is triggered by `setState`, context value change (if consumed), or parent re-render (unless memoized away).
4. **Stale closures** happen when an effect or callback captures old state/props because dependencies were wrong *or* because logic should have lived in a ref / event / store instead of an effect.

Prefer [React docs — You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect) as the default decision guide.

---

## State: default to zero `useState`

| Need | Prefer | Avoid |
|------|--------|--------|
| Value computable from props/other state | **Derive during render** (`const x = f(props)`) | `useState` + `useEffect` to sync |
| Expensive pure derivation | `useMemo(() => …, [deps])` only if profiled or clearly hot | Memoizing everything |
| Form field tied to DOM | Controlled input **or** uncontrolled + ref | Duplicating DOM value in state |
| Shared remote/server data | **TanStack Query**; simple read: **`use(promise)`** + Suspense | Manual `useEffect` + `useState` fetch |
| One-off suspendable read (promise from parent) | **`use(promise)`** inside `<Suspense>` | `useEffect` + loading boolean |
| **Interconnected form + async UI** (question, result, loading, error) | **`useReducer`** + **status enum** (`idle` / `loading` / `error` / `success`) | Separate `useState` booleans that must stay in sync |
| Multi-step UI, guards, async orchestration | **XState** (or similar FSM/store) | Chains of `useEffect` + boolean flags |
| High-frequency updates (pointer, scroll) | Ref + direct DOM / rAF; **not** context | `setState` on every move |
| Theme / auth “read mostly” | Context with stable value + split providers | One giant context updated often |

**Rule:** If you can write `const visible = isOpen && items.length > 0`, do not add `useState(visible)` and sync in an effect.

### `useReducer` for form + async submit flows

When several pieces of UI state change together on submit (input value, active selection, loading, error message, result payload), prefer a **single reducer** over scattered `useState` calls.

Use a **status enum** instead of independent `loading` / `error` booleans — they encode mutually exclusive phases and prevent impossible combinations (`loading && error`).

```tsx
type Status = "idle" | "loading" | "error" | "success";

type State = {
  question: string;
  status: Status;
  result: Result | null;
  error: string | null;
  activeQuestion: string | null;
};

type Action =
  | { type: "SET_QUESTION"; question: string }
  | { type: "SUBMIT_START"; question: string }
  | { type: "SUBMIT_SUCCESS"; result: Result }
  | { type: "SUBMIT_ERROR"; error: string }
  | { type: "RESET" };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "SET_QUESTION":
      return { ...state, question: action.question };
    case "SUBMIT_START":
      return {
        ...state,
        question: action.question,
        activeQuestion: action.question,
        status: "loading",
        result: null,
        error: null,
      };
    case "SUBMIT_SUCCESS":
      return { ...state, status: "success", result: action.result };
    case "SUBMIT_ERROR":
      return { ...state, status: "error", error: action.error };
    case "RESET":
      return initialState;
    default:
      return state;
  }
}
```

**When to stop at `useReducer` vs graduate to XState / React Query:**

- **`useReducer`** — one feature, one submit flow, no shared cache, transitions are linear (idle → loading → success/error). Colocate reducer in `feature-state.ts`.
- **React Query `useMutation`** — same flow but you want retries, dedupe, or invalidation after submit.
- **XState** — guards, parallel states, cancellation, debounced transitions, or graphs too large for a flat enum.

Derive UI flags from status during render: `const isLoading = status === "loading"` — do not store `loading` as separate state.

---

## `useEffect`: last resort, always justified

Use `useEffect` only when synchronizing with **something outside React’s render**:

- Subscriptions (WebSocket, `addEventListener`, observers)
- Imperative widgets (maps, charts, third-party DOM)
- Logging/analytics **after** commit
- Browser APIs without a React wrapper

**Do not use `useEffect` for:**

- **Initial / keyed data load** → `useQuery` or `use(promise)` + Suspense
- Transforming data for render → derive in render / `useMemo`
- Resetting state when props change → [key on component](https://react.dev/learn/you-might-not-need-an-effect#resetting-all-state-when-a-prop-changes) or derive
- Chaining user events → event handlers
- Notifying parent → call parent callback in the handler

When an effect is correct:

```tsx
useEffect(() => {
  const ac = new AbortController();
  // setup…
  return () => {
    ac.abort();
    // teardown: remove listeners, cancel timers, disconnect observers
  };
}, [/* stable, intentional deps only */]);
```

**Dependency arrays:** Include values the effect **semantically** depends on. Omit only when:

- Effect must run **once on mount** (document why), or
- Value is a ref (`ref.current`) or stable store selector designed for it, or
- Logic moved to `useEffectEvent` (React 19+) for non-reactive reads

Never add unstable inline functions/objects to deps without `useCallback`/`useMemo` **when the effect truly needs them** — better: move handler out of effect or use refs.

---

## Refs: DOM-synced and instance state

| Pattern | Use |
|---------|-----|
| `useRef<T>(initial)` | Mutable instance value that must **not** trigger re-render (timers, last size, mounted flag, imperative handle) |
| **Callback ref** `ref={(el) => …}` | Measure DOM, attach non-React library, focus when node mounts |
| `forwardRef` + `useImperativeHandle` | Rare; parent needs imperative API on child |

```tsx
// DOM measurement without render churn
const roRef = useRef<ResizeObserver | null>(null);
const setContainerRef = useCallback((node: HTMLDivElement | null) => {
  roRef.current?.disconnect();
  if (!node) return;
  roRef.current = new ResizeObserver(([entry]) => {
    // update ref or external store — avoid setState per frame unless throttled
  });
  roRef.current.observe(node);
}, []);
```

Do not mirror `ref.current` into `useState` on every resize tick unless the UI truly must re-render at that rate.

---

## Context: narrow, stable, split

- **Split providers** by update frequency (theme vs session vs high-churn UI).
- **Memoize `value`** only when the object identity would force useless re-renders; better: pass `useMemo` primitives or use a store.
- For selectors, prefer **Zustand / Jotai / XState** over custom context + `useReducer` when many consumers need slices.
- Avoid putting “chat messages”, “scroll position”, or animation progress in context.

---

## XState and complex client flows

Reach for **XState v5** when you have:

- Explicit states (idle / loading / error / success)
- Guards (“can submit if valid”)
- Parallel regions or spawned actors
- Retries, cancellation, debounced transitions

Keep machines **colocated** with the feature (`featureMachine.ts`) and wire with `@xstate/react` `useMachine` / `useActor`. UI components stay thin: `state.matches('loading')`, `send({ type: 'SUBMIT' })`.

Do not replicate the same graph with five `useEffect`s and four `useState` booleans.

---

## Component design

1. **Containers vs presentation** — data/orchestration at top; dumb UI accepts props (easy reuse, test, Storybook).
2. **Composition over props drilling** — `children`, render props, or slots; not deep optional-prop trees.
3. **Colocate** state with the subtree that needs it; lift only when two branches must stay in sync.
4. **Keys** — stable IDs for lists; remount with `key={id}` when resetting local state is intentional.
5. **Events** — handlers named `onSubmit`, `onClose`; avoid `useEffect` that watches props to “react” to parent.

**React 19 client notes (no RSC for UI logic):**

- **`use(promise)`** — client suspend-on-read; requires Suspense; see [Data fetching](#data-fetching-not-the-same-as-rsc).
- **`useActionState` / form actions** — OK at client boundaries if already using Next patterns; don’t duplicate the same field in `useState`.
- **`useOptimistic`** — instant UI before server ack.
- **`useEffectEvent`** — latest handler inside an effect without extra deps.

---

## Performance (only when measured)

- `React.memo` on **hot** leaf components with stable props.
- `useCallback` when passing to memoized children or as effect dep you truly need.
- Virtualize long lists; `content-visibility` for heavy static sections.
- `useDeferredValue` / `startTransition` for expensive render during typing.

Default: **no** memoization until profiling or obvious child cost.

---

## Review checklist (PR / refactor)

- [ ] Can any `useState` + `useEffect` pair become a derive or `key` reset?
- [ ] Does interconnected submit/async UI use `useReducer` + status enum instead of boolean soup?
- [ ] Does each `useEffect` have cleanup where it subscribes or schedules work?
- [ ] Would a machine/store shrink boolean soup?
- [ ] Is context update frequency safe for all consumers?
- [ ] Are refs used for DOM/imperative instead of render-loop `setState`?
- [ ] Fetching via Query / `use()` — not `useEffect` load + `useState`?
- [ ] No async **Server** Component for interactive UI; client boundary minimal?

---

## Anti-patterns (reject in review)

```tsx
// ❌ Sync derived state
const [fullName, setFullName] = useState("");
useEffect(() => {
  setFullName(`${first} ${last}`);
}, [first, last]);

// ✅
const fullName = `${first} ${last}`;
```

```tsx
// ❌ Fetch on every dep churn without abort
useEffect(() => { fetch(url).then(setData); }, [url]);

// ✅ AbortController + loading/error in machine or query hook
```

```tsx
// ❌ Scattered submit state
const [loading, setLoading] = useState(false);
const [error, setError] = useState<string | null>(null);
const [result, setResult] = useState<Result | null>(null);
// each handler must remember to flip all four — easy to desync

// ✅ useReducer + status enum — see [useReducer for form + async submit flows](#usereducer-for-form--async-submit-flows)
```

```tsx
// ❌ Giant Context updated every keystroke
<AppContext.Provider value={{ query, setQuery, …500 fields }}>

// ✅ Local state or focused store / state chart
```

---

## Related repo docs

- Biome: `useExhaustiveDependencies` is **off** — follow this skill, not mechanical dep fixes.
- Next in this repo: pages may be server; **interactive** pieces stay in `src/components` with `"use client"` when needed. Add `@tanstack/react-query` when introducing non-trivial client fetching.
- [React `use` API](https://react.dev/reference/react/use) · [TanStack Query docs](https://tanstack.com/query/latest)
