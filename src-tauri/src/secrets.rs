mod file_store;

use keyring::Error as KeyringError;

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

/// Missing credential is normal — not an error.
pub fn get_x_bearer_optional() -> Result<Option<String>, String> {
    if let Some(token) = read_keyring()? {
        return Ok(Some(token));
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
    get_x_bearer_optional()
        .ok()
        .flatten()
        .is_some()
}

/// Writes to file store (reliable under Tauri) and best-effort keyring; verifies read-back.
pub fn set_x_bearer(token: &str) -> Result<(), String> {
    let trimmed = token.trim();
    if trimmed.is_empty() {
        return Err("Bearer token cannot be empty.".to_string());
    }

    file_store::write(trimmed)?;

    if let Err(e) = write_keyring(trimmed) {
        eprintln!("[secrets] keyring save skipped (using file store): {e}");
    }

    match get_x_bearer_optional()? {
        Some(stored) if stored == trimmed => Ok(()),
        Some(_) => Err("Saved credential could not be verified (mismatch).".to_string()),
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

    #[test]
    fn file_store_roundtrip() {
        let token = "AAAA-test-token-1234567890";
        file_store::write(token).expect("write");
        let read = file_store::read().expect("read");
        assert_eq!(read.as_deref(), Some(token));
        file_store::clear().expect("clear");
        assert!(file_store::read().expect("read after clear").is_none());
    }
}