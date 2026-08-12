# Network CSV fixtures

| File | Git | Role |
|------|-----|------|
| `connections.sample.csv` | yes | Mock LinkedIn Connections export for local Network screen |
| `contacts.sample.csv` | yes | Mock contacts merge (email/phone) |
| `connections.csv` | no | Your real LinkedIn export (gitignored) |
| `contacts.csv` | no | Your real contacts export (gitignored) |

Resolution: real `connections.csv` / `contacts.csv` first, then `*.sample.csv` so the app runs without personal data.
