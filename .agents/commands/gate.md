# /gate — collab-finder CI parity

Run full local gate. Do not invent `pnpm lint` / `pnpm precommit`.

## Do now

From repo root:

```bash
pnpm gate
```

That is `scripts/gate.sh`: frozen `pnpm install`, `pnpm build`, `pnpm verify`, seed fixtures, `cargo test --lib`.

If gate fails: fix forward, re-run, then report which step failed. If the user only changed TS, prefer `pnpm type-check` / `pnpm verify` unless they asked for full gate.
