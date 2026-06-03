---
name: collab-finder
description: Use when the user (or an agent) wants to discover, analyze, prepare for, and track high-value jobs, collaborations, side hustles, and community-building opportunities on X. The tool uses live X API (via xurl/MCP patterns + direct), xAI for intelligent fit analysis + CV tailoring + cover letters + research, with strict self-guards, pauses, and explicit user intervention points. It safely reads the user's devprofile CV for grounding and can promote insights back with previews. Exposes capabilities via MCP tools and follows the official X + agentskills.io formats for composability with Grok, Cursor, and other agents. Primary value: highly autonomous preparation so the user finishes everything needed without leaving the interface, intervening only when the guards require it.
metadata:
  version: "0.1"
  mintlify-proj: collab-finder
  x-api-integrated: true
  agentic: true
  self-guards: true
---

# collab-finder — X-Powered Opportunity Hunter (Agentic, Self-Guarded)

## Product summary

Autonomous Tauri desktop app (Rust + React) that turns X into a high-signal source of opportunities tailored to **you** (Peramanathan Sathyamoorthy / p10ns11y). 

- Live tunable X searches (full operator control, presets for jobs/collabs/side-hustles/community).
- xAI (grounded in your real CV + X skill.md + llms context) for fit scoring, rationale, gaps, tailored materials.
- Full prep packs: cover letter, CV sidecar deltas, research, talking points, outreach drafts.
- Tracker + export.
- Safe "promote insights" back to your public devprofile portfolio (sidecar-first, diff preview, backup, explicit confirm).
- **Highly agentic internals**: self-guards (cost, rate, fit thresholds, CV mutation), pauses for user, smart autonomous decisions (xAI "what next?"), intervention only when necessary.
- **Agent-native**: Publishes SKILL.md + MCP server so Grok/Cursor/etc. can drive searches, preps, and promotes directly. Integrates official X agent resources (llms.txt, skill.md, XMCP, xurl).

Built for exponential personal leverage: the more you (and agents) use it, the better the profile, the sharper the future matches, the more high-value collabs/jobs/side work surface with prep already done.

Primary docs + X resources: https://docs.x.com/tools/ai (llms, skill, mcp, xurl).

## When to use

- User wants to search X for opportunities without manual drudgery.
- "Find me collabs that match my Rust + agent + energy-efficiency + Oneflow leadership background".
- "Prep everything for this X post (letter + CV variant + research)".
- "Track my applications and remind me of follow-ups".
- Agentic workflows: "Run daily opportunity scan with my current CV, only surface >85 fit, prep the top 2, pause for review".
- Maintaining the connection between your private opportunity reactor and public portfolio CV.

## Quick reference (capabilities)

### Core hunter flows (MCP tools + Tauri commands + UI)
- `search_x` / `search_x_recent(query: string, filters?)` — fully editable queries, returns enriched leads.
- `analyze_opportunity(lead, cv_packet?)` — xAI fit score + rationale + gaps + angle (using X skill.md + your pruned CV + llms context).
- `generate_prep_pack(lead)` — letter.md, cv-delta.json (structured), research.md, outreach.md, manifest. Writes sidecar in app data.
- `export_pack(lead_or_id, target_dir?)` — copy artifacts + open folder.
- `promote_insights(lead_or_prep)` — load external devprofile cvdata.json, propose edits, show diff, backup, write only on explicit confirm. Always produces sidecar proposal first.
- `update_tracker(status, notes?)` — new/analyzed/prepped/exported/applied/archived.
- `get_context` — current CV packet (pruned), X skill snapshot, cost/rate state.

### Self-guards & pauses (non-bypassable)
- Cost / token budget guard before xAI calls.
- X rate limit header monitoring + backoff.
- Fit threshold (e.g. <70 auto-low-prio; 70-85 pause with summary; >85 auto-prep with notification).
- CV promote: sidecar + unified diff + "are you sure?" gate + external repo write confirmation.
- "Smart decision" xAI output always includes confidence + recommended intervention level.
- User can always override via UI or MCP "force" with audit log.

### X integration (smooth + official)
- Full query control (user/agent can tune anytime).
- Auth via secure store (keyring) or xurl-style.
- Optional: shell to local `xurl` for certain writes or ad-hoc.
- Ingest https://docs.x.com/skill.md + llms-full.txt into prompts.
- Can delegate to local XMCP for richer tool surface.

### CV & portfolio connection
- Reads `cvdata.json` from configured devprofile path (pruned for tokens + relevance).
- Never mutates without guard + user confirm.
- "Promote insights" produces precise, reviewable changes that improve future matches.

## Authentication & setup (for agents & humans)

- X: Bearer for app-only search (or full OAuth via xurl/XMCP flow).
- xAI: API key (chat + structured).
- devprofile_path: absolute path to your portfolio checkout (for CV read + promote target).
- Secure storage in Tauri (keyring plugin) + fallbacks.

See SETUP.md (future) and root README for first-run wizard.

## Decision guidance

| Scenario | Choose / Do | Why |
|----------|-------------|-----|
| Need real-time high-signal X posts | Tunable `search_x` with operators + min_faves + since | Full control, matches your "tune whenever" requirement |
| Deep fit analysis | `analyze_opportunity` with full X skill + pruned CV | xAI + official context = accurate, non-hallucinated reasoning |
| Prepare to apply or reach out | `generate_prep_pack` + export | Letter + CV sidecar + research + outreach in one guarded flow |
| Evolve public profile from real opportunities | `promote_insights` (with pause) | Sidecar-first + diff + confirm = safe compounding |
| Agent wants to drive the whole thing | Call via MCP using this SKILL.md | Composable, no GUI required |
| Low fit or high cost | Guard triggers pause + summary for user | Self-guarding autonomy; you only intervene when it matters |

## Workflow (autonomous with intervention)

1. **Discover** — agent or user triggers search with current context (CV + X skill).
2. **Analyze & decide** — xAI scores + recommends (guard checks cost/fit/rate). Auto-prep high-value; pause + surface others.
3. **Prep** — generate full artifacts (guarded xAI calls).
4. **Act / export** — user (or agent with approval) exports or marks applied.
5. **Learn & promote** — on success or pattern, pause for `promote_insights` (improves future CV packet and public presence).
6. **Self-improve** — after cycles, surplus suggestions for better guards, prompts, or new skills.

The system logs decisions, costs, and intervention points for review.

## Common gotchas (for agents building on this)

- Always prune CV before sending to xAI (fission).
- X queries must be user-tunable; never hardcode the "perfect" query.
- CV promote is the highest-guard operation — sidecar + preview + two confirms minimum.
- Rate limits and costs are first-class state; surface them.
- When using MCP/XMCP, respect allow-lists for safety.
- The Tauri UI and MCP surface must stay in sync (same guards).

## Verification checklist (before marking hunter feature "done")

- [ ] All decision points have explicit self-guard + pause path + logging.
- [ ] X calls respect official skill.md constraints + rate headers.
- [ ] CV reads are pruned; promotes are sidecar + diff + confirm only.
- [ ] MCP tools (if added) are documented in this SKILL and tested.
- [ ] Prompts include current X skill.md + llms context (or reference to fresh fetch).
- [ ] User can intervene at any guard without losing state.
- [ ] Surplus generated: how did this make future hunter iterations cheaper / higher value?
- [ ] Cargo check + pnpm build + tauri check pass.
- [ ] BDD scenarios (via bdd-strategizer) cover the guard + pause cases.

## Resources

- Official X: https://docs.x.com/tools/ai (llms.txt, skill.md, mcp, xurl)
- This project's agent system: root `AGENTS.md`, `.agents/skills/hunter-reactor/SKILL.md`, etc.
- Your devprofile (CV source + public face): sibling repo with its own strong agent setup.
- MCP in this environment: use to drive or extend the hunter.

---

**collab-finder exists so that high-value opportunities on X are discovered, analyzed, and prepped with minimal friction and maximal intelligence — while the development of the tool itself compounds exponentially through the same agentic primitives (fission/fusion + X resources + self-guards + MCP/skill composability).**

You (the human) stay in the loop only for the decisions that truly matter. Agents handle the rest.

#x-agentic #hunter-reactor #self-guarded #xai #mcp #skill-md
