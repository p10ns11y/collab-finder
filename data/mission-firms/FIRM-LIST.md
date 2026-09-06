# Mission firm list

Maintained from [`universe.v1.json`](../durability/universe.v1.json). Scored at **2026-09-06**.

Edit the universe file for stability (`fortress`), hire climate (`hiring_signal`), and economic notes (`cash.note`, `note`). Do not re-LLM the whole registry.

| id | name | fortress | hiring | cash / economic note | status | updated |
| --- | --- | ---: | ---: | --- | --- | --- |
| abb | ABB | 4 | 3 | FY2025 rev 33.2 USDb · income_from_operations 6.047 · fcf 4.566 | active | 2026-09-06 |
| agility | Agility | 1 | 3 | Excluded: venture runway. | excluded | 2026-09-06 |
| asml | ASML | 4 | 2 | FY2025 rev 32.667 EURb · net_income 9.609 | active | 2026-09-06 |
| atlas_copco | Atlas Copco | 4 | 4 | FY2025 rev 168.343 SEKb · operating_profit 34.114 | active | 2026-09-06 |
| bolt | Bolt | 1 | 1 | Estonia work-location exists; no fortress industrial passed gates. | excluded | 2026-09-06 |
| deepmind | Google DeepMind | 4 | 2 | Alphabet parent is the fortress. Lab itself is not a cash statement. | active | 2026-09-06 |
| einride | Einride | 1 | 3 | Excluded: growth-stage, not 10-year operate-from-cash. | excluded | 2026-09-06 |
| epiroc | Epiroc | 3 | 3 | Sandvik spin; fortress assumed from sector, not a full IR pull. | active | 2026-09-06 |
| ericsson | Ericsson | 4 | 2 | FY2025 rev 236.681 SEKb · net_income 28.7 · fcf 26.8 · net cash 61.2 | active | 2026-09-06 |
| fanuc | Fanuc | 4 | 3 | Cash-rich robot OEM. FY not pulled this iteration. | active | 2026-09-06 |
| figure | Figure | 1 | 3 | Excluded: venture runway, not fortress cash. | excluded | 2026-09-06 |
| gitlab | GitLab | 2 | 0 | Excluded: software-as-a-service with long interview loops. | excluded | 2026-09-06 |
| hexagon | Hexagon | 3 | 3 | Industrial metrology + software. FY cash not pulled this iteration. | active | 2026-09-06 |
| hive | Hive | 1 | 0 | Excluded. | excluded | 2026-09-06 |
| klarna | Klarna | 2 | 0 | Excluded: theater software-as-a-service, not a 10-year physical moat. | excluded | 2026-09-06 |
| kongsberg | Kongsberg | 3 | 3 | FY2025 numbers not pulled | active | 2026-09-06 |
| nokia | Nokia | 3 | 2 | Nordic RAN peer. Full FY not pulled this iteration. | active | 2026-09-06 |
| nvidia | NVIDIA | 4 | 3 | FY2026 rev 215.9 USDb · net_income 120.067 · fcf 96.676 | active | 2026-09-06 |
| onex | 1X | 1 | 3 | Excluded: Nordic robotics, still venture cash. | excluded | 2026-09-06 |
| pi | Physical Intelligence | 1 | 3 | Excluded: venture runway. | excluded | 2026-09-06 |
| saab | Saab | 4 | 3 | FY2025 rev 79.1 SEKb · fcf 4.206 | active | 2026-09-06 |
| sandvik | Sandvik | 4 | 3 | FY2025 rev 120.68 SEKb · fcf 21.2 | active | 2026-09-06 |
| siemens | Siemens | 4 | 2 | FY2025 rev 78.9 EURb · net_income 10.4 · fcf 10.8 | active | 2026-09-06 |
| spacexai | SpaceXAI | 3 | 3 | Private. Fortress is capital + operating product, not a filed profit. | active | 2026-09-06 |
| spotify | Spotify | 3 | 0 | Excluded: content stream is AI-substitutable; hiring theatre. | excluded | 2026-09-06 |
| tesla | Tesla | 3 | 3 | FY2025 rev 94.827 USDb · gaap_net_income 3.794 · fcf 6.22 | active | 2026-09-06 |
| volvo_cars | Volvo Cars | 2 | 1 | FY2025 rev 357.3 SEKb (−11% vs 400.2 in 2024). Adj. operating income 12.5 SEKb (3.5% margin); reported EBIT 0.3 SEKb incl. impairment/restructuring. FCF 2.4 SEKb. Revenue down, thin margins, cost/cash actions ongoing. Consumer auto, Geely-majority — weaker fortress than Volvo Group. | watch | 2026-09-06 |
| volvo_group | Volvo Group | 4 | 3 | FY2025 rev 479.2 SEKb · adjusted_operating_income 51.218 · fcf 21.837 · net cash 63 | active | 2026-09-06 |
| wolt | Wolt | 2 | 0 | Excluded: marketplace, not a fortress product. | excluded | 2026-09-06 |

**Status:** `active` passes gates; `watch` admitted with weak hire signal or operator flag; `pause` operator hold; `excluded` fails durability gates.

Regenerate: `node scripts/generate-firm-list.mjs`
