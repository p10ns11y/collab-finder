---
name: verify-machine-seam
description: >
  Adopt verify, a generative XState suite, an adaptate+Zod seam, and a public
  alias preflight. Triggers: verify machine seam, generative state machine,
  adaptate form, host alias preflight, /verify-machine-seam.
---

# Verify, machine, seam, alias

## When to use

- A pure reducer should become an XState machine with coverage that grows from the graph.
- A form has one optional base schema and a consumer that marks fields required.
- A public repo needs a preflight for host aliases, floating Actions tags, and credential-shaped strings.

## Steps

1. Keep the project verify entry (`pnpm verify` here) as the runner. Do not replace the verify router.
2. Model the behavior with `createMachine`. Expose a pure step (`transition` / reducer) for callers that are not React.
3. Generate paths with `createTestModel` from `@xstate/graph`:
   - `getShortestPaths` for one path per reachable serialized state
   - `getSimplePaths` for status sequences
   - `path.test({ states, events })` for postconditions
   Plan events once. Do not hand-write one test per path.
4. Form seam: one Zod object with optional fields, then `transformSchema` from `@adaptate/core` and a consumer config that sets required fields. Parse at the submit boundary.
5. Alias preflight (`bash scripts/ci-fitness.sh` in this repo):
   - private hostnames and `/home/<user>` or `/Users/<user>`
   - Tailscale carrier-grade NAT addresses and VNC logins
   - `uses:` refs that are not a 40-character commit SHA
   - credential-shaped tokens
   Public machine names: `laptop-1`, `laptop-2`, `mac-mini`.

## Done when

- Domain verify exits 0 and prints a path count that includes every machine status.
- The form test shows the base schema accepting a partial object and the consumer schema rejecting it.
- The alias preflight exits 0 on a clean tree.

## Do not

- Snapshot HTML as proof of the machine.
- Assert `true` or compare the machine to itself.
- Print live hostnames, home directories, or tokens in the skill, the PR, or the docs.

## Deferred

- `src/core/domain/opportunity-pipeline.ts` — XState clone of pipeline outcome is backlog; do not port it in the panel PR.
- `pnpm mutate:xai-panel` runs Stryker on `src/core/domain/xai-key-panel.ts` only. It is outside `pnpm verify` (about a minute). The known survivor is the machine `id` string; the panel does not read it. Do not add the mutator to the verify router.
- `src-tauri/src/opportunity_target.rs` integration tests that skip when a devprofile path is missing still duplicate the path write. Leave them until that file is the task.
