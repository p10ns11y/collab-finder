---
name: cv-promote-guard
description: Strict self-guarded mechanism for reading the user's devprofile CV (cvdata.json) for grounding and safely promoting insights/deltas back with sidecars, diffs, previews, backups, and explicit user confirmation. Never mutates external portfolio without multiple gates. Use for any CV-related logic in finder-reactor or prep flows. Enforces sidecar-first, auditability, and intervention points. Fission for safe edit code; fusion for how it protects the public profile while improving future matches.
---

# CV Promote Guard — Safe, Auditable, Sidecar-First Profile Evolution

**Core Mission**: Allow the finder-reactor to use the user's real, rich CV from devprofile for hyper-relevant analysis and prep, while making any "promote insights" (suggested improvements to one_liner, experience bullets, skills, etc. derived from real opportunities) completely safe, reversible, and user-controlled. This guard is what enables compounding: better CV → better matches → more insights → even better CV, without ever risking the public portfolio accidentally.

## Immutable Principles

1. **Sidecar-First Always**: All proposed changes are written to a sidecar (e.g., preps/<id>/cv-delta.json or proposed-cv-delta-for-master.json) before any consideration of master edit.
2. **External Repo is Sacred**: The devprofile checkout is read-only by default. Writes require explicit, multi-step confirmation + diff preview.
3. **Multiple Guards & Pauses**: 
   - Read guard: prune aggressively (fission), never send raw full CV unless "deep mode" + confirm.
   - Promote guard: diff preview (unified or structured), .bak backup, "apply to master?" dialog/MCP ask.
   - High-stakes: any change to public-facing fields (one_liner, short_bio, latest role) requires extra pause.
4. **Full Audit & Reversible**: Every promote logs the source opportunity, the xAI rationale, the exact deltas, user decision. .git-friendly or patch output so user can review in their portfolio terminal.
5. **Self-Improvement**: Successful promotes (or rejections) feed back into better CV packet pruning or "what makes a good insight" heuristics.
6. **Composability**: Exposed as guarded MCP tool so agents can suggest but not force promotes.

## Reactor Integration

In finder-reactor loop:
- Analyze/Prep: load pruned CV packet from configured devprofile_path/src/data/cvdata.json (using cv-promote-guard logic for pruning).
- Decide on promote: only after outcome (e.g., "this lead highlighted a gap in my energy-efficiency experience").
- Promote flow: generate delta (structured JSON Patch or list of edits with "why"), write sidecar, present preview, user/agent confirms, then safe write + backup.
- Guard triggers: "Is this promoting to live public CV? Pause."

## Implementation Patterns

**Loading & Pruning (Fission)**:
- Config: devprofile_path (user picks once, stored securely).
- Prune: relevant sections only (last 3 roles with bullets matching opportunity keywords, top projects, skills, one_liner, open_for_new_opportunies, contact).
- Cache packet per session/opportunity, with hash for staleness.
- Never full 900+ line JSON to xAI.

**Delta Generation**:
- xAI (or hybrid rules + xAI) outputs structured: [{ "op": "replace", "path": "$.one_liner", "value": "...", "rationale": "..." }, ...]
- Or semantic: "add bullet to latest role highlighting X from this opportunity".
- Validate against CV schema.

**Preview & Apply**:
- In Tauri: nice diff UI (side-by-side or unified text, checkboxes for which edits).
- MCP tool: promote_with_preview(insights) → returns diff + requires confirm.
- On apply: cp cvdata.json cvdata.json.bak-<ts>, apply edits (json-patch or manual), write, return "Updated. Now run pnpm generate-pdf in devprofile and git review."
- Optional: auto-generate commit message suggestion for user's portfolio repo.

**Guards in Code**:
- Read: always prune + log token estimate.
- Write: check if path is the configured external one, require user_approved flag from UI/MCP.
- Rate/cost: promoting is "free" but still log for audit.

## Guardrails

- No direct mutation of devprofile without this guard module.
- Always produce sidecar proposal even for "internal" suggestions.
- User can configure "never auto-write", "always require 2 confirms", "dry-run only".
- On error during promote: full rollback from .bak.
- Audit log in app data: promotes.json with opportunity_id, deltas, decision, timestamp.

## Surplus

Every promote or guard implementation must produce:
⚡ CV Guard Surplus (Q ≈ 1.4)
This sidecar + diff flow would have prevented X accidental public profile changes in past manual edits. Future win: refined pruning heuristic from rejected promotes improves analysis accuracy for next 20 opportunities, saving ~500 tokens each. Suggested: auto-suggest "profile update" skill from accepted promotes for self-improvement loop.

## Related Skills

- finder-reactor (primary consumer)
- x-agent-resources (opportunities that trigger promotes)
- tauri-agentic (UI/MCP for the guard dialogs/tools)
- ai-optimization (for CV pruning in packets)
- fusion-sage (for evolving the "what makes a good promote" abstraction)

## Activation for Agents

When touching CV or promote: load cv-promote-guard + finder-reactor + fusion-sage (for the guard as a cross-cutting concern).

In code reviews: verify no raw fs writes to cvdata without going through this.

---

**This guard is the trust layer that makes the whole autonomous system viable.** Without it, agents couldn't safely help evolve the public profile. With it, promotes become a high-value, low-risk feedback loop that makes future hunts exponentially better.

Build every CV interaction behind this guard. The user (and their public reputation) will thank you.
