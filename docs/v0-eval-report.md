# v0 eval report

```mermaid
flowchart LR
  R[real pool + eval set<br/>other machine only] -->|Fleet Desk run| N[recall, mismatches, precision]
  S[synthetic pool in git] -->|CI v0-verify| C[privacy, abuse, offline, a11y, scope, closed rows]
  N --> T[table below]
  C --> T
```

The eval set and the real pool never enter git or CI. Real-pool rows are filled from Fleet Desk's run at the named commit; every other row is checked in CI on each push.

| §5 check | v0 exit | Measured | Where |
|---|---|---|---|
| His description vs his in-pool applied roles, recall@30 | ≥ 8 of 11 (brief), ≥ 10 of 14 (plan) | pending Fleet Desk run | real pool |
| Known mismatches in fits now | 0 | pending Fleet Desk run | real pool |
| 8 in-scope personas, precision@5 of fits now | ≥ 0.7 mean | pending Fleet Desk run | real pool |
| 3 out-of-scope personas get the honest message | 3 of 3 | 3 of 3 | `core.test.ts` out of scope |
| Closed rows shown | 0 | 0 under 400 generated pools | `properties.test.ts` P1, P13 |
| Requests carrying description, goal or likes | 0 | see CI log `REQUESTS` | `web.spec.ts` |
| Personal keys in pool export | 0 | 0 | `export.test.ts`, build pool scan |
| Lighthouse accessibility | ≥ 95 | see CI log `LIGHTHOUSE` | v0-verify web job |
| Works offline after first load | yes | see CI | `web.spec.ts` offline |
| 30 abuse inputs | 0 errors | see CI log `ABUSE` | `web.spec.ts` |

## Recall changes in this round

```mermaid
flowchart LR
  L[likes box] -->|liked company +15, fixed| O[same rows, reordered]
  K[title lists 2+ skills] -->|no skill tie-break| O
  G[lowercase go at list start] -->|read as golang| O
```

- The likes box never adds, drops or regroups a row (property L2); a liked company's score rises by exactly 15 and no row passes it (L3).
- The likes text stays in the tab: no storage API, one fetch for the pool (contract test), 0 requests carry it (Playwright).
