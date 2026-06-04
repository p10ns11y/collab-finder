import type { FinderPort } from '../../ports/finder-port'
import { safeInvoke } from './safe-invoke'

export function createTauriFinderPort(): FinderPort {
  return {
    search: (query, maxResults = 10) =>
      safeInvoke('search_x_recent', { query, maxResults }),
    runCycle: (query, cvSummary) =>
      safeInvoke('run_finder_cycle_cmd', { query, cvSummary }),
    reactorState: () => safeInvoke('get_reactor_state'),
    promote: (leadId = 'latest') => safeInvoke('promote_lead', { leadId }),
  }
}

export function finderPortForEffects(port: FinderPort) {
  return {
    async search(query: string) {
      const result = await port.search(query)
      if (!result.ok) throw result.error
      return result.value
    },
    async runCycle(query: string, cvSummary: string) {
      const result = await port.runCycle(query, cvSummary)
      if (!result.ok) throw result.error
      return result.value
    },
    async reactorState() {
      const result = await port.reactorState()
      if (!result.ok) throw result.error
      return result.value
    },
    async promote(leadId?: string) {
      const result = await port.promote(leadId)
      if (!result.ok) throw result.error
      return result.value
    },
  }
}