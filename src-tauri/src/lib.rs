mod app_dirs;
mod commands;
mod db;
mod finder_reactor;
mod cv_home;
mod environment;
mod firm_durability;
mod operator_pack;
mod rank_config;
mod hire_board;
mod mission_firms;
mod network_graph;
mod platsbanken;
mod llm_route;
mod local_grok;
mod opportunity_target;
mod secrets;
mod x_query;
mod x_search;
mod xai;

use commands::{
    persist_cycle_lead, persist_cycle_search, persist_manual_search, persist_promote_event,
    promote_message,
};
use finder_reactor::{CycleResult, FinderReactor, Guard, ReactorState};
use cv_home::{get_cv_home_status, install_kanithanj_cv};
use llm_route::{get_llm_route_status, set_llm_route_quality};
use local_grok::run_local_grok_quest;
use opportunity_target::{
    analyze_opportunity_target, export_application_pack, fetch_opportunity_target_page,
    generate_apply_cv, get_devprofile_path, get_devprofile_path_cmd, get_fit_mode_cmd,
    get_xai_model_cmd, prep_opportunity_target, propose_cv_sidecar_for_prep,
    read_pack_artifact, open_pack_artifact, list_pack_dir, set_devprofile_path_cmd, set_fit_mode_cmd, set_xai_model_cmd,
};
use std::sync::Mutex as StdMutex;
use tauri::State;
use tokio::sync::Mutex;
use x_search::XTweet;

// Re-export OpportunityTarget*Result types at crate root for wire compatibility (TS domain mirrors "from opportunity-target.rs")
// and any future internal refs.
pub use opportunity_target::{OpportunityTargetAnalysisResult, OpportunityTargetPageResult, OpportunityTargetPrepResult};

pub struct AppReactor(pub Mutex<FinderReactor>);
pub struct AppDb(pub StdMutex<db::SqliteStore>);

// ============================================================================
// CREDENTIALS / X BEARER + xAI KEY ACCESS (STABILITY BOUNDARY)
// ============================================================================
// These are the ONLY ways the rest of the app (and the React UI via invoke) touches
// secrets. See the huge warning header in src/secrets.rs (covers BOTH bearer and xai-key).
//
// x_bearer() is the internal helper used by search/cycle/hydrate.
// get_xai_key() (added below) is the internal helper used by analyze/prep commands.
//
// The EIGHT credential commands (4 bearer + 4 xai) are registered together below.
//
// DO NOT:
// - Rename any of the 8 command strings without updating docs/tauri-commands.md + adapters.
// - Remove any from generate_handler![].
// - Change return shapes of get_*_storage (TS types must match the duplicated structs).
// - Add extra params or make them async unless you update docs + all call sites.
// ============================================================================

fn x_bearer() -> Result<String, String> {
    secrets::get_x_bearer()
}

#[tauri::command]
fn has_x_bearer() -> bool {
    secrets::has_x_bearer()
}

#[tauri::command]
fn get_x_bearer_storage() -> secrets::BearerStorageStatus {
    secrets::get_bearer_storage_status()
}

#[tauri::command]
fn set_x_bearer(token: String) -> Result<(), String> {
    secrets::set_x_bearer(token.trim())
}

#[tauri::command]
fn clear_x_bearer() -> Result<(), String> {
    secrets::clear_x_bearer()
}

// xAI key commands (exact parallel to the 4 bearer commands above — stability boundary)
#[tauri::command]
fn has_xai_key() -> bool {
    secrets::has_xai_key()
}

#[tauri::command]
fn get_xai_key_storage() -> secrets::XaiKeyStorageStatus {
    secrets::get_xai_key_storage()
}

#[tauri::command]
fn set_xai_key(key: String) -> Result<(), String> {
    secrets::set_xai_key(key.trim())
}

#[tauri::command]
fn clear_xai_key() -> Result<(), String> {
    secrets::clear_xai_key()
}

// Opportunity target commands (analyze_opportunity_target, prep_opportunity_target, fetch_opportunity_target_page + OpportunityTarget*Result structs + strip_html_basic + basic Greenhouse title/company extract)
// extracted to src-tauri/src/opportunity_target.rs (TD-005 god-module relief).
// Credential STABILITY block, 8 credential commands, reactor, and bootstrap left 100% untouched (AGENTS + STABILITY CONTRACT).

#[tauri::command]
async fn search_x_recent(
    db: State<'_, AppDb>,
    query: String,
    max_results: Option<u32>,
) -> Result<Vec<XTweet>, String> {
    let bearer = x_bearer()?;
    let max = max_results.unwrap_or(10);
    let start = std::time::Instant::now();
    let (tweets, rate) = x_search::search_recent(&bearer, &query, max).await?;
    let dur = start.elapsed().as_millis() as i64;

    if let Some(rem) = rate.remaining {
        eprintln!("[x] rate remaining: {rem}");
    }

    let run_id =
        db.0.lock()
            .map_err(|e| e.to_string())
            .and_then(|s| persist_manual_search(&s, &query, max, &tweets, &rate, dur))
            .unwrap_or_else(|e| {
                eprintln!("[db] search persist skipped (non-fatal, TD-011): {e}");
                0
            });

    if run_id > 0 {
        eprintln!(
            "[db] recorded search_run {} ({} tweets)",
            run_id,
            tweets.len()
        );
    }

    Ok(tweets)
}

#[tauri::command]
async fn run_finder_cycle_cmd(
    db: State<'_, AppDb>,
    reactor: State<'_, AppReactor>,
    query: String,
    cv_summary: String,
) -> Result<CycleResult, String> {
    let bearer = x_bearer()?;
    let start = std::time::Instant::now();
    let mut rguard = reactor.0.lock().await;
    let run_res = rguard
        .run_autonomous_cycle(query.clone(), bearer, cv_summary)
        .await;
    let dur = start.elapsed().as_millis() as i64;
    let result = match run_res {
        Ok(r) => r,
        Err(e) => {
            if e.contains("XRate") || e.contains("Paused on guard") {
                if let Ok(s) = db.0.lock() {
                    if let Err(pe) =
                        s.record_pause("XRate guard triggered", Some("XRate"), None, None, Some(&e))
                    {
                        eprintln!("[db] pause persist skipped (non-fatal, TD-003): {pe}");
                    }
                }
            }
            drop(rguard);
            return Err(e);
        }
    };
    drop(rguard);

    if !result.decision.guards_triggered.is_empty() {
        if let Ok(s) = db.0.lock() {
            let guard_type = result
                .decision
                .guards_triggered
                .first()
                .map(|g| match g {
                    Guard::XRate { .. } => "XRate",
                    Guard::FitThreshold { .. } => "FitThreshold",
                    Guard::Cost { .. } => "Cost",
                    Guard::CVPromote { .. } => "CVPromote",
                })
                .unwrap_or("Guard");
            if let Err(e) = s.record_pause(
                "Cycle paused on guard(s)",
                Some(guard_type),
                None,
                None,
                Some(&format!("{:?}", result.decision.guards_triggered)),
            ) {
                eprintln!("[db] pause persist skipped (non-fatal, TD-003): {e}");
            }
        }
    }
    if result.decision.action == "promote" {
        if let Ok(s) = db.0.lock() {
            if let Err(e) = s.record_pause(
                "CV promote guard triggered - sidecar only, user confirm required",
                Some("CVPromote"),
                None,
                None,
                None,
            ) {
                eprintln!("[db] pause persist skipped (non-fatal, TD-003): {e}");
            }
        }
    }

    let run_id =
        db.0.lock()
            .map_err(|e| e.to_string())
            .and_then(|s| persist_cycle_search(&s, &query, &result.tweets, dur))
            .unwrap_or_else(|e| {
                eprintln!("[db] cycle search persist skipped (non-fatal, TD-011): {e}");
                0
            });

    let _lead_id =
        db.0.lock()
            .map_err(|e| e.to_string())
            .and_then(|s| persist_cycle_lead(&s, &result))
            .unwrap_or_else(|e| {
                eprintln!("[db] cycle lead persist skipped (non-fatal, TD-011): {e}");
                0
            });

    if run_id > 0 {
        eprintln!("[db] recorded cycle search_run {}", run_id);
    }

    Ok(result)
}

#[tauri::command]
async fn get_reactor_state(
    _db: State<'_, AppDb>,
    reactor: State<'_, AppReactor>,
) -> Result<ReactorState, String> {
    let guard = reactor.0.lock().await;
    Ok(guard.state.clone())
}

#[tauri::command]
async fn promote_lead(
    db: State<'_, AppDb>,
    reactor: State<'_, AppReactor>,
    lead_id: String,
) -> Result<String, String> {
    let mut guard = reactor.0.lock().await;
    let msg = promote_message(&mut guard, &lead_id)?;
    drop(guard);

    let _ = db.0.lock().map(|s| {
        let _ = persist_promote_event(&s, &lead_id, &msg);
    });

    Ok(msg)
}

#[tauri::command]
async fn get_search_history(
    db: State<'_, AppDb>,
    limit: Option<u32>,
) -> Result<Vec<db::SearchRun>, String> {
    let lim = limit.unwrap_or(50);
    db.0.lock()
        .map(|s| s.get_recent_searches(lim))
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn get_search_run(
    db: State<'_, AppDb>,
    id: i64,
) -> Result<Option<db::SearchRunWithTweets>, String> {
    db.0.lock()
        .map(|s| s.get_search_run(id))
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn get_leads(
    db: State<'_, AppDb>,
    min_score: Option<i32>,
    status: Option<String>,
    q: Option<String>,
    limit: Option<u32>,
) -> Result<Vec<db::Lead>, String> {
    let filter = db::LeadFilter {
        min_score,
        status,
        q,
        since: None,
        limit,
    };
    db.0.lock()
        .map(|s| s.get_leads(&filter))
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn get_dashboard_stats(db: State<'_, AppDb>) -> Result<db::DashboardStats, String> {
    db.0.lock()
        .map(|s| s.get_dashboard_stats())
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn get_recent_pauses(
    db: State<'_, AppDb>,
    limit: Option<u32>,
) -> Result<Vec<db::Pause>, String> {
    let lim = limit.unwrap_or(30);
    db.0.lock()
        .map(|s| s.get_recent_pauses(lim))
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn get_events(db: State<'_, AppDb>, limit: Option<u32>) -> Result<Vec<db::Event>, String> {
    let filter = db::EventFilter {
        event_type: None,
        since: None,
        correlation_id: None,
        limit,
    };
    db.0.lock()
        .map(|s| s.get_events(&filter))
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn get_opportunities(
    db: State<'_, AppDb>,
    q: Option<String>,
    status: Option<String>,
    limit: Option<u32>,
    id: Option<i64>,
) -> Result<Vec<db::Opportunity>, String> {
    let filter = db::OpportunityFilter {
        id,
        q,
        status,
        min_fit: None,
        limit,
    };
    db.0.lock()
        .map(|s| s.get_opportunities(&filter))
        .map_err(|e| e.to_string())?
}

/// Pipeline status only (applied / passed / archived / …) — no xAI. Discover rail closure.
#[tauri::command]
async fn update_opportunity_status_cmd(
    db: State<'_, AppDb>,
    id: i64,
    status: String,
    notes: Option<String>,
) -> Result<(), String> {
    let allowed = ["new", "analyzed", "prepped", "applied", "passed", "archived"];
    if !allowed.contains(&status.as_str()) {
        return Err(format!("invalid status '{status}' (allowed: {})", allowed.join(", ")));
    }
    db.0.lock()
        .map_err(|e| e.to_string())?
        .update_opportunity_status(id, &status, notes.as_deref())
}

#[tauri::command]
fn load_network_graph(
    db: State<'_, AppDb>,
    path: Option<String>,
    contacts_path: Option<String>,
    force_reimport: Option<bool>,
    top_n: Option<u32>,
) -> Result<network_graph::NetworkGraphResult, String> {
    let top = top_n.unwrap_or(50) as usize;
    let force = force_reimport.unwrap_or(false);
    let store = db.0.lock().map_err(|e| e.to_string())?;
    if store.network_people_count().unwrap_or(0) > 0 || network_graph::resolve_connections_csv_path(path.as_deref()).is_ok() {
        return network_graph::load_network_graph_via_db(
            &store,
            path.as_deref(),
            contacts_path.as_deref(),
            force,
            top,
        );
    }
    let csv_path = network_graph::resolve_connections_csv_path(path.as_deref())?;
    network_graph::load_network_graph_from_path(&csv_path, top)
}

/// Official X user lookup by candidate usernames (LI slug + name variants) for top-N.
#[tauri::command]
async fn resolve_network_x_profiles(
    db: State<'_, AppDb>,
    graph: network_graph::NetworkGraphResult,
    top_n: Option<u32>,
    ids: Option<Vec<String>>,
) -> Result<network_graph::NetworkGraphResult, String> {
    let bearer = x_bearer()?;
    let top = top_n.unwrap_or(50) as usize;
    let mut graph = graph;
    let _resolved = network_graph::resolve_x_for_top(&bearer, &mut graph, ids, top).await?;
    if let Ok(store) = db.0.lock() {
        let _ = store.upsert_network_people_scores(&graph.people);
    }
    Ok(graph)
}

/// Public LinkedIn page meta only (rate-limited). Prefer after X resolve for top-N.
#[tauri::command]
async fn enrich_network_linkedin(
    db: State<'_, AppDb>,
    graph: network_graph::NetworkGraphResult,
    top_n: Option<u32>,
    ids: Option<Vec<String>>,
) -> Result<network_graph::NetworkGraphResult, String> {
    let top = top_n.unwrap_or(50) as usize;
    let mut graph = graph;
    let _enriched = network_graph::enrich_linkedin_for_top(&mut graph, ids, top).await?;
    if let Ok(store) = db.0.lock() {
        let _ = store.upsert_network_people_scores(&graph.people);
    }
    Ok(graph)
}

/// Fetch public hire spreadsheet CSV, filter + intelli-skim (in-memory). Does not write SQLite.
/// Sheet URL from optional arg or gitignored `data/hire-board/config.local.json`.
#[tauri::command]
async fn fetch_hire_board(
    db: State<'_, AppDb>,
    sheet_url: Option<String>,
    q: Option<String>,
    geo: Option<Vec<String>>,
    require_career_url: Option<bool>,
    limit: Option<u32>,
) -> Result<Vec<hire_board::HireBoardLead>, String> {
    let (export_url, _cfg) = hire_board::resolve_export_url(sheet_url.as_deref())?;
    let text = hire_board::fetch_sheet_csv(&export_url).await?;
    let mut leads = hire_board::parse_sheet_csv(&text)?;
    let filter = hire_board::HireBoardFilter {
        q,
        geo: geo.unwrap_or_default(),
        require_career_url: require_career_url.unwrap_or(true),
        limit: limit.map(|n| n as usize),
    };
    leads = hire_board::filter_and_sort(leads, &filter);

    let known: Vec<(String, i64)> = db
        .0
        .lock()
        .map_err(|e| e.to_string())?
        .get_opportunities(&db::OpportunityFilter {
            limit: Some(500),
            ..Default::default()
        })?
        .into_iter()
        .filter_map(|o| o.source_url.map(|u| (u, o.id)))
        .collect();
    hire_board::mark_already_in_db(&mut leads, &known);
    Ok(leads)
}

fn durability_exclude_ids(store: &db::SqliteStore) -> Vec<String> {
    let mut ids = store.admitted_durability_ids().unwrap_or_default();
    if let Ok(Some(last)) = store.latest_durability_iteration() {
        for row in last.top10 {
            if !ids.iter().any(|id| id == &row.firm_id) {
                ids.push(row.firm_id);
            }
        }
        for id in last.exclude_ids {
            if !ids.iter().any(|x| x == &id) {
                ids.push(id);
            }
        }
    }
    ids
}

#[tauri::command]
fn get_rank_config() -> Result<rank_config::RankConfigView, String> {
    rank_config::view()
}

#[tauri::command]
fn save_rank_config(config: rank_config::RankConfig) -> Result<rank_config::RankConfigView, String> {
    rank_config::save(&config)?;
    rank_config::view()
}

/// Durability ranker. `next`/`advance` skip the last stored wave.
#[tauri::command]
fn list_durable_firms(
    db: State<'_, AppDb>,
    next: Option<bool>,
    advance: Option<bool>,
    refresh: Option<bool>,
) -> Result<firm_durability::IterationResult, String> {
    let go_next = next.unwrap_or(false) || advance.unwrap_or(false);
    let refresh = refresh.unwrap_or(false);
    let store = db.0.lock().map_err(|e| e.to_string())?;
    if !go_next && !refresh {
        if let Ok(Some(last)) = store.latest_durability_iteration() {
            if !last.top10.is_empty() {
                return Ok(last);
            }
        }
    }
    let exclude = if go_next {
        durability_exclude_ids(&store)
    } else {
        Vec::new()
    };
    let wave = store.durability_run_count().unwrap_or(0) + 1;
    let result = firm_durability::run_wave(&exclude, wave);
    let _ = store.record_durability_run(&result);
    for row in &result.top10 {
        let url = row
            .source
            .clone()
            .filter(|s| s.starts_with("http"))
            .unwrap_or_else(|| format!("durable://{}", row.firm_id));
        let jd = format!(
            "{}\n{}\nprofile {} · {}",
            row.name, row.cash_line, row.profile.score, row.product_class
        );
        let _ = store.upsert_opportunity(
            "durable_firm",
            Some(&url),
            Some(&format!("durable:{}", row.firm_id)),
            Some(&row.name),
            Some(&row.name),
            &jd,
            "new",
            Some(row.profile.score),
            None,
            None,
            Some(&format!(
                "durable_wave:{}; total:{}; band:{}",
                result.wave, row.total, row.band
            )),
        );
    }
    Ok(result)
}

/// Mission firms rail — xAI / SpaceX Greenhouse + Swedish bridge employers (JobTech).
#[tauri::command]
async fn search_mission_firms(
    db: State<'_, AppDb>,
    q: Option<String>,
    firms: Option<Vec<String>>,
    texas_only: Option<bool>,
    terafab_bias: Option<bool>,
    limit: Option<u32>,
    force_refresh: Option<bool>,
) -> Result<Vec<mission_firms::MissionFirmLead>, String> {
    let filter = mission_firms::MissionFirmFilter {
        q,
        firms: firms.unwrap_or_default(),
        texas_only: texas_only.unwrap_or(false),
        terafab_bias: terafab_bias.unwrap_or(true),
        limit: limit.map(|n| n as usize),
        force_refresh: force_refresh.unwrap_or(false),
    };
    let mut leads = mission_firms::search_mission_firms(&filter).await?;
    let known: Vec<(String, i64)> = db
        .0
        .lock()
        .map_err(|e| e.to_string())?
        .get_opportunities(&db::OpportunityFilter {
            limit: Some(500),
            ..Default::default()
        })?
        .into_iter()
        .filter_map(|o| o.source_url.map(|u| (u, o.id)))
        .collect();
    mission_firms::mark_already_in_db(&mut leads, &known);

    // Persist the pull so Data → Search runs + Opportunities survive restart.
    if let Ok(store) = db.0.lock() {
        let q = filter.q.clone().unwrap_or_default();
        let _ = store.record_search_run(
            &format!("mission_pull {q}"),
            "mission_pull",
            Some(leads.len() as i32),
            None,
            None,
            0,
            None,
            None,
        );
        let _ = store.record_event(
            "mission_pull",
            Some(&format!("{{\"n\":{}}}", leads.len())),
            None,
            Some("mission"),
        );
        for lead in &leads {
            if lead.absolute_url.trim().is_empty() {
                continue;
            }
            let stub = format!(
                "{}\n{}\n{}\n{}",
                lead.title,
                lead.location,
                lead.absolute_url,
                lead.rank_reasons.join("; ")
            );
            let _ = store.upsert_opportunity(
                "mission_pull",
                Some(&lead.absolute_url),
                Some(&format!("{}:{}", lead.source, lead.external_id)),
                Some(&lead.title),
                Some(&lead.firm_label),
                &stub,
                "new",
                Some(lead.rank_score.round() as i32),
                None,
                None,
                Some(&format!("mission_pull; firm:{}", lead.firm_id)),
            );
        }
        let known2: Vec<(String, i64)> = store
            .get_opportunities(&db::OpportunityFilter {
                limit: Some(800),
                ..Default::default()
            })
            .unwrap_or_default()
            .into_iter()
            .filter_map(|o| o.source_url.map(|u| (u, o.id)))
            .collect();
        drop(store);
        mission_firms::mark_already_in_db(&mut leads, &known2);
    }

    Ok(leads)
}

/// Import one mission-firm posting into opportunities (kind=mission_firm).
#[tauri::command]
async fn import_mission_firm_lead(
    db: State<'_, AppDb>,
    firm_id: String,
    source: String,
    external_id: String,
    absolute_url: Option<String>,
) -> Result<db::Opportunity, String> {
    let firm = firm_id.trim().to_ascii_lowercase();
    let source = source.trim().to_ascii_lowercase();
    let (title, company, url, jd, source_ref) = if source == "greenhouse" {
        let board = mission_firms::greenhouse_board_for_firm(&firm)
            .ok_or_else(|| format!("unsupported greenhouse firm '{firm}'"))?;
        let (title, _loc, abs, jd) =
            mission_firms::fetch_greenhouse_job_jd(board, &external_id).await?;
        let url = if abs.is_empty() {
            absolute_url.unwrap_or_default()
        } else {
            abs
        };
        let company = mission_firms::firm_label(&firm);
        (
            title,
            company,
            url,
            jd,
            format!("gh:{board}:{external_id}"),
        )
    } else if source == "lever" {
        let site = mission_firms::lever_site_for_firm(&firm)
            .ok_or_else(|| format!("unsupported lever firm '{firm}'"))?;
        let (title, _loc, abs, jd) =
            mission_firms::fetch_lever_job_jd(site, &external_id).await?;
        let url = if abs.is_empty() {
            absolute_url.unwrap_or_default()
        } else {
            abs
        };
        let company = mission_firms::firm_label(&firm);
        (
            title,
            company,
            url,
            jd,
            format!("lever:{site}:{external_id}"),
        )
    } else if source == "ashby" {
        let board = mission_firms::ashby_board_for_firm(&firm)
            .ok_or_else(|| format!("unsupported ashby firm '{firm}'"))?;
        let (title, _loc, abs, jd) =
            mission_firms::fetch_ashby_job_jd(board, &external_id, absolute_url.as_deref()).await?;
        let url = if abs.is_empty() {
            absolute_url.unwrap_or_default()
        } else {
            abs
        };
        let company = mission_firms::firm_label(&firm);
        (
            title,
            company,
            url,
            jd,
            format!("ashby:{board}:{external_id}"),
        )
    } else if source == "jobtech" {
        let ad = platsbanken::fetch_ad(&external_id).await?;
        let jd = platsbanken::build_jd_text(&ad);
        (
            ad.headline,
            ad.employer,
            ad.webpage_url,
            jd,
            format!("jobtech:{external_id}"),
        )
    } else if source == "tesla" {
        let (title, company, url, jd) = mission_firms::resolve_tesla_job_for_import(
            &external_id,
            absolute_url.as_deref(),
        )?;
        (title, company, url, jd, format!("tesla:{external_id}"))
    } else {
        return Err(format!("unsupported source '{source}'"));
    };

    if url.trim().is_empty() {
        return Err("absolute_url required".into());
    }

    let notes = format!("mission_firm:{firm}; source:{source}");
    let id = db.0.lock().map_err(|e| e.to_string())?.upsert_opportunity(
        "mission_firm",
        Some(&url),
        Some(&source_ref),
        Some(&title),
        Some(&company),
        &jd,
        "new",
        None,
        None,
        None,
        Some(&notes),
    )?;

    let mut opportunity = db
        .0
        .lock()
        .map_err(|e| e.to_string())?
        .get_opportunities(&db::OpportunityFilter {
            id: Some(id),
            limit: Some(1),
            ..Default::default()
        })?
        .into_iter()
        .next()
        .ok_or_else(|| format!("opportunity {id} missing after mission firm import"))?;
    opportunity.jd_text = jd;
    opportunity.kind = "mission_firm".into();
    opportunity.title = Some(title);
    opportunity.company = Some(company);
    opportunity.source_ref = Some(source_ref);
    Ok(opportunity)
}

#[derive(serde::Serialize)]
struct MissionInspectResult {
    opportunity: db::Opportunity,
    profile: firm_durability::ProfileMatch,
}

/// Click a Pull card: fetch JD, store the row, local profile match (no xAI).
#[tauri::command]
async fn inspect_mission_firm_lead(
    db: State<'_, AppDb>,
    firm_id: String,
    source: String,
    external_id: String,
    absolute_url: Option<String>,
    location: Option<String>,
) -> Result<MissionInspectResult, String> {
    let opportunity = import_mission_firm_lead(
        db.clone(),
        firm_id.clone(),
        source,
        external_id,
        absolute_url,
    )
    .await?;
    let firm_m = firm_durability::score_for_id(&firm_id).map(|r| r.profile);
    let role = firm_durability::local_role_match(
        opportunity.title.as_deref().unwrap_or(""),
        opportunity.company.as_deref().unwrap_or(""),
        location.as_deref().unwrap_or(""),
        &opportunity.jd_text,
    );
    let profile = firm_durability::blend_match(firm_m.as_ref(), &role);
    if let Ok(store) = db.0.lock() {
        let _ = store.upsert_opportunity(
            "mission_firm",
            opportunity.source_url.as_deref(),
            opportunity.source_ref.as_deref(),
            opportunity.title.as_deref(),
            opportunity.company.as_deref(),
            &opportunity.jd_text,
            "new",
            Some(profile.score),
            Some(&serde_json::to_string(&profile).unwrap_or_else(|_| "{}".into())),
            None,
            opportunity.notes.as_deref(),
        );
    }
    Ok(MissionInspectResult {
        opportunity,
        profile,
    })
}

/// Platsbanken — JobTech search, then remember each ad (dedup on source_url / ad id).
#[tauri::command]
async fn search_platsbanken(
    db: State<'_, AppDb>,
    q: Option<String>,
    municipality: Option<String>,
    limit: Option<u32>,
    offset: Option<u32>,
) -> Result<Vec<platsbanken::PlatsbankenLead>, String> {
    let filter = platsbanken::PlatsbankenSearchFilter {
        q,
        municipality,
        limit: limit.map(|n| n as usize),
        offset: offset.map(|n| n as usize),
    };
    let ads = platsbanken::search_ads(&filter).await?;
    let mut leads: Vec<_> = ads
        .into_iter()
        .map(platsbanken::lead_from_parsed)
        .collect();
    leads = platsbanken::rank_leads(leads);

    {
        let store = db.0.lock().map_err(|e| e.to_string())?;
        for lead in leads.iter_mut() {
            let jd = if lead.description_snippet.is_empty() {
                lead.headline.clone()
            } else {
                lead.description_snippet.clone()
            };
            let notes = format!(
                "platsbanken search; municipality={}",
                lead.municipality.as_deref().unwrap_or("-")
            );
            let id = store.remember_opportunity(
                "platsbanken",
                Some(&lead.webpage_url),
                Some(&lead.ad_id),
                Some(&lead.headline),
                Some(&lead.employer),
                &jd,
                Some(&notes),
            )?;
            if id > 0 {
                lead.already_in_db = true;
                lead.opportunity_id = Some(id);
            }
        }
    }
    Ok(leads)
}

/// Import one Platsbanken ad as Opportunity (kind=platsbanken) with full JD text.
#[tauri::command]
async fn import_platsbanken_ad(
    db: State<'_, AppDb>,
    ad_id: String,
) -> Result<db::Opportunity, String> {
    let ad = platsbanken::fetch_ad(&ad_id).await?;
    let jd = platsbanken::build_jd_text(&ad);
    let notes = format!(
        "platsbanken emergency; favorite_match terms may apply; municipality={}",
        ad.municipality.as_deref().unwrap_or("-")
    );
    let id = db.0.lock().map_err(|e| e.to_string())?.remember_opportunity(
        "platsbanken",
        Some(&ad.webpage_url),
        Some(&ad.ad_id),
        Some(&ad.headline),
        Some(&ad.employer),
        &jd,
        Some(&notes),
    )?;

    let mut opportunity = db
        .0
        .lock()
        .map_err(|e| e.to_string())?
        .get_opportunities(&db::OpportunityFilter {
            id: Some(id),
            limit: Some(1),
            ..Default::default()
        })?
        .into_iter()
        .next()
        .ok_or_else(|| format!("opportunity {id} missing after platsbanken import"))?;
    // Upsert keeps prior jd_text on URL conflict; Evaluate still needs the live ad body.
    opportunity.jd_text = jd;
    opportunity.kind = "platsbanken".into();
    opportunity.title = Some(ad.headline);
    opportunity.company = Some(ad.employer);
    opportunity.source_ref = Some(ad.ad_id);
    Ok(opportunity)
}

#[tauri::command]
fn delete_opportunity_cmd(db: State<'_, AppDb>, id: i64) -> Result<(), String> {
    db.0.lock()
        .map_err(|e| e.to_string())?
        .delete_opportunity(id)
}

#[tauri::command]
fn open_external_url(app: tauri::AppHandle, url: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let t = url.trim();
    if !(t.starts_with("https://") || t.starts_with("http://")) {
        return Err("only http(s) urls can be opened".into());
    }
    app.opener()
        .open_url(t, None::<&str>)
        .map_err(|e| e.to_string())
}

fn mission_maps_dir() -> std::path::PathBuf {
    std::env::var_os("HOME")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join(".grok/mission-maps")
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct HeadingSnapshot {
    map_json: String,
    contacts: String,
    waybar: String,
}

/// Read-only cluster SoT (mission-map owner writes these files).
#[tauri::command]
fn read_heading_snapshot() -> Result<HeadingSnapshot, String> {
    let d = mission_maps_dir();
    let read = |name: &str| std::fs::read_to_string(d.join(name)).unwrap_or_default();
    Ok(HeadingSnapshot {
        map_json: read("cash-path-now.json"),
        contacts: read("contacts.md"),
        waybar: read("waybar.json"),
    })
}

fn open_route_path() -> std::path::PathBuf {
    mission_maps_dir().join("open-route")
}

fn parse_open_route(raw: &str) -> Option<String> {
    let t = raw.trim();
    if t.is_empty() {
        None
    } else {
        Some(t.to_string())
    }
}

/// Peek cluster route. Do not delete — hydrate / a second window must still see `heading`.
#[tauri::command]
fn read_cluster_route() -> Result<Option<String>, String> {
    let p = open_route_path();
    if !p.is_file() {
        return Ok(None);
    }
    let s = std::fs::read_to_string(&p).unwrap_or_default();
    Ok(parse_open_route(&s))
}

/// Drop the one-shot file after Heading is actually on screen.
#[tauri::command]
fn clear_cluster_route() -> Result<(), String> {
    let p = open_route_path();
    if p.is_file() {
        let _ = std::fs::remove_file(&p);
    }
    Ok(())
}

/// Legacy one-shot (peek + delete). Prefer `read_cluster_route` + `clear_cluster_route`.
#[tauri::command]
fn consume_cluster_route() -> Result<Option<String>, String> {
    let v = read_cluster_route()?;
    if v.is_some() {
        let _ = clear_cluster_route();
    }
    Ok(v)
}

/// Persist one hire-board lead as Opportunity status=new (URL dedup via upsert).
#[tauri::command]
async fn select_hire_board_lead(
    db: State<'_, AppDb>,
    company: String,
    location: Option<String>,
    career_url: String,
    thread_url: Option<String>,
) -> Result<db::Opportunity, String> {
    let mut career = career_url.trim().to_string();
    if career.is_empty() {
        return Err("career_url required".into());
    }
    if career.contains('@') && !career.contains("://") {
        return Err("career_url must be an http(s) link, not email".into());
    }
    let lower = career.to_lowercase();
    if matches!(lower.as_str(), "—" | "-" | "(mentioned)" | "n/a") {
        return Err("career_url is not usable".into());
    }
    if !career.starts_with("http://") && !career.starts_with("https://") {
        if career.contains('.') {
            career = format!("https://{career}");
        } else {
            return Err("career_url must be http(s)".into());
        }
    }

    let loc = location.unwrap_or_default();
    let thread = thread_url.unwrap_or_default();
    let jd = hire_board::select_stub_jd(&loc, &career, &thread);
    // Best-effort provenance from local config (no hardcoded sheet id).
    let cfg = hire_board::load_hire_board_config().unwrap_or_default();
    let source_ref = hire_board::source_ref_for_sheet(&cfg, &thread);
    let company_trim = company.trim();
    if company_trim.is_empty() {
        return Err("company required".into());
    }

    let id = db.0.lock().map_err(|e| e.to_string())?.upsert_opportunity(
        "web",
        Some(&career),
        Some(&source_ref),
        Some(company_trim),
        Some(company_trim),
        &jd,
        "new",
        None,
        None,
        None,
        Some(&format!("location: {loc}")),
    )?;

    db.0
        .lock()
        .map_err(|e| e.to_string())?
        .get_opportunities(&db::OpportunityFilter {
            id: Some(id),
            limit: Some(1),
            ..Default::default()
        })?
        .into_iter()
        .next()
        .ok_or_else(|| format!("opportunity {id} missing after upsert"))
}

#[tauri::command]
async fn search_past_tweets(
    db: State<'_, AppDb>,
    fts_query: String,
    limit: Option<u32>,
) -> Result<Vec<XTweet>, String> {
    let lim = limit.unwrap_or(20);
    db.0.lock()
        .map(|s| s.search_tweets_fts(&fts_query, lim))
        .map_err(|e| e.to_string())?
}

/// Re-fetch full post content from X on demand (not persisted; handles deletions via 404).
#[tauri::command]
async fn hydrate_tweet(id: String) -> Result<XTweet, String> {
    let bearer = x_bearer()?;
    x_search::lookup_tweet(&bearer, &id).await
}

#[tauri::command]
fn log_event(
    db: State<'_, AppDb>,
    event_type: String,
    payload: Option<String>,
    correlation_id: Option<String>,
) -> Result<(), String> {
    let _ = db.0.lock().map(|s| {
        let _ = s.record_event(
            &event_type,
            payload.as_deref(),
            correlation_id.as_deref(),
            Some("ui"),
        );
    });
    Ok(())
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct PersistQuestTurnInput {
    session_id: String,
    kind: String,
    context_ids: String,
    last_opp_id: Option<i64>,
    role: String,
    text: String,
    backend: Option<String>,
    prompt_chars: Option<i64>,
}

#[tauri::command]
fn persist_quest_turn(db: State<'_, AppDb>, input: PersistQuestTurnInput) -> Result<(), String> {
    let _ = db.0.lock().map(|s| {
        let _ = s.persist_quest_turn(
            &input.session_id,
            &input.kind,
            &input.context_ids,
            input.last_opp_id,
            &input.role,
            &input.text,
            input.backend.as_deref(),
            input.prompt_chars,
        );
    });
    Ok(())
}

#[tauri::command]
fn load_latest_quest_thread(db: State<'_, AppDb>) -> Result<Option<db::QuestThread>, String> {
    db.0.lock()
        .map(|s| s.get_latest_quest_thread())
        .map_err(|e| e.to_string())?
}

#[tauri::command]
fn load_quest_thread(
    db: State<'_, AppDb>,
    session_id: String,
) -> Result<Option<db::QuestThread>, String> {
    db.0.lock()
        .map(|s| s.get_quest_thread(&session_id))
        .map_err(|e| e.to_string())?
}

#[tauri::command]
fn list_quest_threads(
    db: State<'_, AppDb>,
    limit: Option<u32>,
) -> Result<Vec<db::QuestThreadSummary>, String> {
    db.0.lock()
        .map(|s| s.list_quest_threads(limit.unwrap_or(12)))
        .map_err(|e| e.to_string())?
}

#[tauri::command]
fn search_quest_turns(
    db: State<'_, AppDb>,
    q: String,
    limit: Option<u32>,
) -> Result<Vec<db::QuestTurnHit>, String> {
    db.0.lock()
        .map(|s| s.search_quest_turns(&q, limit.unwrap_or(20)))
        .map_err(|e| e.to_string())?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        // Seed reactor from Settings store (same devprofile_path.txt as analyze/prep).
        .manage(AppReactor(Mutex::new(FinderReactor::new(get_devprofile_path()))))
        .manage(AppDb(StdMutex::new(db::SqliteStore::new())))
        .invoke_handler(tauri::generate_handler![
            // Credential commands (stability boundary — see above). Keep bearer + xai together.
            has_x_bearer,
            get_x_bearer_storage,
            set_x_bearer,
            clear_x_bearer,
            has_xai_key,
            get_xai_key_storage,
            set_xai_key,
            clear_xai_key,
            fetch_opportunity_target_page,
            analyze_opportunity_target,
            prep_opportunity_target,
            export_application_pack,
            read_pack_artifact,
            open_pack_artifact,
            list_pack_dir,
            generate_apply_cv,
            get_devprofile_path_cmd,
            set_devprofile_path_cmd,
            get_cv_home_status,
            install_kanithanj_cv,
            get_xai_model_cmd,
            set_xai_model_cmd,
            get_llm_route_status,
            set_llm_route_quality,
            get_fit_mode_cmd,
            set_fit_mode_cmd,
            propose_cv_sidecar_for_prep,
            get_opportunities,
            update_opportunity_status_cmd,
            fetch_hire_board,
            select_hire_board_lead,
            search_platsbanken,
            import_platsbanken_ad,
            delete_opportunity_cmd,
            open_external_url,
            read_heading_snapshot,
            read_cluster_route,
            clear_cluster_route,
            consume_cluster_route,
            run_local_grok_quest,
            get_rank_config,
            save_rank_config,
            list_durable_firms,
            search_mission_firms,
            import_mission_firm_lead,
            inspect_mission_firm_lead,
            load_network_graph,
            resolve_network_x_profiles,
            enrich_network_linkedin,
            search_x_recent,
            run_finder_cycle_cmd,
            get_reactor_state,
            promote_lead,
            get_search_history,
            get_search_run,
            get_leads,
            get_dashboard_stats,
            get_recent_pauses,
            get_events,
            search_past_tweets,
            hydrate_tweet,
            log_event,
            persist_quest_turn,
            load_latest_quest_thread,
            load_quest_thread,
            list_quest_threads,
            search_quest_turns,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod open_route_tests {
    use super::parse_open_route;

    #[test]
    fn trims_heading() {
        assert_eq!(parse_open_route("heading\n").as_deref(), Some("heading"));
    }

    #[test]
    fn empty_is_none() {
        assert_eq!(parse_open_route("  \n"), None);
    }
}
