---
name: upgrade-packages
description: >-
  Upgrades npm/pnpm dependencies safely: patch and minor first, framework
  majors (Next.js, React) with official or community codemods and code fixes.
  Use when the user asks to update, upgrade, or bump packages, reduce outdated
  deps, or migrate to a new major of Next, React, TypeScript, Tailwind, or Biome/ESLint.
---

# Upgrade packages

Safe, incremental dependency upgrades for pnpm projects. Pair with [fix-dependency-security](../fix-dependency-security/SKILL.md) for audit and install hardening.

## Principles

1. **Prefer non-breaking upgrades** — stay within semver ranges in `package.json` (`^`, `~`) before jumping majors.
2. **One logical change per commit** — e.g. “bump patch/minors” vs “Next 15 → 16 + codemods”.
3. **Framework libs are worth major upgrades** — `next`, `react`, `react-dom`, `typescript`, `tailwindcss`, and the active linter (`@biomejs/biome` in devprofile; `eslint` in ESLint-based repos) — but require changelog review, codemods, and code fixes; never bump only the version pin.
4. **Keep related packages aligned** — React + types + DOM; Next + `@next/env` override; linter + its plugins (Biome or ESLint ecosystem).
5. **Install with SFW** when supply-chain hardening is enabled: `sfw pnpm install` / `sfw pnpm update`.

---

## Upgrade tiers

| Tier | Scope | Risk | Approach |
|------|--------|------|----------|
| **A** | Patch / minor within current range | Low | `pnpm update`, refresh lockfile |
| **B** | Minor outside range or low-level tools | Medium | Bump range in `package.json`, install, type-check |
| **C** | Framework / toolchain **major** | High | Read migration guide → codemods → manual fixes → full validate |

**Tier C “hard deps”** (treat as framework): `next`, `react`, `react-dom`, `typescript`, `tailwindcss`, `@biomejs/biome` or `eslint`, `@playwright/test`, and UI stacks tightly coupled to React (`motion`, `react-pdf`, `@react-pdf/renderer`).

**Tier A/B examples**: `clsx`, `lucide-react`, `class-variance-authority`, `@radix-ui/*`, `postcss`, `autoprefixer` — upgrade freely after quick smoke check.

---

## Workflow checklist

```
- [ ] 1. Baseline: pnpm outdated [-r]
- [ ] 2. Classify each outdated pkg (tier A / B / C)
- [ ] 3. Tier A/B: bump + sfw pnpm install
- [ ] 4. Tier C: read upgrade guide + run codemods
- [ ] 5. Fix types, lint, runtime breakages in app code
- [ ] 6. Align pnpm-workspace.yaml overrides (e.g. @next/env); fix trust downgrades via why/bump/override
- [ ] 7. pnpm audit, type-check, lint, build, e2e if relevant
```

---

## Step 1: Discover what is outdated

```bash
pnpm outdated
pnpm outdated -r          # include transitive (plan overrides if needed)
```

Note **current → wanted → latest** and whether **latest** is a major bump.

```bash
pnpm why <package>        # if a transitive blocks resolution
```

---

## Step 2: Tier A — safe in-range updates

Update everything that stays within existing semver ranges:

```bash
sfw pnpm update
```

Or target packages:

```bash
sfw pnpm update lucide-react clsx tailwind-merge
```

Re-run `pnpm outdated`. If **wanted** equals **latest** for a package, Tier A is done for it.

---

## Step 3: Tier B — bump ranges without framework majors

Edit `package.json` to the new **minor** (or patch) range, then:

```bash
sfw pnpm install
```

Prefer **one ecosystem group per PR** (e.g. all Radix, or all dev tooling except ESLint).

---

## Step 4: Tier C — framework major upgrades

### 4.1 Before bumping

1. Read the official upgrade / migration doc for the target major.
2. Check **peer dependency** requirements (e.g. Next 16 + React 19).
3. Search the repo for deprecated APIs (`grep` / semantic search).
4. Note **codemods** listed below; run them **after** installing the new version unless the doc says otherwise.

### 4.2 Bump versions together

Example — keep React family in sync:

```json
"next": "<target>",
"react": "^19.x",
"react-dom": "^19.x"
```

```json
"@types/react": "^19.x",
"@types/react-dom": "^19.x"
```

Update matching **pnpm overrides** in `pnpm-workspace.yaml` when the project pins ecosystem packages (e.g. `@next/env` with `next`).

```bash
sfw pnpm install
```

Respect **minimumReleaseAge** — very new majors may not install until policy allows; do not disable policy without user approval.

### 4.3 Codemods and migration tools

Run from repo root. Prefer **official** codemods first; then community.

| Library | Command / tool | Notes |
|---------|----------------|-------|
| **Next.js** | `npx @next/codemod@latest upgrade latest` | Interactive upgrade + transforms; see [Next upgrading](https://nextjs.org/docs/app/getting-started/upgrading) |
| **Next.js** | `npx @next/codemod@latest <transform> .` | Specific transforms (e.g. `new-link`, `metadata-to-viewport-export`) — list via `--help` |
| **React 19** | `npx codemod@latest react/19/migration-recipe` | [React 19 upgrade](https://react.dev/blog/2024/04/25/react-19-upgrade-guide) |
| **React 18→19** | `npx react-codemod@latest rename-unsafe-lifecycles` | Legacy patterns if needed |
| **TypeScript** | `npx typescript-go` / manual | TS 6+ — follow [TS release notes](https://www.typescriptlang.org/docs/handbook/release-notes.html); fix `tsc` errors |
| **Biome** | Bump `@biomejs/biome`; read [Biome release notes](https://biomejs.dev/internals/changelog/) | **devprofile** uses Biome only (no ESLint) |
| **ESLint 9+** | `npx @eslint/migrate-config` | Other repos; flat config from `.eslintrc` |
| **Tailwind 3→4** | `npx @tailwindcss/upgrade` | [Upgrade guide](https://tailwindcss.com/docs/upgrade-guide) |
| **Playwright** | Bump `@playwright/test` only; **do not** `playwright install chromium` | This repo uses **Brave Beta** via `executablePath` ([tests/e2e/README.md](../../../tests/e2e/README.md)) |

**Community / general:**

- `npx codemod@latest` — catalog of recipes ([codemod.com](https://codemod.com))
- `npx npm-check-updates -u` — only to **propose** version bumps; review diff carefully, do not blind commit

Always read codemod output and **review the git diff** — codemods are incomplete.

### 4.4 Manual follow-up

- Fix remaining `tsc` and linter errors (`pnpm lint` — Biome in devprofile, ESLint elsewhere).
- Update `next.config.*`, `postcss.config.*`, and linter config (`biome.json` or `eslint.config.*`) per migration guides.
- Run `pnpm build` and critical **e2e** paths (`pnpm test:e2e`).

---

## Step 5: Trust downgrades (`ERR_PNPM_TRUST_DOWNGRADE`)

With `trustPolicy: no-downgrade` (see [fix-dependency-security](../fix-dependency-security/SKILL.md)), installs can fail on a specific version.

1. Note the blocked package from the error.
2. Run `pnpm why <package>` — identify **direct** vs **transitive** path.
3. Resolve without `trustPolicyExclude`:

| Path | Action |
|------|--------|
| Direct in `package.json` | Bump the direct dependency range |
| Transitive via upgradable parent | Bump parent so it depends on a trusted release (e.g. a direct dep that pulls the blocked package) |
| Parent stuck on old range | Add a targeted `overrides` entry in `pnpm-workspace.yaml` for a compatible newer version |

4. If the lockfile still lists the bad version after changing overrides, regenerate:

```bash
rm -rf node_modules pnpm-lock.yaml
sfw pnpm install --no-frozen-lockfile
```

5. Confirm with `pnpm why <package>` and `pnpm install` (lockfile policy check passes).

---

## Step 6: Transitive / override conflicts

If `pnpm install` resolves but **runtime or lint breaks** (e.g. incompatible `semver` major after a trust override):

1. `pnpm why <package>`
2. Prefer **removing or narrowing overrides** over adding more pins.
3. Re-run Tier A update for the conflicting subtree.

Do not stack overrides to silence breakage without understanding the semver mismatch.

---

## Step 7: Validate

```bash
pnpm audit
pnpm type-check
pnpm lint
pnpm build
pnpm test:e2e          # when UI/routing/auth changed
```

Report to the user:

- What was upgraded (tier A/B/C)
- Codemods run and manual edits made
- Outdated packages intentionally deferred (and why)
- Any policy blocks (`minimumReleaseAge`, `trustPolicy`)

---

## Project-specific notes (devprofile)

| Package | Notes |
|---------|--------|
| `next` | Pinned exact version (`16.2.6`); bump with `@next/codemod` + align `@next/env` override |
| `react` / `react-dom` | Keep on same major; types packages must match |
| `typescript` | `^6.0.x` — major bumps need full `tsc` pass |
| `@biomejs/biome` | **Lint + format** via `biome.json`; `pnpm lint` / `lint:fix` / `format` — ESLint was removed in PR #42 |
| `tailwindcss` | v4 + `@tailwindcss/postcss` — use `@tailwindcss/upgrade` for major migrations |
| `motion` | Successor to Framer Motion — [motion.dev](https://motion.dev/) on major bumps |
| `@playwright/test` | Bump package only; tests use **Brave Beta** — do not `playwright install chromium` |
| `@huggingface/transformers` | Heavy native deps — run [audit-allow-builds](../audit-allow-builds/SKILL.md) after upgrades |
| Overrides | Security + trust pins in `pnpm-workspace.yaml` (ONNX, `@next/env`, `semver`, etc.) — `pnpm why` before adding |

---

## Anti-patterns

- Jumping to `latest` on all packages in one commit
- Bumping `next` or `react` without running codemods or reading the migration guide
- Upgrading `@types/react` without `react` / `react-dom`
- Using `pnpm update --latest` on the whole tree without tier review
- Leaving `pnpm outdated` zero while audit or build is red
- Disabling `minimumReleaseAge` / `trustPolicy` to force a bleeding-edge major
- `trustPolicyExclude` instead of `pnpm why` + bump or `overrides`

## Related skills

- [audit-allow-builds](../audit-allow-builds/SKILL.md) — post-upgrade review of lifecycle-script packages in `allowBuilds`
- [audit-ide-dependencies](../audit-ide-dependencies/SKILL.md) — editor extensions/plugins (not the project lockfile)
- [fix-dependency-security](../fix-dependency-security/SKILL.md) — audit, SFW, workspace supply-chain policy

## Related skills

- [fix-dependency-security](../fix-dependency-security/SKILL.md) — audit, SFW, `trustPolicy`, override patterns for trust downgrades

## References

- [pnpm update](https://pnpm.io/cli/update)
- [pnpm why](https://pnpm.io/cli/why)
- [pnpm outdated](https://pnpm.io/cli/outdated)
- [Next.js codemods](https://nextjs.org/docs/app/guides/upgrading/codemods)
- [React 19 upgrade guide](https://react.dev/blog/2024/04/25/react-19-upgrade-guide)
