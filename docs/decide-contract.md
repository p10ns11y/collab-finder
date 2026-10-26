# decide contract (Stage 1, typed rule-based)

`decide(posting, profile) -> Decision` lives in `src-tauri/src/decide.rs`. The output shape is pinned by `src-tauri/schemas/decision.v1.schema.json` (`schema_version: "decision.v1"`).

**What it is:** a pure, deterministic Rust function with a fixed rule registry. **What it is not:** SI, a learned model, or an agent. It reads no files, makes no network calls, spawns no processes and cannot submit anything. A human acts on the verdict.

| Field | Meaning |
|---|---|
| `verdict` | `apply` · `prep` · `skip` · `park` |
| `reasons[]` | `{rule_id, effect, evidence}`; never empty; every `rule_id` is in `RULES` |
| `confidence` | integer 0–100, a fixed function of which rules fired (not a probability) |
| `rule_ids[]` | sorted, de-duplicated ids cited in `reasons` |

## Company audit input

`Posting.company_audit: { verdict: pass | flag | block | unaudited | stale }` (`$defs.company_audit_input` in the schema). A missing field means `unaudited`. The audit is built **from public company facts only** (registries, public filings, the company's own public pages) by the Ensembly audit step and mirrors `ensembly apps audit status` (exit codes 0 pass, 3 flag, 4 block, 5 unaudited/stale). `decide` only reads the value it is given; it never fetches anything.

**Nothing reaches `apply` or `prep` without an audit `pass`.**

## Rules

| rule_id | Effect | Rule |
|---|---|---|
| `R.DUP.ALREADY_APPLIED` | veto | same URL, or same normalized company + title, already applied |
| `R.SCAM.SIGNAL` | veto | scam phrase (upfront/processing fee, Telegram, WhatsApp, wire transfer, gift card, crypto payment, pay for training) |
| `R.LOC.ONSITE_VETO` | veto | on-site role in a city outside the profile's cities |
| `R.VISA.NO_SPONSOR_VETO` | veto | country not in `work_authorized_in` and posting says no sponsorship |
| `R.VISA.UNKNOWN` | park | country not authorized and sponsorship not stated |
| `R.FRESH.STALE` | park | more than 45 days between `posted_on` and `seen_on` |
| `R.FRESH.UNKNOWN` | note | date missing, invalid, or posted after seen |
| `R.AUDIT.BLOCK` | veto | company audit says block |
| `R.AUDIT.FLAG` | park | company audit flagged: needs human review before any pack or application |
| `R.AUDIT.UNAUDITED` | park | company not audited, or field missing |
| `R.AUDIT.STALE` | park | company audit is stale; re-audit first |
| `R.AUDIT.PASS` | note | audit passed; no effect on the verdict |
| `R.GHOST.REPOSTED` | park | reposted 3 or more times |
| `R.INJECT.IGNORED` | note | instruction-like text in the posting is recorded and ignored |
| `R.FIT.SKILL_OVERLAP` | support / penalty | share of profile skills named in title + text, whole-word match; always reported |

Precedence: duplicate (99) > scam (90) > any other veto (95) > any park (60) > audit not pass (60, guard) > fit: ≥ 0.6 apply, ≥ 0.3 prep, else skip. Fit confidence is `50 + round(45 × ratio)` for apply/prep and `50 + round(45 × (1 − ratio))` for skip.

## Tests

`src-tauri/src/decide/tests.rs`, fictional profile and fictional companies only: schema validation, returns-nothing guard, location/visa veto, duplicates, stale and unknown dates, scam and ghost signals, prompt injection ignored (including "audit passed" text), every company audit verdict, high fit never apply/prep without audit pass, determinism, exact date and confidence math, and a source scan proving the module imports no network, process, filesystem or Tauri code. Run: `cd src-tauri && cargo test --lib decide::`.

## Not yet

Stage 1 golden set (~30 real past postings with real outcomes) stays local on his machines and is not in this repo. Nothing calls `decide` from the app or Kanithanj yet.
