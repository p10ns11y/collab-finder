# QA: Platsbanken publication freshness

Manual check after the freshness ranking change lands. No API keys required — JobTech search is open.

## Setup

1. On laptop-1 or laptop-2, from the repo root: `pnpm tauri dev` (or launch `kanithanj.ai` from PATH if already installed).
2. Wait for the app window to open.

## Open the Platsbanken rail

1. In the left sidebar, click **Sweden** (keyboard: Meta+5).
2. Confirm the right panel shows the JobTech query field, **Search** button, rail chips, and location chips.

## Search

1. In the query field, enter `software engineer` (or any term that returns several ads).
2. Optionally select **Stockholm** under Location.
3. Click **Search** and wait until the left **Results** list shows multiple ads (not “Searching…”).

## What to look for

Work top to bottom in the Results list. Each row shows a **rank** score on the right; age tags appear in the rank reasons (same pattern as Mission firm rows).

### Ordering (Done means)

1. Find two ads with similar headlines/relevance (no ★ favorite marker, similar rank scores before freshness).
2. The ad with a **recent** `publication_date` (within the last week) should appear **above** an older ad with the same rough fit.
3. Tap/select each row and note the rank reasons on the card or row chips.

### Fresh (≤ 7 days)

- Expect a reason like `fresh:3d` (days since publication).
- Rank score should be **higher** than an otherwise identical ad in the 8–30 day window.

### Neutral (8–30 days)

- Expect **no** `fresh:` or `stale:` tag.
- Rank score should match what you would expect from API relevance + favorite boost only.

### Stale (> ~60 days)

- Expect a reason like `stale:140d`.
- The stale ad should sit **below** a fresh ad with similar relevance, but still on the first page if it has a strong match (★ or high rank).

### Unknown date

- An ad with no parseable `publication_date` should show `posted:unknown`.
- It should sit where it would have before freshness (no boost, no penalty).

### Future date (clock skew)

- If JobTech returns a publication date after today, treat it as **0 days** old (`fresh:0d`), not negative.

## Pass criteria

| Check | Expected |
|-------|----------|
| Fresh vs stale, similar relevance | Fresher ad higher in list |
| Fresh tag | `fresh:Xd` where X ≤ 7 |
| 8–30 day ad | No freshness tag; neutral score |
| > 60 day ad | `stale:Xd`; below fresh peer, still visible if strong |
| Missing/unparseable date | `posted:unknown`; neutral score |
| Reasons visible | Age tag present on inspected rows |

## Fail signals

- Stale ads consistently above fresh ads with the same relevance.
- Missing `fresh:`, `stale:`, or `posted:unknown` tags when dates differ or are absent.
- Unknown-date ads boosted or penalized vs their pre-change position.
- Strong stale matches vanish from the first page entirely.
