import { safeInvoke } from './safe-invoke'
import { applyScreenHash } from '../../core/domain/finder-nav'

export type HeadingSnapshot = {
  mapJson: string
  contacts: string
  waybar: string
}

/** Cluster `mm-waybar open` asked for Heading; opp hydrate must not steal Discover. */
let clusterHeadingHold = false

export function isClusterHeadingHold(): boolean {
  return clusterHeadingHold
}

export function releaseClusterHeadingHold(): void {
  clusterHeadingHold = false
}

export function readHeadingSnapshot() {
  return safeInvoke<HeadingSnapshot>('read_heading_snapshot', {})
}

export function readClusterRoute() {
  return safeInvoke<string | null>('read_cluster_route', {})
}

export function clearClusterRoute() {
  return safeInvoke<void>('clear_cluster_route', {})
}

/** @deprecated peek+delete — use readClusterRoute + clearClusterRoute */
export function consumeClusterRoute() {
  return safeInvoke<string | null>('consume_cluster_route', {})
}

function applyHeading(
  dispatch: (msg: { type: 'ScreenChanged'; screen: 'heading' }) => void,
): true {
  clusterHeadingHold = true
  applyScreenHash('heading')
  dispatch({ type: 'ScreenChanged', screen: 'heading' })
  return true
}

export function headingBootFromCluster(
  dispatch: (msg: { type: 'ScreenChanged'; screen: 'heading' }) => void,
): Promise<boolean> {
  return readClusterRoute().then((routeResult) => {
    if (routeResult.ok && routeResult.value === 'heading') {
      return applyHeading(dispatch)
    }
    if (routeResult.ok) {
      return false
    }
    // Old binaries only expose consume (peek+delete).
    return consumeClusterRoute().then((legacy) => {
      if (legacy.ok && legacy.value === 'heading') {
        return applyHeading(dispatch)
      }
      return false
    })
  })
}

function isTauriShell(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

/** Focus + poll: already-running CF never sees AppStarted again after waybar click. */
export function watchClusterRoute(
  dispatch: (msg: { type: 'ScreenChanged'; screen: 'heading' }) => void,
): () => void {
  if (!isTauriShell()) {
    return () => {}
  }
  const onFocus = () => {
    void headingBootFromCluster(dispatch)
  }
  window.addEventListener('focus', onFocus)
  const intervalId = window.setInterval(onFocus, 400)
  return () => {
    window.removeEventListener('focus', onFocus)
    window.clearInterval(intervalId)
  }
}
