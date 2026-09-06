# User config (operator pack)

Identity and preferences live on disk — **nothing personal is compiled into the binary**.

## Where

```
~/.config/collab-finder/rank.json          # metric weights + gates
~/.config/collab-finder/packs/
    universe.json                          # firm durability universe
    places.json                            # life-quality places board
    cv-packet.txt                          # default CV when devprofile unset
    constraints-strict.txt                 # dual-fit analyze constraints
    constraints-relaxed.txt                # relaxed fit constraints
    proof-variants.md                      # exceptional-work bank
    public-projects-focused.json           # GitHub project bank (focused)
    public-projects.json                   # slim repo list
    public-projects-clean.json             # full descriptions
    hunt-rails.json                        # rail chips + hunt presets (Mission / Sweden)
    x-search-queries.json                  # Xplore search presets
```

`hunt-rails.json` shape (extend `huntPresets` to add operator hunts without code changes):

```json
{
  "missionQueryChips": [{ "id": "honest", "rail": "honest", "label": "…", "q": "…" }],
  "platsbankenRailChips": [{ "id": "honest", "rail": "honest", "label": "…", "q": "…", "municipality": "" }],
  "huntPresets": [
    { "id": "track-a-kernel", "label": "Kernel / HITL", "q": "rust local-first agent runtime HITL workflow", "rail": "stretch" }
  ]
}
```

Example Track A packs: `data/hunt-presets/track-a.json` (copy `huntPresets` into your pack).

Gitignored source bundle (copy from legacy once): `data/operator/` — see `data/operator/README.md`.

## First run (you)

```bash
./scripts/seed-operator-config.sh
```

Creates `rank.json`, copies your pack into `~/.config/collab-finder/packs/`, and refreshes `src-tauri/testdata/` for tests.

## rank.json

```json
{
  "profile": "operator",
  "weights": { "spacexai": 8, "fortress": 7, "ai_tsunami": 6, "product_moat": 6, "hiring": 5 },
  "place_weights": { "economic": 5, "ethics": 5, "character": 4, "social": 6, "family": 6, "self_fit": 4 },
  "gates": { "theater_saas": true, "fortress_min": 2, "product_moat_min": 2 },
  "pack_dirs": []
}
```

`profile` is a label only — packs on disk are always authoritative.

Settings → **Preferences** → Rank packs & metrics edits `rank.json` and refreshes Mission.

Example stub for strangers: `data/durability/example-pack/`.
