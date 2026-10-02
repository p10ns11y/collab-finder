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

Work top to bottom in the Results list. Each row shows a **rank** score on the right. The age tag (`fresh:3d`, `stale:140d`, or `posted:unknown`) is on that row and on the selected card.

### Ordering (Done means)

1. Find two ads with similar headlines/relevance (no ★ favorite marker, similar rank scores before freshness).
2. The ad with a **recent** `publication_date` (within the last week) should appear **above** an older ad with the same rough fit.
3. Select a row and confirm the same age tag is on the row and on the card.

### Fresh (0–7 days, including a future date)

- Expect `fresh:Nd` (N is days since publication, 0 for today or a future date).
- Rank score should be **higher** than an otherwise identical ad in the neutral window.

### Neutral (8–60 days)

- Expect **no** `fresh:` or `stale:` tag.
- Rank score should match API relevance + favorite boost only.

### Stale (61 days and older)

- Expect `stale:Nd`.
- A stale ad with similar relevance and no ★ should sit **below** a fresh ad.
- A stale ad with a ★ favorite and similar relevance should stay **above** fresh ads that are not favorites, and should remain on the first page of results.

### Unknown date

- An ad with no parseable `publication_date` should show `posted:unknown`.
- It should sit where it would have before freshness (no boost, no penalty).

### Future date (clock skew)

- If JobTech returns a publication date after today, treat it as **0 days** old (`fresh:0d`), not negative.

## Pass criteria

| Check | Expected |
|-------|----------|
| Fresh vs stale, similar relevance | Fresher ad higher in list |
| Fresh tag | `fresh:Nd` where N is 0–7 |
| 8–60 day ad | No age tag; neutral score |
| 61+ day ad | `stale:Nd`; below a similar fresh peer; a ★ stale ad stays above generic fresh ads and on the first page |
| Missing/unparseable date | `posted:unknown`; neutral score |
| Reasons visible | Age tag present on inspected rows |

## Fail signals

- Stale ads consistently above fresh ads with the same relevance.
- Missing `fresh:`, `stale:`, or `posted:unknown` tags when dates differ or are absent.
- Unknown-date ads boosted or penalized vs their pre-change position.
- Strong stale matches vanish from the first page entirely.
