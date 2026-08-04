# Hire board fixtures

Public Google Sheet company list used by Discover → Hire board.

## Local config (required for live fetch)

```bash
cp data/hire-board/config.example.json data/hire-board/config.local.json
# edit sheet_url and/or sheet_id + gid
```

`config.local.json` is **gitignored**. Never commit a personal sheet id.

Resolution order (Rust):

1. `sheet_url` argument to `fetch_hire_board` (optional override)
2. `HIRE_BOARD_CONFIG` — path to a JSON file
3. `HIRE_BOARD_SHEET_URL` — edit or export URL
4. `data/hire-board/config.local.json` (cwd / project walk)
5. `$XDG_DATA_HOME/collab-finder/hire-board/config.local.json`

## Files

| File | Git | Role |
|------|-----|------|
| `config.example.json` | yes | Template |
| `config.local.json` | no | Your sheet |
| `sample.csv` | yes | Offline golden for `cargo test hire_board` |

Schema after preamble rows: `Company`, `Location`, `Career Page`, `Thread Reply Link`.
