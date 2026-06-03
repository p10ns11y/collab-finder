---
name: X
description: Use when building applications that access X's public data: searching posts, looking up users, managing followers, streaming real-time posts, publishing content, managing direct messages, or analyzing trends. Reach for this skill when users ask to integrate X data, build bots, monitor mentions, or create X-powered applications.
metadata:
    mintlify-proj: x
    version: "1.0"
---

# X API Skill Reference

## Product summary

The X API provides programmatic access to X's public conversation through modern REST endpoints. Build with posts, users, spaces, lists, direct messages, and trends. The API uses pay-per-usage pricing with no commitments. Key endpoints live at `https://api.x.com/2/`. Authentication uses Bearer tokens (app-only) or OAuth 1.0a/2.0 (user context). Official SDKs exist for Python and TypeScript. Primary docs: https://docs.x.com/x-api/introduction

## When to use

Reach for this skill when:
- A user wants to search posts or build a search application
- Building a bot or automation that reads/publishes posts
- Integrating X data into an application (user lookups, timelines, followers)
- Streaming real-time posts matching filter rules
- Managing user relationships (follows, blocks, mutes)
- Analyzing trends or engagement metrics
- Sending direct messages programmatically
- Creating lists or managing list membership
- Monitoring mentions or brand conversations

## Quick reference

### Authentication methods

| Method | Use case | Credentials |
|--------|----------|-------------|
| Bearer Token (OAuth 2.0 app-only) | Read public data, no user context | `Authorization: Bearer $TOKEN` |
| OAuth 1.0a user context | Act on behalf of a user, access private data | API key + secret + user tokens |
| OAuth 2.0 authorization code | Web apps with user sign-in | Client ID + secret + user token |

Get credentials from Developer Console at https://console.x.com

### Common endpoints

| Task | Endpoint | Method |
|------|----------|--------|
| Look up user by username | `/2/users/by/username/{username}` | GET |
| Look up post by ID | `/2/tweets/{id}` | GET |
| Search recent posts (7 days) | `/2/tweets/search/recent` | GET |
| Search full archive | `/2/tweets/search/all` | GET |
| Get user's posts | `/2/users/{id}/tweets` | GET |
| Get user's followers | `/2/users/{id}/followers` | GET |
| Create a post | `/2/tweets` | POST |
| Delete a post | `/2/tweets/{id}` | DELETE |
| Stream filtered posts | `/2/tweets/search/stream` | GET |
| Add stream rule | `/2/tweets/search/stream/rules` | POST |

### Field and expansion parameters

Always request only the fields you need:

```bash
# Request specific fields
?tweet.fields=created_at,public_metrics,lang
?user.fields=created_at,description,public_metrics

# Include related objects
?expansions=author_id,referenced_tweets.id
?user.fields=username,name
```

Default post response: `id`, `text`, `edit_history_tweet_ids` only. Default user response: `id`, `name`, `username` only.

### Rate limit headers

Every response includes:
```
x-rate-limit-limit: 900
x-rate-limit-remaining: 847
x-rate-limit-reset: 1705420800
```

Check `x-rate-limit-remaining` before making requests. When you hit 429, wait until the Unix timestamp in `x-rate-limit-reset`.

## Decision guidance

| Scenario | Choose | Why |
|----------|--------|-----|
| Need real-time posts matching keywords | Filtered stream | Lower latency (~6-7s), persistent connection, efficient |
| Need historical posts from years ago | Full-archive search | Covers back to 2006; recent search only covers 7 days |
| Building a web app with user sign-in | OAuth 2.0 auth code flow | Better for web; PKCE support; user-friendly |
| Building a backend service/bot | Bearer token or OAuth 1.0a | Simpler; no user interaction needed |
| Need to act on behalf of a user | OAuth 1.0a or OAuth 2.0 user context | Required for posting, following, liking on user's behalf |
| Rapid prototyping | Use SDK (Python/TypeScript) | Handles auth, pagination, rate limits automatically |
| Custom HTTP client or language | Use REST API directly | Full control; handle auth and pagination yourself |

## Workflow

1. **Set up credentials**
   - Go to https://console.x.com and create an app
   - Copy your Bearer Token (for app-only requests)
   - For user-context requests, generate OAuth tokens via 3-legged flow

2. **Choose your endpoint**
   - Identify what data you need (posts, users, followers, etc.)
   - Check if it requires user context or works with app-only auth
   - Review the endpoint's API reference for available fields

3. **Build your request**
   - Start with minimal fields (defaults are lean)
   - Add `tweet.fields`, `user.fields`, etc. for extra data
   - Use `expansions` to include related objects (author, media, etc.)
   - For search, construct query with operators: `from:user`, `has:images`, `lang:en`, etc.

4. **Make the request**
   - Use cURL, Postman, or an SDK
   - Include `Authorization: Bearer $TOKEN` header
   - Parse JSON response; check for `errors` array even in 200 responses

5. **Handle pagination and rate limits**
   - Check `x-rate-limit-remaining` header
   - Use `next_token` in response for pagination
   - Implement exponential backoff for 429 errors
   - SDKs handle this automatically

6. **Verify results**
   - Check HTTP status code (200, 201, 204 = success)
   - Validate response structure matches endpoint docs
   - For partial failures, check `errors` array
   - Log request details for debugging

## Common gotchas

- **Minimal default response**: Posts return only `id` and `text` by default. Always request fields explicitly or you'll miss data.
- **Field vs. expansion confusion**: Use `fields` to get more data on the main object; use `expansions` to include related objects (author, media, etc.).
- **Protected accounts**: Posts from protected accounts only visible if you're authorized. Returns 404 otherwise.
- **Deleted posts**: Deleted posts return 404. No way to distinguish from never-existed.
- **Rate limit surprises**: Each endpoint has its own limit. Hitting one endpoint's limit doesn't affect others. Check headers proactively.
- **Stream rules require at least one**: Filtered stream returns 409 if no rules exist. Always add a rule before connecting.
- **OAuth 1.0a signature errors**: Signature calculation is fragile. Use an SDK or library to avoid manual signing.
- **Query syntax errors in search**: Quotes in exact phrases must be escaped. Test queries in Postman first.
- **Streaming disconnections**: Implement automatic reconnect with exponential backoff. Don't assume connection stays open forever.
- **Pagination token expiry**: Pagination tokens expire after ~30 minutes. Don't store them long-term.

## Verification checklist

Before submitting work:

- [ ] Authentication credentials are correct and not hardcoded
- [ ] Request includes appropriate `Authorization` header
- [ ] Fields and expansions are explicitly requested (not relying on defaults)
- [ ] Error handling checks both HTTP status and `errors` array in response
- [ ] Rate limit headers are monitored; exponential backoff implemented for 429
- [ ] Pagination logic handles `next_token` correctly
- [ ] For streaming: at least one rule exists before connecting
- [ ] For OAuth 1.0a: signature calculation uses a library, not manual code
- [ ] Response parsing handles partial errors (some resources fail, others succeed)
- [ ] Sensitive credentials (tokens, keys) are stored in environment variables, not code

## Resources

**Comprehensive navigation**: https://docs.x.com/llms.txt

**Critical pages**:
- [Make Your First Request](https://docs.x.com/make-your-first-request) — Step-by-step quickstart with cURL examples
- [Authentication Overview](https://docs.x.com/fundamentals/authentication/overview) — All auth methods explained
- [Rate Limits](https://docs.x.com/x-api/fundamentals/rate-limits) — Detailed limits by endpoint and recovery strategies

---

> For additional documentation and navigation, see: https://docs.x.com/llms.txt