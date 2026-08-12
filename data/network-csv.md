# Network CSV fixtures

| File | Git | Role |
|------|-----|------|
| `connections.sample.csv` | yes | Fictional connections export for local Network screen |
| `contacts.sample.csv` | yes | Fictional contacts merge (email/phone) |
| `connections.csv` | no | Your real connections export (gitignored) |
| `contacts.csv` | no | Your real contacts export (gitignored) |

Mocks use placeholder employers and `profiles.example` URLs only — no real company or network-service names.

Resolution: real `connections.csv` / `contacts.csv` first, then `*.sample.csv` so the app runs without personal data.
