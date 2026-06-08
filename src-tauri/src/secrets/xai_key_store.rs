use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use crate::app_dirs;

// See the big STABILITY CONTRACT header in secrets.rs (and app_dirs.rs).
// This file ONLY implements the xAI API key plaintext fallback file (0600, "xai-key" name).
// It is a deliberate parallel to file_store.rs (for x-bearer) so that changes to one
// secret type do not risk the other. The directory root is owned by app_dirs.
// DO NOT merge this with bearer logic.

const FILE_NAME: &str = "xai-key";

pub(crate) fn store_path() -> Result<PathBuf, String> {
    Ok(app_dirs::app_data_dir()?.join(FILE_NAME))
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
        eprintln!(
            "[secrets] xAI key loaded from file store: {}",
            path.display()
        );
        Ok(Some(trimmed))
    }
}

pub fn write(key: &str) -> Result<(), String> {
    let path = store_path()?;
    ensure_parent(&path)?;
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .open(&path)
        .map_err(|e| e.to_string())?;
    file.write_all(key.as_bytes()).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&path, fs::Permissions::from_mode(0o600)).map_err(|e| e.to_string())?;
    }
    eprintln!("[secrets] xAI key saved to file store: {}", path.display());
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
    use crate::app_dirs::test_harness;
    use std::os::unix::fs::PermissionsExt;
    use tempfile::TempDir;

    struct TestDir {
        _dir: TempDir,
        _lock: std::sync::MutexGuard<'static, ()>,
    }

    impl TestDir {
        fn new() -> Self {
            let lock = test_harness::LOCK
                .lock()
                .expect("xai key file store test lock");
            let dir = TempDir::new().expect("tempdir");
            test_harness::set(dir.path().to_path_buf());
            Self {
                _dir: dir,
                _lock: lock,
            }
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
        write("  xai-test-key-123  ").unwrap();
        assert_eq!(read().unwrap().as_deref(), Some("xai-test-key-123"));
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
        write("xai-secret").unwrap();
        let mode = fs::metadata(store_path().unwrap())
            .unwrap()
            .permissions()
            .mode()
            & 0o777;
        assert_eq!(mode, 0o600);
    }
}
