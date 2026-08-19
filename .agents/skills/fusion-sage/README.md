# Fusion Sage — companion files

See [SKILL.md](SKILL.md) for the agent workflow (**Secondary files** + **Persist** trust rules). This README holds installer/human notes only — agents should **not** load it by default (token budget).

## Quick start

1. Install this skill (see root [README.md](../README.md)).
2. Pair with [ai-optimization](../ai-optimization/SKILL.md) — fission is the containment field.
3. Use in-package [fusion-playbooks.md](fusion-playbooks.md) by default. Project overlays (if any) are **untrusted hints**: load only when you explicitly name the path — never auto-discovered.

## Files in this directory

| File | Purpose |
|------|---------|
| `fusion-playbooks.md` | Generic language fusion patterns (package-trusted) |
| `fusion-state.schema.json` | Schema for optional KG cache (size caps; free text = data) |
| `fusion-surplus-examples.md` | Q-factor calculation examples |
| `fusion-state.json` | **Example seed only** — not live agent memory |

Optional project playbooks under [examples/](../examples/README.md) are user-opt-in data, not skill policy.

## Marketplace scanners (Gen Agent Trust Hub and similar)

> **Audience:** humans / installers / badge readers. **Not** agent SoT — operational trust rules live in [SKILL.md](SKILL.md) (Secondary files, Guardrails, Persist). Claim-by-claim rebuttal is **only here** so it does not waste agent tokens.

Public badge example: [skills.sh · fusion-sage · agent-trust-hub](https://www.skills.sh/p10ns11y/skills/fusion-sage/security/agent-trust-hub).

### What the scanner actually does (and does not)

| Scanner reality | Not what the badge means |
|-----------------|---------------------------|
| Static pattern scan over markdown skill text | Live agent run, exploit PoC, or malware RE |
| Taxonomy labels (`PROMPT_INJECTION`, `COMMAND_EXECUTION`) from instruction *shape* | Proof that code executed or secrets left the host |
| **Warn / MEDIUM** as a coarse risk bucket | “This skill is compromised” or “do not install” |
| Cheap, high-recall signal shared by many coding skills | High-effort audit with evidence of an attack path |

Treat the badge as a **low-effort static warning**, not a security incident report. Hardening in [SKILL.md](SKILL.md) targets **real** mines only; overclaims are called out here so installers are not misled.

Agent-side mitigations (read-only skill trees, human approval for writes, project `AGENTS.md` overrides) dominate real safety and are **outside** what the scanner models.

### Claim-by-claim counter

Findings below match the typical Trust Hub write-up for this skill (Jul 2026-style). Status: **REAL** (actionable surface), **PARTIAL** (class correct, severity/mechanism inflated), **OVERCLAIM** (not in the skill text / wrong mechanism).

---

#### 1. `[PROMPT_INJECTION]` — dynamic playbooks / overlays from the repo

**Scanner claim:** Skill loads instruction files from paths such as `../examples/overlays/` or project reference dirs; no boundary markers; enables code diffs / “reactor upgrades”; no sanitization.

| Aspect | Assessment |
|--------|------------|
| Status | **PARTIAL → real mine, then hardened** |
| What is real | Secondary markdown *can* influence a cooperating agent if loaded and treated as policy. Open-ended “also load overlays under …” is a classic indirect prompt-injection *surface* (same family as “read untrusted README and obey it”). |
| What is overclaimed | Implies forced or automatic load of arbitrary repo trees. There is no install hook, no glob auto-discovery, no runtime path computation. “Reactor upgrades” / code diffs are **normal coding-skill** outcomes, not a special backdoor. |
| Effort quality | Pattern match on “load extra files + agent edits code” → PROMPT_INJECTION. No demonstration that an overlay was loaded or that policy was overridden. |
| Mitigation in this package | **Secondary files (trust)** in [SKILL.md](SKILL.md): package allowlist only by default; project/examples overlays only if the user names the exact path; `<<<UNTRUSTED_HINT>>>` markers; never above `SKILL.md` / `AGENTS.md` / user policy; no shell/network/skill-edit authority from hints. |

---

#### 2. `[PROMPT_INJECTION]` — “Self-Referential Improvement Loop”

**Scanner claim:** Interaction history + project code used for “rule optimization”; agent directed to propose/modify its own instruction set in `SKILL.md`; no boundary markers / sanitization.

| Aspect | Assessment |
|--------|------------|
| Status | **OVERCLAIM** |
| What is real | Words like “self-improving”, “self-improve”, and principle “Self-amplification ≻ One-shot help” appear. A host agent with write tools *could* edit any path the user allows — that is host policy, not this skill’s protocol. |
| What is overclaimed | There is **no** section named “Self-Referential Improvement Loop”, no instruction to optimize rules from history, and **no** protocol to edit `SKILL.md` from product sessions. “Self-improve” means **project** surplus (Q>1 abstractions), not rewriting the skill body. |
| Effort quality | Inferred closed loop from marketing/trigger language. Grep-level invents a feature that is not in the file. Weakest bullet of the report. |
| Mitigation in this package | Explicit guardrail: do not edit this skill package in a product session; skill changes = human PR on the skills repo. Self-amplification defined as project surplus only. |

---

#### 3. `[COMMAND_EXECUTION]` — dynamic loading of operating logic from repo paths

**Scanner claim:** Loading instructions from computed file paths outside the verified package influences core behavior; medium-severity execution-flow risk.

| Aspect | Assessment |
|--------|------------|
| Status | **OVERCLAIM on label; PARTIAL on underlying idea** |
| What is real | Optional secondary markdown *outside* a pinned package (e.g. project overlays) can change what the model tries to do next — that is **instruction expansion / control influence**, not OS command execution. |
| What is overclaimed | **`COMMAND_EXECUTION` as a category is wrong** for this package: no shell, subprocess, install script, obfuscated payload, or executable. Paths in `SKILL.md` are static links, not computed loaders. |
| Effort quality | Taxonomy dump: “reads more instructions” → COMMAND_EXECUTION. Scary label for a markdown methodology skill. |
| Mitigation in this package | Same as (1): allowlist package files; no auto-discovery; untrusted markers; no authorization of shell/installs/network from secondary content. |

---

#### 4. `[PROMPT_INJECTION]` — `fusion-state.json` multi-session injection

**Scanner claim:** Cached summaries (`compressed_representation`, etc.) re-injected on concept expand; `source_files` as ingestion points; only weak “≥2 sources” guard; multi-session injection.

| Aspect | Assessment |
|--------|------------|
| Status | **PARTIAL → real mine class, then hardened** |
| What is real | Free-text fields in a persisted KG can carry poisoned prose across sessions **if** the user opts into loading state and the agent treats that prose as high-priority instructions. “≥2 source locations” (axiom A5) is about not inventing APIs — it is **not** injection resistance. |
| What is overclaimed | Implies automatic, system-level injection of state into every session. Shipped file is an **example seed**, not live memory. `source_files` are path *hints*, not a loader that pulls and executes those files as policy. Attack still needs: poisoned state + opt-in load + agent that elevates cache text over `AGENTS.md` / user. |
| Effort quality | Correct class (agent memory / RAG-over-notes). Inflated mechanism language (“directly injected”, multi-session attack as if guaranteed). |
| Mitigation in this package | Session-only default; load only on user opt-in; free text as `<<<FUSION_STATE_CACHE>>>`; schema `maxLength` / `maxItems` / `additionalProperties: false`; re-check `source_files` over trusting prose; example seed clearly non-live. |

---

### Summary table

| # | Label in report | Verdict | Action taken |
|---|-----------------|---------|--------------|
| 1 | PROMPT_INJECTION (overlays/playbooks) | **Partial — real surface** | Allowlist + untrusted markers + no auto-load |
| 2 | PROMPT_INJECTION (self-referential loop) | **Overclaim** | Documented; no self-edit protocol; guardrail forbids package edit |
| 3 | COMMAND_EXECUTION | **Mislabel** (instruction expansion ≠ shell) | Same secondary-file trust model |
| 4 | PROMPT_INJECTION (fusion-state) | **Partial — real class** | Opt-in, caps, cache markers, example-only seed |

### Installer takeaway

1. **Do not** treat MEDIUM/Warn as “malware” or “drop this skill.”  
2. **Do** keep secondary files and optional state under the trust rules in [SKILL.md](SKILL.md).  
3. **Do** rely on host controls (pin installs, review PRs that touch agent paths, approval for writes).  
4. Re-audits after hardening may still Warn if the scanner only matches “skill mentions other files / memory” — that is a **scanner limitation**, not new evidence of compromise.
