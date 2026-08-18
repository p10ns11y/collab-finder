# Firm durability scorer (v1)

Deterministic ranker for **kanithanj.ai** (crate `collab-finder`). Iteration v1 answers: *can this employer operate for ten years, stay relevant after an AI wave, and is the loop worth a Swedish citizen’s scarce apply hours?*

## Data plane (what lives where)

| Store | Role | Why this, not that |
|-------|------|--------------------|
| `universe.v1.json` (this folder, git) | Evidence + axes. Public IR only. | Replayable. No apply state. |
| SQLite `firm_durability_runs` / `_scores` | Local snapshot of each run | Same intention-engine pattern as opportunities. Survives relaunch. |
| In-memory rank (Rust `firm_durability.rs`) | Hard gates + weighted score | Tests pin the algorithm. |
| Career-board registry (`mission_firms.rs`) | Pullable Greenhouse / Lever / Ashby / JobTech | Orthogonal to quality. A fortress with no public board still ranks. |

**Not Neo4j (this iteration).** A property graph server is the wrong tool for one operator, ~30 firms, and a 10-row list. Edges in the JSON (`same_sector`, `talent_vector`) are enough to walk later. Promote to an embedded graph only when a real multi-hop query exists (supplier → talent → sponsor).

## Hard gates (exclude)

1. `theater_saas` — simple software-as-a-service plus long interview theatre (typically 4–6 rounds).
2. `fortress < 2` — cannot show a decade of operations from cash / free cash flow / backlog.
3. `product_moat < 2` — no product a customer would miss.
4. `hiring_signal == 0` — process is the product.

## Score (admitted only)

Axes are integers 0–4.

```
quality = 8·spacexai_vector + 7·fortress + 6·ai_tsunami + 6·product_moat + 5·hiring_signal
geo     = SE 16 · Nordics 12 · Europe 8 · Estonia 6 · US/JP/SG 4
total   = quality + geo
```

**Action top 10** = 7 depth (Sweden → Nordics → Europe → Estonia) + 3 width (United States first, then Japan / Singapore). SpaceXAI stays in the width three when it passes gates.

## Honesty rules

- Numbers come from the company’s own year-end / IR page. Missing field = `null`, not a guess.
- Private firms (SpaceXAI) may have `fortress` from known capital + operating business, but profit stays `null`.
- Estonia is a **work-location** preference, not a source of fortress industrials. Iteration v1 admits none there.
- Live apply / intro state never enters this folder.

## Repeatable waves

Same procedure, next 10 = exclude prior admitted ids (`Next 10` in Mission).

1. Universe + gates + score  
2. 7 depth + 3 width  
3. Persist wave to SQLite + `durable_firm` opportunities  
4. Next wave skips those ids  

Pull stores every posting as `mission_pull` (Data → Opportunities + Search Runs). Card click fetches the JD and scores a **local** profile match (no model). Evaluate still calls xAI.

## Verify

```
cd src-tauri && cargo test firm_durability
```
