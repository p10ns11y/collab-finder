---
name: ai-optimization
description: >-
  Fission engine for token-efficient coding (JS, TS, Node, Rust, Python, ML/AI):
  relevance scoring, hierarchical compression, strict token budgets, progressive
  disclosure, accuracy guardrails. Pair with fusion-sage for synthesis/surplus.
  Triggers: tokens, context window, prune, compress, Context Sage, large repo.
---

# ai-optimization (Context Sage)

> **Load rule:** Formal SoT below. Lang playbooks → [references/](references/) only if needed. Expand [references/english-procedure.md](references/english-procedure.md) **only if** scoring/budget still ambiguous.  
> **CLT:** this skill is the primary **agent-extraneous** reducer under [../rules/clt-dual-load.mdc](../rules/clt-dual-load.mdc) — prune before deep/coding fill; do not strip germane VERIFY evidence.

```text
// Signature
Fission  ≔ prune + compress + budget   // this skill
Fusion   ≔ synthesis + surplus         // [fusion-sage](../fusion-sage/SKILL.md)
Score    ∈ 0..100                      // relevance
Budget   ≔ context cap for *input* code/docs (not model CoT)

// Axioms
A1  Relevance ≻ Completeness     // ~80% value from ~5–15% of code
A2  Hierarchy first              // structure before bodies
A3  Language-native compression  // AST/API idioms per lang
A4  Budget dictates form         // lower score → denser form
A5  Progressive disclosure       // expand only on request / auto-expand rules
A6  Correctness ⊥ tokens         // never trade correctness for compression
A7  Evaluate(δ) ≔ (C, E, η)      // keep tactics with Δ>0
```

Pair: [fusion-sage](../fusion-sage/SKILL.md) · [master-planner](../master-planner/SKILL.md) overlays · [examples/overlays/](../examples/overlays/).

---

## Use / skip

| Use when | Skip when |
|----------|-----------|
| repo ≳10k LOC · multi-file change | 1-file typo, full file already pasted |
| "tokens", "context", "Cursor slow/expensive" | pure design chat with no code load |
| implement / debug / refactor with code context | architecture-only → start fusion-sage |
| pasting partial code + "implement X" | |

---

## Flow (internal — do not dump as essay)

```text
intent → map (modules/API surface) → score → compress form → budget trim → act
```

| Step | Do |
|------|-----|
| **1 Intent** | goal ∈ {implement, debug, refactor, explain, test, migrate, optimize}; symbols; scope; constraints |
| **2 Map** | lightweight module + public surface + recent files + arch style |
| **3 Score** | table below (0–100) |
| **4 Form** | score → compression tier |
| **5 Budget** | hard cap **35%** context for input code; reserve **~25%** for reasoning+answer; drop lowest score first |

### Relevance score

| Signal | Δ |
|--------|---|
| symbol exact match | +40 |
| keyword in path/name | +20 |
| centrality (many importers) | +15 |
| business-critical (`auth`, `payment`, `core`, model def) | +15 |
| recency (last ≤3 turns) | +10 |
| `test/` `__pycache__/` `node_modules/` `dist/` `target/` | −50 (*waive* if goal is debug/test — boost instead) |

### Compression tiers

| Score | Form |
|-------|------|
| >85 | full file stripped (noise out) |
| 60–85 | signature + critical blocks + docstring |
| 30–60 | public API + 1-line purpose + key edges |
| <30 | name only + "see prior context" |

### Cross-lang strip rules

- Drop: licenses, generated markers, excess blank lines, repetitive getters  
- Collapse standard validation/error-map to one sentence  
- Use `...` when name+signature+context makes body obvious  
- ≤2 full function bodies per file unless score >90  

Lang detail: [references/typescript-optimizer.md](references/typescript-optimizer.md) · [references/python-optimizer.md](references/python-optimizer.md) · [references/rust-optimizer.md](references/rust-optimizer.md). Optional project overlay under `.agents/skills/ai-optimization/references/` or [examples/overlays/](../examples/overlays/).

---

## Accuracy guardrails (never violate)

| Rule | Detail |
|------|--------|
| **Never compress** | auth, security, payments, secrets, permissions, migrations/schema, lockfile/deps edits, CI/E2E/build config, **files you will edit**, callers of changed symbols (sig+imports min) |
| **Debug / flaky** | full suspect files + config + related tests |
| **Before edit** | if body was summarized → read full file first |
| **No invention** | never invent APIs/patterns not seen |
| **Done** | state assumptions; run verify (`type-check`, `lint`, tests) |

### Task overrides

| Task | Compression |
|------|-------------|
| explain / scout | summaries OK |
| implement | full types + full bodies for files edited |
| debug (esp. flaky/CI) | full suspects + config + tests |
| refactor / rename | full call graph for touched symbols |

### Auto-expand (do not wait)

- Edge cases in summarized body (errors, auth, async/effect deps)  
- User: `expand <symbol>` · `show full <file>` · `use whole project`  
- You would write "assuming standard pattern" without having read it  

### Red flags — stop summarizing

- Diff with no callers/tests noted  
- Skip files required by `AGENTS.md` / project rules  
- One-line summary of complex control flow (`useEffect`, retries, transactions)  

---

## Output protocol

```text
🧠 Context Sage | Budget: Xk / Yk (Z%) | Relevance: R/100 | Files: N (forms…)

## Snapshot   (2–4 lines: stack, key dirs, verify cmds)
## Context    (structured, tiered)
## Action     (minimal diff/answer + assumptions)
## Token note (expand <name> to deepen)
```

**Hand off to fusion-sage when:** architecture / long-term design · "make it better for the future" · 3+ related queries → suggest fusion pass.

---

## IDE

| Host | Action |
|------|--------|
| Cursor | symlink skill; optional [assets/cursorrules-template.md](assets/cursorrules-template.md) → `.cursor/rules/ai-optimization.mdc` |
| Grok / others | install skill dir; description routing |

---

## Self-improve (session)

After success: boost scores of symbols actually used; if user expanded a summary → lower compression next time for similar queries.

**Done when:** intent+scores applied; budget respected; guardrails held; verify cmds run for multi-file edits; fusion handoff noted when architecture.

**Anti-patterns:** dump whole repo "just in case" · compress auth/edit targets · invent unseen APIs · skip verify because "context was tight" · dual-load full English playbooks every turn.

Script helper: [scripts/context-sage.py](scripts/context-sage.py). English expansion: [references/english-procedure.md](references/english-procedure.md).
