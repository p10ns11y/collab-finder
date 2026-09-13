// Env fallback for xAI API key — parallel to xai_key_store.rs (see secrets.rs STABILITY CONTRACT).
// Reads operator-provided XAI_API_KEY when keyring + file are empty. Never logs secret bytes.

const VAR_NAME: &str = "XAI_API_KEY";

pub(crate) fn var_name_if_present() -> Option<String> {
    match std::env::var(VAR_NAME) {
        Ok(value) if !value.trim().is_empty() => Some(VAR_NAME.to_string()),
        _ => None,
    }
}

pub(crate) fn is_present() -> bool {
    var_name_if_present().is_some()
}

/// Returns `(key, var_name)` when `XAI_API_KEY` is set and non-empty. Never logs the key.
pub fn read() -> Result<Option<(String, String)>, String> {
    match std::env::var(VAR_NAME) {
        Ok(value) => {
            let trimmed = value.trim();
            if trimmed.is_empty() {
                return Ok(None);
            }
            eprintln!("[secrets] xAI key loaded from env var: {VAR_NAME}");
            Ok(Some((trimmed.to_string(), VAR_NAME.to_string())))
        }
        Err(std::env::VarError::NotPresent) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}
