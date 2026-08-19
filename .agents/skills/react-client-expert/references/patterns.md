# react-client-expert — patterns & samples

Load **only if** [../SKILL.md](../SKILL.md) tables need illustration.

## `use(promise)` + Suspense

```tsx
"use client";
import { Suspense, use } from "react";

function UserDetails({ userPromise }: { userPromise: Promise<User> }) {
  const user = use(userPromise);
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

## TanStack Query

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

Wrap once in `QueryClientProvider`. No `useEffect` for initial fetch.

## useReducer + status enum

```tsx
type Status = "idle" | "loading" | "error" | "success";
type State = {
  question: string;
  status: Status;
  result: Result | null;
  error: string | null;
};
// SUBMIT_START → loading clears error/result; SUCCESS/ERROR flip status only
```

Derive: `const isLoading = status === "loading"`.

## Effect shape

```tsx
useEffect(() => {
  const ac = new AbortController();
  // setup…
  return () => {
    ac.abort();
  };
}, [/* intentional deps */]);
```

## Mental model

1. Render = pure function of props+state+context  
2. Commit → layout effects → paint → `useEffect`  
3. Stale closures → ref / event / store, not more deps theater  

Guide: [You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect)

## Anti-pattern snippets

```tsx
// ❌ derived sync
useEffect(() => setFullName(`${first} ${last}`), [first, last]);
// ✅
const fullName = `${first} ${last}`;
```

```tsx
// ❌ manual fetch machine
useEffect(() => { fetch(url).then(setData); }, [url]);
// ✅ useQuery or use(promise)+Suspense
```

## Links

- [React `use`](https://react.dev/reference/react/use)  
- [TanStack Query](https://tanstack.com/query/latest)  
