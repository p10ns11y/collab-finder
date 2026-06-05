// ============================================================================
// STABILITY CONTRACT — X BEARER / KEYRING + FILE FALLBACK (CREDENTIALS)
// ============================================================================
//
// THIS IS THE #1 AREA THAT KEEPS GETTING BROKEN BY UNRELATED REFACTORS.
//
// What it is:
// - Dual store for the X app-only Bearer token: prefer OS keyring (keyring crate +
//   sync-secret-service on Linux), always write plaintext 0600 fallback file under
//   app data dir, best-effort keyring with explicit "clear on keyring-fail so file wins".
// - Rich status for the UI credentials panel: `get_x_bearer_storage` returns
//   BearerStorageStatus (active_source, keyring.reachable + error, file info).
// - Internal `get_x_bearer()` / `x_bearer()` used by search/cycle/hydrate — the token
//   is NEVER passed over IPC from the frontend on each call.
//
// Why agents (Cursor composer, etc.) repeatedly break it on unrelated work:
// - The 4 thin credential commands live in the big list in lib.rs:generate_handler!.
// - `x_bearer()` helper is called from multiple command fns in the same file.
// - Shared app_data_dir used to be owned by file_store (imported by db.rs) → "storage"
//   refactors (e.g. implementing the x-content-storage-distributin-policy recommendation
//   for tweet snippets vs full text) touch lib.rs + data layout + "storage" modules.
// - Subtle invariants: dual-write + shadowing prevention, NoEntry special case,
//   probe vs read vs resolve_active_source, unix 0600/0700 perms, global test harness mutex,
//   exact serde shape matching the TS BearerStorageStatus type.
// - keyring behavior is platform + DE dependent (works great on macOS/Windows full DEs,
//   intentionally falls back on minimal Arch/Hyprland — agents on nice desktops delete
//   the "complex" fallback).
// - Verification often stops at `cargo check`; the real contract (status panel +
//   Linux keyring roundtrip test + "save then search works") lives in `cargo test` + manual run.
//
// RULES (non-negotiable for any agent or human):
// 1. Treat the credential commands + Bearer* types + error string from get_x_bearer as
//    a public contract. See docs/tauri-commands.md.
// 2. Before touching lib.rs command registration, secrets.rs, file_store.rs, or app_dirs.rs:
//    - Grep for all call sites of get_x_bearer*, set/clear, x_bearer, app_data_dir.
//    - Read the header in app_dirs.rs and this header.
// 3. Any edit that could affect registration, signatures, or the read/write paths:
//    MUST be followed by `cd src-tauri && cargo test` (exercises the harness + keyring probes).
// 4. After change, run the app and verify the X Connection panel shows correct
//    active_source + keyring.reachable (and that search/cycle still succeed).
// 5. Never remove the file fallback "because keyring is better now".
// 6. Never bypass x_bearer() or put bearer on the wire.
//
// If the task is "implement X content storage policy / tweet snippets / hydrate":
//   Do NOT refactor secrets, bearer storage, or the dir logic "while you're in the area".
//   The two "storage" things are deliberately separated now (app_dirs + secrets vs db/tweets).
//
// ============================================================================

mod file_store;

// Note: app_data_dir now lives in the sibling `app_dirs` module (decoupled on purpose).
// file_store (bearer file) and db both consume it. See app_dirs.rs for rationale + its own stability header.

use keyring::Error as KeyringError;
use serde::Serialize;

const SERVICE: &str = "collab-finder";
const USER: &str = "x-bearer";

fn keyring_entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICE, USER).map_err(|e| e.to_string())
}

fn read_keyring() -> Result<Option<String>, String> {
    let entry = keyring_entry()?;
    match entry.get_password() {
        Ok(value) if value.trim().is_empty() => Ok(None),
        Ok(value) => Ok(Some(value.trim().to_string())),
        Err(KeyringError::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

fn write_keyring(token: &str) -> Result<(), String> {
    let entry = keyring_entry()?;
    entry.set_password(token).map_err(|e| e.to_string())
}

fn clear_keyring() -> Result<(), String> {
    let entry = keyring_entry()?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(KeyringError::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

pub fn get_x_bearer_optional() -> Result<Option<String>, String> {
    match read_keyring() {
        Ok(Some(token)) => {
            eprintln!("[secrets] bearer token loaded from keyring");
            return Ok(Some(token));
        }
        Ok(None) => {}
        Err(e) => {
            eprintln!("[secrets] keyring read failed (falling back to file store): {e}");
        }
    }
    file_store::read()
}

pub fn get_x_bearer() -> Result<String, String> {
    match get_x_bearer_optional()? {
        Some(token) => Ok(token),
        None => Err(
            "X bearer not configured. Save your token under X connection first.".to_string(),
        ),
    }
}

pub fn has_x_bearer() -> bool {
    get_bearer_storage_status().connected
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum BearerActiveSource {
    Keyring,
    File,
    None,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct BearerFileStorageInfo {
    pub present: bool,
    pub path: String,
    pub encrypted: bool,
    pub permissions: String,
    pub why_not_encrypted: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct BearerKeyringStorageInfo {
    pub present: bool,
    pub service: String,
    pub user: String,
    pub reachable: bool,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct BearerStorageStatus {
    pub connected: bool,
    pub active_source: BearerActiveSource,
    pub file: BearerFileStorageInfo,
    pub keyring: BearerKeyringStorageInfo,
}

/// Which store `get_x_bearer_optional` will read from (keyring first, then file).
fn resolve_active_source() -> BearerActiveSource {
    match read_keyring() {
        Ok(Some(token)) if !token.is_empty() => BearerActiveSource::Keyring,
        _ if file_store::is_present() => BearerActiveSource::File,
        _ => BearerActiveSource::None,
    }
}

fn probe_keyring() -> BearerKeyringStorageInfo {
    let service = SERVICE.to_string();
    let user = USER.to_string();
    match keyring_entry() {
        Err(e) => BearerKeyringStorageInfo {
            present: false,
            service,
            user,
            reachable: false,
            error: Some(e),
        },
        Ok(_) => match read_keyring() {
            Ok(Some(_)) => BearerKeyringStorageInfo {
                present: true,
                service,
                user,
                reachable: true,
                error: None,
            },
            Ok(None) => BearerKeyringStorageInfo {
                present: false,
                service,
                user,
                reachable: true,
                error: None,
            },
            Err(e) => BearerKeyringStorageInfo {
                present: false,
                service,
                user,
                reachable: false,
                error: Some(e),
            },
        },
    }
}

pub fn get_bearer_storage_status() -> BearerStorageStatus {
    let keyring = probe_keyring();
    let file_present = file_store::is_present();
    let file_path = file_store::path_display().unwrap_or_default();
    let active_source = resolve_active_source();

    eprintln!(
        "[secrets] bearer storage status: active_source={:?}, keyring_reachable={}, keyring_present={}, keyring_error={:?}, file_present={}",
        active_source, keyring.reachable, keyring.present, keyring.error, file_present
    );

    let why_not_encrypted = if file_present {
        Some(
            "Fallback file is plaintext UTF-8 with mode 0600 (user-only). It is not encrypted by design so Tauri/dev and minimal desktops can always read the token; prefer keyring when reachable.".to_string(),
        )
    } else {
        None
    };

    BearerStorageStatus {
        connected: keyring.present || file_present,
        active_source,
        file: BearerFileStorageInfo {
            present: file_present,
            path: file_path,
            encrypted: false,
            permissions: "0600".to_string(),
            why_not_encrypted,
        },
        keyring,
    }
}

pub fn set_x_bearer(token: &str) -> Result<(), String> {
    let trimmed = token.trim();
    if trimmed.is_empty() {
        return Err("Bearer token cannot be empty.".to_string());
    }

    file_store::write(trimmed)?;

    match write_keyring(trimmed) {
        Ok(()) => eprintln!("[secrets] bearer token also written to keyring"),
        Err(e) => {
            eprintln!("[secrets] keyring save skipped (using file store): {e}");
            // Drop stale keyring entry so reads do not shadow the file we just wrote.
            let _ = clear_keyring();
        }
    }

    match file_store::read()? {
        Some(stored) if stored == trimmed => Ok(()),
        Some(_) => Err("Saved credential could not be verified (file mismatch).".to_string()),
        None => Err(
            "Credential save failed — could not read back token. Check app data permissions."
                .to_string(),
        ),
    }
}

pub fn clear_x_bearer() -> Result<(), String> {
    file_store::clear()?;
    clear_keyring()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::app_dirs::test_harness;
    use tempfile::TempDir;

    struct TestDir {
        _dir: TempDir,
        _lock: std::sync::MutexGuard<'static, ()>,
    }

    impl TestDir {
        fn new() -> Self {
            let lock = test_harness::LOCK.lock().expect("secrets test lock");
            let dir = TempDir::new().expect("tempdir");
            test_harness::set(dir.path().to_path_buf());
            let _ = clear_x_bearer();
            Self { _dir: dir, _lock: lock }
        }
    }

    impl Drop for TestDir {
        fn drop(&mut self) {
            let _ = clear_x_bearer();
            test_harness::clear();
        }
    }

    #[test]
    fn set_rejects_empty_token() {
        let _g = TestDir::new();
        assert!(set_x_bearer("  ").is_err());
    }

    #[test]
    fn set_and_read_back_via_file_fallback() {
        let _g = TestDir::new();
        set_x_bearer("AAAA-test-token-1234567890").expect("set");
        let status = get_bearer_storage_status();
        assert!(status.connected);
        assert_eq!(get_x_bearer().unwrap(), "AAAA-test-token-1234567890");
        assert!(status.file.present);
        assert!(!status.file.encrypted);
        assert!(status.file.why_not_encrypted.is_some());
    }

    #[test]
    fn clear_removes_connection() {
        let _g = TestDir::new();
        set_x_bearer("tok").unwrap();
        clear_x_bearer().unwrap();
        let status = get_bearer_storage_status();
        assert!(!status.connected);
        assert_eq!(status.active_source, BearerActiveSource::None);
        assert!(get_x_bearer().is_err());
    }

    #[test]
    fn storage_status_file_active_when_only_file_has_token() {
        let _g = TestDir::new();
        file_store::write("file-only-token").unwrap();
        let _ = clear_keyring();
        let status = get_bearer_storage_status();
        assert_eq!(status.active_source, BearerActiveSource::File);
        assert_eq!(
            get_x_bearer_optional().unwrap().as_deref(),
            Some("file-only-token")
        );
    }

    #[test]
    fn active_source_matches_read_path_not_keyring_metadata_alone() {
        let _g = TestDir::new();
        file_store::write("from-file").unwrap();
        let _ = clear_keyring();
        assert_eq!(resolve_active_source(), BearerActiveSource::File);
        write_keyring("from-keyring").expect("keyring write");
        assert_eq!(resolve_active_source(), BearerActiveSource::Keyring);
        assert_eq!(
            get_x_bearer_optional().unwrap().as_deref(),
            Some("from-keyring")
        );
    }

    #[test]
    fn set_succeeds_when_keyring_stale_but_file_written() {
        let _g = TestDir::new();
        write_keyring("stale-keyring-token").expect("seed keyring");
        set_x_bearer("fresh-file-token").expect("set should verify file, update keyring");
        assert_eq!(
            file_store::read().unwrap().as_deref(),
            Some("fresh-file-token")
        );
        let status = get_bearer_storage_status();
        assert_eq!(
            get_x_bearer_optional().unwrap().as_deref(),
            Some("fresh-file-token")
        );
        assert_eq!(status.active_source, BearerActiveSource::Keyring);
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn keyring_roundtrip_when_available() {
        let _g = TestDir::new();
        let token = "AAAA-keyring-integration-probe";
        write_keyring(token).expect("write");
        assert_eq!(read_keyring().expect("read").as_deref(), Some(token));
        assert_eq!(
            get_bearer_storage_status().active_source,
            BearerActiveSource::Keyring
        );
        clear_keyring().expect("clear");
    }
}
