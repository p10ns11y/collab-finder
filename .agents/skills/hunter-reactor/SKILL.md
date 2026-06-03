---
name: hunter-reactor
description: The core autonomous, self-guarded decision and execution loop for collab-finder. Handles opportunity discovery (X search), analysis (xAI + CV + X skill.md context), prep generation, tracking, and promote with built-in guards (cost, rate, fit, CV mutation), pauses for human intervention, smart intelli decisions (structured xAI "recommend next action + confidence"), and logging. Use for designing, implementing, or debugging the agentic heart of the app. Fission for tight loops; fusion for the overall reactor architecture and surplus (cheaper future decisions, better guards).
---

# Hunter Reactor — Self-Guarded, Pause-Aware, Agentic Opportunity Engine

**Core Mission**: Turn raw X firehose + your CV + xAI into a reliable, low-intervention personal opportunity system. The reactor decides what to pursue, prepares materials, tracks outcomes, and improves itself — while **never** acting on high-stakes things (CV changes to public profile, expensive runs, low-confidence fits) without explicit guard clearance and user pause points.

It is the "intelli" part that makes development (and usage) feel exponential: agents can drive large parts of the loop, the loop itself improves with use, and surplus from each cycle compounds the quality of future cycles.

## Immutable Principles (Self-Guards Always Win)

1. **Guard > Speed**: No action crosses a threshold (cost, rate remaining, fit score, CV write) without a named guard check + audit log.
2. **Pause for Human on Ambiguity or Stakes**: Low/medium confidence, any CV promote, high token/cost estimates, X write side-effects → surface summary + explicit "proceed / tweak / ignore" path. User only intervenes when the guard fires.
3. **Full Query + Context Control**: The human/agent always owns the X query. Reactor never hides or hardcodes the "best" search.
4. **Sidecar-First for External Mutation**: CV promote always writes a sidecar proposal first. Master write to devprofile is a separate guarded step with diff + confirm.
5. **Structured + Observable Decisions**: Every xAI "decide" call returns machine-readable recommendation + confidence + guard triggers + rationale (zod/serde). UI + MCP + logs expose it.
6. **Surplus After Every Cycle**: After a search-analyze-prep-promote loop (or sub-part), produce at least one concrete improvement that makes the *next* similar loop cheaper or higher-value (better prompt, tighter guard, new skill, refined CV packet, etc.).
7. **Reversible + Auditable**: All state (leads, preps, decisions) is file-based JSON in app data. Easy to inspect, replay, or roll back. CV promotes produce .bak + git-friendly diffs.

## Reactor Loop (Conceptual State Machine)

```
Search (tunable query + X context)
  → Ingest + Classify (X skill.md helps)
  → Analyze (pruned CV packet + X skill/llms + post → fit, gaps, angle, confidence)
    Guard: cost, rate, basic validity
  → Decide (xAI structured: pursue? score? prep now? pause for user? why?)
    Guards fire here (fit < threshold → low-prio queue; cost > budget → pause)
  → Prep (if cleared): letter, cv-delta, research, outreach (multiple xAI calls, guarded)
  → Present + Track (UI/MCP)
  → Export / Apply (user or approved agent action)
  → Outcome → Learn (update personal context? suggest profile improvement?)
  → Promote (if pattern or explicit): guarded path to devprofile CV
  → Surplus (what made this cycle better/cheaper for the future?)
```

Every arrow has a guard or pause hook.

**Pause / Intervention Points** (exposed in Tauri UI as toasts/dialogs + MCP "ask_user" tool):
- Before expensive xAI batch.
- On fit 60-85 or "interesting but stretch".
- Before any promote.
- On rate limit approaching or cost budget hit.
- On low confidence decision.
- User can always "force" with reason (logged).

## Implementation Patterns (Fission + Fusion)

**Fission (for the tight code)**:
- Prune CV to "CorePacket" before any xAI (relevant experience bullets, projects matching keywords in the post, skills, one-liner + open status).
- Prune X posts (use X skill.md operators knowledge; request only needed fields).
- Token budget on every prompt (35% context rule from ai-optimization).
- Structured output schemas (zod in TS side for UI, serde in Rust).

**Fusion (for the architecture & self-improvement)**:
- Treat the whole thing as a "HunterReactor" state machine (XState in frontend? or Rust + events for durability).
- Cross-cutting: CVPromoteGuard, CostGuard, XRateGuard, DecisionLogger, SurplusGenerator.
- Evolving knowledge: persist "what worked" (successful preps → better future scoring prompts or CV packet refinements).
- Surplus every cycle: "This guard heuristic would have saved 2 xAI calls on the last 5 opportunities."

**MCP / Skill Exposure**:
- The reactor's key entry points become MCP tools (search, analyze, prep, decide, promote).
- Documented in the root SKILL.md (agentskills.io style) so external agents (including future versions of this Grok session) can call them reliably.
- Use the official X skill.md + llms as *live or cached context* inside the reactor's prompts.

**Self-Improvement Loop (the exponential part)**:
After a meaningful cycle or batch:
1. Analyze the trace (decisions, costs, outcomes, where user overrode).
2. Propose 1-2 concrete upgrades (new guard rule, better CV pruning heuristic, refined xAI prompt template, new preset query derived from real wins, improvement to the SKILL.md itself).
3. Track "binding energy" (how many future opportunities or dev tasks this will improve).
4. (Optional) Auto-apply low-risk improvements; pause for high-impact ones.

This is how the system gets dramatically better in days/weeks of use + agentic development.

## Guardrails (Non-Negotiable)

- Never send full raw cvdata.json or full unpruned X threads to xAI unless user explicitly asks for "deep mode" with confirmation.
- Never write to the devprofile CV (or any external) without sidecar + preview + two explicit confirms.
- Always surface X rate limit headers and current estimated spend.
- All autonomous "decide" outputs must include confidence (0-100) and at least one recommended intervention level.
- When using XMCP or xurl, respect their auth and allow-listing for safety.
- In dev of the reactor itself: follow bdd-strategizer for the guard + pause logic (decision tables, "what happens on 429?", "user rejects promote?").

## Activation for Agents Building the Reactor

- Architecture / overall loop / new guard design: "use fusion" or load hunter-reactor + fusion-sage.
- Implementing a specific guard, prompt, or MCP tool: load ai-optimization + relevant (cv-promote-guard, x-agent-resources, tauri-agentic).
- Adding tests or BDD for autonomy: bdd-strategizer.
- Parallel work on Rust backend vs React UI vs prompt library: agent-orchestrator + git-worktrees + concurrent-cli-agents.
- After shipping a slice: generate surplus explicitly.

## Surplus Generation (Mandatory After Reactor Changes)

Every response or PR that touches the hunter must end with:

```
⚡ Hunter Surplus (Q ≈ X.X)
This change would have [saved Y tokens / avoided Z bad decisions / enabled W new autonomous flows] on the last N real opportunities (or during dev).
Concrete future win: [specific example].
Suggested follow-up: [one small thing that compounds].
```

Track in `.agents/skills/hunter-reactor/surplus-log.md` (or fusion-state style).

## Language / Tech Specifics

- **Rust (backend reactor core)**: Durable state (JSON files or simple sqlite), async guards, structured serde for xAI decisions, optional shell to xurl, MCP server (tauri or sidecar).
- **React/TS (UI + MCP client)**: Minimal state (react-client-expert), command palette that feels like talking to the reactor, visual guard status, diff viewers for promotes.
- **Prompts (xAI)**: Always start with current X skill.md excerpt + llms context + pruned CV packet + opportunity. Fission-prune the opportunity text too.
- **MCP surface**: Tools must be safe by default (read-heavy; writes guarded).

## IDE / Agent Integration

- Cursor: Load `hunter-reactor.mdc` (to be created in rules) + fusion-sage.
- This Grok session: Prefix with "hunter-reactor" or just let AGENTS.md route. Use spawn_subagent for guard logic, prep generation, etc.
- The running app: Expose the same reactor via MCP so you can say in chat "use collab-finder to find me 3 collabs this week and prep the best one".

---

**The hunter-reactor is what makes collab-finder *autonomous and high-value*.** It is not a dumb search + generate tool. It is a self-improving, guard-railed agent that does the boring/scary/expensive parts for you and only surfaces the decisions that benefit from your judgment.

Build it with the same care as the X + xAI primitives it consumes. The compounding will be obvious within days.

See also: root `SKILL.md`, `x-agent-resources`, `cv-promote-guard`, `tauri-agentic`, `ai-optimization`, `fusion-sage`, `bdd-strategizer`.
