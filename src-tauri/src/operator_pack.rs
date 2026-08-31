//! Operator identity files — loaded from `~/.config/collab-finder/packs/`, never compiled in.
//!
//! Seed once: `scripts/seed-operator-config.sh` (copies from gitignored `data/operator/`).

use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

static PACKS_DIR_OVERRIDE: Mutex<Option<PathBuf>> = Mutex::new(None);

pub fn set_test_packs_dir(dir: Option<PathBuf>) {
    *PACKS_DIR_OVERRIDE.lock().expect("packs dir") = dir;
}

pub fn packs_dir() -> Result<PathBuf, String> {
    if let Some(d) = PACKS_DIR_OVERRIDE.lock().expect("packs dir").clone() {
        return Ok(d);
    }
    #[cfg(test)]
    {
        let testdata = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("testdata");
        if testdata.join("universe.json").is_file() {
            return Ok(testdata);
        }
    }
    crate::rank_config::default_packs_dir()
}

pub fn read_text(name: &str) -> Option<String> {
    let path = packs_dir().ok()?.join(name);
    fs::read_to_string(path).ok()
}

pub fn read_text_or(name: &str, fallback: &str) -> String {
    read_text(name).unwrap_or_else(|| fallback.to_string())
}

/// Minimal install when packs are empty — stranger / fresh clone.
pub const STUB_UNIVERSE_JSON: &str = r#"{"algorithm_version":"v1","scored_at":"stub","firms":[{"id":"example_co","name":"Example Co","hq":"EU","depth_geo":"europe","product_class":"example","theater_saas":false,"product_moat":3,"ai_tsunami":3,"fortress":3,"hiring_signal":2,"spacexai_vector":2}]}"#;

pub const STUB_PLACES_JSON: &str = r#"{"algorithm_version":"v1","scored_at":"stub","notes":"","critic":[],"places":[{"id":"example_city","name":"Example City","country":"EU","band":"depth","economic":3,"ethics":3,"character":3,"social":3,"family":3,"self":3,"legal_ease":0,"why":"stub","cost":"stub"}]}"#;

pub const STUB_CV_PACKET: &str =
    "Configure your CV summary in ~/.config/collab-finder/packs/cv-packet.txt (run scripts/seed-operator-config.sh).";

pub const STUB_CONSTRAINTS_STRICT: &str =
    "Configure strict dual-fit constraints in ~/.config/collab-finder/packs/constraints-strict.txt";

pub const STUB_CONSTRAINTS_RELAXED: &str =
    "Configure relaxed constraints in ~/.config/collab-finder/packs/constraints-relaxed.txt";

pub const STUB_PROOF_VARIANTS: &str =
    "# Proof variants\n\nConfigure ~/.config/collab-finder/packs/proof-variants.md";

pub const STUB_PUBLIC_PROJECTS_JSON: &str = "[]";

pub fn universe_json() -> String {
    read_text("universe.json").unwrap_or_else(|| STUB_UNIVERSE_JSON.to_string())
}

pub fn places_json() -> String {
    read_text("places.json")
        .or_else(|| read_text("environments.json"))
        .unwrap_or_else(|| STUB_PLACES_JSON.to_string())
}

pub fn cv_packet() -> String {
    read_text("cv-packet.txt").unwrap_or_else(|| STUB_CV_PACKET.to_string())
}

pub fn constraints_strict() -> String {
    read_text("constraints-strict.txt").unwrap_or_else(|| STUB_CONSTRAINTS_STRICT.to_string())
}

pub fn constraints_relaxed() -> String {
    read_text("constraints-relaxed.txt").unwrap_or_else(|| STUB_CONSTRAINTS_RELAXED.to_string())
}

pub fn proof_variants_md() -> String {
    read_text("proof-variants.md").unwrap_or_else(|| STUB_PROOF_VARIANTS.to_string())
}

pub fn public_projects_focused_json() -> String {
    read_text("public-projects-focused.json")
        .unwrap_or_else(|| STUB_PUBLIC_PROJECTS_JSON.to_string())
}

pub fn public_projects_slim_json() -> String {
    read_text("public-projects.json").unwrap_or_else(|| STUB_PUBLIC_PROJECTS_JSON.to_string())
}

pub fn public_projects_clean_json() -> String {
    read_text("public-projects-clean.json").unwrap_or_else(|| STUB_PUBLIC_PROJECTS_JSON.to_string())
}

pub fn x_search_queries_json() -> String {
    read_text("x-search-queries.json").unwrap_or_else(|| {
        include_str!("../../data/distillation/x-search/queries.json").to_string()
    })
}

pub fn hunt_rails_json() -> String {
    read_text("hunt-rails.json").unwrap_or_else(|| "{}".to_string())
}

#[cfg(test)]
pub struct TestFixturesGuard {
    _tmpdir: tempfile::TempDir,
}

#[cfg(test)]
impl Drop for TestFixturesGuard {
    fn drop(&mut self) {
        clear_test_fixtures();
    }
}

#[cfg(test)]
pub fn install_test_fixtures() -> TestFixturesGuard {
    use std::path::Path;

    let tmp = tempfile::tempdir().expect("test tempdir");
    let packs = tmp.path().join("packs");
    fs::create_dir_all(&packs).expect("packs dir");
    let src = Path::new(env!("CARGO_MANIFEST_DIR")).join("testdata");
    if src.is_dir() {
        for ent in fs::read_dir(&src).into_iter().flatten().flatten() {
            let path = ent.path();
            if path.is_file() {
                let _ = fs::copy(&path, packs.join(path.file_name().unwrap()));
            }
        }
    }
    crate::rank_config::set_test_dir(Some(tmp.path().to_path_buf()));
    set_test_packs_dir(Some(packs));
    TestFixturesGuard { _tmpdir: tmp }
}

#[cfg(test)]
pub fn clear_test_fixtures() {
    crate::rank_config::set_test_dir(None);
    set_test_packs_dir(None);
}
