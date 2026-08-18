//! Co-located kanithanj.cv home (~/.local/share/kanithanj.cv). Apply-CV PDF maker extracted from devprofile.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;

use crate::app_dirs;

#[cfg(test)]
static TEST_HOME_OVERRIDE: Mutex<Option<Option<PathBuf>>> = Mutex::new(None);

#[cfg(test)]
pub fn set_test_home(home: Option<Option<PathBuf>>) {
    *TEST_HOME_OVERRIDE.lock().expect("cv home test lock") = home;
}

#[cfg(test)]
pub fn clear_test_home() {
    *TEST_HOME_OVERRIDE.lock().expect("cv home test lock") = None;
}

const CV_HOME_FILE: &str = "cv_home.txt";
const DEFAULT_SHARE_NAME: &str = "kanithanj.cv";

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct CvHomeStatus {
    pub installed: bool,
    pub home_path: Option<String>,
    pub cli_path: Option<String>,
    pub script_present: bool,
    pub cvdata_present: bool,
    pub bun_present: bool,
}

pub fn default_home() -> PathBuf {
    dirs::data_local_dir()
        .map(|d| d.join(DEFAULT_SHARE_NAME))
        .unwrap_or_else(|| PathBuf::from(format!("{}/.local/share/{}", std::env::var("HOME").unwrap_or_default(), DEFAULT_SHARE_NAME)))
}

pub fn cli_path() -> PathBuf {
    dirs::home_dir()
        .map(|h| h.join(".local/bin/kanithanj.cv"))
        .unwrap_or_else(|| PathBuf::from("/usr/local/bin/kanithanj.cv"))
}

fn read_persisted_home() -> Option<PathBuf> {
    let p = app_dirs::app_data_dir().ok()?.join(CV_HOME_FILE);
    let text = fs::read_to_string(p).ok()?;
    let trimmed = text.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(PathBuf::from(trimmed))
    }
}

pub fn write_persisted_home(path: &Path) -> Result<(), String> {
    let dir = app_dirs::app_data_dir()?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    fs::write(dir.join(CV_HOME_FILE), format!("{}\n", path.display())).map_err(|e| e.to_string())
}

/// Resolved CV maker root: persisted cv_home → default share if script exists.
pub fn resolve_home() -> Option<PathBuf> {
    #[cfg(test)]
    if let Some(forced) = TEST_HOME_OVERRIDE.lock().expect("cv home test lock").clone() {
        return forced;
    }
    if let Some(p) = read_persisted_home() {
        if p.join("scripts/generate-apply-cv.tsx").is_file() {
            return Some(p);
        }
    }
    let fallback = default_home();
    if fallback.join("scripts/generate-apply-cv.tsx").is_file() {
        return Some(fallback);
    }
    None
}

pub fn status() -> CvHomeStatus {
    let home = resolve_home();
    let script_present = home
        .as_ref()
        .map(|h| h.join("scripts/generate-apply-cv.tsx").is_file())
        .unwrap_or(false);
    let cvdata_present = home
        .as_ref()
        .map(|h| h.join("src/data/cvdata.json").is_file())
        .unwrap_or(false);
    let cli = cli_path();
    CvHomeStatus {
        installed: script_present,
        home_path: home.as_ref().map(|p| p.display().to_string()),
        cli_path: if cli.is_file() {
            Some(cli.display().to_string())
        } else {
            None
        },
        script_present,
        cvdata_present,
        bun_present: crate::opportunity_target::resolve_tool_binary("bun").is_some(),
    }
}
fn repo_root() -> Result<PathBuf, String> {
    // collab-finder repo when running `cargo tauri dev` from src-tauri
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    Ok(manifest.parent().ok_or("no repo root")?.to_path_buf())
}

/// Run scripts/install-kanithanj-cv.sh (bundled vendor → ~/.local/share/kanithanj.cv).
pub fn install_from_vendor() -> Result<CvHomeStatus, String> {
    let root = repo_root()?;
    let script = root.join("scripts/install-kanithanj-cv.sh");
    if !script.is_file() {
        return Err(format!("install script missing at {}", script.display()));
    }
    let devprofile = crate::opportunity_target::get_devprofile_path();
    let mut cmd = Command::new("bash");
    cmd.arg(&script).current_dir(&root);
    if let Some(ref dev) = devprofile.filter(|d| PathBuf::from(d).is_dir()) {
        cmd.env("DEVPROFILE_SRC", dev);
        let cvdata = PathBuf::from(dev).join("src/data/cvdata.json");
        if cvdata.is_file() {
            cmd.env("CVDATA_SRC", cvdata);
        }
    }
    let out = cmd.output().map_err(|e| format!("install kanithanj.cv: {e}"))?;
    if !out.status.success() {
        return Err(format!(
            "install kanithanj.cv failed ({}):\n{}\n{}",
            out.status,
            String::from_utf8_lossy(&out.stdout),
            String::from_utf8_lossy(&out.stderr)
        ));
    }
    Ok(status())
}

pub fn preflight_script(home: &Path) -> Result<PathBuf, String> {
    let script = home.join("scripts/generate-apply-cv.tsx");
    if !script.is_file() {
        return Err(format!(
            "generate-apply-cv.tsx missing at {} — install kanithanj.cv from Preferences",
            script.display()
        ));
    }
    Ok(script)
}

#[tauri::command]
pub fn get_cv_home_status() -> CvHomeStatus {
    status()
}

#[tauri::command]
pub fn install_kanithanj_cv() -> Result<CvHomeStatus, String> {
    install_from_vendor()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_home_respects_test_override() {
        clear_test_home();
        let tmp = tempfile::tempdir().expect("tmpdir");
        let script_dir = tmp.path().join("scripts");
        std::fs::create_dir_all(&script_dir).expect("scripts");
        std::fs::write(script_dir.join("generate-apply-cv.tsx"), b"// stub").expect("write");
        set_test_home(Some(Some(tmp.path().to_path_buf())));
        assert_eq!(resolve_home().as_deref(), Some(tmp.path()));
        set_test_home(Some(None));
        assert!(resolve_home().is_none());
        clear_test_home();
    }

    #[test]
    fn preflight_script_requires_file() {
        let tmp = tempfile::tempdir().expect("tmpdir");
        assert!(preflight_script(tmp.path()).is_err());
        std::fs::create_dir_all(tmp.path().join("scripts")).expect("scripts");
        std::fs::write(tmp.path().join("scripts/generate-apply-cv.tsx"), b"// ok").expect("write");
        assert!(preflight_script(tmp.path()).is_ok());
    }
}
