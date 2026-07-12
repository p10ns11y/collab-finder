# Secrets agent safety — never dump keys into logs

## What went wrong (2026-07)

A remote-control agent session ran OS tooling roughly equivalent to:

```bash
secret-tool search service collab-finder
# and/or listing ~/.local/share/collab-finder/
```

`secret-tool search` **prints secret attribute values (the full API key / bearer) in cleartext** to stdout. That output was captured into Cursor cloud logs and remains visible. This is **not** an app UI leak; it is **agent/shell inspection of the keyring and plaintext file fallback**.

## Where secrets live

| Secret | Keyring (service / user) | File fallback (mode 0600, **plaintext**) |
|--------|--------------------------|------------------------------------------|
| X bearer | `collab-finder` / `x-bearer` | `~/.local/share/collab-finder/x-bearer` |
| xAI API key | `collab-finder` / `xai-key` | `~/.local/share/collab-finder/xai-key` |

App code must only use `get_x_bearer` / `get_xai_key` **inside Rust** for API calls. Status commands return **metadata only** (present/reachable/path) — never the secret string over IPC.

## Forbidden for agents / remote control

**Never** run or request output from:

- `secret-tool search`, `secret-tool lookup`, `secret-tool clear` (except user-initiated local recovery with redaction)
- `cat` / `hexdump` / `less` / `head` of `x-bearer`, `xai-key`, or any `*bearer*` / `*key*` under the app data dir
- Printing env vars that may hold tokens (`XAI_API_KEY`, `BEARER`, etc.)
- Logging invoke args that include raw `key` / `bearer` / `token` bodies
- Pasting secrets into chat, PRs, issues, or commit messages

## Allowed diagnostics (status only)

```bash
# File presence + mode only — do not cat contents
ls -la ~/.local/share/collab-finder/ | grep -E 'bearer|xai-key|devprofile'

# In-app: Settings → X connection / xAI Intelligence panels
# Rust: get_x_bearer_storage / get_xai_key_storage (metadata only)
```

If you need to verify storage, use the **Settings UI** or Tauri commands that return `BearerStorageStatus` / `XaiKeyStorageStatus` (connected, active_source, keyring reachable, file path). Never request the secret value.

## If a secret was already logged

1. **Rotate immediately** in the provider console (X Developer Portal, console.x.ai).
2. Clear old key in Settings → Disconnect, then save the new key.
3. Assume any cloud agent transcript that ran `secret-tool search` is compromised for that key.

## Product / process prevention (layers)

| Layer | Measure | Status |
|-------|---------|--------|
| App IPC | Never return secret material from Tauri commands | Enforced (status-only APIs) |
| App logs | `eprintln!` status only (active_source, present flags) — never log key bytes | Enforced; do not regress |
| File fallback | Plaintext 0600 for reliability on minimal desktops | By design; agents must not `cat` |
| Agent instructions | This doc + AGENTS.md ban list | Required reading |
| Human | Prefer keyring; rotate if any transcript may have dumped secrets | Operational |
| Future harden | Optional encrypted file store; agent sandbox deny-list for secret-tool | Optional follow-up |

## Rule for coding agents (collab-finder)

When debugging credentials: **describe** storage state (keyring yes/no, file yes/no, active_source). **Never** retrieve or echo secret values. If a tool would print a secret, stop and use Settings UI status instead.
