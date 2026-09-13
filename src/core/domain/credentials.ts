/** Mirrors `secrets::BearerStorageStatus` from Rust (snake_case serde). */

export type BearerActiveSource = 'keyring' | 'file' | 'env' | 'none'

export type BearerFileStorageInfo = {
  present: boolean
  path: string
  encrypted: boolean
  permissions: string
  why_not_encrypted: string | null
}

export type BearerKeyringStorageInfo = {
  present: boolean
  service: string
  user: string
  reachable: boolean
  error: string | null
}

export type BearerEnvStorageInfo = {
  present: boolean
  /** Env var name only — never the secret value. */
  var_name: string | null
}

export type BearerStorageStatus = {
  connected: boolean
  active_source: BearerActiveSource
  file: BearerFileStorageInfo
  keyring: BearerKeyringStorageInfo
  env: BearerEnvStorageInfo
}

export function activeSourceLabel(source: BearerActiveSource): string {
  switch (source) {
    case 'keyring':
      return 'OS keyring (Secret Service)'
    case 'file':
      return 'Local file fallback'
    case 'env':
      return 'Environment variable'
    default:
      return 'Not stored'
  }
}