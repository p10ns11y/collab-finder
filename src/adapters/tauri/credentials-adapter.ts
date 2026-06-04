import type { CredentialsPort } from '../../ports/credentials-port'
import { map } from '../../core/result'
import { safeInvoke } from './safe-invoke'

export function createTauriCredentialsPort(): CredentialsPort {
  return {
    hasStored: () => safeInvoke<boolean>('has_x_bearer'),
    save: async (token) => {
      const result = await safeInvoke<void>('set_x_bearer', { token })
      return map(result, () => undefined)
    },
    clear: () => safeInvoke<void>('clear_x_bearer'),
  }
}

/** Bridge port (Result) → effect layer (throws via Promise rejection avoided). */
export function credentialsPortForEffects(port: CredentialsPort) {
  return {
    async hasStored() {
      const result = await port.hasStored()
      if (!result.ok) throw result.error
      return result.value
    },
    async save(token: string) {
      const result = await port.save(token)
      if (!result.ok) throw result.error
    },
    async clear() {
      const result = await port.clear()
      if (!result.ok) throw result.error
    },
  }
}