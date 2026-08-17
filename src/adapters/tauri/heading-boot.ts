import { safeInvoke } from './safe-invoke'

export type HeadingSnapshot = {
  mapJson: string
  contacts: string
  waybar: string
}

export function readHeadingSnapshot() {
  return safeInvoke<HeadingSnapshot>('read_heading_snapshot', {})
}

export function consumeClusterRoute() {
  return safeInvoke<string | null>('consume_cluster_route', {})
}

export function headingBootFromCluster(dispatch: (msg: { type: 'ScreenChanged'; screen: 'heading' }) => void) {
  void consumeClusterRoute().then((r) => {
    if (r.ok && r.value === 'heading') {
      dispatch({ type: 'ScreenChanged', screen: 'heading' })
    }
  })
}
