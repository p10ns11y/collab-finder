use std::fs;
use std::io::Write;
use std::path::PathBuf;

const FILE_NAME: &str = "x-bearer";

/// Shared app data dir for collab-finder (used by secrets + db for consistency).
pub(crate) fn app_data_dir() -> Result<PathBuf, String> {
    let base = dirs::data_local_dir().ok_or("Could not resolve app data directory")?;
    Ok(base.join("collab-finder"))
}

fn store_path() -> Result<PathBuf, String> {
    Ok(app_data_dir()?.join(FILE_NAME))
}

fn ensure_parent(path: &PathBuf) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(parent, fs::Permissions::from_mode(0o700)).ok();
        }
    }
    Ok(())
}

pub fn read() -> Result<Option<String>, String> {
    let path = store_path()?;
    if !path.exists() {
        return Ok(None);
    }
    let bytes = fs::read(&path).map_err(|e| e.to_string())?;
    let value = String::from_utf8(bytes).map_err(|e| e.to_string())?;
    let trimmed = value.trim().to_string();
    if trimmed.is_empty() {
        Ok(None)
    } else {
        eprintln!("[secrets] bearer token loaded from file store: {}", path.display());
        Ok(Some(trimmed))
    }
}

pub fn write(token: &str) -> Result<(), String> {
    let path = store_path()?;
    ensure_parent(&path)?;
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .open(&path)
        .map_err(|e| e.to_string())?;
    file.write_all(token.as_bytes()).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&path, fs::Permissions::from_mode(0o600)).map_err(|e| e.to_string())?;
    }
    eprintln!("[secrets] bearer token saved to file store: {}", path.display());
    Ok(())
}

pub fn clear() -> Result<(), String> {
    let path = store_path()?;
    if path.exists() {
        fs::remove_file(path).map_err(|e| e.to_string())?;
    }
    Ok(())
}