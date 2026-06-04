use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

const FILE_NAME: &str = "x-bearer";

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

/// Shared app data dir for collab-finder (used by secrets + db for consistency).
pub(crate) fn app_data_dir() -> Result<PathBuf, String> {
    #[cfg(test)]
    if let Some(root) = test_harness::get() {
        return Ok(root);
    }
    let base = dirs::data_local_dir().ok_or("Could not resolve app data directory")?;
    Ok(base.join("collab-finder"))
}

pub(crate) fn store_path() -> Result<PathBuf, String> {
    Ok(app_data_dir()?.join(FILE_NAME))
}

pub(crate) fn path_display() -> Result<String, String> {
    Ok(store_path()?.display().to_string())
}

pub(crate) fn is_present() -> bool {
    read().ok().flatten().is_some()
}

fn ensure_parent(path: &Path) -> Result<(), String> {
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::os::unix::fs::PermissionsExt;
    use tempfile::TempDir;

    struct TestDir {
        _dir: TempDir,
        _lock: std::sync::MutexGuard<'static, ()>,
    }

    impl TestDir {
        fn new() -> Self {
            let lock = test_harness::LOCK.lock().expect("file store test lock");
            let dir = TempDir::new().expect("tempdir");
            test_harness::set(dir.path().to_path_buf());
            Self { _dir: dir, _lock: lock }
        }
    }

    impl Drop for TestDir {
        fn drop(&mut self) {
            test_harness::clear();
        }
    }

    #[test]
    fn roundtrip_trim_and_clear() {
        let _guard = TestDir::new();
        write("  token-with-space  ").unwrap();
        assert_eq!(read().unwrap().as_deref(), Some("token-with-space"));
        clear().unwrap();
        assert!(read().unwrap().is_none());
    }

    #[test]
    fn empty_file_treated_as_missing() {
        let _guard = TestDir::new();
        let path = store_path().unwrap();
        ensure_parent(&path).unwrap();
        fs::write(&path, "   \n").unwrap();
        assert!(read().unwrap().is_none());
    }

    #[cfg(unix)]
    #[test]
    fn file_mode_is_0600() {
        let _guard = TestDir::new();
        write("secret").unwrap();
        let mode = fs::metadata(store_path().unwrap())
            .unwrap()
            .permissions()
            .mode()
            & 0o777;
        assert_eq!(mode, 0o600);
    }
}
