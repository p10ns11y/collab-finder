//! Platsbanken emergency rail — JobTech JobSearch → ranked leads → Opportunity upsert.
//! Open API (CC0); no auth. Prefer favorites (ML/AI/Robotics) without hiding emergency volume.

use serde::{Deserialize, Serialize};
use serde_json::Value;

const JOBSEARCH_BASE: &str = "https://jobsearch.api.jobtechdev.se";

/// Soft preference boost for optimal roles; non-matches stay visible for AF reporting.
const FAVORITE_TERMS: &[&str] = &[
    "machine learning",
    "maskininlärning",
    "deep learning",
    "artificial intelligence",
    "artificiell intelligens",
    "robotics",
    "robotik",
    "robot",
    "llm",
    "computer vision",
    "autonomous",
    "mlops",
    "data scientist",
    "ml engineer",
    "ai engineer",
    "research scientist",
];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlatsbankenLead {
    pub ad_id: String,
    pub headline: String,
    pub employer: String,
    pub municipality: Option<String>,
    pub occupation: Option<String>,
    pub webpage_url: String,
    pub application_url: Option<String>,
    pub publication_date: Option<String>,
    pub application_deadline: Option<String>,
    /// Snippet for list UI (full text loaded on import).
    pub description_snippet: String,
    pub api_relevance: f64,
    pub rank_score: f64,
    pub rank_reasons: Vec<String>,
    pub favorite_match: bool,
    pub already_in_db: bool,
    pub opportunity_id: Option<i64>,
}

#[derive(Debug, Clone, Default)]
pub struct PlatsbankenSearchFilter {
    pub q: Option<String>,
    /// Display label (Stockholm) or raw taxonomy code (0180).
    pub municipality: Option<String>,
    pub limit: Option<usize>,
    pub offset: Option<usize>,
}

/// JobSearch `municipality` is taxonomy codes (SK kommunkod), not city names.
#[derive(Debug, Clone, PartialEq, Eq)]
enum GeoFilter {
    MunicipalityCode(String),
    RemotePhraseMatch,
}

fn resolve_geo_filter(raw: &str) -> Option<GeoFilter> {
    let t = raw.trim();
    if t.is_empty() {
        return None;
    }
    if t.chars().all(|c| c.is_ascii_digit()) {
        return Some(GeoFilter::MunicipalityCode(t.to_string()));
    }
    let key = t.to_ascii_lowercase();
    // Normalize common spelling variants without diacritics.
    let key = key
        .replace('ö', "o")
        .replace('ä', "a")
        .replace('å', "a");
    match key.as_str() {
        "stockholm" => Some(GeoFilter::MunicipalityCode("0180".into())),
        "goteborg" | "gothenburg" => Some(GeoFilter::MunicipalityCode("1480".into())),
        "malmo" => Some(GeoFilter::MunicipalityCode("1280".into())),
        "uppsala" => Some(GeoFilter::MunicipalityCode("0380".into())),
        "remote" | "distans" => Some(GeoFilter::RemotePhraseMatch),
        _ => None,
    }
}

#[derive(Debug, Deserialize)]
struct SearchResponse {
    #[serde(default)]
    hits: Vec<Value>,
}

#[derive(Debug, Clone)]
pub struct ParsedAd {
    pub ad_id: String,
    pub headline: String,
    pub employer: String,
    pub municipality: Option<String>,
    pub occupation: Option<String>,
    pub webpage_url: String,
    pub application_url: Option<String>,
    pub publication_date: Option<String>,
    pub application_deadline: Option<String>,
    pub description_text: String,
    pub api_relevance: f64,
}

fn label_from(obj: &Value, key: &str) -> Option<String> {
    obj.get(key)
        .and_then(|v| v.get("label"))
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

fn string_field(obj: &Value, key: &str) -> Option<String> {
    obj.get(key)
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

pub fn parse_ad_value(raw: &Value) -> Result<ParsedAd, String> {
    let ad_id = raw
        .get("id")
        .map(|v| match v {
            Value::String(s) => s.trim().to_string(),
            Value::Number(n) => n.to_string(),
            _ => String::new(),
        })
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "ad missing id".to_string())?;

    let headline = string_field(raw, "headline").unwrap_or_else(|| format!("Ad {ad_id}"));
    let employer = raw
        .get("employer")
        .and_then(|e| string_field(e, "name").or_else(|| string_field(e, "workplace")))
        .unwrap_or_else(|| "Unknown employer".into());

    let municipality = raw
        .get("workplace_address")
        .and_then(|a| string_field(a, "municipality"));
    let occupation = label_from(raw, "occupation");

    let webpage_url = string_field(raw, "webpage_url").unwrap_or_else(|| {
        format!("https://arbetsformedlingen.se/platsbanken/annonser/{ad_id}")
    });
    let application_url = raw
        .get("application_details")
        .and_then(|a| string_field(a, "url"));

    let description_text = raw
        .get("description")
        .and_then(|d| string_field(d, "text"))
        .unwrap_or_default();

    let api_relevance = raw
        .get("relevance")
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);

    Ok(ParsedAd {
        ad_id,
        headline,
        employer,
        municipality,
        occupation,
        webpage_url,
        application_url,
        publication_date: string_field(raw, "publication_date"),
        application_deadline: string_field(raw, "application_deadline"),
        description_text,
        api_relevance,
    })
}

pub fn score_favorites(ad: &ParsedAd) -> (f64, Vec<String>, bool) {
    let hay = format!(
        "{} {} {} {}",
        ad.headline,
        ad.occupation.as_deref().unwrap_or(""),
        ad.description_text,
        ad.employer
    )
    .to_lowercase();

    let mut boost = 0.0_f64;
    let mut reasons = Vec::new();
    for term in FAVORITE_TERMS {
        let needle = term.trim();
        if needle.is_empty() {
            continue;
        }
        if hay.contains(needle) {
            boost += 12.0;
            reasons.push(format!("favorite:{needle}"));
        }
    }
    // Cap so API relevance still matters; emergency volume stays sortable.
    if boost > 48.0 {
        boost = 48.0;
    }
    let favorite_match = !reasons.is_empty();
    if favorite_match {
        reasons.insert(0, "ml_ai_robotics_boost".into());
    }
    (boost, reasons, favorite_match)
}

pub fn lead_from_parsed(ad: ParsedAd) -> PlatsbankenLead {
    let (boost, mut rank_reasons, favorite_match) = score_favorites(&ad);
    if ad.api_relevance > 0.0 {
        rank_reasons.push(format!("api_relevance:{:.2}", ad.api_relevance));
    }
    let rank_score = ad.api_relevance + boost;
    let snippet: String = ad
        .description_text
        .chars()
        .take(220)
        .collect::<String>()
        .replace('\n', " ");

    PlatsbankenLead {
        ad_id: ad.ad_id,
        headline: ad.headline,
        employer: ad.employer,
        municipality: ad.municipality,
        occupation: ad.occupation,
        webpage_url: ad.webpage_url,
        application_url: ad.application_url,
        publication_date: ad.publication_date,
        application_deadline: ad.application_deadline,
        description_snippet: snippet,
        api_relevance: ad.api_relevance,
        rank_score,
        rank_reasons,
        favorite_match,
        already_in_db: false,
        opportunity_id: None,
    }
}

pub fn rank_leads(mut leads: Vec<PlatsbankenLead>) -> Vec<PlatsbankenLead> {
    leads.sort_by(|a, b| {
        b.rank_score
            .partial_cmp(&a.rank_score)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| a.ad_id.cmp(&b.ad_id))
    });
    leads
}

pub fn mark_already_in_db(leads: &mut [PlatsbankenLead], known: &[(String, i64)]) {
    for lead in leads.iter_mut() {
        if let Some((_, id)) = known.iter().find(|(url, _)| {
            url == &lead.webpage_url
                || lead
                    .application_url
                    .as_ref()
                    .is_some_and(|app| app == url)
        }) {
            lead.already_in_db = true;
            lead.opportunity_id = Some(*id);
        }
    }
}

pub fn build_jd_text(ad: &ParsedAd) -> String {
    let mut parts = Vec::new();
    parts.push(format!("# {}\n", ad.headline));
    parts.push(format!("Employer: {}\n", ad.employer));
    if let Some(m) = &ad.municipality {
        parts.push(format!("Municipality: {m}\n"));
    }
    if let Some(o) = &ad.occupation {
        parts.push(format!("Occupation: {o}\n"));
    }
    if let Some(d) = &ad.application_deadline {
        parts.push(format!("Deadline: {d}\n"));
    }
    parts.push(format!("Platsbanken: {}\n", ad.webpage_url));
    if let Some(app) = &ad.application_url {
        parts.push(format!("Apply: {app}\n"));
    }
    parts.push(format!("Ad id: {}\n\n", ad.ad_id));
    parts.push(ad.description_text.clone());
    parts.join("")
}

pub async fn search_ads(filter: &PlatsbankenSearchFilter) -> Result<Vec<ParsedAd>, String> {
    let limit = filter.limit.unwrap_or(25).clamp(1, 100);
    let offset = filter.offset.unwrap_or(0);
    let mut url = format!("{JOBSEARCH_BASE}/search?limit={limit}&offset={offset}");
    if let Some(q) = filter.q.as_ref().map(|s| s.trim()).filter(|s| !s.is_empty()) {
        url.push_str(&format!("&q={}", urlencoding::encode(q)));
    }
    if let Some(raw) = filter.municipality.as_ref() {
        match resolve_geo_filter(raw) {
            Some(GeoFilter::MunicipalityCode(code)) => {
                url.push_str(&format!("&municipality={}", urlencoding::encode(&code)));
            }
            Some(GeoFilter::RemotePhraseMatch) => {
                url.push_str("&remote=true");
            }
            None => {
                return Err(format!(
                    "Unknown city filter '{raw}'. Use a chip (Stockholm, Göteborg, …) or a municipality code like 0180."
                ));
            }
        }
    }

    let client = reqwest::Client::builder()
        .user_agent("collab-finder/platsbanken-emergency")
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("JobSearch request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("JobSearch HTTP {}", resp.status()));
    }
    let body: SearchResponse = resp
        .json()
        .await
        .map_err(|e| format!("JobSearch JSON: {e}"))?;
    let mut out = Vec::with_capacity(body.hits.len());
    for hit in &body.hits {
        out.push(parse_ad_value(hit)?);
    }
    Ok(out)
}

fn digits_after(haystack: &str, marker: &str) -> Option<String> {
    let lower = haystack.to_lowercase();
    let pos = lower.find(marker)?;
    let after = &haystack[pos + marker.len()..];
    let id: String = after.chars().take_while(|c| c.is_ascii_digit()).collect();
    if id.len() >= 4 {
        Some(id)
    } else {
        None
    }
}

/// Platsbanken listing id from a public ad or JobTech `/ad/{id}` URL.
pub fn ad_id_from_webpage_url(url: &str) -> Option<String> {
    if let Some(id) = digits_after(url, "/platsbanken/annonser/") {
        return Some(id);
    }
    let lower = url.to_lowercase();
    if lower.contains("jobtechdev.se") {
        if let Some(id) = digits_after(url, "/ad/") {
            return Some(id);
        }
    }
    let is_af = lower.contains("arbetsformedlingen.se") || lower.contains("platsbanken");
    if !is_af {
        return None;
    }
    let mut best: Option<String> = None;
    let mut run = String::new();
    for ch in url.chars() {
        if ch.is_ascii_digit() {
            run.push(ch);
        } else if !run.is_empty() {
            if (6..=10).contains(&run.len()) {
                best = Some(run.clone());
            }
            run.clear();
        }
    }
    if (6..=10).contains(&run.len()) {
        best = Some(run);
    }
    best
}

/// AF CMP / cookie-consent page — not a job description. Use JobTech instead of HTML.
pub fn is_cookie_wall_text(text: &str) -> bool {
    let lower = text.to_lowercase();
    lower.contains("jag godkänner alla kakor")
        || lower.contains("jag godkanner alla kakor")
        || lower.contains("godkänn alla cookies")
        || lower.contains("godkann alla cookies")
        || (lower.contains("nödvändiga kakor") && lower.contains("cookie"))
        || (lower.contains("nodvandiga kakor") && lower.contains("cookie"))
        || (lower.contains("we use cookies") && lower.contains("arbetsformedlingen"))
}

pub async fn fetch_ad(ad_id: &str) -> Result<ParsedAd, String> {
    let id = ad_id.trim();
    if id.is_empty() {
        return Err("ad_id required".into());
    }
    let url = format!("{JOBSEARCH_BASE}/ad/{}", urlencoding::encode(id));
    let client = reqwest::Client::builder()
        .user_agent("collab-finder/platsbanken-emergency")
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("JobSearch /ad failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("JobSearch /ad HTTP {}", resp.status()));
    }
    let body: Value = resp
        .json()
        .await
        .map_err(|e| format!("JobSearch /ad JSON: {e}"))?;
    parse_ad_value(&body)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn sample_ml_hit() -> Value {
        json!({
            "id": "31226420",
            "headline": "Machine Learning Engineer",
            "relevance": 1.5,
            "employer": { "name": "Exempel Arbetsgivare AB" },
            "occupation": { "label": "Backend-utvecklare" },
            "workplace_address": { "municipality": "Stockholm" },
            "webpage_url": "https://arbetsformedlingen.se/platsbanken/annonser/31226420",
            "application_details": { "url": "https://example.com/apply" },
            "description": { "text": "We need a Machine Learning Engineer for robotics-adjacent work." },
            "publication_date": "2026-08-01T00:00:00",
            "application_deadline": "2026-09-01T00:00:00"
        })
    }

    fn sample_other_hit() -> Value {
        json!({
            "id": "100",
            "headline": "Lagerarbetare",
            "relevance": 2.0,
            "employer": { "name": "Warehouse AB" },
            "occupation": { "label": "Lagerarbetare" },
            "workplace_address": { "municipality": "Göteborg" },
            "webpage_url": "https://arbetsformedlingen.se/platsbanken/annonser/100",
            "description": { "text": "Packning och plock." }
        })
    }

    #[test]
    fn parses_and_boosts_favorites_above_higher_api_relevance() {
        let ml = lead_from_parsed(parse_ad_value(&sample_ml_hit()).unwrap());
        let other = lead_from_parsed(parse_ad_value(&sample_other_hit()).unwrap());
        assert!(ml.favorite_match);
        assert!(!other.favorite_match);
        assert!(
            ml.rank_score > other.rank_score,
            "favorite boost should outrank bare api relevance"
        );
        let ranked = rank_leads(vec![other.clone(), ml.clone()]);
        assert_eq!(ranked[0].ad_id, "31226420");
    }

    #[test]
    fn mark_db_matches_webpage() {
        let mut leads = vec![lead_from_parsed(parse_ad_value(&sample_ml_hit()).unwrap())];
        mark_already_in_db(
            &mut leads,
            &[(
                "https://arbetsformedlingen.se/platsbanken/annonser/31226420".into(),
                42,
            )],
        );
        assert!(leads[0].already_in_db);
        assert_eq!(leads[0].opportunity_id, Some(42));
    }

    #[test]
    fn jd_includes_provenance() {
        let ad = parse_ad_value(&sample_ml_hit()).unwrap();
        let jd = build_jd_text(&ad);
        assert!(jd.contains("Ad id: 31226420"));
        assert!(jd.contains("Platsbanken:"));
        assert!(jd.contains("Machine Learning Engineer"));
    }

    #[test]
    fn ad_id_from_platsbanken_url() {
        assert_eq!(
            ad_id_from_webpage_url(
                "https://arbetsformedlingen.se/platsbanken/annonser/31331639"
            )
            .as_deref(),
            Some("31331639")
        );
        assert_eq!(ad_id_from_webpage_url("https://jobs.qred.com/x"), None);
        assert_eq!(
            ad_id_from_webpage_url(
                "https://arbetsformedlingen.se/platsbanken/annonser/31331639?foo=1"
            )
            .as_deref(),
            Some("31331639")
        );
        assert_eq!(
            ad_id_from_webpage_url("https://jobsearch.api.jobtechdev.se/ad/31331639")
                .as_deref(),
            Some("31331639")
        );
        assert!(is_cookie_wall_text(
            "Jag godkänner alla kakor. Nödvändiga kakor för webbplatsen."
        ));
        assert!(!is_cookie_wall_text("Hiring a software engineer in Stockholm"));
    }

    #[test]
    fn city_chips_map_to_taxonomy_codes_not_names() {
        assert_eq!(
            resolve_geo_filter("Stockholm"),
            Some(GeoFilter::MunicipalityCode("0180".into()))
        );
        assert_eq!(
            resolve_geo_filter("Göteborg"),
            Some(GeoFilter::MunicipalityCode("1480".into()))
        );
        assert_eq!(
            resolve_geo_filter("Malmö"),
            Some(GeoFilter::MunicipalityCode("1280".into()))
        );
        assert_eq!(
            resolve_geo_filter("Uppsala"),
            Some(GeoFilter::MunicipalityCode("0380".into()))
        );
        assert_eq!(
            resolve_geo_filter("Remote"),
            Some(GeoFilter::RemotePhraseMatch)
        );
        assert_eq!(
            resolve_geo_filter("0180"),
            Some(GeoFilter::MunicipalityCode("0180".into()))
        );
        assert_eq!(resolve_geo_filter("NotACity"), None);
    }
}
