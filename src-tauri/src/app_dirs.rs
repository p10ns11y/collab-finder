// ============================================================================
// STABILITY CONTRACT — APP DIRS (shared data root for bearer + xai-key + DB)
// ============================================================================
//
// THIS MODULE IS A STABILITY HOTSPOT.
//
// - It defines the single source of truth for where collab-finder keeps its local data.
// - Bearer credentials (keyring + `x-bearer` file) + xAI key (keyring + `xai-key` file)
//   AND the SQLite history DB both depend on it.
// - Unrelated refactors that touch "storage", "data layout", "app dirs", "paths", "x-content policy",
//   db init, or secrets have historically broken keyring access or the credentials panels.
//
// RULES FOR AGENTS (Cursor, Grok, etc.):
// - If your task mentions "storage policy", "snippets", "hydrate", "db", "tweets table", or
//   "reorganize data" — READ THIS FILE and src-tauri/src/secrets.rs HEADER FIRST.
// - Prefer editing here only for genuine path changes. Never inline or duplicate app_data_dir.
// - After any edit: run `cd src-tauri && cargo test` (the harness tests exercise override for bearer, xai-key, and DB).
//
// Do not "clean up", "modernize", or "extract config" this without explicit approval and full verification.
// ============================================================================

//! Shared application directories for collab-finder.
//!
//! Provides the canonical XDG-style app data dir (`~/.local/share/collab-finder` on Linux,
//! equivalent on macOS/Windows via `dirs` crate). Both the bearer secret store (keyring + file fallback)
//! and the SQLite history DB use this root for consistency.
//!
//! WHY THIS MODULE EXISTS (stability):
//! - Previously the dir logic lived inside `secrets/file_store.rs` (because bearer file was the first user).
//! - `db.rs` imported it via `crate::secrets::app_data_dir`.
//! - Any "refactor storage", "clean up secrets", or "unify data paths" during *unrelated* work
//!   (e.g. tweet content storage policy changes) would accidentally touch or move the bearer logic.
//! - Extracting to a tiny, boring, first-class module makes the shared concern explicit and narrow.
//!   Future agents searching for "data dir", "app data", or "collab-finder dir" land here first.
//!
//! STABILITY CONTRACT:
//! - Do not add bearer/keyring logic here.
//! - Do not change the directory name "collab-finder" without migration story + docs update.
//! - Test harness is only for unit tests that must run without polluting real user dirs.
//! - Keep this module small and dependency-free except `dirs` + std.

use std::path::PathBuf;

#[cfg(test)]
pub(crate) mod test_harness {
    use std::path::PathBuf;
    use std::sync::Mutex;

    static ROOT: Mutex<Option<PathBuf>> = Mutex::new(None);
    pub static LOCK: Mutex<()> = Mutex::new(());

    pub fn set(root: PathBuf) {
        *ROOT.lock().expect("test lock") = Some(root);
    }

    pub fn clear() {
        *ROOT.lock().expect("test lock") = None;
    }

    pub fn get() -> Option<PathBuf> {
        ROOT.lock().expect("test lock").clone()
    }
}

/// Shared app data dir for collab-finder (used by bearer secrets + sqlite DB for consistency).
///
/// In production: `dirs::data_local_dir() / "collab-finder"`
/// In tests: overridden via the test_harness (see secrets tests and db tests).
pub(crate) fn app_data_dir() -> Result<PathBuf, String> {
    #[cfg(test)]
    if let Some(root) = test_harness::get() {
        return Ok(root);
    }
    let base = dirs::data_local_dir().ok_or("Could not resolve app data directory")?;
    Ok(base.join("collab-finder"))
}
