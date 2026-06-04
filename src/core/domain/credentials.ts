/** Mirrors `secrets::BearerStorageStatus` from Rust (snake_case serde). */

export type BearerActiveSource = 'keyring' | 'file' | 'none'

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

export type BearerStorageStatus = {
  connected: boolean
  active_source: BearerActiveSource
  file: BearerFileStorageInfo
  keyring: BearerKeyringStorageInfo
}

export function activeSourceLabel(source: BearerActiveSource): string {
  switch (source) {
    case 'keyring':
      return 'OS keyring (Secret Service)'
    case 'file':
      return 'Local file fallback'
    default:
      return 'Not stored'
  }
}