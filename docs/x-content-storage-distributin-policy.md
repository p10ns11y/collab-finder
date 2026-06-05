**No, you are not clearly violating X's terms in a high-risk way for a personal desktop app**, but storing full post text persistently does touch the edges of their Developer Policy in a way that could be tightened. Storing only post links + partial text (or, better, Post IDs + minimal metadata) is a cleaner, lower-risk approach and aligns better with X's stated preferences.

### What X's Policy Actually Says (Current as of 2026)

From the official [X Developer Policy](https://docs.x.com/developer-terms/policy):

- **"The best place to get X Content is directly from X."** They explicitly want to discourage long-term storage/redistribution of hydrated (full) Post content.
- **Redistribution to third parties** is heavily restricted: You can generally only share **Post IDs** (and User IDs) in bulk. Limits like 1.5M Post IDs per 30 days to any entity apply when sharing with others. Your personal Tauri app is **not** redistributing to third parties, so this section is less directly applicable.
- **Offline storage clause** (the relevant one here):  
  > "If you store X Content offline, you must keep it up to date with the current state of that content on X. Specifically, you must delete or modify any content you have if it is deleted or modified on X. This must be done as soon as reasonably possible, or within 24 hours after receiving a request..."

- You must also maintain integrity when *displaying* content (use the API for the most current version; remove promptly if deleted).

Your project (from the code in `db.rs` and `x_search.rs`):
- Fetches live via the official `/2/tweets/search/recent` endpoint (good — you're using the API properly with your Bearer token).
- Persists into SQLite (`collab-finder.db`): full `text`, `id`, `author_id`, `created_at`, plus search run metadata and leads.
- Uses FTS5 on the full text for local search.

This means you **are** storing full X Post content offline. There's no visible mechanism (yet) for syncing deletions or modifications, which technically puts you on the wrong side of the "keep it up to date" rule.

### Is This a Real Problem in Practice?

For a **personal desktop tool** (Tauri + your own API token, not a public web service or dataset you share):

- **Low enforcement risk.** X primarily goes after bulk scraping without the API, public full-tweet archives, commercial redistribution, or people building competing datasets. A single person's local opportunity/lead tracker is not their target.
- However, it is not 100% pedantically compliant if you keep full text long-term without deletion handling.
- The `search_runs` / `search_hits` / `leads` tables (your audit trail and scoring) are fine — those are *your* data.

### Your Proposed Alternative: Post Links + Partial Text

**Yes, this is a good idea and meaningfully safer.**

Storing:
- The Post **ID** (primary key)
- A short **partial text** / snippet (e.g. first 200–300 characters, or a truncated version for preview/FTS)
- Your internal metadata (`fetched_at`, your score, status, notes, search context, etc.)
- The **link** (easily derived: `https://x.com/i/web/status/{id}` or with username if you store it)

**Why this is better:**
- You avoid (or minimize) storing full "X Content" long-term.
- You can always re-fetch the authoritative full text on demand via the lookup endpoint (`GET /2/tweets/{id}`) when the user actually opens a lead or needs the complete post. This gives you fresh data + automatic handling of deletions (404 = gone).
- Links + snippets are much closer to "public reference" than full hydrated posts.
- You still get most of the UX benefits (local search/preview, deduplication, lead tracking).

This pattern (store IDs + rehydrate on demand) is the approach X implicitly encourages and what many careful developers use for personal/compliance-sensitive tools.

### Recommended Path Forward

1. **Short-term (quick win)**: Change the `tweets` insert to store only a truncated `snippet` (or make `text` nullable / move full text out). Keep everything else. Update your FTS table accordingly or run FTS only on the snippet. This already reduces exposure significantly.

2. **Better long-term**: Make the `tweets` table ID-primary with minimal metadata. When rendering or deeply processing a lead, add a small `hydrate_tweet(id)` command that calls the lookup API and merges fresh data. You can cache the fresh version temporarily in memory or for the current session.

3. **Nice-to-have**: Add a lightweight cleanup pass (e.g., on app start or in the reactor) that checks a sample of older leads or uses batch compliance ideas if volume grows. For personal scale this is often overkill.

4. **Documentation**: Add a short note in the README (under a "Data Handling" or "Compliance" section) stating that data is fetched via the official X API for personal productivity use only, full content is minimized, and links always point back to the original on X. This shows good faith.

### Other Quick Notes

- **Rate limits**: Your recent search usage looks reasonable for personal/autonomous reactor use. Lookup (for rehydration) is cheap and has its own limits.
- **Never commit** the `.db` file or any real tweet data to the repo.
- The secure keychain handling for the Bearer token and the overall architecture (reactor, guards, etc.) are already solid.
- Using xAI for processing the opportunities is fine (the policy carves out exceptions around Grok/xAI in some contexts).

**Bottom line**: Your current full-text storage is *practically* low-risk for a personal tool, but switching to a Post-ID + link + partial-text (or snippet) model is cleaner, more future-proof, and closer to X's intent. It also gives you fresher data when users interact with leads.

If you want, share the relevant parts of `db.rs` or how the reactor writes to the DB and I can give more targeted edit suggestions. You're building something useful here — nice work on the Tauri + Rust + local-first approach.