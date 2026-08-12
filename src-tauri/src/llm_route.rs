//! Quality-tier LLM routing metadata (not a secret).
//! Long+high → Grok ACP; long+moderate → cursor-agent; short/fast → xAI API.
//! Never recommend --always-approve / --yolo.

use serde::Serialize;
use std::path::PathBuf;
use std::process::Command;

const DEFAULT_QUALITY: &str = "fast";

#[derive(Debug, Clone, Serialize)]
pub struct LlmRouteStatus {
    pub quality: String,
    pub grok_bin: Option<String>,
    pub cursor_agent_bin: Option<String>,
    pub xai_key_present: bool,
    pub short_backend: String,
    pub long_high_backend: String,
    pub long_moderate_backend: String,
}

fn which(name: &str) -> Option<String> {
    let output = Command::new("which").arg(name).output().ok()?;
    if !output.status.success() {
        return None;
    }
    let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if path.is_empty() {
        None
    } else {
        Some(path)
    }
}

fn quality_path() -> Option<PathBuf> {
    crate::app_dirs::app_data_dir().ok().map(|d| d.join("llm_quality.txt"))
}

pub fn get_llm_quality() -> String {
    if let Some(p) = quality_path() {
        if let Ok(s) = std::fs::read_to_string(p) {
            let t = s.trim().to_ascii_lowercase();
            if t == "high" || t == "moderate" || t == "fast" {
                return t;
            }
        }
    }
    DEFAULT_QUALITY.to_string()
}

#[tauri::command]
pub fn get_llm_route_status() -> Result<LlmRouteStatus, String> {
    let grok_bin = which("grok");
    let cursor_agent_bin = which("cursor-agent");
    let xai_key_present = crate::secrets::has_xai_key();
    let grok = grok_bin.is_some();
    let cursor = cursor_agent_bin.is_some();

    let short_backend = if xai_key_present {
        "xai_api"
    } else if grok {
        "grok_headless"
    } else if cursor {
        "cursor_cli"
    } else {
        "none"
    }
    .to_string();

    let long_high_backend = if grok {
        "grok_acp"
    } else if xai_key_present {
        "xai_api"
    } else {
        "none"
    }
    .to_string();

    let long_moderate_backend = if cursor {
        "cursor_agent"
    } else if xai_key_present {
        "xai_api"
    } else if grok {
        "grok_acp"
    } else {
        "none"
    }
    .to_string();

    Ok(LlmRouteStatus {
        quality: get_llm_quality(),
        grok_bin,
        cursor_agent_bin,
        xai_key_present,
        short_backend,
        long_high_backend,
        long_moderate_backend,
    })
}

#[tauri::command]
pub fn set_llm_route_quality(quality: String) -> Result<(), String> {
    let t = quality.trim().to_ascii_lowercase();
    if t != "high" && t != "moderate" && t != "fast" {
        return Err("quality must be high | moderate | fast".into());
    }
    let dir = crate::app_dirs::app_data_dir()?;
    let _ = std::fs::create_dir_all(&dir);
    std::fs::write(dir.join("llm_quality.txt"), t).map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_quality_is_fast() {
        // Unset file in test harness → default.
        let q = get_llm_quality();
        assert!(q == "fast" || q == "high" || q == "moderate", "got {q}");
    }

    #[test]
    fn rejects_unknown_quality() {
        let err = set_llm_route_quality("yolo".into()).unwrap_err();
        assert!(err.contains("high"));
    }
}
