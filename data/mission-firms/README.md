# Mission firms

## Living firm list

**Mission pack quality comes from the durability universe, not a fresh LLM curation.**

| Source | Path | Role |
|--------|------|------|
| Baked universe | [`../durability/universe.v1.json`](../durability/universe.v1.json) | Stability (`fortress`), hire climate (`hiring_signal`), economic notes (`cash`) |
| Scannable table | [`FIRM-LIST.md`](FIRM-LIST.md) | All firms — regenerate: `pnpm firm-list` |
| Operator overlay | `~/.config/collab-finder/packs/universe.json` | Same `id` replaces a baked row |
| Pull boards | `FIRM_REGISTRY` in `mission_firms.rs` + `~/.config/collab-finder/packs/mission-firms.json` | JobTech / Greenhouse / Lever / Ashby — orthogonal to durability |

When facts change (restructuring, office closures, IR), edit `universe.v1.json` and bump `scored_at`. Link fortress → stability, `cash.note` → economic progression, `hiring_signal` → hire climate.

Durability scorer details: [`../durability/README.md`](../durability/README.md).

## Tesla listings

Tesla's public careers API (`cua-api/apps/careers/state`) is often Akamai-blocked from servers/agents.

| File | Git | Role |
|------|-----|------|
| `tesla.jobs.sample.json` | yes | Demo mixed software↔hardware roles only |
| `tesla.jobs.json` | no | Your live dump from the careers state endpoint |

### Refresh live Tesla roles

1. Open https://www.tesla.com/careers/search/ in a browser (solve any bot check).
2. Open https://www.tesla.com/cua-api/apps/careers/state and save the JSON.
3. Write it to `data/mission-firms/tesla.jobs.json`.
4. Mission firms → Pull with **Tesla** selected.

Only **mixed software + hardware** (or hybrid titles like firmware / embedded / autonomy / robotics software) are shown.

## Pull score overlay (optional)

Registry firms can receive `score_bonus` / `score_reason` from `mission-firms.json` without duplicating the board row — see [`../durability/example-pack/mission-firms.json`](../durability/example-pack/mission-firms.json).
