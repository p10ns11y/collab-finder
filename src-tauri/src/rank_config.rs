//! User overlay for rankers. Identity data lives in `~/.config/collab-finder/packs/` only.
//!
//! `profile` is a label (operator vs custom) — both use packs on disk; nothing is compiled in.
//!
//! Config lives at `~/.config/collab-finder/rank.json` — not `app_dirs` (DB/secrets).

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum RankProfile {
    #[default]
    Operator,
    Custom,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FirmWeights {
    pub spacexai: i32,
    pub fortress: i32,
    pub ai_tsunami: i32,
    pub product_moat: i32,
    pub hiring: i32,
}

impl Default for FirmWeights {
    fn default() -> Self {
        Self {
            spacexai: 8,
            fortress: 7,
            ai_tsunami: 6,
            product_moat: 6,
            hiring: 5,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlaceWeights {
    pub economic: i32,
    pub ethics: i32,
    pub character: i32,
    pub social: i32,
    pub family: i32,
    pub self_fit: i32,
}

impl Default for PlaceWeights {
    fn default() -> Self {
        Self {
            economic: 5,
            ethics: 5,
            character: 4,
            social: 6,
            family: 6,
            self_fit: 4,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RankGates {
    pub theater_saas: bool,
    pub fortress_min: u8,
    pub product_moat_min: u8,
}

impl Default for RankGates {
    fn default() -> Self {
        Self {
            theater_saas: true,
            fortress_min: 2,
            product_moat_min: 2,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RankConfig {
    #[serde(default)]
    pub profile: RankProfile,
    #[serde(default)]
    pub weights: FirmWeights,
    #[serde(default)]
    pub place_weights: PlaceWeights,
    #[serde(default)]
    pub gates: RankGates,
    /// Extra directories containing `universe.json` and/or `places.json`.
    #[serde(default)]
    pub pack_dirs: Vec<String>,
    /// Firm ids selected by default on Mission Pull. Empty = all registry firms.
    #[serde(default)]
    pub default_firms: Vec<String>,
}

impl Default for RankConfig {
    fn default() -> Self {
        Self {
            profile: RankProfile::Operator,
            weights: FirmWeights::default(),
            place_weights: PlaceWeights::default(),
            gates: RankGates::default(),
            pack_dirs: Vec::new(),
            default_firms: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RankConfigView {
    pub config: RankConfig,
    pub config_path: String,
    pub pack_files: Vec<String>,
}

static OVERRIDE: Mutex<Option<RankConfig>> = Mutex::new(None);
static DIR_OVERRIDE: Mutex<Option<PathBuf>> = Mutex::new(None);

pub fn set_test_config(cfg: Option<RankConfig>) {
    *OVERRIDE.lock().expect("rank config") = cfg;
}

pub fn set_test_dir(dir: Option<PathBuf>) {
    *DIR_OVERRIDE.lock().expect("rank dir") = dir;
}

pub fn config_dir() -> Result<PathBuf, String> {
    if let Some(d) = DIR_OVERRIDE.lock().expect("rank dir").clone() {
        return Ok(d);
    }
    let base = dirs::config_dir().ok_or("no config dir")?;
    Ok(base.join("collab-finder"))
}

pub fn config_path() -> Result<PathBuf, String> {
    Ok(config_dir()?.join("rank.json"))
}

pub fn default_packs_dir() -> Result<PathBuf, String> {
    Ok(config_dir()?.join("packs"))
}

pub fn load() -> RankConfig {
    if let Some(cfg) = OVERRIDE.lock().expect("rank config").clone() {
        return cfg;
    }
    let path = match config_path() {
        Ok(p) => p,
        Err(_) => return RankConfig::default(),
    };
    match fs::read_to_string(&path) {
        Ok(text) => serde_json::from_str(&text).unwrap_or_default(),
        Err(_) => RankConfig::default(),
    }
}

pub fn save(cfg: &RankConfig) -> Result<PathBuf, String> {
    let dir = config_dir()?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    fs::create_dir_all(dir.join("packs")).map_err(|e| e.to_string())?;
    let path = dir.join("rank.json");
    let text = serde_json::to_string_pretty(cfg).map_err(|e| e.to_string())?;
    fs::write(&path, text).map_err(|e| e.to_string())?;
    Ok(path)
}

pub fn view() -> Result<RankConfigView, String> {
    let path = config_path()?;
    if !path.exists() {
        let _ = save(&RankConfig::default());
    }
    let config = load();
    let mut pack_files = Vec::new();
    for dir in resolved_pack_dirs(&config) {
        if let Ok(rd) = fs::read_dir(&dir) {
            for ent in rd.flatten() {
                let p = ent.path();
                if p.extension().and_then(|s| s.to_str()) == Some("json") {
                    pack_files.push(p.display().to_string());
                }
            }
        }
    }
    pack_files.sort();
    Ok(RankConfigView {
        config,
        config_path: path.display().to_string(),
        pack_files,
    })
}

fn resolved_pack_dirs(cfg: &RankConfig) -> Vec<PathBuf> {
    let mut out = Vec::new();
    if let Ok(d) = default_packs_dir() {
        out.push(d);
    }
    for raw in &cfg.pack_dirs {
        let p = PathBuf::from(raw);
        if p.is_dir() {
            out.push(p);
        }
    }
    out
}

pub fn pack_json_values(names: &[&str]) -> Vec<serde_json::Value> {
    let cfg = load();
    let mut out = Vec::new();
    for dir in resolved_pack_dirs(&cfg) {
        for name in names {
            let p = dir.join(name);
            if let Ok(text) = fs::read_to_string(&p) {
                if let Ok(v) = serde_json::from_str(&text) {
                    out.push(v);
                }
            }
        }
    }
    out
}

pub fn is_custom_profile() -> bool {
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pack_json_reads_universe_file() {
        let tmp = tempfile::tempdir().unwrap();
        let packs = tmp.path().join("packs");
        fs::create_dir_all(&packs).unwrap();
        fs::write(packs.join("universe.json"), r#"{"firms":[{"id":"x"}]}"#).unwrap();
        set_test_dir(Some(tmp.path().to_path_buf()));
        set_test_config(Some(RankConfig::default()));
        let vals = pack_json_values(&["universe.json"]);
        assert_eq!(vals.len(), 1);
        set_test_config(None);
        set_test_dir(None);
    }
}
