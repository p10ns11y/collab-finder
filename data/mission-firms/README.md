# Mission firms — Tesla listings

Tesla’s public careers API (`cua-api/apps/careers/state`) is often Akamai-blocked from servers/agents.

| File | Git | Role |
|------|-----|------|
| `tesla.jobs.sample.json` | yes | Demo mixed software↔hardware roles only |
| `tesla.jobs.json` | no | Your live dump from the careers state endpoint |

## Refresh live Tesla roles

1. Open https://www.tesla.com/careers/search/ in a browser (solve any bot check).
2. Open https://www.tesla.com/cua-api/apps/careers/state and save the JSON.
3. Write it to `data/mission-firms/tesla.jobs.json`.
4. Mission firms → Pull with **Tesla** selected.

Only **mixed software + hardware** (or hybrid titles like firmware / embedded / autonomy / robotics software) are shown.
