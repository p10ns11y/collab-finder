# Job sources — operator hunt map

Curated sources for **fast URL → Evaluate → Apply** in collab-finder. Tiers are reliability for *your* stack (TypeScript/Rust/React, agentic AI, senior IC). Culture tags are **hints you verify** — not hard filters in code unless noted in `rank.json` / hire-board sheet.

**Geo mix (your band):** ~60% Sweden · ~10% Nordics · ~20% EU best places · US remote apply OK (visa wall expected).

---

## Fastest paths in the app

| Path | Screen | When |
|------|--------|------|
| **Mission Pull** | Mission | Firm on Greenhouse/Lever/Ashby/JobTech — one-click import + JD |
| **Sweden search** | Sweden | Platsbanken/JobTech — skips cookie wall |
| **Quick Target** | Discover | Paste any career URL or JD |
| **Hire board** | Discover | Curated sheet (`data/hire-board/operator-sources.csv`) |
| **Xplore** | Xplore | Live posts with `has:links` presets |

---

## Tier A — API-integrated (Mission screen)

Public ATS APIs; no auth. Slugs HTTP-verified 2026-08-19.

### Sweden / Nordics depth

| Firm | Mission id | ATS | Career URL |
|------|------------|-----|------------|
| Lovable | `lovable` | Ashby | https://lovable.dev/careers |
| Legora | `legora` | Ashby | https://legora.com/careers |
| Mentimeter | `mentimeter` | Greenhouse | https://www.mentimeter.com/careers |
| Recorded Future | `recordedfuture` | Greenhouse | https://www.recordedfuture.com/careers |
| Klarna | `klarna` | JobTech | https://www.klarna.com/careers |
| Einride | `einride` | JobTech | https://www.einride.tech/careers |
| Saab | `saab` | JobTech | https://www.saab.com/careers |
| Ericsson | `ericsson` | JobTech | https://www.ericsson.com/en/careers |
| Atlas Copco | `atlas_copco` | JobTech | https://www.atlascopco.com/en/careers |
| ABB | `abb` | JobTech | https://global.abb/group/en/careers |
| Volvo Group | `volvo_group` | JobTech | https://www.volvogroup.com/en/careers |
| Sandvik | `sandvik` | JobTech | https://www.home.sandvik/en/careers |
| Hexagon | `hexagon` | JobTech | https://careers.hexagon.com |
| Epiroc | `epiroc` | JobTech | https://www.epiroc.com/en/careers |
| Spotify | `spotify` | Lever | https://www.lifeatspotify.com/jobs |

**Sweden-wide (not single-firm):** JobTech search API — https://jobsearch.api.jobtechdev.se (Sweden screen). ~45k+ Platsbanken ads; best for consultancy/AF-listed roles.

### EU width (best places)

| Firm | Mission id | ATS | Notes |
|------|------------|-----|-------|
| n8n | `n8n` | Ashby | Berlin; workflow/automation |
| ElevenLabs | `elevenlabs` | Ashby | Voice AI; remote-friendly |
| Supabase | `supabase` | Ashby | Remote-first Postgres platform |
| Linear | `linear` | Ashby | Remote-first product eng |
| Vercel | `vercel` | Greenhouse | Next.js; remote |
| Wayve | `wayve` | Ashby | UK autonomous driving |

### US frontier (apply anyway; sponsorship rare)

| Firm | Mission id | ATS | Notes |
|------|------------|-----|-------|
| SpaceXAI | `spacexai` | Greenhouse (`xai`) | Primary north star |
| SpaceX | `spacex` | Greenhouse | Hardware + software |
| Tesla | `tesla` | Local/API dump | Mixed SW/HW filter in Mission |
| Anthropic | `anthropic` | Greenhouse | Inference / safety |
| OpenAI | `openai` | Ashby | Frontier lab |
| Together AI | `togetherai` | Greenhouse | Inference infra |
| Anduril | `anduril` | Greenhouse | Defense; mission meritocracy |
| Perplexity | `perplexity` | Ashby | Search + inference |
| Poolside | `poolside` | Ashby | AI dev tools |
| Figure / 1X / PI / Waymo / DeepMind / Hive / GitLab / Wolt | see Mission registry | various | Physical AI + platform |

---

## Tier B — Paste URL / Discover Quick Target

No bulk API in app yet. Bookmark for weekly skim.

| Source | URL | Speed | Use |
|--------|-----|-------|-----|
| **DevJobs.se** | https://devjobs.se | Daily | SE dev aggregator → links to Platsbanken/ATS |
| **HN Who's Hiring** | https://news.ycombinator.com/item?id=49156683 (Aug 2026) | Monthly | Founder-direct; filter Rust/TS |
| **HNHiring index** | https://hnhiring.com | Monthly | Tech filters on HN thread |
| **WarpJobs** | https://warpjobs.com | Daily | GPU/inference niche |
| **ai-jobs.net** | https://ai-jobs.net | Daily | Vertical AI board |
| **YC Work at a Startup** | https://www.ycombinator.com/jobs | Continuous | High-growth startups |
| **Wellfound** | https://wellfound.com | Continuous | Startup/equity |
| **Welcome to the Jungle (Otta)** | https://welcometothejungle.com | Continuous | EU curated |
| **NextLevelJobs.eu** | https://nextleveljobs.eu | Weekly | €100k+ scraped roles |
| **Webbjobb.io** | https://webbjobb.io | Daily | Swedish web/IT tags |
| **Jobanni** | https://jobanni.com | Continuous | Direct company career page links; no middleman ATS |
| **Hiring without whiteboards** | https://github.com/poteto/hiring-without-whiteboards | Manual | Community list of firms that skip whiteboard interviews. **Do not ingest yet** — distill company names + career URLs into `packs/mission-firms.json` / hire-board in a later task. |

**HN spike (future):** small prototype to parse monthly HN thread → Mission-style leads. Not shipped; manual skim + paste until then.

**Hiring without whiteboards (later):** https://github.com/poteto/hiring-without-whiteboards README is a firm list (take-home / conversational process). Distill matching Greenhouse/Lever/Ashby slugs into the operator `mission-firms.json` pack — do not copy the whole catalog into git.

---

## Tier C — Consultancy / fast cash (Sweden)

Higher **velocity**, lower moat. Use **Sweden screen** + JobTech keywords; verify employer on Platsbanken before apply.

| Pattern | JobTech query hint | Culture hint |
|---------|-------------------|--------------|
| Senior fullstack via konsult | `senior fullstack typescript Stockholm` | Paid trial / strong-dev talk per [[hiring-posture]] |
| AF-listed direct hire | Platsbanken URL in Discover | Statutory parental leave baseline |
| Body-shop (Quest, AFSS, etc.) | DevJobs.se → filter "consultancy" | Fast landing; rotate if stack wrong |

---

## Culture / family signal tags (verify yourself)

Use in hire-board **Tier** column and durability `places.json` weights — not auto-excluded in Mission unless you add a gate.

| Tag | Objective signal | Examples |
|-----|-------------------|----------|
| **A-family** | SE statutory 480d parental + above-market package | Spotify, Klarna, Saab, industrial majors |
| **A-growth** | Revenue/backlog growth, real product | Lovable, Legora, SpaceXAI vector |
| **B-merit** | Mission/defense/industrial; output-weighted hiring | Saab, Anduril, Atlas, SpaceX |
| **B-remote** | Remote or async-first | Supabase, Linear, Vercel, GitLab |
| **C-verify** | Apply but read JD for mandatory training / weak leave | Some fintech scale-ups |
| **C-consult** | Fast cash; verify project length | Platsbanken konsult listings |

**Hard exclude hint (human):** skip employers where JD mandates ideology training or offers weak parental leave vs role level — you confirm before Evaluate.

---

## Xplore presets

See `data/distillation/x-search/queries.json`. New presets (2026-08-19):

- **Stockholm high-growth** — Lovable-class AI product companies in SE
- **Nordic physical AI** — autonomous, robotics, industrial software
- **HN hiring links** — `has:links` posts referencing who's hiring
- **US remote frontier** — width apply band
- **SE consultancy** — rekryterar/konsult + senior stack

---

## Weekly operator loop

1. **Navigating** — read mission heading; one **Do** apply.
2. **Jobanni live-check** — https://jobanni.com search (`senior software engineer Stockholm`, `/locations/Sweden`). Paste **one** Greenhouse/Lever/Ashby/Workable URL into Discover. Jobanni does **not** index JobTech/Platsbanken.
3. **Mission Pull** — default firm set (SE-heavy) + query `typescript rust senior`.
4. **Sweden** — one consultancy + one direct-hire search.
5. **Xplore** — run priority + Stockholm presets; import links with `has:links`.
6. **Discover** — Hire board skim `operator-sources.csv` Tier A rows not yet in DB.
7. **Evaluate → Prepare → Apply** — same session; do not wait for replies.

---

## Related

- [GUIDE.md](./GUIDE.md) — screens and checklist
- [mission-flow-relevance.md](./mission-flow-relevance.md) — Pull vs Next 10 vs Evaluate
- [config.md](./config.md) — `rank.json`, `universe.json`, places weights
- `data/hire-board/operator-sources.csv` — tier-tagged company list for Discover hire board
