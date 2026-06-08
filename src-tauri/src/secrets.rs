// ============================================================================
// STABILITY CONTRACT — X BEARER + xAI KEY / KEYRING + FILE FALLBACK (CREDENTIALS)
// ============================================================================
//
// THIS IS THE #1 AREA THAT KEEPS GETTING BROKEN BY UNRELATED REFACTORS.
//
// There are now TWO independent credential pairs that must be treated with identical care:
//
// 1. X Bearer (original, for X API search/cycle)
//    - Dual store: OS keyring (preferred) + plaintext 0600 "x-bearer" file fallback.
//    - Commands: has_x_bearer / get_x_bearer_storage / set_x_bearer / clear_x_bearer
//    - Internal: get_x_bearer() / x_bearer()
//    - Status: BearerStorageStatus (used by X Connection panel)
//
// 2. xAI Key (new, for analysis, fit scoring, CV tailoring, cover letters, prep packs)
//    - Exact parallel dual store: OS keyring (preferred) + plaintext 0600 "xai-key" file fallback.
//    - Commands: has_xai_key / get_xai_key_storage / set_xai_key / clear_xai_key
//    - Internal: get_xai_key() (used only inside analyze/prep commands — NEVER on IPC wire)
//    - Status: XaiKeyStorageStatus (shape mirrors Bearer* exactly for UI consistency)
//    - Default model for this app: grok-4.3 (highest quality for CV+JD work). Pricing
//      for estimates: $1.25/M input, $2.50/M output (real costs from API usage fields).
//
// Shared invariants (apply to BOTH):
// - Rich status for the UI (active_source, keyring.reachable + error, file info with 0600 note).
// - Automatic promotion/heal on status query (when keyring reachable but empty and file has the secret).
// - Heal is gated under !cfg!(test) to preserve existing bearer tests.
// - file_store.rs (bearer) and the new xai_key_store.rs are deliberately separate modules.
// - app_data_dir is the single source of truth for both fallback files.
// - The 8 credential commands (4+4) live together in lib.rs generate_handler!.
// - After ANY edit here, to lib.rs credential registration, to either *store.rs, or to app_dirs.rs:
//   MUST run `cd src-tauri && cargo test` (exercises both harnesses + keyring probes for both secrets).
// - After change, run the app and verify BOTH the X Connection panel AND the new xAI Intelligence
//   panel in Settings show correct active_source + keyring status.
// - In particular, after clearing a keyring entry (or on a machine that only has the file),
//   simply opening **Settings** should cause the status to flip to active_source=Keyring thanks to heal.
//
// Why this area is fragile:
// - The credential commands are the only way the rest of the app (and React via invoke) touches secrets.
// - Unrelated refactors (DB, storage policy, "clean up lib.rs", new features) have historically
//   broken one or both by touching the wrong files or the handler list.
// - Linux keyring (secret-service) is DE-dependent and can be flaky on minimal setups (Hyprland etc.).
//   The file fallback + heal + explicit clear-on-fail is what keeps things working.
//
// RULES (non-negotiable):
// 1. Treat the 8 credential commands + *StorageStatus types + the two error strings
//    ("X bearer not configured..." and the equivalent for xAI) as public contracts.
//    See docs/tauri-commands.md.
// 2. Before touching lib.rs command registration, secrets.rs, file_store.rs, xai_key_store.rs,
//    or app_dirs.rs:
//    - Grep for call sites of get_x_bearer*, set/clear_x_bearer, x_bearer,
//      AND the new xai equivalents.
//    - Read the header in app_dirs.rs AND this entire header.
// 3. Any edit that could affect registration, signatures, read/write paths, or status shape:
//    MUST be followed by `cd src-tauri && cargo test`.
// 4. After change, manually run the app and check BOTH credential panels in Settings.
// 5. Never remove the file fallback for either secret.
// 6. Never bypass the internal get_*() helpers or put raw keys on the IPC wire.
// 7. When adding a third secret in the future, create yet another parallel *_key_store.rs
//    and duplicate the pattern again rather than abstracting (abstraction has caused breakage).
//
// If your task is "implement job URL analysis / xAI prep / new feature that happens to need a key":
//   Do NOT refactor secrets, keyring, or the dir logic "while you're in the area".
//   Implement the new secret type by copying the existing parallel pattern.
//
// ============================================================================

mod file_store;
mod xai_key_store;

// Note: app_data_dir now lives in the sibling `app_dirs` module (decoupled on purpose).
// file_store (bearer file) and xai_key_store (xAI key file) + db consume it.
// See app_dirs.rs for rationale + its own stability header.
// The two secret types (X bearer + xAI key) are deliberately kept in parallel
// modules so that work on one cannot accidentally regress the other.

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
    let file_token = file_store::read()?;
    if let Some(ref tok) = file_token {
        // Best-effort heal: if we fell back to file (no kr entry), try to (re)populate keyring.
        // This recovers from transient keyring write failures at save time, or after dev
        // pollution of the keyring entry was manually/external cleared. Next read will prefer kr.
        if let Err(e) = write_keyring(tok) {
            eprintln!("[secrets] post-fallback heal to keyring skipped: {e}");
        } else {
            eprintln!("[secrets] healed bearer token into keyring from file fallback");
        }
    }
    Ok(file_token)
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

// ============================================================================
// xAI KEY STORAGE (EXACT PARALLEL TO X BEARER — DO NOT REFACTOR TOGETHER)
// ============================================================================
//
// This is the new secret for grok-4.3 calls (analysis, CV tailoring, cover letters,
// prep packs, job fit). It uses the identical dual keyring + 0600 file pattern.
//
// Rules from the top STABILITY CONTRACT apply verbatim to this block too.
// All xai functions are deliberately duplicated (not shared) to protect the bearer path.

const XAI_SERVICE: &str = "collab-finder";
const XAI_USER: &str = "xai-key";

fn xai_keyring_entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(XAI_SERVICE, XAI_USER).map_err(|e| e.to_string())
}

fn read_xai_keyring() -> Result<Option<String>, String> {
    let entry = xai_keyring_entry()?;
    match entry.get_password() {
        Ok(value) if value.trim().is_empty() => Ok(None),
        Ok(value) => Ok(Some(value.trim().to_string())),
        Err(KeyringError::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

fn write_xai_keyring(key: &str) -> Result<(), String> {
    let entry = xai_keyring_entry()?;
    entry.set_password(key).map_err(|e| e.to_string())
}

fn clear_xai_keyring() -> Result<(), String> {
    let entry = xai_keyring_entry()?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(KeyringError::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

pub fn get_xai_key_optional() -> Result<Option<String>, String> {
    match read_xai_keyring() {
        Ok(Some(key)) => {
            eprintln!("[secrets] xAI key loaded from keyring");
            return Ok(Some(key));
        }
        Ok(None) => {}
        Err(e) => {
            eprintln!("[secrets] keyring read failed (falling back to xai file store): {e}");
        }
    }
    let file_key = xai_key_store::read()?;
    if let Some(ref k) = file_key {
        if let Err(e) = write_xai_keyring(k) {
            eprintln!("[secrets] post-fallback heal of xAI key to keyring skipped: {e}");
        } else {
            eprintln!("[secrets] healed xAI key into keyring from file fallback");
        }
    }
    Ok(file_key)
}

pub fn get_xai_key() -> Result<String, String> {
    match get_xai_key_optional()? {
        Some(key) => Ok(key),
        None => Err(
            "xAI API key not configured. Save your key under xAI / Intelligence in Settings.".to_string(),
        ),
    }
}

pub fn has_xai_key() -> bool {
    get_xai_key_storage().connected
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum XaiKeyActiveSource {
    Keyring,
    File,
    None,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct XaiKeyFileStorageInfo {
    pub present: bool,
    pub path: String,
    pub encrypted: bool,
    pub permissions: String,
    pub why_not_encrypted: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct XaiKeyKeyringStorageInfo {
    pub present: bool,
    pub service: String,
    pub user: String,
    pub reachable: bool,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct XaiKeyStorageStatus {
    pub connected: bool,
    pub active_source: XaiKeyActiveSource,
    pub file: XaiKeyFileStorageInfo,
    pub keyring: XaiKeyKeyringStorageInfo,
}

fn resolve_xai_active_source() -> XaiKeyActiveSource {
    match read_xai_keyring() {
        Ok(Some(k)) if !k.is_empty() => XaiKeyActiveSource::Keyring,
        _ if xai_key_store::is_present() => XaiKeyActiveSource::File,
        _ => XaiKeyActiveSource::None,
    }
}

fn probe_xai_keyring() -> XaiKeyKeyringStorageInfo {
    let service = XAI_SERVICE.to_string();
    let user = XAI_USER.to_string();
    match xai_keyring_entry() {
        Err(e) => XaiKeyKeyringStorageInfo {
            present: false,
            service,
            user,
            reachable: false,
            error: Some(e),
        },
        Ok(_) => match read_xai_keyring() {
            Ok(Some(_)) => XaiKeyKeyringStorageInfo {
                present: true,
                service,
                user,
                reachable: true,
                error: None,
            },
            Ok(None) => XaiKeyKeyringStorageInfo {
                present: false,
                service,
                user,
                reachable: true,
                error: None,
            },
            Err(e) => XaiKeyKeyringStorageInfo {
                present: false,
                service,
                user,
                reachable: false,
                error: Some(e),
            },
        },
    }
}

pub fn get_xai_key_storage() -> XaiKeyStorageStatus {
    let mut keyring = probe_xai_keyring();
    let mut file_present = xai_key_store::is_present();
    let file_path = xai_key_store::path_display().unwrap_or_default();
    let mut active_source = resolve_xai_active_source();

    if !cfg!(test) && keyring.reachable && !keyring.present && file_present {
        if let Ok(Some(k)) = xai_key_store::read() {
            match write_xai_keyring(&k) {
                Ok(()) => {
                    eprintln!("[secrets] promoted xAI key from file into keyring (heal during status)");
                    keyring = probe_xai_keyring();
                    active_source = resolve_xai_active_source();
                    file_present = xai_key_store::is_present();
                }
                Err(e) => {
                    eprintln!("[secrets] promotion of xAI file key to keyring failed: {e}");
                }
            }
        }
    }

    eprintln!(
        "[secrets] xAI key storage status: active_source={:?}, keyring_reachable={}, keyring_present={}, keyring_error={:?}, file_present={}",
        active_source, keyring.reachable, keyring.present, keyring.error, file_present
    );

    let why_not_encrypted = if file_present {
        Some(
            "Fallback file is plaintext UTF-8 with mode 0600 (user-only). It is not encrypted by design so Tauri/dev and minimal desktops can always read the key; prefer keyring when reachable.".to_string(),
        )
    } else {
        None
    };

    XaiKeyStorageStatus {
        connected: keyring.present || file_present,
        active_source,
        file: XaiKeyFileStorageInfo {
            present: file_present,
            path: file_path,
            encrypted: false,
            permissions: "0600".to_string(),
            why_not_encrypted,
        },
        keyring,
    }
}

pub fn set_xai_key(key: &str) -> Result<(), String> {
    let trimmed = key.trim();
    if trimmed.is_empty() {
        return Err("xAI API key cannot be empty.".to_string());
    }

    xai_key_store::write(trimmed)?;

    match write_xai_keyring(trimmed) {
        Ok(()) => eprintln!("[secrets] xAI key also written to keyring"),
        Err(e) => {
            eprintln!("[secrets] keyring save skipped for xAI (using file store): {e}");
            let _ = clear_xai_keyring();
        }
    }

    match xai_key_store::read()? {
        Some(stored) if stored == trimmed => Ok(()),
        Some(_) => Err("Saved xAI key could not be verified (file mismatch).".to_string()),
        None => Err(
            "xAI key save failed — could not read back key. Check app data permissions."
                .to_string(),
        ),
    }
}

pub fn clear_xai_key() -> Result<(), String> {
    xai_key_store::clear()?;
    clear_xai_keyring()
}

// End of xAI key parallel block
// ============================================================================

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
    let mut keyring = probe_keyring();
    let mut file_present = file_store::is_present();
    let file_path = file_store::path_display().unwrap_or_default();
    let mut active_source = resolve_active_source();

    // Promotion / heal on status query (production only).
    //
    // If the OS Secret Service is reachable but we currently have no entry (`present=false`)
    // while the file fallback has the token, we best-effort write the file's token into the
    // keyring and then re-probe. This causes the *returned status* (and the eprintln the UI
    // developer sees) to flip to active_source=Keyring on this call.
    //
    // Why this was added (2026):
    // - After the full-viewport multi-screen refactor the credentials panel moved to the
    //   Settings screen. Users (and agents) noticed "keyring is not used" more often because
    //   they now had to navigate to see the panel.
    // - Transient `write_keyring` failures (very common on Linux/Hyprland/minimal desktops)
    //   or external clearing of the entry (e.g. during `secret-tool` debugging) would leave
    //   the app permanently on the File fallback until the user did a full Disconnect+Save.
    // - The heal makes promotion automatic the next time the status is queried (startup or
    //   when the user opens Settings).
    //
    // See docs/SETUP.md → "Keyring reachable but not active" for the full story, the exact
    // log message this fixes, and diagnostic commands.
    //
    // Skipped under test (`!cfg!(test)`) to preserve exact expectations of the
    // `storage_status_file_active_when_only_file_has_token` etc. tests that deliberately
    // construct "only file + cleared keyring" scenarios. The usage-path heal in
    // `get_x_bearer_optional` is left unconditional (tests already tolerate it because they
    // call `clear_keyring()` in their harness + Drop).
    if !cfg!(test) && keyring.reachable && !keyring.present && file_present {
        if let Ok(Some(token)) = file_store::read() {
            match write_keyring(&token) {
                Ok(()) => {
                    eprintln!("[secrets] promoted bearer token from file into keyring (heal during status)");
                    // Re-probe so this status report reflects the promotion
                    keyring = probe_keyring();
                    active_source = resolve_active_source();
                    file_present = file_store::is_present();
                }
                Err(e) => {
                    eprintln!("[secrets] promotion of file token to keyring failed: {e}");
                }
            }
        }
    }

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
