# devprofile — Fusion Playbook

Load with [fusion-playbooks.md](../fusion-playbooks.md) and fission overlay [devprofile-typescript.md](../../ai-optimization/references/devprofile-typescript.md).

## Project snapshot (fusion context)

Next.js 16 portfolio: **client UI for interactivity** (no async RSC for state). Domains: **CV/PDF**, **Profile Q&A** (hybrid retrieval), **content hub**, **X search**, **certificates**, **E2E (Brave Beta)**. Agent tooling: **ai-optimization** (fission) + **fusion-sage** (this playbook).

## High-stability fusion targets (iron-peak candidates)

| Domain | Source files (≥2 required) | Fused abstraction |
|---|---|---|
| **CV Q&A** | `src/lib/qa/profile-qa-generator.ts`, `src/app/api/cv/qa/route.ts`, `src/components/profile-qa.tsx` | `CvQaReactor` — retrieve → route → generate |
| **Document viewing** | `document-viewer.tsx`, `document-viewer-pdf.tsx`, `src/app/api/cv/**` | `DocumentViewReactor` — PDF/react-pdf + sidebar + download |
| **Content hub** | — | `ContentHubReactor` — **deferred** (code removed; `/content-hub` → `/x`; see `docs/content-hub-deferred.md`) |
| **X search** | `src/lib/x-search/*`, `src/components/x/*`, `src/app/x/page.tsx` | `XSearchReactor` — date ranges, sections, filter links |
| **E2E Brave** | `playwright.brave.ts`, `playwright.config.ts`, `tests/e2e/global-setup.ts` | `BraveE2eReactor` — IDE-safe launch options + runtime assert |
| **Agent skills** | `ai-optimization/SKILL.md`, `fusion-sage/SKILL.md`, `fusion-sage.mdc` | `ConnectedReactor` — fission route + fusion surplus |

## devprofile fusion rules (override generic TS playbook)

1. **No Server-Component UI fusion** — do not propose RSC for modals, forms, theme, AI chat, or document interactions. Fuse as **client feature reactors** ([react-client-expert](.agents/skills/react-client-expert/SKILL.md)).
2. **E2E surplus must preserve Brave Beta** — never fuse toward Playwright Chromium; surplus diffs must keep `executablePath` + `globalSetup` assert pattern.
3. **CV Q&A fusion** — `@huggingface/transformers` extractor + chunk cache is the binding core; fuse duplicate fetch/embed paths before adding UI.
4. **Marketing sections** — low fusion priority (hero, about, skills); summarize unless refactor touches shared layout/types.

## Example fusion output (this repo)

```markdown
## Fused Abstraction: BraveE2eReactor
playwright.brave.ts + playwright.config.ts + tests/e2e/global-setup.ts
→ launchOptions returns path only (IDE-safe); assertBraveBetaInstalled() at test run.
Binding energy: High (every E2E spec depends on this)
Traceability: 3 files, PlaywrightTestConfig launchOptions typing

⚡ Fusion Surplus (Q ≈ 1.4)
Persist in fusion-state.json as `brave-e2e-reactor` so agents stop re-discovering LaunchOptions vs PlaywrightTestConfig mismatch.
```

## Surplus ideas with realistic Q (devprofile)

| Trigger | Surplus suggestion |
|---|---|
| Third CV/Q&A change | Extract `useCvQa()` hook wrapping cache + POST `/api/cv/qa` |
| Multiple X search UI edits | Single `useXSearchWindow()` for dates + sections + URL sync |
| Repeated E2E + config questions | Seed `fusion-state.json` with `BraveE2eReactor` node |
| Content hub card additions | Typed `ContentItem` union instead of per-card props drift |

## Knowledge graph path

Persist: `.agents/skills/fusion-sage/fusion-state.json` (schema: `fusion-state.schema.json`).

## Verify after fusion-impacting changes

```bash
pnpm type-check
pnpm lint
```

E2E: `pnpm test:e2e` (requires Brave Beta or `BRAVE_BETA_PATH`).
