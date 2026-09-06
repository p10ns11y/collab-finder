//! Mission firms + Platsbanken hunt commands (extracted from lib.rs).

use crate::db;
use crate::mission_firms;
use crate::platsbanken;
use crate::AppDb;
use tauri::State;

#[derive(serde::Serialize)]
pub struct FirmChip {
    pub id: String,
    pub label: String,
}

/// Mission firm registry + config defaults for the frontend chip list.
#[tauri::command]
pub fn list_mission_firm_registry() -> Result<(Vec<FirmChip>, Vec<String>), String> {
    let chips: Vec<FirmChip> = mission_firms::registry_chips()
        .into_iter()
        .map(|(id, label)| FirmChip { id, label })
        .collect();
    let defaults = mission_firms::default_firm_ids();
    Ok((chips, defaults))
}

/// Mission boot / filter — read hull cache only (no network Pull).
#[tauri::command]
pub fn list_cached_mission_leads(
    db: State<'_, AppDb>,
    q: Option<String>,
    firms: Option<Vec<String>>,
    texas_only: Option<bool>,
    terafab_bias: Option<bool>,
    limit: Option<u32>,
) -> Result<Vec<mission_firms::MissionFirmLead>, String> {
    let filter = mission_firms::MissionFirmFilter {
        q,
        firms: firms.unwrap_or_default(),
        texas_only: texas_only.unwrap_or(false),
        terafab_bias: terafab_bias.unwrap_or(true),
        limit: limit.map(|n| n as usize),
        force_refresh: false,
    };
    let mut leads = mission_firms::list_cached_mission_leads(&filter);
    let known: Vec<(String, i64)> =
        db.0.lock()
            .map_err(|e| e.to_string())?
            .get_opportunities(&db::OpportunityFilter {
                limit: Some(500),
                ..Default::default()
            })?
            .into_iter()
            .filter_map(|o| o.source_url.map(|u| (u, o.id)))
            .collect();
    mission_firms::mark_already_in_db(&mut leads, &known);
    Ok(leads)
}

/// Mission firms rail — xAI / SpaceX Greenhouse + Swedish bridge employers (JobTech).
#[tauri::command]
pub async fn search_mission_firms(
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
    let known: Vec<(String, i64)> =
        db.0.lock()
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
pub async fn import_mission_firm_lead(
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
        (title, company, url, jd, format!("gh:{board}:{external_id}"))
    } else if source == "lever" {
        let site = mission_firms::lever_site_for_firm(&firm)
            .ok_or_else(|| format!("unsupported lever firm '{firm}'"))?;
        let (title, _loc, abs, jd) = mission_firms::fetch_lever_job_jd(site, &external_id).await?;
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
        let (title, company, url, jd) =
            mission_firms::resolve_tesla_job_for_import(&external_id, absolute_url.as_deref())?;
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

    let mut opportunity =
        db.0.lock()
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
pub struct MissionInspectResult {
    pub opportunity: db::Opportunity,
    pub profile: crate::firm_durability::ProfileMatch,
}

/// Click a Pull card: fetch JD, store the row, local profile match (no xAI).
#[tauri::command]
pub async fn inspect_mission_firm_lead(
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
    let firm_m = crate::firm_durability::score_for_id(&firm_id).map(|r| r.profile);
    let role = crate::firm_durability::local_role_match(
        opportunity.title.as_deref().unwrap_or(""),
        opportunity.company.as_deref().unwrap_or(""),
        location.as_deref().unwrap_or(""),
        &opportunity.jd_text,
    );
    let profile = crate::firm_durability::blend_match(firm_m.as_ref(), &role);
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
pub async fn search_platsbanken(
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
    let mut leads: Vec<_> = ads.into_iter().map(platsbanken::lead_from_parsed).collect();
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
pub async fn import_platsbanken_ad(
    db: State<'_, AppDb>,
    ad_id: String,
) -> Result<db::Opportunity, String> {
    let ad = platsbanken::fetch_ad(&ad_id).await?;
    let jd = platsbanken::build_jd_text(&ad);
    let notes = format!(
        "platsbanken emergency; favorite_match terms may apply; municipality={}",
        ad.municipality.as_deref().unwrap_or("-")
    );
    let id =
        db.0.lock()
            .map_err(|e| e.to_string())?
            .remember_opportunity(
                "platsbanken",
                Some(&ad.webpage_url),
                Some(&ad.ad_id),
                Some(&ad.headline),
                Some(&ad.employer),
                &jd,
                Some(&notes),
            )?;

    let mut opportunity =
        db.0.lock()
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
