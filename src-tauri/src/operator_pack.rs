//! Operator identity files — loaded from `~/.config/collab-finder/packs/`, never compiled in.
//!
//! Seed once: `scripts/seed-operator-config.sh` (copies from gitignored `data/operator/`).

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::UNIX_EPOCH;

static PACKS_DIR_OVERRIDE: Mutex<Option<PathBuf>> = Mutex::new(None);

#[cfg(test)]
static FIXTURES_LOCK: Mutex<()> = Mutex::new(());

#[cfg(test)]
thread_local! {
    static FIXTURES_DEPTH: std::cell::Cell<usize> = const { std::cell::Cell::new(0) };
}

pub(crate) struct FixturesReadGuard {
    #[cfg(test)]
    _lock: Option<std::sync::MutexGuard<'static, ()>>,
}

impl Drop for FixturesReadGuard {
    fn drop(&mut self) {
        #[cfg(test)]
        FIXTURES_DEPTH.with(|depth| depth.set(depth.get().saturating_sub(1)));
    }
}

pub(crate) fn enter_fixtures() -> FixturesReadGuard {
    #[cfg(test)]
    {
        let depth = FIXTURES_DEPTH.with(|depth| depth.get());
        FIXTURES_DEPTH.with(|depth| depth.set(depth.get() + 1));
        if depth == 0 {
            FixturesReadGuard {
                _lock: Some(
                    FIXTURES_LOCK
                        .lock()
                        .unwrap_or_else(|poison| poison.into_inner()),
                ),
            }
        } else {
            FixturesReadGuard { _lock: None }
        }
    }
    #[cfg(not(test))]
    FixturesReadGuard {}
}

pub fn set_test_packs_dir(dir: Option<PathBuf>) {
    *PACKS_DIR_OVERRIDE.lock().expect("packs dir") = dir;
}

pub fn packs_dir() -> Result<PathBuf, String> {
    let _guard = enter_fixtures();
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

/// Files seeded by `scripts/seed-operator-config.sh` (order = display priority).
const EXPECTED_PACK_FILES: &[&str] = &[
    "cv-packet.txt",
    "universe.json",
    "places.json",
    "constraints-strict.txt",
    "constraints-relaxed.txt",
    "proof-variants.md",
    "public-projects-focused.json",
    "public-projects.json",
    "public-projects-clean.json",
    "x-search-queries.json",
    "hunt-rails.json",
    "mission-firms.json",
];

/// Critical for Evaluate / Next 10 — stub here tanks operator trust.
const CRITICAL_PACK_FILES: &[&str] = &["cv-packet.txt", "universe.json"];

pub const SEED_OPERATOR_PACK_HINT: &str =
    "Run ./scripts/seed-operator-config.sh from the collab-finder repo root (creates ~/.config/collab-finder/packs/).";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PackFileKind {
    Ok,
    Missing,
    Unreadable,
    Stub,
    Invalid,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PackFileStatus {
    pub name: String,
    pub present: bool,
    pub readable: bool,
    pub size_bytes: Option<u64>,
    pub modified_secs: Option<i64>,
    pub kind: PackFileKind,
    pub detail: Option<String>,
    pub critical: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OperatorPackHealth {
    Healthy,
    Degraded,
    Stub,
    Missing,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OperatorPackStatus {
    pub packs_dir: String,
    pub dir_present: bool,
    pub dir_readable: bool,
    pub health: OperatorPackHealth,
    pub seeded: bool,
    pub seed_hint: String,
    pub fix_hint: Option<String>,
    pub files: Vec<PackFileStatus>,
    pub extra_files: Vec<String>,
}

fn file_mtime_secs(path: &Path) -> Option<i64> {
    let modified = fs::metadata(path).ok()?.modified().ok()?;
    modified
        .duration_since(UNIX_EPOCH)
        .ok()
        .map(|d| d.as_secs() as i64)
}

fn is_stub_content(name: &str, text: &str) -> bool {
    let trimmed = text.trim();
    match name {
        "cv-packet.txt" => trimmed == STUB_CV_PACKET.trim(),
        "universe.json" => {
            trimmed == STUB_UNIVERSE_JSON.trim() || trimmed.contains(r#""scored_at":"stub""#)
        }
        "places.json" | "environments.json" => {
            trimmed == STUB_PLACES_JSON.trim() || trimmed.contains(r#""scored_at":"stub""#)
        }
        "constraints-strict.txt" => trimmed == STUB_CONSTRAINTS_STRICT.trim(),
        "constraints-relaxed.txt" => trimmed == STUB_CONSTRAINTS_RELAXED.trim(),
        "proof-variants.md" => trimmed == STUB_PROOF_VARIANTS.trim(),
        "public-projects-focused.json" | "public-projects.json" | "public-projects-clean.json" => {
            trimmed == STUB_PUBLIC_PROJECTS_JSON.trim()
        }
        _ => false,
    }
}

fn validate_pack_file(name: &str, text: &str) -> Result<(), String> {
    if is_stub_content(name, text) {
        return Err("stub placeholder — seed operator pack".to_string());
    }
    if name.ends_with(".json") {
        serde_json::from_str::<serde_json::Value>(text)
            .map_err(|e| format!("invalid JSON: {e}"))?;
    }
    Ok(())
}

fn inspect_pack_file(dir: &Path, name: &str) -> PackFileStatus {
    let critical = CRITICAL_PACK_FILES.contains(&name);
    let path = dir.join(name);
    if !path.is_file() {
        return PackFileStatus {
            name: name.to_string(),
            present: false,
            readable: false,
            size_bytes: None,
            modified_secs: None,
            kind: PackFileKind::Missing,
            detail: Some("file not found".to_string()),
            critical,
        };
    }
    let meta = match fs::metadata(&path) {
        Ok(m) => m,
        Err(e) => {
            return PackFileStatus {
                name: name.to_string(),
                present: true,
                readable: false,
                size_bytes: None,
                modified_secs: None,
                kind: PackFileKind::Unreadable,
                detail: Some(e.to_string()),
                critical,
            };
        }
    };
    let size_bytes = meta.len();
    let modified_secs = file_mtime_secs(&path);
    match fs::read_to_string(&path) {
        Ok(text) => {
            let validation = validate_pack_file(name, &text);
            let kind = match &validation {
                Ok(()) => PackFileKind::Ok,
                Err(msg) if msg.contains("stub") => PackFileKind::Stub,
                Err(_) => PackFileKind::Invalid,
            };
            PackFileStatus {
                name: name.to_string(),
                present: true,
                readable: true,
                size_bytes: Some(size_bytes),
                modified_secs,
                kind,
                detail: validation.err(),
                critical,
            }
        }
        Err(e) => PackFileStatus {
            name: name.to_string(),
            present: true,
            readable: false,
            size_bytes: Some(size_bytes),
            modified_secs,
            kind: PackFileKind::Unreadable,
            detail: Some(e.to_string()),
            critical,
        },
    }
}

fn list_extra_pack_files(dir: &Path) -> Vec<String> {
    let mut extras = Vec::new();
    let Ok(rd) = fs::read_dir(dir) else {
        return extras;
    };
    for ent in rd.flatten() {
        let path = ent.path();
        if !path.is_file() {
            continue;
        }
        let Some(name) = path.file_name().and_then(|s| s.to_str()) else {
            continue;
        };
        if EXPECTED_PACK_FILES.contains(&name) {
            continue;
        }
        extras.push(name.to_string());
    }
    extras.sort();
    extras
}

fn derive_pack_health(
    files: &[PackFileStatus],
    dir_present: bool,
    dir_readable: bool,
) -> (OperatorPackHealth, bool, Option<String>) {
    if !dir_present {
        return (
            OperatorPackHealth::Missing,
            false,
            Some(format!(
                "Packs directory missing. {SEED_OPERATOR_PACK_HINT}"
            )),
        );
    }
    if !dir_readable {
        return (
            OperatorPackHealth::Missing,
            false,
            Some("Packs directory exists but is not readable — check permissions.".to_string()),
        );
    }

    let critical: Vec<_> = files.iter().filter(|f| f.critical).collect();
    let cv = critical.iter().find(|f| f.name == "cv-packet.txt");
    let universe = critical.iter().find(|f| f.name == "universe.json");

    if cv.is_some_and(|f| f.kind == PackFileKind::Missing)
        || universe.is_some_and(|f| f.kind == PackFileKind::Missing)
    {
        return (
            OperatorPackHealth::Missing,
            false,
            Some(format!(
                "Critical pack files missing (cv-packet.txt and/or universe.json). {SEED_OPERATOR_PACK_HINT}"
            )),
        );
    }

    if critical.iter().any(|f| {
        matches!(
            f.kind,
            PackFileKind::Stub | PackFileKind::Invalid | PackFileKind::Unreadable
        )
    }) {
        return (
            OperatorPackHealth::Stub,
            false,
            Some(format!(
                "Evaluate / Next 10 are using stub identity — seed real packs. {SEED_OPERATOR_PACK_HINT}"
            )),
        );
    }

    let any_bad = files.iter().any(|f| {
        matches!(
            f.kind,
            PackFileKind::Missing
                | PackFileKind::Stub
                | PackFileKind::Invalid
                | PackFileKind::Unreadable
        )
    });
    if any_bad {
        return (
            OperatorPackHealth::Degraded,
            true,
            Some(
                "Core packs are seeded; some optional files are missing or invalid — re-run seed or copy from data/operator/."
                    .to_string(),
            ),
        );
    }

    (OperatorPackHealth::Healthy, true, None)
}

pub fn pack_status() -> Result<OperatorPackStatus, String> {
    let dir = packs_dir()?;
    let dir_present = dir.is_dir();
    let dir_readable = dir_present && fs::read_dir(&dir).is_ok();
    let files: Vec<PackFileStatus> = EXPECTED_PACK_FILES
        .iter()
        .map(|name| inspect_pack_file(&dir, name))
        .collect();
    let extra_files = if dir_readable {
        list_extra_pack_files(&dir)
    } else {
        Vec::new()
    };
    let (health, seeded, fix_hint) = derive_pack_health(&files, dir_present, dir_readable);
    Ok(OperatorPackStatus {
        packs_dir: dir.display().to_string(),
        dir_present,
        dir_readable,
        health,
        seeded,
        seed_hint: SEED_OPERATOR_PACK_HINT.to_string(),
        fix_hint,
        files,
        extra_files,
    })
}

#[tauri::command]
pub fn get_operator_pack_status() -> Result<OperatorPackStatus, String> {
    pack_status()
}

#[cfg(test)]
pub struct FixtureLockGuard {
    _lock: FixturesReadGuard,
}

#[cfg(test)]
impl Drop for FixtureLockGuard {
    fn drop(&mut self) {
        clear_test_fixtures();
    }
}

#[cfg(test)]
pub fn lock_test_fixtures() -> FixtureLockGuard {
    FixtureLockGuard {
        _lock: enter_fixtures(),
    }
}

#[cfg(test)]
pub struct TestFixturesGuard {
    _tmpdir: tempfile::TempDir,
    _lock: FixtureLockGuard,
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

    let lock = lock_test_fixtures();
    let tmp = tempfile::tempdir().expect("test tempdir");
    let packs = tmp.path().join("packs");
    fs::create_dir_all(&packs).expect("packs dir");
    let src = Path::new(env!("CARGO_MANIFEST_DIR")).join("testdata");
    install_pack_files(&src, &packs);
    crate::rank_config::set_test_dir(Some(tmp.path().to_path_buf()));
    set_test_packs_dir(Some(packs));
    TestFixturesGuard {
        _tmpdir: tmp,
        _lock: lock,
    }
}

/// Copy testdata first, then fill gaps from `scripts/seed-testdata-for-ci.sh`.
/// A file already in testdata is left as-is.
#[cfg(test)]
fn install_pack_files(testdata: &Path, packs: &Path) {
    if testdata.is_dir() {
        for ent in fs::read_dir(testdata).into_iter().flatten().flatten() {
            let path = ent.path();
            if path.is_file() {
                let Some(name) = path.file_name() else {
                    continue;
                };
                let _ = fs::copy(&path, packs.join(name));
            }
        }
    }
    seed_missing_from_repo(packs);
}

/// Pairs of (repo-relative source, pack file name) from the seed script.
#[cfg(test)]
fn repo_seed_pairs() -> Vec<(String, String)> {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../scripts/seed-testdata-for-ci.sh");
    let script = fs::read_to_string(&path).unwrap_or_else(|err| {
        panic!("missing seed script scripts/seed-testdata-for-ci.sh: {err}");
    });
    let pairs = parse_seed_script(&script);
    if pairs.is_empty() {
        panic!("seed script scripts/seed-testdata-for-ci.sh has no copy lines");
    }
    pairs
}

#[cfg(test)]
fn parse_seed_script(script: &str) -> Vec<(String, String)> {
    script
        .lines()
        .filter_map(|line| {
            let rest = line.trim().strip_prefix("copy \"$ROOT/")?;
            let (src, rest) = rest.split_once("\" \"")?;
            let name = rest.strip_suffix('"')?;
            if src.is_empty() || name.is_empty() {
                return None;
            }
            Some((src.to_string(), name.to_string()))
        })
        .collect()
}

#[cfg(test)]
fn seed_missing_from_repo(packs: &Path) {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..");
    for (src, name) in repo_seed_pairs() {
        let dest = packs.join(&name);
        if dest.exists() {
            continue;
        }
        copy_repo_seed(&root, &src, &dest);
    }
}

#[cfg(test)]
fn copy_repo_seed(root: &Path, src_rel: &str, dest: &Path) {
    fs::copy(root.join(src_rel), dest).unwrap_or_else(|err| {
        panic!("missing seed {src_rel}: {err}");
    });
}

#[cfg(test)]
pub fn clear_test_fixtures() {
    crate::rank_config::set_test_config(None);
    crate::rank_config::set_test_dir(None);
    set_test_packs_dir(None);
}

#[cfg(test)]
mod pack_status_tests {
    use super::*;

    #[test]
    fn pack_status_reports_missing_dir_as_missing() {
        let tmp = tempfile::tempdir().expect("tmpdir");
        let missing = tmp.path().join("no-such-packs");
        let _lock = lock_test_fixtures();
        set_test_packs_dir(Some(missing));
        let status = pack_status().expect("status");
        assert_eq!(status.health, OperatorPackHealth::Missing);
        assert!(!status.seeded);
        assert!(status.fix_hint.is_some());
    }

    #[test]
    fn pack_status_healthy_with_test_fixtures() {
        let _guard = install_test_fixtures();
        let status = pack_status().expect("status");
        assert!(status.dir_present);
        assert!(status.dir_readable);
        assert_eq!(status.health, OperatorPackHealth::Healthy);
        assert!(status.seeded);
        let cv = status
            .files
            .iter()
            .find(|f| f.name == "cv-packet.txt")
            .expect("cv-packet");
        assert_eq!(cv.kind, PackFileKind::Ok);
        assert!(cv.size_bytes.unwrap_or(0) > 100);
    }

    #[test]
    fn pack_status_detects_stub_cv_packet() {
        let tmp = tempfile::tempdir().expect("tmpdir");
        let packs = tmp.path().join("packs");
        fs::create_dir_all(&packs).expect("packs");
        fs::write(packs.join("cv-packet.txt"), STUB_CV_PACKET).expect("stub cv");
        fs::write(
            packs.join("universe.json"),
            r#"{"algorithm_version":"v1","scored_at":"2026-01-01","firms":[]}"#,
        )
        .expect("universe");
        let _lock = lock_test_fixtures();
        crate::rank_config::set_test_dir(Some(tmp.path().to_path_buf()));
        set_test_packs_dir(Some(packs));
        let status = pack_status().expect("status");
        assert_eq!(status.health, OperatorPackHealth::Stub);
        assert!(!status.seeded);
    }

    #[test]
    fn testdata_file_survives_installer() {
        let tmp = tempfile::tempdir().expect("tmpdir");
        let testdata = tmp.path().join("testdata");
        let packs = tmp.path().join("packs");
        fs::create_dir_all(&testdata).expect("testdata");
        fs::create_dir_all(&packs).expect("packs");
        let marker = "distinct-testdata-universe-not-from-repo\n";
        fs::write(testdata.join("universe.json"), marker).expect("marker");
        install_pack_files(&testdata, &packs);
        let kept = fs::read_to_string(packs.join("universe.json")).expect("installed universe");
        assert_eq!(
            kept, marker,
            "installer overwrote a file already present in testdata"
        );
        assert!(packs.join("places.json").is_file());
    }

    #[test]
    fn seed_pairs_come_from_seed_script() {
        let pairs = repo_seed_pairs();
        let mut names: Vec<&str> = pairs.iter().map(|(_, name)| name.as_str()).collect();
        let mut expected = EXPECTED_PACK_FILES.to_vec();
        names.sort_unstable();
        expected.sort_unstable();
        assert_eq!(names, expected);
        for (src, _) in &pairs {
            assert!(src.starts_with("data/"), "{src}");
        }
    }

    #[test]
    #[should_panic(expected = "missing seed")]
    fn missing_repo_seed_fails_clearly() {
        let tmp = tempfile::tempdir().expect("tmpdir");
        copy_repo_seed(
            tmp.path(),
            "data/no-such-seed.json",
            &tmp.path().join("universe.json"),
        );
    }
}
