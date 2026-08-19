---
name: react-client-expert
description: >-
  Senior client-side React (no RSC for UI): minimal state, deliberate effects,
  use() + Suspense and TanStack Query for data, XState for complex flows, refs,
  restrained Context. Use for components, hooks, fetching, effects, or client
  refactors in .tsx files.
---

# react-client-expert

> **Load rule:** Formal SoT. Code samples + narrative → [references/patterns.md](references/patterns.md) **only if** needed.

```text
// Scope
Client only ("use client" when Next requires)
¬ async Server Components for interactive UI state

// Lint note
Biome useExhaustiveDependencies may be OFF — fix the model, not dep stuffing

// Data preference order
useQuery / useMutation  ≽  use(promise)+Suspense  ≻  useEffect+fetch+useState
```

---

## Fetch: do not conflate RSC vs client

| Mechanism | Layer | Role |
|-----------|-------|------|
| `async` Server Component | server | RSC stream — **out of scope** for interactive client logic |
| `use(promise)` / `use(context)` | client | suspend during render; needs `<Suspense>` |
| TanStack Query | client | cache, dedupe, refetch, invalidation — **default** non-trivial data |
| `useEffect`+`fetch`+`useState` | client | **avoid** for load-by-key |

**Rules for `use(promise)`:** stable promise (not bare `use(fetch())` every render) · Suspense above · rejections → error boundary · refetch via new promise/`key` or graduate to Query.

---

## State: default to zero `useState`

| Need | Prefer | Avoid |
|------|--------|-------|
| computable from props/state | derive in render | sync `useState`+effect |
| expensive pure | `useMemo` if hot/profiled | memo everything |
| form field | controlled **or** uncontrolled+ref | duplicate DOM in state |
| remote data | Query / `use()` | effect fetch soup |
| form+async UI together | **`useReducer` + status enum** | N booleans that desync |
| multi-step / guards / cancel | **XState** | effect chains + flags |
| high-freq (pointer/scroll) | ref + rAF/DOM | context every move |
| theme/auth read-mostly | narrow Context | giant hot context |

```text
status ∈ { idle, loading, error, success }  // mutually exclusive phases
isLoading ≔ status === "loading"           // derive; don't store extra bool
```

**Graduate:** `useReducer` (one feature, linear) → Query mutation (retries/invalidation) → XState (guards, parallel, cancel).

---

## `useEffect`: last resort

**OK:** subscriptions, imperative widgets, post-commit analytics, browser APIs without React wrapper.

**Forbidden uses:** initial/keyed load · transform for render · reset when props change (use `key`) · chain user events · notify parent (call in handler).

When correct: setup + **cleanup** (abort, removeListener, disconnect); deps = semantic only.

---

## Refs / Context / XState / components

| Area | Rule |
|------|------|
| Refs | no re-render needed (timers, last value, DOM measure via callback ref) |
| Context | split by update frequency; avoid high-churn in provider value |
| XState | idle/loading/error/success + guards/parallel/retry → colocate `featureMachine.ts` |
| Components | container vs presentation · colocate state · stable list keys · event handlers not effect-watchers |

**React 19 client:** `use` · `useActionState` · `useOptimistic` · `useEffectEvent` — see [patterns](references/patterns.md).

---

## Perf (measured only)

`memo` / `useCallback` only for hot leaves or true effect deps · virtualize long lists · `startTransition` / `useDeferredValue` for expensive input. Default: **no** memo.

---

## Review checklist

- [ ] `useState`+effect → derive or `key`?  
- [ ] submit/async → reducer+status enum?  
- [ ] each effect has cleanup if it subscribes?  
- [ ] machine/store shrinks boolean soup?  
- [ ] context frequency safe?  
- [ ] refs for DOM/imperative?  
- [ ] Query/`use()` not effect-load?  
- [ ] no async Server Component for interactive UI?  

---

## Anti-patterns

| ¬ | Do |
|---|-----|
| sync derived state in effect | derive in render |
| fetch without abort / Query | Query or abort+cleanup |
| loading+error+result bool soup | status enum + reducer |
| giant Context every keystroke | local state / store / machine |
| async client function component as fetch | `"use client"` + `use`/Query |

**Done when:** client UI follows tables above; no effect-based loaders for keyed data; review checklist green for touched files.

Patterns/code: [references/patterns.md](references/patterns.md).
