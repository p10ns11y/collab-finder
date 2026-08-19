# ai-optimization — English procedure

> Expand **only if** the formal [SKILL.md](../SKILL.md) is still ambiguous for the current step. Do **not** dual-load by default.

## Why fission exists

Large-repo agent turns fail when the model spends the context budget on low-signal files. Context Sage forces a **relevance → form → budget** pipeline so the answer stays correct while token cost drops.

## Intent parsing (detail)

1. Classify goal: implement | debug | refactor | explain | test | migrate | optimize.
2. List exact symbols (types, functions, files). Prefer user-named identifiers over guesses.
3. Scope: single file, module, feature, cross-cutting, or whole project.
4. Infer token pressure from model if known (128k / 200k / 1M) and from how much the user already pasted.

## Project map (lightweight)

Keep an in-memory sketch, not a full index:

- Modules and their public exports
- Approximate call edges for hot paths
- Files touched in the last few turns
- Architectural style (MVC, clean, monorepo packages, etc.)

Update the map when new evidence appears; do not re-scan the entire tree every turn.

## Scoring worked example

Target: fix auth token refresh in `src/auth/session.ts`.

| File | Why | Score band |
|------|-----|------------|
| `src/auth/session.ts` | edit target + auth | never-compress → full |
| `src/auth/types.ts` | symbol/types | high |
| `src/api/client.ts` | caller of refresh | high signatures |
| `tests/auth.test.ts` | debug/test goal | no −50 penalty |
| `src/legacy/dashboard.tsx` | unrelated | low / name-only |

## Compression narrative

- **Full stripped:** remove license headers, dead imports, noise comments; keep logic.
- **Signature + critical blocks:** keep control-flow that encodes business rules; collapse boilerplate.
- **API + one-liner:** enough for navigation and "what depends on what".
- **Name only:** bookmark for later expand.

## Budget discipline

1. Estimate tokens for selected context.
2. If over 35% of context for *input* code: drop lowest scores, then re-compress mid-tier items.
3. Never free budget by dropping never-compress files — free it by dropping low-score noise.

## Accuracy scars (why guards exist)

- Summarizing auth/payments caused silent security bugs.
- Editing from a summary invented APIs that were not in the file.
- Flaky tests live in test helpers and config; the −50 test/ penalty must be waived for debug.
- "Assuming standard pattern" without reading the body is a failure mode, not a feature.

## Hand-off to fusion

After pruning, if the user needs architecture, domain models, or compounding improvements, load [fusion-sage](../../fusion-sage/SKILL.md). Fission remains the containment field; fusion adds synthesis and surplus.

## Self-improvement loop

- Symbols used in the final answer → raise future score.
- User `expand` on a summary → lower compression for that class of symbol next turn.
- Track only lightweight session memory; do not invent a permanent global index unless the project uses fusion-state.
