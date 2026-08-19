# kanithanj.ai (collab-finder)

Tauri desktop app — hunt high-fit roles, prepare application packs, track history in SQLite. You intervene when guards fire, not on every step.

**Planning:** `~/life-os/Projects/collab-finder/README.md` · **Agents:** [AGENTS.md](AGENTS.md) · **Playbook:** [docs/agent-playbook.md](docs/agent-playbook.md) · **Guide:** [docs/GUIDE.md](docs/GUIDE.md)

---

## Quick start

**Needs:** Node LTS, pnpm, Rust stable, [Tauri v2 prerequisites](https://v2.tauri.app/start/prerequisites/) (Linux: GTK/WebKit).

```bash
pnpm install
pnpm tauri dev
```

Arch install to PATH:

```bash
pnpm install:local    # → ~/.local/bin/kanithanj.ai
```

---

## First run (3 steps)

| Step | Where | What |
|------|--------|------|
| 1 | **Settings** | X bearer + xAI API key |
| 2 | **Preferences** | Install **kanithanj.cv**; optional devprofile path for CV grounding |
| 3 | **Discover** | Paste URL or JD → Evaluate → Prepare → Generate apply CV |

CV packet is built **locally** (textarea → devprofile / kanithanj.cv → operator pack). xAI key is only needed for Evaluate and Prepare.

Details: [docs/GUIDE.md](docs/GUIDE.md) · Config: [docs/config.md](docs/config.md) · Setup/troubleshooting: [docs/SETUP.md](docs/SETUP.md)

---

## Verify

```bash
pnpm run gate       # build + domain verify + cargo test --lib
```

See [docs/ci.md](docs/ci.md) for CI jobs.

---

## Docs

| | |
|--|--|
| [docs/GUIDE.md](docs/GUIDE.md) | Screens, hunt loop, architecture map |
| [docs/SETUP.md](docs/SETUP.md) | Install, credentials, Arch notes |
| [docs/config.md](docs/config.md) | Rank packs + operator config |
| [docs/tauri-commands.md](docs/tauri-commands.md) | IPC / invoke reference |
| [docs/release.md](docs/release.md) | Tag → GitHub Release binary |

Private tool for p10ns11y.
