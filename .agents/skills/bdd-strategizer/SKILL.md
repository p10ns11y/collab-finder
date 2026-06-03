---
name: bdd-strategizer
description: Generic high-quality BDD/TDD strategist for complex projects of any size. Decomposes large refactors into core-first test slices, contract-first invariants, and safe incremental delivery. Triggers on BDD strategy, TDD plan complex, behavior-driven refactor, legacy migration, make this testable.
---

# BDD Strategiser — Generic Core-First, Test-Driven

**Activate on:** any mention of BDD/TDD strategy, complex refactor planning, legacy migration, dual systems, stubs, or "make this testable".

**Core Philosophy**
Turn big, risky refactors into small, verifiable, green slices with zero behavior change.

**Immutable Principles**
- Red → green → refactor per slice. Never move to next slice until current is green.
- Core-outward: start with harness + contracts, then stable core, then shell.
- Design-doc / spec invariants first — encode every "must" as a contract test.
- One source of truth for flags/config (never scattered env checks).
- Stubs are temporary scaffolding — replace with real logic before moving on.
- Production safety first: preflight checks + fallback paths before any risky change.

## Generic Strategy Playbook

### Phase 0 — Test Harness (Mandatory First Step)
- Ensure `vitest` / `jest` + `pnpm test:unit` (or equivalent) works.
- Create `contracts.ts` (or `invariants.test.ts`) that encodes all critical behaviors from design docs, specs, or legacy behavior.
- Make `pnpm test:unit` the single source of truth for the refactor.

### Slice 1 — Contracts (Types + Public API)
- Write `*.contract.test.ts` for every public interface, type, and response shape.
- Fail fast on any drift from legacy contracts or design specifications.

### Slice 2 — Core Journey (User Flow)
- Break the feature into major steps of the user journey.
- One test file (`.feature.test.ts` or `*.contract.test.ts`) per major step.
- Use `describe.each` or matrix testing over configuration/env variations.

### Slice 3 — Safety & Fallbacks
- Explicitly test dual-path / legacy + new path behavior.
- Ensure new path falls back to old behavior on error.
- Add preflight checks before any external calls or risky operations.

### Slice 4 — Stubs → Real Implementation
- Merge or replace stub modules with real logic.
- Ensure all test symbols are properly exported from barrels.
- Remove duplicate function names and confusing exports.

### Slice 5 — Orchestration & Gateway
- Extract orchestration logic into clean pipeline stages (discriminated unions preferred).
- Create a thin gateway/wrapper that owns caching, mode selection, and fallback.
- Keep route/handler files minimal (ideally <15 lines).

### Slice 6 — Structure & Hygiene (Last Step)
- Perform folder reorganization only after all tests are green.
- Use temporary re-export shims during transition if needed.
- Remove excessive meta-comments, PR references, and outdated documentation.
- Keep only invariants, non-obvious workarounds, and clear decision records.

## For Highly Complex Projects
- First map all pain points (duplicate names, stub drift, stale docs, tangled dependencies).
- Shape folders around user flow, not technical layers.
- Use state machines (e.g. XState) only for complex client UX (streaming, retries, cancellation) — not for simple config/flags.
- Add generation controls (token limits, temperature, style prompts) as a dedicated config module when relevant.
- Maintain a "Production vs Branch" matrix in README before any deployment.

## Required Output Format (Always Use This)
1. One-sentence goal + key risk controls
2. Phased todo list (with id, description, and test type)
3. Mermaid diagram of the current slice / flow
4. Exact command to run tests after the phase
5. "Fusion surplus" — one concrete change that will reduce future token/effort cost by 3× or more

**When stuck:** Run the unit test command with grep for `contract|invariant|feature|golden` and expand only the failing lowest-relevance slice.

**Never do:**
- Big-bang moves
- Implement code before writing the contract test
- Ignore documented invariants or design specs

This generic strategist turns any large, messy codebase into clean, testable, incrementally delivered slices while protecting production behavior.
