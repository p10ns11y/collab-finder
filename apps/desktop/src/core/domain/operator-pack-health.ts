/** Operator identity pack health — mirrors `get_operator_pack_status` IPC shape. */

export type OperatorPackHealth = 'healthy' | 'degraded' | 'stub' | 'missing'

export type PackFileKind = 'ok' | 'missing' | 'unreadable' | 'stub' | 'invalid'

export type PackFileStatus = {
  name: string
  present: boolean
  readable: boolean
  size_bytes: number | null
  modified_secs: number | null
  kind: PackFileKind
  detail: string | null
  critical: boolean
}

export type OperatorPackStatus = {
  packs_dir: string
  dir_present: boolean
  dir_readable: boolean
  health: OperatorPackHealth
  seeded: boolean
  seed_hint: string
  fix_hint: string | null
  files: PackFileStatus[]
  extra_files: string[]
}

export function packHealthLabel(health: OperatorPackHealth): string {
  switch (health) {
    case 'healthy':
      return 'Seeded'
    case 'degraded':
      return 'Degraded'
    case 'stub':
      return 'Stub identity'
    case 'missing':
      return 'Missing'
  }
}

export function packHealthTone(health: OperatorPackHealth): 'success' | 'warning' | 'danger' | 'neutral' {
  switch (health) {
    case 'healthy':
      return 'success'
    case 'degraded':
      return 'warning'
    case 'stub':
    case 'missing':
      return 'danger'
  }
}

export function packFileKindLabel(kind: PackFileKind): string {
  switch (kind) {
    case 'ok':
      return 'ok'
    case 'missing':
      return 'missing'
    case 'unreadable':
      return 'unreadable'
    case 'stub':
      return 'stub'
    case 'invalid':
      return 'invalid'
  }
}

export function packFileKindTone(kind: PackFileKind): 'success' | 'warning' | 'danger' | 'neutral' {
  switch (kind) {
    case 'ok':
      return 'success'
    case 'missing':
      return 'neutral'
    case 'stub':
    case 'invalid':
    case 'unreadable':
      return 'danger'
  }
}

export function formatPackBytes(bytes: number | null): string {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function formatPackMtime(secs: number | null): string {
  if (secs == null) return '—'
  return new Date(secs * 1000).toLocaleString()
}
