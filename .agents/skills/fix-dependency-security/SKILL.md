---
name: fix-dependency-security
description: >-
  Fixes dependency vulnerabilities and deprecations, hardens the supply chain,
  and wraps package-manager installs with Socket Firewall (sfw). Use when the
  user asks for pnpm/npm audit, security fixes, deprecated packages,
  supply-chain attack prevention, StepSecurity-style dependency hygiene, or sfw.
---

# Fix dependency security

End-to-end workflow for **vulnerabilities**, **deprecations**, and **supply-chain install safety** in Node/pnpm projects.

## Principles

1. **Prefer real upgrades** over silencing warnings (`allowedDeprecatedVersions`, ignoring audit).
2. **One source of policy** for pnpm: `pnpm-workspace.yaml` (overrides, `minimumReleaseAge`, `blockExoticSubdeps`) — not scattered `package.json` `pnpm` blocks.
3. **Wrap risky commands** with **SFW** so malicious packages are blocked before download.
4. **Re-verify** after every change: install → audit → type-check/lint.

## Tooling map

| Tool | Role |
|------|------|
| **pnpm audit** | CVE/advisory report for the lockfile |
| **pnpm overrides** (`pnpm-workspace.yaml`) | Force patched transitive versions |
| **SFW (`sfw`)** | [Socket Firewall Free](https://docs.socket.dev/docs/socket-firewall-free) — prefix installs; blocks confirmed malware at network layer |
| **StepSecurity** | CI/runtime supply-chain platform ([Harden-Runner](https://docs.stepsecurity.io/harden-runner/workflow-runs), threat intel, cooldown policies). Complements local `sfw`; does not replace `pnpm audit` |
| **pnpm settings** | `minimumReleaseAge`, `blockExoticSubdeps`, `trustPolicy` — delay/block risky resolution ([pnpm supply-chain security](https://pnpm.io/supply-chain-security)) |

SFW is the **`sfw` CLI** (Socket). StepSecurity is often first to publish npm incident analysis; use their advisories for context, and **Harden-Runner** in GitHub Actions for CI egress control.

---

## Workflow checklist

Copy and track:

```
- [ ] 1. Baseline: pnpm audit (and pnpm outdated if useful)
- [ ] 2. If trust downgrade: pnpm why → bump parent or overrides (no trustPolicyExclude)
- [ ] 3. Plan CVE fixes (direct bumps vs overrides vs upstream)
- [ ] 4. Apply fixes (package.json + pnpm-workspace.yaml)
- [ ] 5. Install behind SFW: sfw pnpm install
- [ ] 6. Confirm: pnpm audit → clean
- [ ] 7. Confirm: no deprecated deps (install output / pnpm why)
- [ ] 8. Validate: pnpm type-check && pnpm lint
```

---

## Step 1: Audit

```bash
pnpm audit
```

- Note **severity**, **package**, **patched versions**, and **paths** (which dependency pulls it in).
- If multiple advisories affect one package, bump to the **highest** required patched version (e.g. `>=16.2.6` beats `>=16.2.5`).

```bash
pnpm why <package>    # trace transitive source
pnpm outdated         # optional: direct upgrade candidates
```

---

## Step 2: Fix `ERR_PNPM_TRUST_DOWNGRADE`

When `trustPolicy: no-downgrade` blocks install or lockfile verification:

1. Read the package name and version from the error (e.g. `semver@6.3.1`).
2. Trace the tree:

```bash
pnpm why <package>
```

3. Fix in this order (do **not** use `trustPolicyExclude` unless the user explicitly approves an exception):

| Option | When |
|--------|------|
| **Bump direct dep** | `pnpm why` shows your `package.json` dependency — raise its range and reinstall |
| **Bump transitive parent** | A parent you control (e.g. `eslint-config-next`) has a newer release that drops the bad version — upgrade that parent |
| **`pnpm.overrides`** | Parent range cannot move yet, but a newer **same-major** or compatible major exists with stronger trust — pin in `pnpm-workspace.yaml`, then regenerate the lockfile |

4. Regenerate a stale lockfile if overrides changed but verification still fails:

```bash
rm -rf node_modules pnpm-lock.yaml
sfw pnpm install --no-frozen-lockfile
pnpm install   # confirm lockfile passes supply-chain policies
```

5. Re-run `pnpm why <package>` to confirm a single trusted version remains.

Example (eslint toolchain): `eslint-config-next` pulled `eslint-import-resolver-typescript@3.10.1` and `semver@6.3.1` → overrides to `^4.4.4` and `^7.7.2` after `pnpm why` showed no newer parent.

---

## Step 3: Fix vulnerabilities

### Direct dependencies

Bump in `package.json`, then install (see Step 5).

Example: Next.js advisories → set `next` to latest patched in the same major line (e.g. `16.2.6`).

### Transitive only

Add or update **overrides** in `pnpm-workspace.yaml`:

```yaml
overrides:
  "<package>": ^<patched-version>
```

Align related packages (e.g. `@next/env` with `next`).

### After overrides

```bash
sfw pnpm install
pnpm audit
```

Do not stop until `pnpm audit` reports no known vulnerabilities (or document accepted risk with user approval).

---

## Step 4: Fix deprecations

```bash
pnpm install    # surface deprecated warnings (prefer sfw — Step 5)
pnpm why <deprecated-package>
```

| Situation | Action |
|-----------|--------|
| Newer non-deprecated version exists | Override or bump parent dependency |
| Entire package deprecated (all versions) | Bump **parent** chain (e.g. `onnxruntime-node@1.26` → `global-agent@4` removes deprecated `boolean`) |
| Only silencing available | **Avoid** `allowedDeprecatedVersions` unless user explicitly accepts risk |

---

## Step 5: SFW (Socket Firewall) for installs

### Install SFW once per machine

```bash
npm i -g sfw
# or: binary from https://github.com/SocketDev/sfw-free/releases
```

### Prefix package-manager commands

```bash
sfw pnpm install
sfw pnpm add <pkg>
sfw pnpm update <pkg>
sfw npm ci          # if using npm in CI
```

**Limits:** SFW blocks **network fetches** of confirmed malware. Cached artifacts are not re-checked — after compromise scares, prune cache:

```bash
pnpm store prune
```

**CI (GitHub Actions):**

```yaml
- uses: socketdev/action@v1
  with:
    mode: firewall-free   # or firewall for enterprise
- run: sfw pnpm install --frozen-lockfile
```

Docs: https://docs.socket.dev/docs/socket-firewall-free

---

## Step 6: pnpm supply-chain hardening

Prefer settings in **`pnpm-workspace.yaml`** (not `package.json`):

```yaml
# Example — tune per project; pnpm 11 defaults minimumReleaseAge to 1440 (1 day)
minimumReleaseAge: 1440
blockExoticSubdeps: true
# trustPolicy: no-downgrade   # optional, stricter trust
```

Keep existing project overrides (security pins) alongside these keys.

**`allowBuilds`:** only enable lifecycle scripts for packages that truly need native builds (e.g. `sharp`, `esbuild`). After changes to the whitelist or to locked versions of allowed packages, run [audit-allow-builds](../audit-allow-builds/SKILL.md).

---

## Step 7: CI / StepSecurity (optional)

For GitHub Actions, add [Harden-Runner](https://github.com/step-security/harden-runner) early in the job to detect anomalous egress and tampering:

```yaml
- uses: step-security/harden-runner@v2
  with:
    egress-policy: audit    # then tighten to block + allowed-endpoints
```

Use StepSecurity threat write-ups when investigating **npm incidents** (typosquats, maintainer hijacks). Pair with `sfw` on developer machines and `pnpm audit` in CI.

---

## Step 8: Validate

```bash
pnpm audit
pnpm type-check
pnpm lint
pnpm build    # if user expects full verification
```

Summarize for the user:

- What was vulnerable / deprecated and **how** it was fixed
- Version bumps and overrides added
- Whether `sfw` was used for install
- Remaining risks (e.g. AI-flagged but unconfirmed packages SFW only warns on)

---

## Project-specific notes (devprofile)

- **Package manager:** pnpm 11; config in `pnpm-workspace.yaml`.
- **Hardened workspace:** `minimumReleaseAge: 1440` (strict 1d; bump to `10080` when lockfile has no packages newer than 7d), `minimumReleaseAgeStrict`, `blockExoticSubdeps`, `trustPolicy: no-downgrade` (no `trustPolicyExclude`), `strictDepBuilds`, `verifyDepsBeforeRun: error`, `sideEffectsCache: false`, explicit `allowBuilds` whitelist.
- **Overrides** pin transitive security packages, ONNX stack, and eslint trust fixes (`eslint-import-resolver-typescript`, `semver`).
- **Do not** reintroduce `allowedDeprecatedVersions` for `boolean` — fixed via `onnxruntime-node` / `global-agent` bumps.

---

## Anti-patterns

- Pinning vulnerable versions indefinitely without user sign-off
- `allowedDeprecatedVersions: "*"` instead of upgrading
- Running `pnpm add` / `pnpm update` without `sfw` when hardening supply chain
- Putting pnpm `overrides` in `package.json` when the repo uses `pnpm-workspace.yaml`
- Assuming audit clean means safe without checking deprecations and install-time firewall
- `trustPolicyExclude` to bypass trust downgrades — use `pnpm why`, bump, or `overrides` instead

## Related skills

- [audit-allow-builds](../audit-allow-builds/SKILL.md) — supply-chain review of `allowBuilds` packages (lockfile versions, new releases, postinstall scripts)
- [audit-ide-dependencies](../audit-ide-dependencies/SKILL.md) — Cursor/VS Code extensions and plugin caches under `~/.cursor` (separate from the project lockfile)
- [upgrade-packages](../upgrade-packages/SKILL.md) — semver-safe and major framework upgrades; shares trust-downgrade / `pnpm why` workflow

## References

- [pnpm audit](https://pnpm.io/cli/audit)
- [pnpm overrides](https://pnpm.io/package_json#pnpmoverrides)
- [pnpm supply-chain security](https://pnpm.io/supply-chain-security)
- [Socket Firewall Free (`sfw`)](https://docs.socket.dev/docs/socket-firewall-free)
- [StepSecurity docs](https://docs.stepsecurity.io/)
