# /gate — collab-finder CI parity

Run full local gate (includes Vite build). GitHub PR CI uses `pnpm ci-check` instead; tag push builds the binary.

Do not invent `pnpm lint` / `pnpm precommit`.

## Do now

From repo root:

```bash
pnpm ci-check   # PR parity: type-check + verify + cargo test
pnpm gate       # above + Vite build — before push when UI/build inputs changed
```

`scripts/gate.sh`: frozen `pnpm install`, `pnpm build`, `pnpm verify`, seed fixtures, `cargo test --lib`.

If gate fails: fix forward, re-run, then report which step failed. Agent/docs-only work: `pnpm ci-check` is enough unless Vite inputs changed.
