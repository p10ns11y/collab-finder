//! Import research postings as new opportunities. Never marks them applied.

use crate::db::SqliteStore;
use serde::Deserialize;
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::path::Path;

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
pub struct ResearchLead {
    pub company: String,
    pub title: String,
    pub location: String,
    #[serde(alias = "applyUrl")]
    pub apply_url: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, serde::Serialize)]
pub struct ResearchIngestReport {
    pub inserted: usize,
    pub skipped_existing: usize,
    pub skipped_excluded: usize,
    pub inserted_ids: Vec<i64>,
}

pub fn canonical_apply_url(raw: &str) -> String {
    let token = first_url_token(raw);
    if token.is_empty() {
        return String::new();
    }
    let without_fragment = token.split('#').next().unwrap_or(token);
    let (base, query) = match without_fragment.split_once('?') {
        Some((base, query)) => (base, Some(query)),
        None => (without_fragment, None),
    };
    let Some((scheme, rest)) = base.split_once("://") else {
        return base.trim_end_matches('/').to_ascii_lowercase();
    };
    let scheme = canonical_scheme(scheme);
    let (host, path) = match rest.find('/') {
        Some(index) => (&rest[..index], &rest[index..]),
        None => (rest, ""),
    };
    let host = canonical_host(host);
    let path = path.trim_end_matches('/');
    let query = query.map(canonical_query).filter(|query| !query.is_empty());
    match query {
        Some(query) => format!("{scheme}://{host}{path}?{query}"),
        None => format!("{scheme}://{host}{path}"),
    }
}

pub fn ingest_files(
    db_path: &Path,
    input_json: &Path,
    exclude: Option<&Path>,
) -> Result<ResearchIngestReport, String> {
    let text = std::fs::read_to_string(input_json).map_err(|err| err.to_string())?;
    let rows: Vec<ResearchLead> = serde_json::from_str(&text).map_err(|err| err.to_string())?;
    let store = SqliteStore::open_at(db_path.to_path_buf())?;
    ingest(&store, &rows, exclude)
}

pub fn normalize_firm(name: &str) -> String {
    name.split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_ascii_lowercase()
}

pub fn ingest(
    store: &SqliteStore,
    rows: &[ResearchLead],
    exclude_config: Option<&Path>,
) -> Result<ResearchIngestReport, String> {
    let prepared = prepare_leads(rows)?;
    let excluded = excluded_firms(exclude_config)?;
    let mut known = known_urls(store)?;
    let (mut report, pending) = classify_leads(&prepared, &excluded, &mut known);
    report.inserted_ids = store.insert_research_opportunities(&pending)?;
    report.inserted = report.inserted_ids.len();
    Ok(report)
}

struct PreparedLead<'a> {
    canonical: String,
    original: String,
    row: &'a ResearchLead,
}

fn prepare_leads(rows: &[ResearchLead]) -> Result<Vec<PreparedLead<'_>>, String> {
    let mut prepared = Vec::with_capacity(rows.len());
    for row in rows {
        let canonical = canonical_apply_url(&row.apply_url);
        if canonical.is_empty() {
            return Err("apply_url required".into());
        }
        prepared.push(PreparedLead {
            canonical,
            original: first_url_token(&row.apply_url).to_string(),
            row,
        });
    }
    Ok(prepared)
}

fn excluded_firms(path: Option<&Path>) -> Result<HashSet<String>, String> {
    let mut excluded = HashSet::new();
    if let Some(path) = path {
        for firm in firms_from_config(path)? {
            let firm = normalize_firm(&firm);
            if !firm.is_empty() {
                excluded.insert(firm);
            }
        }
    }
    Ok(excluded)
}

fn known_urls(store: &SqliteStore) -> Result<HashMap<String, i64>, String> {
    let mut known = HashMap::new();
    for (id, url) in store.list_opportunity_source_urls()? {
        known.entry(canonical_apply_url(&url)).or_insert(id);
    }
    Ok(known)
}

fn classify_leads(
    rows: &[PreparedLead<'_>],
    excluded: &HashSet<String>,
    known: &mut HashMap<String, i64>,
) -> (ResearchIngestReport, Vec<(String, String, String, String)>) {
    let mut report = ResearchIngestReport::default();
    let mut pending = Vec::new();
    for row in rows {
        let company = row.row.company.trim();
        if excluded.contains(&normalize_firm(company)) {
            report.skipped_excluded += 1;
            continue;
        }
        if known.contains_key(&row.canonical) {
            report.skipped_existing += 1;
            continue;
        }
        let title = row.row.title.trim();
        let jd = format!(
            "# {title}\nCompany: {company}\nLocation: {}\nURL: {}\n",
            row.row.location.trim(),
            row.original
        );
        pending.push((
            row.original.clone(),
            title.to_string(),
            company.to_string(),
            jd,
        ));
        known.insert(row.canonical.clone(), 0);
    }
    (report, pending)
}

fn first_url_token(raw: &str) -> &str {
    let raw = raw.trim();
    let raw = raw.split('·').next().unwrap_or(raw).trim();
    raw.split_whitespace().next().unwrap_or("")
}

fn canonical_scheme(scheme: &str) -> String {
    let scheme = scheme.to_ascii_lowercase();
    if scheme == "http" {
        "https".to_string()
    } else {
        scheme
    }
}

fn canonical_host(host: &str) -> String {
    let host = host.to_ascii_lowercase();
    let host = host.strip_prefix("www.").unwrap_or(&host);
    if host == "job-boards.greenhouse.io" {
        "boards.greenhouse.io".to_string()
    } else {
        host.to_string()
    }
}

fn canonical_query(query: &str) -> String {
    let mut pairs: Vec<(String, String)> = query
        .split('&')
        .filter(|part| !part.is_empty())
        .filter_map(|part| {
            let (key, value) = part.split_once('=').unwrap_or((part, ""));
            let key = key.trim().to_ascii_lowercase();
            if key.is_empty() || is_tracking_param(&key) {
                return None;
            }
            Some((key, value.trim().to_string()))
        })
        .collect();
    pairs.sort();
    pairs
        .into_iter()
        .map(|(key, value)| format!("{key}={value}"))
        .collect::<Vec<_>>()
        .join("&")
}

fn is_tracking_param(key: &str) -> bool {
    key.starts_with("utm_") || matches!(key, "gh_src" | "gclid" | "fbclid" | "mc_eid" | "ref")
}

fn firms_from_config(path: &Path) -> Result<Vec<String>, String> {
    if !path.is_file() {
        return Ok(Vec::new());
    }
    let text = std::fs::read_to_string(path).map_err(|err| err.to_string())?;
    let value: Value = serde_json::from_str(&text).map_err(|err| format!("hard-exclude: {err}"))?;
    let firms = value
        .get("firms")
        .and_then(|firms| firms.as_array())
        .ok_or_else(|| "hard-exclude: firms array required".to_string())?;
    Ok(firms
        .iter()
        .filter_map(|firm| firm.as_str().map(str::to_string))
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{OpportunityFilter, SqliteStore};
    use std::fs;
    use std::path::PathBuf;

    fn temp_store() -> (tempfile::TempDir, SqliteStore) {
        let dir = tempfile::tempdir().expect("tempdir");
        let store = SqliteStore::open_at(dir.path().join("ingest.db")).expect("open");
        (dir, store)
    }

    fn stamp_pairs(opps: &[crate::db::Opportunity]) -> Vec<(i64, String, String)> {
        let mut pairs: Vec<_> = opps
            .iter()
            .map(|opp| (opp.id, opp.last_updated.clone(), opp.status.clone()))
            .collect();
        pairs.sort();
        pairs
    }

    fn lead(company: &str, url: &str) -> ResearchLead {
        ResearchLead {
            company: company.into(),
            title: "Senior Software Engineer".into(),
            location: "Europe".into(),
            apply_url: url.into(),
        }
    }

    #[test]
    fn canonical_url_drops_tracking_and_slash() {
        assert_eq!(
            canonical_apply_url(
                "HTTPS://Stripe.com/jobs/search?utm_source=x&gh_jid=8226261&utm_custom=1&utm_medium=mail#role"
            ),
            "https://stripe.com/jobs/search?gh_jid=8226261"
        );
        assert_eq!(
            canonical_apply_url("https://jobs.ashbyhq.com/linear/abc/"),
            "https://jobs.ashbyhq.com/linear/abc"
        );
        assert_eq!(
            canonical_apply_url(
                "https://job-boards.greenhouse.io/gitlab/jobs/8693103002 · Poland: https://job-boards.greenhouse.io/gitlab/jobs/8749952002"
            ),
            "https://boards.greenhouse.io/gitlab/jobs/8693103002"
        );
        assert_eq!(
            canonical_apply_url("http://www.stripe.com/jobs?Gh_jid=AbC&utm_source=x"),
            "https://stripe.com/jobs?gh_jid=AbC"
        );
        assert_eq!(
            canonical_apply_url("https://job-boards.greenhouse.io/gitlab/jobs/1"),
            canonical_apply_url("https://boards.greenhouse.io/gitlab/jobs/1")
        );
        assert_eq!(
            canonical_apply_url("https://www.job-boards.greenhouse.io/gitlab/jobs/1"),
            "https://boards.greenhouse.io/gitlab/jobs/1"
        );
        assert_eq!(canonical_apply_url("   "), "");
        assert_eq!(
            canonical_apply_url(
                "https://jobs.example.test/role?b=2&a=1&gh_src=x&gclid=1&fbclid=2&mc_eid=3&ref=4"
            ),
            "https://jobs.example.test/role?a=1&b=2"
        );
    }

    #[test]
    fn missing_exclude_file_is_empty_and_bad_json_errors() {
        let (_dir, store) = temp_store();
        let missing = _dir.path().join("missing-hard-exclude.json");
        let report = ingest(
            &store,
            &[lead("Railway", "https://jobs.example.test/r")],
            Some(&missing),
        )
        .unwrap();
        assert_eq!(report.inserted, 1);
        let bad = _dir.path().join("bad.json");
        fs::write(&bad, "not-json").unwrap();
        let err = ingest(
            &store,
            &[lead("Pleo", "https://jobs.example.test/p")],
            Some(&bad),
        )
        .unwrap_err();
        assert!(err.contains("hard-exclude"));
    }

    #[test]
    fn ingest_inserts_research_rows_once_and_skips_excludes() {
        let (_dir, store) = temp_store();
        let config = _dir.path().join("hard-exclude.json");
        fs::write(
            &config,
            r#"{"firms":["Fabrikam Wait LLC","Northwind Paper Co"]}"#,
        )
        .unwrap();

        let rows = vec![
            lead(
                "Railway",
                "https://jobs.ashbyhq.com/railway/6ddcfe47-6cce-469b-ba6d-4f0e83440c9d/",
            ),
            lead(
                "Railway",
                "https://jobs.ashbyhq.com/railway/6ddcfe47-6cce-469b-ba6d-4f0e83440c9d?utm_source=batch",
            ),
            lead("Northwind Paper Co", "https://jobs.example.test/northwind"),
            lead("  Fabrikam   Wait LLC ", "https://jobs.example.test/fabrikam"),
            lead("Pleo", "https://jobs.ashbyhq.com/pleo/56c51ea0-31c0-492f-bdc7-bd5efff5cd25"),
        ];
        let report = ingest(&store, &rows, Some(&config)).unwrap();
        assert_eq!(report.inserted, 2);
        assert_eq!(report.skipped_existing, 1);
        assert_eq!(report.skipped_excluded, 2);

        let opps = store
            .get_opportunities(&OpportunityFilter {
                limit: Some(20),
                ..Default::default()
            })
            .unwrap();
        assert_eq!(opps.len(), 2);
        for opp in &opps {
            assert_eq!(opp.kind, "research");
            assert_eq!(opp.status, "new");
            assert!(opp.applied_at.is_none());
            assert!(opp.outcome_status.is_none());
            let stamp = opp.last_updated.as_str();
            assert!(
                stamp.len() == 20 && stamp.ends_with('Z') && stamp.contains('T'),
                "{stamp}"
            );
        }

        let again = ingest(&store, &rows, Some(&config)).unwrap();
        assert_eq!(again.inserted, 0);
        assert_eq!(again.skipped_existing, 3);
        assert_eq!(again.skipped_excluded, 2);
        let opps_again = store
            .get_opportunities(&OpportunityFilter {
                limit: Some(20),
                ..Default::default()
            })
            .unwrap();
        assert_eq!(stamp_pairs(&opps_again), stamp_pairs(&opps));
    }

    #[test]
    fn existing_db_row_blocks_ingest_without_status_change() {
        let (_dir, store) = temp_store();
        let fancy = "HTTPS://Jobs.Ashbyhq.com/linear/d3bc1ced-3ce4-4086-a050-555055dbb1ff/?utm_source=newsletter";
        let id = store
            .upsert_opportunity(
                "web",
                Some(fancy),
                None,
                Some("Senior / Staff Fullstack Engineer"),
                Some("Linear"),
                "# existing\n",
                "analyzed",
                None,
                None,
                None,
                None,
            )
            .unwrap();
        let report = ingest(
            &store,
            &[lead(
                "Linear",
                "https://jobs.ashbyhq.com/linear/d3bc1ced-3ce4-4086-a050-555055dbb1ff",
            )],
            None,
        )
        .unwrap();
        assert_eq!(report.inserted, 0);
        assert_eq!(report.skipped_existing, 1);
        let opp = store
            .get_opportunities(&OpportunityFilter {
                id: Some(id),
                ..Default::default()
            })
            .unwrap()
            .pop()
            .unwrap();
        assert_eq!(opp.status, "analyzed");
        assert_eq!(opp.kind, "web");
        assert!(opp.applied_at.is_none());
    }

    #[test]
    fn empty_apply_url_is_rejected() {
        let (_dir, store) = temp_store();
        let err = ingest(&store, &[lead("Railway", "   ")], None).unwrap_err();
        assert!(err.contains("apply_url"));
        let opps = store
            .get_opportunities(&OpportunityFilter {
                limit: Some(10),
                ..Default::default()
            })
            .unwrap();
        assert!(opps.is_empty());
    }

    #[test]
    fn empty_url_after_a_valid_row_inserts_nothing() {
        let (_dir, store) = temp_store();
        let err = ingest(
            &store,
            &[
                lead("Railway", "https://jobs.example.test/ok"),
                lead("Pleo", "   "),
            ],
            None,
        )
        .unwrap_err();
        assert!(err.contains("apply_url"));
        let opps = store
            .get_opportunities(&OpportunityFilter {
                limit: Some(10),
                ..Default::default()
            })
            .unwrap();
        assert!(opps.is_empty());
    }

    #[test]
    fn source_url_keeps_the_original_string() {
        let (_dir, store) = temp_store();
        let raw = "http://www.stripe.com/jobs/listing/?Gh_jid=AbC&utm_source=x";
        let report = ingest(&store, &[lead("Stripe", raw)], None).unwrap();
        assert_eq!(report.inserted, 1);
        let opp = store
            .get_opportunities(&OpportunityFilter {
                limit: Some(5),
                ..Default::default()
            })
            .unwrap()
            .pop()
            .unwrap();
        assert_eq!(opp.source_url.as_deref(), Some(raw));
        assert_eq!(opp.kind, "research");
        assert_eq!(opp.status, "new");
        let again = ingest(
            &store,
            &[lead("Stripe", "https://stripe.com/jobs/listing?gh_jid=AbC")],
            None,
        )
        .unwrap();
        assert_eq!(again.inserted, 0);
        assert_eq!(again.skipped_existing, 1);
        let stored = store
            .get_opportunities(&OpportunityFilter {
                id: Some(report.inserted_ids[0]),
                ..Default::default()
            })
            .unwrap()
            .pop()
            .unwrap();
        assert_eq!(stored.source_url.as_deref(), Some(raw));
        assert_eq!(stored.last_updated, opp.last_updated);
    }

    #[test]
    fn ingest_files_reads_json_into_the_given_db() {
        let dir = tempfile::tempdir().expect("tempdir");
        let db_path = dir.path().join("ingest.db");
        let input = dir.path().join("leads.json");
        fs::write(
            &input,
            r#"[{"company":"Railway","title":"Senior Software Engineer","location":"Europe","apply_url":"https://jobs.example.test/from-file"}]"#,
        )
        .unwrap();
        let report = ingest_files(&db_path, &input, None).unwrap();
        assert_eq!(report.inserted, 1);
        let store = SqliteStore::open_at(db_path).unwrap();
        let opp = store
            .get_opportunities(&OpportunityFilter {
                limit: Some(5),
                ..Default::default()
            })
            .unwrap()
            .pop()
            .unwrap();
        assert_eq!(
            opp.source_url.as_deref(),
            Some("https://jobs.example.test/from-file")
        );
        assert_eq!(opp.kind, "research");
        assert_eq!(opp.status, "new");
    }

    #[test]
    fn batch_a_fixture_ingests_twenty_two_rows() {
        let (_dir, store) = temp_store();
        let path =
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("fixtures/batch-a-apply-urls.json");
        let text = fs::read_to_string(&path).unwrap();
        let value: Value = serde_json::from_str(&text).unwrap();
        let rows = value.as_array().unwrap();
        assert_eq!(rows.len(), 22);
        let allowed = ["company", "title", "location", "apply_url"];
        for row in rows {
            let object = row.as_object().unwrap();
            assert!(object.keys().all(|key| allowed.contains(&key.as_str())));
            assert_eq!(object.len(), 4);
        }
        let leads: Vec<ResearchLead> = serde_json::from_str(&text).unwrap();
        let urls: HashSet<_> = leads
            .iter()
            .map(|row| canonical_apply_url(&row.apply_url))
            .collect();
        assert_eq!(urls.len(), 22);
        let report = ingest(&store, &leads, None).unwrap();
        assert_eq!(report.inserted, 22);
        assert_eq!(report.skipped_existing, 0);
        assert_eq!(report.skipped_excluded, 0);
        let opps = store
            .get_opportunities(&OpportunityFilter {
                limit: Some(50),
                ..Default::default()
            })
            .unwrap();
        assert_eq!(opps.len(), 22);
        assert!(opps
            .iter()
            .all(|opp| opp.kind == "research" && opp.status == "new"));
        assert!(opps
            .iter()
            .all(|opp| opp.applied_at.is_none() && opp.outcome_status.is_none()));
        let stored: HashSet<_> = opps
            .iter()
            .filter_map(|opp| opp.source_url.clone())
            .collect();
        for row in &leads {
            assert!(stored.contains(&row.apply_url), "{}", row.apply_url);
        }

        let mut decorated = leads.clone();
        for row in &mut decorated {
            let raw = row.apply_url.trim();
            row.apply_url = if raw.contains('?') {
                format!("{raw}&utm_source=rerun")
            } else {
                format!("{}/?utm_source=rerun", raw.trim_end_matches('/'))
            };
        }
        let second = ingest(&store, &decorated, None).unwrap();
        assert_eq!(second.inserted, 0);
        assert_eq!(second.skipped_existing, 22);
        let opps = store
            .get_opportunities(&OpportunityFilter {
                limit: Some(50),
                ..Default::default()
            })
            .unwrap();
        assert_eq!(opps.len(), 22);
    }
}
