/** Browser / web-preview helpers. No @tauri-apps import — safe to load in Node tests. */

export const DESKTOP_APP_NEEDED = 'This needs the kanithanj.ai desktop app.'

/** True only inside the Tauri webview, where invoke is available. */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

function emptyStats() {
  return {
    total_searches: 0,
    total_unique_leads: 0,
    total_surfaces: 0,
    total_pauses: 0,
    top_queries: [] as string[],
  }
}

function emptyHeadingSnapshot() {
  return {
    mapJson: '',
    contacts: '',
    waybar: '',
    syncedAt: null as string | null,
    syncError: null as string | null,
  }
}

type PreviewOk<T> = { ok: true; value: T }
type PreviewErr = { ok: false; error: { code: 'unknown'; message: string } }
export type PreviewResult<T> = PreviewOk<T> | PreviewErr

/**
 * Browser / web-preview fallback. List reads resolve to empty data so boot
 * does not raise an error banner. Other commands get a clear desktop-app message.
 * Never talks to a local engine.
 */
export function webPreviewResult<T>(command: string): PreviewResult<T> {
  switch (command) {
    case 'get_search_history':
    case 'get_leads':
    case 'get_recent_pauses':
    case 'get_events':
    case 'get_opportunities':
    case 'get_pipeline_opportunities':
    case 'fetch_hire_board':
    case 'search_platsbanken':
    case 'list_cached_mission_leads':
    case 'search_mission_firms':
    case 'list_pack_dir':
      return { ok: true, value: [] as T }
    case 'get_search_run':
    case 'read_cluster_route':
    case 'get_devprofile_path_cmd':
    case 'get_x_search_catalog':
      return { ok: true, value: null as T }
    case 'get_dashboard_stats':
      return { ok: true, value: emptyStats() as T }
    case 'read_heading_snapshot':
      return { ok: true, value: emptyHeadingSnapshot() as T }
    case 'list_mission_firm_registry':
      return { ok: true, value: [[], []] as T }
    default:
      return { ok: false, error: { code: 'unknown', message: DESKTOP_APP_NEEDED } }
  }
}
