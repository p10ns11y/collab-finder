//! Hire board: fetch public Google Sheet CSV → filter + heuristic intelli-skim.
//! Ephemeral leads only; SQLite writes happen via `select_hire_board_lead` / analyze.
//! Sheet identity comes from gitignored local config — never hardcode sheet ids.

use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::io::Cursor;
use std::path::{Path, PathBuf};

const DEFAULT_GID: &str = "0";

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct HireBoardConfig {
    /// Edit or export URL (preferred when set).
    #[serde(default)]
    pub sheet_url: Option<String>,
    #[serde(default)]
    pub sheet_id: Option<String>,
    #[serde(default)]
    pub gid: Option<String>,
}

impl HireBoardConfig {
    pub fn sheet_id_for_ref(&self) -> String {
        if let Some(id) = self.sheet_id.as_ref().map(|s| s.trim()).filter(|s| !s.is_empty()) {
            return id.to_string();
        }
        if let Some(url) = self.sheet_url.as_ref() {
            if let Some(id) = extract_sheet_id(url) {
                return id;
            }
        }
        "unknown".into()
    }

    pub fn gid_for_ref(&self) -> String {
        self.gid
            .as_ref()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .or_else(|| self.sheet_url.as_ref().and_then(|u| extract_gid(u)))
            .unwrap_or_else(|| DEFAULT_GID.to_string())
    }

    pub fn resolved_export_url(&self) -> Result<String, String> {
        if let Some(url) = self.sheet_url.as_ref().map(|s| s.trim()).filter(|s| !s.is_empty()) {
            if url.contains("YOUR_SHEET_ID") {
                return Err(config_missing_hint());
            }
            return Ok(normalize_sheet_export_url(url)?);
        }
        let id = self
            .sheet_id
            .as_ref()
            .map(|s| s.trim())
            .filter(|s| !s.is_empty() && *s != "YOUR_SHEET_ID")
            .ok_or_else(config_missing_hint)?;
        let gid = self.gid_for_ref();
        Ok(format!(
            "https://docs.google.com/spreadsheets/d/{}/export?format=csv&gid={}",
            id, gid
        ))
    }
}

fn config_missing_hint() -> String {
    "Hire board not configured. Copy data/hire-board/config.example.json → config.local.json and set sheet_url or sheet_id (gitignored). Or pass sheet_url / set HIRE_BOARD_SHEET_URL.".into()
}

fn extract_sheet_id(url: &str) -> Option<String> {
    let rest = url.strip_prefix("https://docs.google.com/spreadsheets/d/")?;
    let id = rest.split('/').next()?.trim();
    if id.is_empty() || id == "YOUR_SHEET_ID" {
        None
    } else {
        Some(id.to_string())
    }
}

fn extract_gid(url: &str) -> Option<String> {
    url.split("gid=")
        .nth(1)
        .map(|s| s.split(&['#', '&', '?'][..]).next().unwrap_or(DEFAULT_GID).to_string())
}

/// Accept edit or export URLs; return CSV export URL.
pub fn normalize_sheet_export_url(raw: &str) -> Result<String, String> {
    let t = raw.trim();
    if t.is_empty() {
        return Err("empty sheet url".into());
    }
    if t.contains("YOUR_SHEET_ID") {
        return Err(config_missing_hint());
    }
    if t.contains("/export?") {
        return Ok(t.to_string());
    }
    if let Some(id) = extract_sheet_id(t) {
        let gid = extract_gid(t).unwrap_or_else(|| DEFAULT_GID.to_string());
        return Ok(format!(
            "https://docs.google.com/spreadsheets/d/{}/export?format=csv&gid={}",
            id, gid
        ));
    }
    Err(format!("unrecognized Google Sheet URL: {t}"))
}

fn candidate_config_paths() -> Vec<PathBuf> {
    let mut out = Vec::new();
    if let Ok(p) = std::env::var("HIRE_BOARD_CONFIG") {
        let t = p.trim();
        if !t.is_empty() {
            out.push(PathBuf::from(t));
        }
    }
    // Project-relative (dev / cwd)
    if let Ok(cwd) = std::env::current_dir() {
        out.push(cwd.join("data/hire-board/config.local.json"));
        // tauri often runs with cwd = src-tauri
        out.push(cwd.join("../data/hire-board/config.local.json"));
    }
    // Compile-time path next to crate (tests + local builds)
    {
        let mut p = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        p.push("../data/hire-board/config.local.json");
        out.push(p);
    }
    // App data (packaged / user-global)
    if let Ok(app) = crate::app_dirs::app_data_dir() {
        out.push(app.join("hire-board/config.local.json"));
    }
    out
}

pub fn load_hire_board_config() -> Result<HireBoardConfig, String> {
    if let Ok(url) = std::env::var("HIRE_BOARD_SHEET_URL") {
        let t = url.trim();
        if !t.is_empty() {
            return Ok(HireBoardConfig {
                sheet_url: Some(t.to_string()),
                sheet_id: extract_sheet_id(t),
                gid: extract_gid(t),
            });
        }
    }

    for path in candidate_config_paths() {
        if path.is_file() {
            return read_config_file(&path);
        }
    }
    Err(config_missing_hint())
}

fn read_config_file(path: &Path) -> Result<HireBoardConfig, String> {
    let raw = std::fs::read_to_string(path)
        .map_err(|e| format!("read hire board config {}: {e}", path.display()))?;
    let cfg: HireBoardConfig = serde_json::from_str(&raw)
        .map_err(|e| format!("parse hire board config {}: {e}", path.display()))?;
    // Validate placeholders
    cfg.resolved_export_url()?;
    Ok(cfg)
}

/// Resolve export URL: optional override arg, else local config.
pub fn resolve_export_url(sheet_url_override: Option<&str>) -> Result<(String, HireBoardConfig), String> {
    if let Some(u) = sheet_url_override.map(str::trim).filter(|s| !s.is_empty()) {
        let export = normalize_sheet_export_url(u)?;
        let cfg = HireBoardConfig {
            sheet_url: Some(u.to_string()),
            sheet_id: extract_sheet_id(u),
            gid: extract_gid(u),
        };
        return Ok((export, cfg));
    }
    let cfg = load_hire_board_config()?;
    let export = cfg.resolved_export_url()?;
    Ok((export, cfg))
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct HireBoardLead {
    pub company: String,
    pub location: String,
    pub career_url: String,
    pub thread_url: String,
    pub geo_tags: Vec<String>,
    pub skim_score: i32,
    pub skim_reasons: Vec<String>,
    pub already_in_db: bool,
    pub opportunity_id: Option<i64>,
}

#[derive(Debug, Clone, Default)]
pub struct HireBoardFilter {
    pub q: Option<String>,
    /// Match if lead has ANY of these geo tags (empty = no geo filter).
    pub geo: Vec<String>,
    pub require_career_url: bool,
    pub limit: Option<usize>,
}

pub fn parse_sheet_csv(csv_text: &str) -> Result<Vec<HireBoardLead>, String> {
    let mut rdr = csv::ReaderBuilder::new()
        .flexible(true)
        .has_headers(false)
        .from_reader(Cursor::new(csv_text.as_bytes()));

    let mut records: Vec<csv::StringRecord> = Vec::new();
    for rec in rdr.records() {
        let rec = rec.map_err(|e| format!("csv parse: {e}"))?;
        records.push(rec);
    }

    let header_idx = records
        .iter()
        .position(|r| {
            r.get(0)
                .map(|c| c.trim().eq_ignore_ascii_case("Company"))
                .unwrap_or(false)
        })
        .ok_or_else(|| "hire board CSV: no Company header row".to_string())?;

    let mut leads = Vec::new();
    for r in records.iter().skip(header_idx + 1) {
        let company = r.get(0).unwrap_or("").trim().to_string();
        if company.is_empty() {
            continue;
        }
        let location = r.get(1).unwrap_or("").trim().to_string();
        let career_url = r.get(2).unwrap_or("").trim().to_string();
        let thread_url = r.get(3).unwrap_or("").trim().to_string();
        let (score, reasons, tags) = skim_rank(&company, &location, &career_url);
        leads.push(HireBoardLead {
            company,
            location,
            career_url,
            thread_url,
            geo_tags: tags,
            skim_score: score,
            skim_reasons: reasons,
            already_in_db: false,
            opportunity_id: None,
        });
    }
    Ok(leads)
}

pub fn geo_tags_from_location(location: &str) -> Vec<String> {
    let l = location.to_lowercase();
    let mut tags = Vec::new();
    if l.contains("remote") {
        tags.push("remote".into());
    }
    if l.contains("sf")
        || l.contains("san francisco")
        || l.contains("bay area")
        || l.contains("mtv")
        || l.contains("north beach")
        || l.contains("palo alto")
        || l.contains("menlo")
    {
        tags.push("sf-bay".into());
    }
    if l.contains("nyc") || l.contains("new york") {
        tags.push("nyc".into());
    }
    if l.contains("london") {
        tags.push("london".into());
    }
    if l.contains("stockholm") || l.contains("sweden") {
        tags.push("sweden".into());
    }
    if l.contains("eu ")
        || l.contains(" eu")
        || l.contains("europe")
        || l.contains("berlin")
        || l.contains("amsterdam")
        || l.contains("paris")
        || l.contains("munich")
        || l.contains("oslo")
        || l.contains("norway")
    {
        tags.push("eu".into());
    }
    if tags.is_empty() {
        tags.push("other".into());
    }
    tags
}

fn career_url_usable(url: &str) -> bool {
    let t = url.trim();
    if t.is_empty() {
        return false;
    }
    let lower = t.to_lowercase();
    if lower == "—" || lower == "-" || lower == "(mentioned)" || lower == "n/a" {
        return false;
    }
    if lower.contains('@') && !lower.starts_with("http") {
        return false;
    }
    true
}

fn career_url_quality_boost(url: &str) -> (i32, Option<&'static str>) {
    let lower = url.to_lowercase();
    if !career_url_usable(url) {
        return (-40, Some("weak or missing career URL"));
    }
    if lower.contains("ashbyhq.com")
        || lower.contains("greenhouse.io")
        || lower.contains("lever.co")
        || lower.contains("/careers")
        || lower.contains("/jobs")
        || lower.contains("/hiring")
    {
        return (15, Some("structured careers URL"));
    }
    if lower.starts_with("http") {
        return (5, Some("http career link"));
    }
    (0, None)
}

/// Deterministic intelli-skim v1 (candidate geo prefs + URL quality). No xAI.
pub fn skim_rank(company: &str, location: &str, career_url: &str) -> (i32, Vec<String>, Vec<String>) {
    let tags = geo_tags_from_location(location);
    let mut score: i32 = 0;
    let mut reasons = Vec::new();

    if tags.iter().any(|t| t == "remote") {
        score += 25;
        reasons.push("remote-friendly".into());
    }
    if tags.iter().any(|t| t == "sf-bay") {
        score += 20;
        reasons.push("SF Bay".into());
    }
    if tags.iter().any(|t| t == "nyc") {
        score += 18;
        reasons.push("NYC".into());
    }
    if tags.iter().any(|t| t == "sweden") {
        score += 22;
        reasons.push("Sweden / Stockholm".into());
    }
    if tags.iter().any(|t| t == "eu") {
        score += 12;
        reasons.push("EU".into());
    }
    if tags.iter().any(|t| t == "london") {
        score += 8;
        reasons.push("London (soft)".into());
    }

    let (boost, reason) = career_url_quality_boost(career_url);
    score += boost;
    if let Some(r) = reason {
        reasons.push(r.into());
    }

    let c = company.to_lowercase();
    for (needle, pts, label) in [
        ("cursor", 8, "high-signal name"),
        ("cognition", 6, "high-signal name"),
        ("spacex", 10, "high-signal name"),
        ("xai", 10, "high-signal name"),
    ] {
        if c.contains(needle) {
            score += pts;
            reasons.push(label.into());
            break;
        }
    }

    (score, reasons, tags)
}

pub fn filter_and_sort(mut leads: Vec<HireBoardLead>, filter: &HireBoardFilter) -> Vec<HireBoardLead> {
    if let Some(q) = filter.q.as_ref().map(|s| s.trim().to_lowercase()).filter(|s| !s.is_empty()) {
        leads.retain(|l| {
            l.company.to_lowercase().contains(&q)
                || l.location.to_lowercase().contains(&q)
                || l.career_url.to_lowercase().contains(&q)
        });
    }
    if filter.require_career_url {
        leads.retain(|l| career_url_usable(&l.career_url));
    }
    if !filter.geo.is_empty() {
        let want: HashSet<String> = filter.geo.iter().map(|g| g.to_lowercase()).collect();
        leads.retain(|l| l.geo_tags.iter().any(|t| want.contains(&t.to_lowercase())));
    }
    leads.sort_by(|a, b| {
        b.skim_score
            .cmp(&a.skim_score)
            .then_with(|| a.company.to_lowercase().cmp(&b.company.to_lowercase()))
    });
    if let Some(lim) = filter.limit {
        leads.truncate(lim);
    }
    leads
}

pub async fn fetch_sheet_csv(url: &str) -> Result<String, String> {
    let export = if url.contains("/export?") {
        url.to_string()
    } else {
        normalize_sheet_export_url(url)?
    };
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::limited(10))
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client
        .get(&export)
        .header("User-Agent", "collab-finder-hire-board/0.1")
        .send()
        .await
        .map_err(|e| format!("hire board fetch failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("hire board HTTP {}", resp.status()));
    }
    resp.text()
        .await
        .map_err(|e| format!("hire board body: {e}"))
}

pub fn mark_already_in_db(leads: &mut [HireBoardLead], url_to_id: &[(String, i64)]) {
    let map: std::collections::HashMap<String, i64> = url_to_id
        .iter()
        .map(|(u, id)| (normalize_url_key(u), *id))
        .collect();
    for lead in leads.iter_mut() {
        let key = normalize_url_key(&lead.career_url);
        if let Some(id) = map.get(&key) {
            lead.already_in_db = true;
            lead.opportunity_id = Some(*id);
        }
    }
}

pub fn normalize_url_key(raw: &str) -> String {
    let t = raw.trim().trim_end_matches('/');
    t.to_lowercase()
}

pub fn select_stub_jd(location: &str, career_url: &str, thread_url: &str) -> String {
    format!("Career page: {career_url}\nLocation: {location}\nThread: {thread_url}")
}

pub fn source_ref_for_sheet(cfg: &HireBoardConfig, thread_url: &str) -> String {
    let id = cfg.sheet_id_for_ref();
    let gid = cfg.gid_for_ref();
    if !thread_url.trim().is_empty() {
        format!("sheet:{id}#gid={gid}|{thread_url}")
    } else {
        format!("sheet:{id}#gid={gid}")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn fixture_csv() -> String {
        let mut p = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        p.push("../data/hire-board/sample.csv");
        std::fs::read_to_string(&p).unwrap_or_else(|e| panic!("read {:?}: {e}", p))
    }

    #[test]
    fn parse_fixture_has_company_header_and_rows() {
        let leads = parse_sheet_csv(&fixture_csv()).expect("parse");
        assert!(leads.len() >= 50, "expected many companies, got {}", leads.len());
        assert!(leads.iter().any(|l| l.company.contains("Cursor")));
        assert!(leads.iter().any(|l| l.geo_tags.iter().any(|t| t == "remote")));
    }

    #[test]
    fn skim_ranks_usable_remote_above_weak_url() {
        let (good, _, _) = skim_rank("Acme", "Remote (US)", "https://acme.com/careers");
        let (bad, _, _) = skim_rank("Nope", "Miami, FL", "(mentioned)");
        assert!(good > bad, "good={good} bad={bad}");
    }

    #[test]
    fn filter_geo_and_q() {
        let leads = parse_sheet_csv(&fixture_csv()).unwrap();
        let filtered = filter_and_sort(
            leads,
            &HireBoardFilter {
                q: Some("cursor".into()),
                geo: vec![],
                require_career_url: true,
                limit: Some(5),
            },
        );
        assert!(!filtered.is_empty());
        assert!(filtered[0].company.to_lowercase().contains("cursor"));
    }

    #[test]
    fn normalize_edit_url_to_export() {
        let edit = "https://docs.google.com/spreadsheets/d/abcTESTSheetId123/edit?gid=0#gid=0";
        let out = normalize_sheet_export_url(edit).unwrap();
        assert!(out.contains("/export?format=csv"));
        assert!(out.contains("abcTESTSheetId123"));
    }

    #[test]
    fn placeholder_config_rejected() {
        let cfg = HireBoardConfig {
            sheet_url: Some("https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID/edit".into()),
            sheet_id: Some("YOUR_SHEET_ID".into()),
            gid: Some("0".into()),
        };
        assert!(cfg.resolved_export_url().is_err());
    }

    #[test]
    fn mark_db_matches_normalized_url() {
        let mut leads = vec![HireBoardLead {
            company: "X".into(),
            location: "SF".into(),
            career_url: "https://Example.com/careers/".into(),
            thread_url: "".into(),
            geo_tags: vec!["sf-bay".into()],
            skim_score: 1,
            skim_reasons: vec![],
            already_in_db: false,
            opportunity_id: None,
        }];
        mark_already_in_db(&mut leads, &[("https://example.com/careers".into(), 42)]);
        assert!(leads[0].already_in_db);
        assert_eq!(leads[0].opportunity_id, Some(42));
    }

    #[tokio::test]
    #[ignore = "network — needs config.local.json + HIRE_BOARD_LIVE=1"]
    async fn hire_board_live_fetch() {
        if std::env::var("HIRE_BOARD_LIVE").is_err() {
            return;
        }
        let (url, _) = resolve_export_url(None).expect("local config");
        let text = fetch_sheet_csv(&url).await.expect("live fetch");
        let leads = parse_sheet_csv(&text).expect("parse live");
        assert!(!leads.is_empty());
    }
}
