# devprofile — TypeScript / JavaScript optimizer

Load this overlay when working in **devprofile** (Next.js 16 App Router portfolio). Generic rules: [typescript-optimizer.md](typescript-optimizer.md).

## Project snapshot (~4 lines, always include)

Next.js 16 App Router monorepo-style **single app** under `src/`. `@/*` → `./src/*`. **Client components for interactive UI** — no async RSC for UI state ([react-client-expert](.agents/skills/react-client-expert/SKILL.md)). Marketing shell: `src/components/site/*`, `src/styles/marketing.css`. E2E at repo root: `playwright.config.ts`, `playwright.brave.ts`; specs in `tests/e2e/`. Verify: `pnpm type-check`, `pnpm lint` (Biome, errors only).

## Relevance scoring (devprofile)

| Signal | Boost | Notes |
|---|---|---|
| `playwright.brave.ts`, `playwright.config.ts`, `tests/e2e/**` | +30 | E2E / Brave Beta — read full |
| `src/app/api/**` | +25 | Route handlers + types |
| `src/components/**`, `src/hooks/**` | +20 | Client UI |
| `src/lib/**`, `src/utils/**`, `src/types/**` | +20 | Shared logic / contracts |
| `src/data/**`, `src/config/**` | +15 | Static config / content |
| `scripts/**` | +10 unless query mentions script/PDF/E2E |
| `public/**`, `*.css`, generated PDF assets | −40 | Skip unless asset-specific task |
| `next-env.d.ts`, `.next/**` | −60 | Never include |

## Never compress — read full

- **E2E:** `playwright.brave.ts`, `playwright.config.ts`, `tests/e2e/global-setup.ts`, spec under edit, `tests/e2e/helpers/**`
- **Types:** `src/types/**`, exported props interfaces, Playwright `PlaywrightTestConfig` derivations
- **API contracts:** request/response shapes in `src/app/api/**/route.ts` and `src/utils/qa-utils.ts` when touching CV Q&A
- **Env toggles (e.g. QA reactor):** `ENABLE_XAI_REACTOR` in `.env` — no Vercel `flags` package
- **Rules in play:** `.cursor/rules/e2e-playwright-brave.mdc`, `react-client.mdc` when globs match

## Compress aggressively

- **Marketing sections:** `hero.tsx`, `about.tsx`, `site/*`, `marketing.css` — props + one-line render summary
- **UI primitives:** `src/components/ui/*` — export signature only unless editing that component
- **Certificate / CV viewers:** "PDF via react-pdf / document-viewer; native `<dialog>` on certificates grid"

## Module cheat sheet

```
src/app/           App Router pages + layouts (metadata exports on layouts)
src/app/api/       Route handlers (POST/GET); no separate controllers folder
src/components/    Client + presentational; x/ = X/Twitter search UI
src/hooks/         useIntersectionObserver, etc.
src/lib/           Domain helpers (x-search, certificate-hash, motion)
src/utils/         qa-utils (embeddings CV Q&A), file-utils
src/data/          documents-data.ts — static content
tests/e2e/         Playwright specs; global-setup asserts Brave at test run
playwright.*.ts    Repo root — not under tests/
scripts/           generate-pdf.tsx, playwright-ui-brave.mjs, editor sync
```

## Compression examples (this repo)

```ts
// playwright.brave.ts (E2E — NEVER summarize; pattern agents must know)
// BRAVE_BETA_EXECUTABLE from env|default; braveBetaLaunchOptions() → { executablePath } only (IDE-safe)
// assertBraveBetaInstalled() in globalSetup — throw at test run, not config load
// Return type: NonNullable<PlaywrightTestConfig["use"]>["launchOptions"] — NOT LaunchOptions from @playwright/test

// src/app/api/cv/qa/route.ts (~79 LOC → ~45 tokens)
export async function POST(request: Request) {
  /* parse question → qaCache → embed via @huggingface/transformers → cosine sim on chunks → generateAnswer */ }

// src/components/x/XSearchFilterLinks.tsx (client)
// props: { sections, activeSection, onSelect } — filter links for X search; no fetch in component

// src/app/layout.tsx
export default function RootLayout({ children }: { children: React.ReactNode }) {
  /* ThemeProvider, SWRegister, SpeedInsights, VercelToolbar in dev, skip link */ }
```

## React / Next.js (this repo)

- **`"use client"`** where interaction/state — summarize as "client: useState/useEffect|Query for X"
- **Do not** assume Server Components for modals, forms, theme toggle, AI chat, document viewer interactions
- **Data:** prefer TanStack Query / `use()` + Suspense over effect+fetch (see react-client rule)
- **Imports:** `@/components/...`, `@/lib/...` — preserve alias in summaries, not deep relative paths
- **Biome:** `type="button"` on buttons; `useExhaustiveDependencies` off — don't "fix" effect deps mechanically

## Playwright types (learned here)

```ts
// ✓ Config-aligned launch options
type BraveBetaLaunchOptions = NonNullable<
  NonNullable<PlaywrightTestConfig["use"]>["launchOptions"]
>;

// ✗ LaunchOptions is not exported from @playwright/test
// import type { LaunchOptions } from "@playwright/test";
```

## Investigation order (token-efficient)

1. Grep symbol or route name → 1–3 files max
2. Read full: types + file under edit + direct importers
3. Expand only on `expand <symbol>` or failing test output
4. Skip: unrelated page sections, all of `src/components/ui/` unless styling task

## Verify (mandatory after multi-file TS/TSX)

```bash
pnpm type-check
pnpm lint
```

E2E file changes: see [tests/e2e/README.md](tests/e2e/README.md) — Brave Beta, not `playwright install chromium`.

**Fusion handoff:** architecture or 3+ related queries → [devprofile-fusion-playbook.md](../../fusion-sage/references/devprofile-fusion-playbook.md) via [fusion-sage.mdc](.agents/rules/fusion-sage.mdc).
