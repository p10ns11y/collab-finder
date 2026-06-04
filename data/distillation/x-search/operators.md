# X API v2 search operators (collab-finder)

**Canonical doc:** https://docs.x.com/x-api/posts/search/integrate/operators  
**Build guide:** https://docs.x.com/x-api/posts/search/integrate/build-a-query

Recent search (`/2/tweets/search/recent`) returns posts from the **last 7 days** only. Self-serve query length limit: **512 characters**.

## Never use in the query string

| Invalid | Use instead |
|---------|-------------|
| `since:YYYY-MM-DD` | Request param `start_time` (ISO 8601) on the URL |
| `until:…` | Request param `end_time` |
| `min_faves:N`, `min_retweets:N` | Tighten keywords; post-filter in app |
| `filter:links`, `filter:has_engagement` | `has:links` (with a keyword or `from:`) |

Enforced in app: `src-tauri/src/x_query.rs`.

## Conjunction-required operators

Must appear with at least one standalone term (keyword, `"phrase"`, `from:`, `#tag`, `@user`):

- `lang:en`, `-is:retweet`, `has:links`, `has:media`, `is:verified`, `place_country:SE`, etc.

## Recommended patterns for opportunity search

```
(keywords OR "exact phrase") lang:en -is:retweet has:links
```

```
from:account (hiring OR engineer OR careers) lang:en -is:retweet has:links
```

```
(keywords) (City OR Country) (hiring OR jobb) lang:en -is:retweet place_country:SE
```
