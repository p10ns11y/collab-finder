# Proof variants & proof-point bank

**Purpose:** Role-class “exceptional work” samples + tagged metrics for prep packs / applications.  
**Source:** Distilled only from `cv-packet-distilled.txt` + live `cvdata.json` employment/projects/publications (2026-07-11).  
**Honesty:** Personal/OSS ≠ multi-year production AI-lab employment. “9+ years” = aggregate industry employment only.  
**Status:** First draft for user improve/add/tweak later. Prefer exact packet numbers; do not invent new metrics.

---

## How to pick a variant

| Role class | Prefer variant ID | Why |
|------------|-------------------|-----|
| Agent infra / xAI / SpaceXAI / MCP / guarded systems | `EW-agent-collab-finder` | Live agentic product + self-guards |
| Platform / integrations / public API / multi-client | `EW-integrations-oneflow` | Founded Integration Team + CRM/API |
| Quality / E2E / type safety / senior craft | `EW-quality-ts-playwright` | TS migration + Playwright rewrite |
| Leadership / team / mentoring | `EW-lead-self-organizing` | Engineering Team Lead arc |
| Energy-efficient / local-first / constrained systems / world-models framing | `EW-research-eeaas` | Thesis + IEEE papers (research, not lab job) |
| Systems / MVU / C / desktop | `EW-systems-elomaxz` | elomaxz + Tauri/Rust personal work |
| ML learning / minimal agents (honest junior ML signal) | `EW-ml-prototype-it` | Personal PyTorch LSTM + ReAct — **not** production training |
| Default if unclear | `EW-agent-collab-finder` | Matches SpaceXAI wishlist + packet default |

---

## Exceptional-work variants (≤120 words each)

### EW-agent-collab-finder — default for SpaceXAI / agent roles

collab-finder (personal, Tauri + Rust + React/TypeScript): a working agentic desktop app that uses live X API + xAI to find high-fit opportunities. It runs a self-guarded autonomous reactor (cost, fit, rate-limit gates), exposes MCP-oriented tooling, and generates cover letters / research packs with CV sidecar proposals that never mutate master cvdata without explicit promote. Built for truth-seeking, high-signal output, and safe iteration — the same craft standards I applied to TypeScript migrations, Playwright E2E, and integration platforms at Oneflow.

### EW-integrations-oneflow — integrations / platform / API

At Oneflow (Full Stack Integration Engineer, 2019–2021) I established the Integration Team and long-term integration processes from the ground up. I built multi-client Python/React applications integrating HubSpot, SuperOffice, Microsoft Dynamics, Salesforce, and Teamtailor, and stabilized and evolved the Public API so a third-party ecosystem could grow reliably. Later senior work (typed migrations, ACL unification) compounded that platform ownership. This is production product integration at scale — not a side demo.

### EW-quality-ts-playwright — reliability / TypeScript / testing

As Senior Software Engineer at Oneflow (2023–2024) I integrated TypeScript into a mixed FlowType/JavaScript codebase, cutting type-related errors by ~70%, and automated JS→TypeScript conversion with a custom script that preserved VCS history (~200 hours saved). As Engineering Team Lead (2021–2022) I led a Playwright E2E transformation from mob-test prototype to full suite rewrite, reducing regressions, and built a lightweight Zod-based validation library to cut runtime data errors. Craft = fewer silent failures, faster safe change.

### EW-lead-self-organizing — leadership / culture / hiring

As Engineering Team Lead at Oneflow (Oct 2021 – Dec 2022) I co-led a JSON rich-text editor with legacy HTML integration that increased user satisfaction by ~60%. I mentored the team into a self-organizing model, oversaw hiring and onboarding, and drove continuous-improvement culture while shipping Playwright E2E and Zod validation infrastructure. Leadership here meant technical ownership + enabling the team — not title theater.

### EW-research-eeaas — energy / orchestration / constrained systems

MSc thesis (Uppsala): *Enabling Energy-Efficient Data Communication with Participatory Sensing and Mobile Cloud* — self energy-efficient cloud profiler/actuator, dynamic knowledge graphs, cloud-assisted optimization. Publications: IEEE CloudCom 2015 *Energy Efficiency as an Orchestration Service for the Mobile Internet of Things*; journal follow-on on profiling energy efficiency and data communications for mobile IoT (WCMC 2017). Framing for local-first / power-aware / resource-constrained agents — **research and thesis work, not production GPU training employment**.

### EW-systems-elomaxz — systems programming / MVU / desktop

elomaxz (personal, C): a hybrid Model-View-Update framework for systems programming with Elm-like Cmd/Effect, composition, and testability — bringing predictable UI/system architecture to C. Paired with personal Tauri + Rust desktop work (collab-finder) and arch-machine (profile-based AI/ML-ready Arch installer with security audits and self-healing). Signal: systems thinking and agentic desktop runtime ownership as **personal/OSS**, built to production craft standards from Oneflow years.

### EW-ml-prototype-it — honest ML learning signal only

prototype-it-to-explain-itself (personal, Python/PyTorch): minimal LLM education stack — character-level LSTM (~150k params), next-token sampling, probability inspection, and a minimal trainable ReAct agent you can inspect and modify. Complements agent-prompt-tuning-lab (privacy-first transcript → skills/rules/datasets) and recent learning (LangChain, Cilium AI/ML Security). **Personal educational / experimental work** — do not claim production model training, serving, or multi-year AI-lab employment.

---

## Tagged proof points (metrics & facts)

Use in cover letters only if true in source; tags guide selection.

| ID | Claim (grounded) | Tags | Source |
|----|------------------|------|--------|
| PP-ts-70 | ~70% reduction in type-related errors via TypeScript integration | quality, typescript, oneflow, senior | Oneflow SWE 2023–24 |
| PP-ts-200h | Automated JS→TS migration preserving git history; ~200 hours saved | quality, tooling, migration | Oneflow SWE 2023–24 |
| PP-acl | Unified distributed ACL (owner/guest) into one maintainable utility | platform, security, oneflow | Oneflow SWE 2023–24 |
| PP-rte-60 | JSON rich-text editor + legacy HTML; ~+60% user satisfaction | product, frontend, leadership | Oneflow ETL 2021–22 |
| PP-playwright | Playwright E2E: mob-test prototype → full suite rewrite; fewer regressions | quality, e2e, leadership | Oneflow ETL 2021–22 |
| PP-zod-lib | Lightweight Zod-based validation library; fewer runtime data errors | quality, typescript, zod | Oneflow ETL 2021–22 |
| PP-integ-team | Established Integration Team + long-term processes | integrations, leadership, platform | Oneflow Integration 2019–21 |
| PP-crm | Multi-client integrations: HubSpot, SuperOffice, Dynamics, Salesforce, Teamtailor | integrations, python, react | Oneflow Integration 2019–21 |
| PP-public-api | Stabilized/evolved Public API for third-party ecosystem | api, platform, integrations | Oneflow Integration 2019–21 |
| PP-ci-40 | CI build time −40% | devops, quality | Oneflow JS Dev 2017–19 |
| PP-iam-router | React Router into Backbone.js IAM for faster prototyping/testing | frontend, modernization | Oneflow JS Dev 2017–19 |
| PP-aws-40 | AWS ops cost −40% at Weavler | devops, aws, early | Weavler 2016–17 |
| PP-pts | Weavler platform with 1.6M SEK PTS grant context | startup, early | Weavler |
| PP-babel-i18n | OSS Babel i18n plugin for project-wide translations | oss, i18n | Weavler / OSS |
| PP-thesis | Energy-efficient data communication thesis (Uppsala MSc) | research, energy, orchestration | Education |
| PP-ieee | IEEE CloudCom 2015 + WCMC journal energy/IoT orchestration | research, publications | Publications |
| PP-collab | collab-finder: X API + xAI, guarded reactor, MCP-oriented, CV sidecars | agent, personal, tauri, rust | Personal |
| PP-elomaxz | elomaxz C MVU Cmd/Effect framework | systems, c, personal | Personal |
| PP-proto | ~150k-param LSTM + minimal trainable ReAct (educational) | ml, personal, honesty | Personal |
| PP-yoe | 9+ years professional SWE employment (Oneflow + Weavler + intern) | career | Profile |
| PP-citizen | Swedish citizen; US needs sponsorship | auth, geo | Profile |
| PP-stack-pro | Professional depth: TypeScript, React, Python, Playwright | stack | Packet |
| PP-stack-personal | Personal/OSS: Rust, Tauri, C, PyTorch, xAI API | stack, personal | Packet |

---

## Default packet policy (G defaults until user tweaks)

| Decision | Default | Rationale |
|----------|---------|-----------|
| Quick Target default CV | `cv-packet-distilled.txt` (full employment arc) | Best for FT analyze; already app default |
| Agent-infra heavy roles | Optionally swap/prepend agent packet emphasis | `cv-packet-agent-distilled.txt` exists |
| Exceptional-work default | `EW-agent-collab-finder` | SpaceXAI wishlist |
| Constraints vs CV | Keep family/relocation/comp in `candidate-preferences.md` only | Do not dump into public cover letters unless asked |
| OCI | Only when opportunity is India-targeted | Per preferences |
| User edits | Expected | Improve metrics wording, add missing wins, reorder project ranking |

---

## Anti-fabrication checklist (always)

- Never attribute 9+ YOE to collab-finder, elomaxz, prototype-*, MCP, Tauri.
- Never invent GPU/TPU, production model training/serving, or AI-lab employment.
- Never invent US work authorization.
- Prefer “built / led / established / personal OSS” over “multi-year production AI infrastructure.”
- Research = thesis/papers framing only for energy/orchestration.

---

## Changelog

- **2026-07-11:** Initial bank from CV packet + cvdata; user will improve/add/tweak later.
