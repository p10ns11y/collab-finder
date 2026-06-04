# X search query tuning

**Do not guess operators.** Only use operators listed in the official reference:

- [Search operators (X API v2)](https://docs.x.com/x-api/posts/search/integrate/operators)
- [Build a query](https://docs.x.com/x-api/posts/search/integrate/build-a-query)

## Invalid in v2 query strings (will 400)

These come from legacy Twitter web search or Enterprise GNIP docs — **not** supported in `/2/tweets/search/recent`:

| Do not use | Use instead |
|------------|-------------|
| `since:2026-05-01` | API param `start_time` (ISO 8601) on the request URL; recent search only covers **last 7 days** |
| `until:…` | API param `end_time` |
| `min_faves:N` | Not available — filter in app after fetch, or tighten keywords / `has:links` |
| `filter:links`, `filter:has_engagement` | `has:links` (with a keyword/`from:` clause) |

collab-finder validates queries in Rust (`src-tauri/src/x_query.rs`) and rejects the invalid tokens above before calling X.

## Safe patterns (documented)

- **Language + no retweets:** `… lang:en -is:retweet` (both need a keyword/`from:` clause)
- **Job posts with links:** `… has:links` (pair with hiring keywords)
- **Account:** `from:xaicareers …`
- **Geo (country):** `place_country:SE` with other standalone terms

## Presets in the app

Built-in presets live in `src/core/domain/finder.ts` (`SEARCH_PRESETS`). They follow the operator reference only.

## Example queries (v2-valid)

### xAI / Grok

```
from:xaicareers (hiring OR engineer OR careers OR inference) lang:en -is:retweet has:links
```

```
("xAI" OR "x.ai" OR Grok) (hiring OR "open roles" OR engineer) lang:en -is:retweet has:links
```

### Sweden / Stockholm

```
("Senior Software Engineer" OR "AI Engineer" OR "Rust Developer") (Stockholm OR Sweden) (hiring OR jobb) lang:en -is:retweet place_country:SE
```

### Side hustles & collabs

```
("looking for" OR collaborator OR "co-founder" OR bounty) ("Rust developer" OR "AI agent" OR "local LLM") lang:en -is:retweet
```

```
("AI agent infrastructure" OR agentic OR "build with me") (hiring OR ship OR collab) lang:en -is:retweet
```

## How to use in the app

1. Pick a preset or paste a v2-valid query in **Search query**.
2. **Search** or **Run cycle** (same query rules for both).
3. Tune in the UI — recent search is limited to the last 7 days regardless of query.

## Verified career links (not X operators)

Use these outside X search (browser / applications):

- [xAI Greenhouse](https://job-boards.greenhouse.io/xai/jobs/4956028007)
- [Tesla Energy Software](https://www.tesla.com/careers/search/job/software-distributed-systems-engineer-energy-software-259432)

## Sites (off-X)

- [japan-dev.com](https://japan-dev.com/)
- [wellfound.com/jobs](https://wellfound.com/jobs)
- [@xaicareers](https://x.com/xaicareers)
