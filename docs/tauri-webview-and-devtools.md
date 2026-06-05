# Tauri WebView and DevTools (Linux)

Why the collab-finder desktop shell looks like Safari on Linux, how to open the inspector, and how to manually test Tauri `invoke` commands (e.g. `hydrate_tweet`) from the console.

Related: [tauri-ipc-debugging.md](./tauri-ipc-debugging.md) (IPC layers, Rust logs) · [tauri-commands.md](./tauri-commands.md) (all handlers) · [SETUP.md](./SETUP.md) (install, credentials)

## Why the WebView looks like Safari

Tauri does **not** embed Chromium or Firefox. It renders your React UI through **[wry](https://github.com/tauri-apps/wry)**, which picks a **native webview per OS**:

| OS | Engine | DevTools style |
|----|--------|----------------|
| **Linux** | **WebKitGTK** (`webkit2gtk`) | WebKit Web Inspector (Safari-like tabs) |
| macOS | WKWebView (Apple WebKit) | WebKit Web Inspector |
| Windows | WebView2 (Chromium / Edge) | Chromium DevTools |

On Arch and most Linux desktops, collab-finder uses **WebKitGTK**. The inspector tabs you see — **Elements, Console, Sources, Network, Timelines, Storage, Graphics, Layers, Audit** — are **WebKit Web Inspector**, the same toolkit Safari uses. It is not Safari the browser; it is the same engine family and inspector UI.

**Implications:**

- CSS/JS behavior follows **WebKit**, not Chrome. Most modern layout works; edge cases can differ from Chromium (newer APIs, subtle flex/grid quirks).
- **Network tab** shows Vite HMR and any fetches the **webview** makes. It does **not** show `invoke` calls or Rust `reqwest` traffic to `api.x.com` (those run in the Rust process — watch the terminal).
- A Windows build of the same app would show Chromium-style DevTools instead.

This repo enables `withGlobalTauri: true` in `src-tauri/tauri.conf.json`, so `window.__TAURI__.core` is available in the WebView console for ad-hoc `invoke` tests.

## Open DevTools in dev

```bash
pnpm tauri dev
```

With `devUrl: http://localhost:5173` in `tauri.conf.json`, the window loads Vite inside the embedded WebKitGTK view.

**Open inspector:**

- Right-click in the app window → **Inspect** (when the context menu exposes it), or
- Your desktop / Tauri dev shortcut for WebKit inspector (varies by WM).

You should see the Safari-like inspector docked under or beside the app — same as in manual testing screenshots during PR review.

**Two consoles to use:**

| Where | What you see |
|-------|----------------|
| **WebView Console** | `invoke` results, optional `[ipc →]` / `[ipc ←]` if you add dev logging in `safe-invoke.ts` |
| **Terminal** (`pnpm tauri dev`) | Rust `eprintln!`: `[secrets]`, `[db]`, `[x]`; X API HTTP happens here |

## Manual `invoke` testing from the console

Use this when a command exists in Rust but is not wired in the UI yet (e.g. `hydrate_tweet`).

### Prerequisites

1. Bearer token saved (credentials panel shows connected).
2. App running: `pnpm tauri dev`.
3. WebView inspector → **Console** tab.

### Pattern

```javascript
const { invoke } = window.__TAURI__.core;

// Example: any registered command from docs/tauri-commands.md
const result = await invoke('COMMAND_NAME', { argName: 'value' });
console.log(result);
```

Errors from Rust handlers reject the promise (Tauri surfaces the `String` error message).

### Example: `search_x_recent` (get a real post ID)

```javascript
const { invoke } = window.__TAURI__.core;

const tweets = await invoke('search_x_recent', {
  query: 'rust lang:en',
  maxResults: 10,
});
console.log(tweets[0]);
// → { id, text, author_id, created_at } with full text from live API
```

Copy `tweets[0].id` for the hydrate test below.

### Example: `hydrate_tweet` (full post on demand)

**Happy path — known ID:**

```javascript
const { invoke } = window.__TAURI__.core;

const id = 'PASTE_ID_FROM_SEARCH'; // e.g. tweets[0].id from above
const hydrated = await invoke('hydrate_tweet', { id });
console.log(hydrated);
// → full text from GET /2/tweets/{id}; not written to SQLite
```

**Compare snippet vs full text:**

```javascript
const { invoke } = window.__TAURI__.core;

const id = 'YOUR_ID';
const hydrated = await invoke('hydrate_tweet', { id });

const runs = await invoke('get_search_history', { limit: 5 });
const detail = await invoke('get_search_run', { id: runs[0].id });
const stored = detail.tweets.find((t) => t.id === id);

console.log('stored snippet len:', stored?.text?.length); // ≤ 280
console.log('hydrated full len:', hydrated.text.length);
```

**Not found / deleted — bogus ID:**

```javascript
const { invoke } = window.__TAURI__.core;

try {
  await invoke('hydrate_tweet', { id: '9999999999999999999' });
} catch (err) {
  console.log(err);
  // expect: "Post not found on X (may have been deleted)"
}
```

**No bearer configured:**

Clear credentials in the UI, then invoke any X command. Expect an error like `X bearer not configured...` (same as `search_x_recent`).

### Checklist (PR / manual QA)

- [ ] Real ID → `hydrate_tweet` returns full `text`
- [ ] Bogus ID → rejects with `Post not found on X (may have been deleted)`
- [ ] After hydrate, `get_search_run` / leads still show snippet only (≤ 280 chars)
- [ ] Credentials panel unchanged (`get_x_bearer_storage` still reports keyring/file)

## Can you opt out of WebKit on Linux?

**Not in stock Tauri v2.** There is no `tauri.conf.json` flag to swap the Linux webview to Chromium or Firefox. [wry](https://github.com/tauri-apps/wry) hard-selects the platform default:

| Platform | Engine | User choice today |
|----------|--------|-------------------|
| Linux | WebKitGTK only | None (official) |
| Windows | WebView2 (Chromium) | Automatic — already Chromium |
| macOS | WKWebView (WebKit) | None |

Tauri’s design is **system webview** (small binary, OS updates the engine). Bundling Chromium on Linux would move you toward Electron-sized apps, which Tauri deliberately avoids.

### What you can do instead

| Approach | Chromium? | `invoke` / Rust? | Notes |
|----------|-----------|------------------|-------|
| **`pnpm tauri dev`** (this app) | No (WebKitGTK) | Yes | Normal desktop dev path |
| **`pnpm dev` + Firefox/Chrome at `localhost:5173`** | Yes (your browser) | **No** | UI/CSS/JS only; no Tauri IPC, secrets, or sqlite |
| **Build/run on Windows** | Yes (WebView2) | Yes | Same codebase, different engine per platform |
| **Switch to Electron** | Yes (bundled) | Different stack | Full rewrite of shell integration |
| **Sidecar browser** | Yes | No integration | Opens a normal browser window; not a Tauri webview backend |

**Sidecars do not help:** Tauri cannot point its webview at an external Chrome/Firefox process — it needs a controllable webview API (IPC, custom protocols, etc.).

### On the horizon (not available for collab-finder today)

The Tauri/wry team has discussed **opt-in** Linux backends; none are stable in v2 yet:

- **CEF** (Chromium Embedded Framework) — [tauri#14963](https://github.com/tauri-apps/tauri/issues/14963); would increase bundle size; target is optional Linux alternative.
- **Qt WebEngine** — research via [cxx-qt-widgets](https://github.com/wusyong/cxx-qt-widgets); depends on distro Qt; integration still uncertain.
- Community experiments (e.g. CEF wrappers around wry) exist but are unofficial and unsupported.

wry’s `os-webview` feature mentions future ports (“cef”, “servo”) in docs; **only WebKitGTK is production-ready on Linux today**.

### Practical recommendation for this project

1. **Desktop QA on Linux** — accept WebKitGTK; run `cargo test` + manual checks in the WebKit inspector.
2. **Chromium-specific UI bugs** — reproduce with `pnpm dev` in Chrome, then confirm fix still works under `pnpm tauri dev`.
3. **Need Chromium + full app** — test a Windows build, or wait for official CEF/Qt options in wry/Tauri.

## Platform quirks (Linux)

| Symptom | Notes |
|---------|--------|
| Blank window on `tauri dev` | Missing WebKit/GTK system deps — [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) |
| `Gdk-WARNING` / selection broken pipe | Harmless WebKitGTK noise on Hyprland/wlroots when text becomes selectable; see [SETUP.md](./SETUP.md#troubleshooting) |
| Inspector missing | WM may block context menu; try Tauri debug features or [CrabNebula DevTools](https://v2.tauri.app/develop/debug/) |

## Related code

| File | Role |
|------|------|
| `src-tauri/tauri.conf.json` | `withGlobalTauri`, `devUrl`, window size |
| `src-tauri/Cargo.lock` | `webkit2gtk`, `wry` on Linux |
| `src/adapters/tauri/safe-invoke.ts` | Production IPC seam (add dev logging here) |
| `src-tauri/src/lib.rs` | `#[tauri::command]` handlers including `hydrate_tweet` |
| `src-tauri/src/x_search.rs` | `lookup_tweet` → X API (terminal-side HTTP) |
