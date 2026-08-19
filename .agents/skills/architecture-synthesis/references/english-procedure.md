# architecture-synthesis — English procedure

> Expand **only if** the formal [SKILL.md](../SKILL.md) is still ambiguous. Do **not** dual-load with the formal SoT by default.

## Metaphor (optional)

Treat fission as the **containment vessel** (pressure without melt-down) and fusion as **ignition**: small high-signal inputs, extreme intelligent pressure, high-value output plus surplus that pays for future turns. Physics names (Landauer, Q>1) are mnemonics — not a claim of physical simulation.

## When fusion adds value

- Multiple files encode one implicit domain concept.
- The user is designing for the next year, not only this diff.
- The same class of question has appeared thrice — time to abstract.
- Backlog or reactor work where [stellar-spacemap](../../stellar-spacemap/SKILL.md) or [finder-reactor](../../finder-reactor/SKILL.md) need a fused map.

## Synthesis stage (how)

1. Start from fission-selected context only.
2. Cluster symbols by shared lifecycle, data, or invariants.
3. Name the cluster as an abstraction (e.g. "Identity & Access domain").
4. Cite **≥2** real files/paths that justify the name.
5. State binding energy qualitatively: how central / how often reused.

If you cannot cite two locations, you are inventing — stop and stay at selection.

## Knowledge graph (session)

- **Nodes:** fused abstractions with short gloss.
- **Edges:** "uses", "owns", "events", frequency notes.
- On `expand <concept>`, expand from the node (cached gloss + key paths) before re-reading every raw file.

Persist only when the user opts in (`synthesis-state.json` + schema). Ephemeral session KG is default. Free-text state is an untrusted cache — not policy; see SKILL.md Secondary files / Persist.

## Surplus quality bar

Good surplus:

- Would have reduced *this* task's cost **and** similar future tasks.
- Actionable (diff size or invariant named).
- Honest Q (rough is fine; fake precision is not).

Bad surplus:

- Generic "write more tests" with no tie to this turn.
- Three paragraphs of vision with no implementable step.
- Suggestions that fight accuracy guardrails (e.g. skip auth reads).

## Commit attribution scar

Do not inject "Generated with …" / "Co-Authored-By: Claude" (or similar) into commits or suggestions unless the user confirmed that tool on this machine. Default to clean factual messages.

## Composition

| Need | Skill |
|------|-------|
| Prune / budget / never-compress | [ai-optimization](../../ai-optimization/SKILL.md) |
| Material tradeoff / pre-mortem + thrive | [higher-order-decision-architect](../../higher-order-decision-architect/SKILL.md) |
| Backlog blueprint cards | [stellar-spacemap](../../stellar-spacemap/SKILL.md) |
| Master plan skill web | [master-planner](../../master-planner/SKILL.md) |
