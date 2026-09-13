// Env fallback for X bearer — parallel to file_store.rs (see secrets.rs STABILITY CONTRACT).
// Reads operator-provided env vars when keyring + file are empty. Never logs secret bytes.

const VAR_PRIMARY: &str = "X_API_KEY";
const VAR_ALT: &str = "X_BEARER";

/// Which env var name is set (metadata only). `X_API_KEY` wins over `X_BEARER` when both are non-empty.
pub(crate) fn var_name_if_present() -> Option<String> {
    for name in [VAR_PRIMARY, VAR_ALT] {
        match std::env::var(name) {
            Ok(value) if !value.trim().is_empty() => return Some(name.to_string()),
            _ => {}
        }
    }
    None
}

pub(crate) fn is_present() -> bool {
    var_name_if_present().is_some()
}

/// Returns `(token, var_name)` when a non-empty env var is set. Never logs the token.
pub fn read() -> Result<Option<(String, String)>, String> {
    for name in [VAR_PRIMARY, VAR_ALT] {
        match std::env::var(name) {
            Ok(value) => {
                let trimmed = value.trim();
                if trimmed.is_empty() {
                    continue;
                }
                eprintln!("[secrets] bearer token loaded from env var: {name}");
                return Ok(Some((trimmed.to_string(), name.to_string())));
            }
            Err(std::env::VarError::NotPresent) => {}
            Err(e) => return Err(e.to_string()),
        }
    }
    Ok(None)
}
