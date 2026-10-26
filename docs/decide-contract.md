# decide contract (Stage 1, typed rule-based)

`decide(posting, profile) -> Decision` lives in `src-tauri/src/decide.rs`. The output shape is pinned by `src-tauri/schemas/decision.v1.schema.json` (`schema_version: "decision.v1"`).

**What it is:** a pure, deterministic Rust function with a fixed rule registry. **What it is not:** SI, a learned model, or an agent. It reads no files, makes no network calls, spawns no processes and cannot submit anything. A human acts on the verdict.

| Field | Meaning |
|---|---|
| `verdict` | `apply` · `prep` · `skip` · `park` |
| `reasons[]` | `{rule_id, effect, evidence}`; never empty; every `rule_id` is in `RULES` |
| `confidence` | integer 0–100, a fixed function of which rules fired (not a probability) |
| `rule_ids[]` | sorted, de-duplicated ids cited in `reasons` |

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
| `R.GHOST.REPOSTED` | park | reposted 3 or more times |
| `R.INJECT.IGNORED` | note | instruction-like text in the posting is recorded and ignored |
| `R.FIT.SKILL_OVERLAP` | support / penalty | share of profile skills named in title + text, whole-word match; always reported |

Precedence: duplicate (99) > scam (90) > any other veto (95) > any park (60) > fit: ≥ 0.6 apply, ≥ 0.3 prep, else skip. Fit confidence is `50 + round(45 × ratio)` for apply/prep and `50 + round(45 × (1 − ratio))` for skip.

## Tests

`src-tauri/src/decide/tests.rs`, fictional profile and fictional companies only: schema validation, returns-nothing guard, location/visa veto, duplicates, stale and unknown dates, scam and ghost signals, prompt injection ignored, determinism, exact date and confidence math, and a source scan proving the module imports no network, process, filesystem or Tauri code. Run: `cd src-tauri && cargo test --lib decide::`.

## Not yet

Stage 1 golden set (~30 real past postings with real outcomes) stays local on his machines and is not in this repo. Nothing calls `decide` from the app or Kanithanj yet.
