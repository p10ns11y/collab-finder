import { AlertTriangle, FileKey, KeyRound, ShieldCheck } from 'lucide-react'
import {
  activeSourceLabel,
  type BearerStorageStatus,
} from '../../core/domain/credentials'
import { Badge } from '../ui/badge'

type Props = {
  storage: BearerStorageStatus | null
  checking: boolean
}

function Row({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="grid grid-cols-[7rem_1fr] gap-2 text-[11px] leading-snug">
      <span className="text-ink-faint">{label}</span>
      <span className={mono ? 'break-all font-mono text-ink-muted' : 'text-ink-muted'}>
        {value}
      </span>
    </div>
  )
}

export function CredentialsStorageDetails({ storage, checking }: Props) {
  if (checking) {
    return (
      <p className="rounded-lg border border-border-subtle bg-surface-elevated/40 px-3 py-2 text-[11px] text-ink-faint">
        Checking credential storage…
      </p>
    )
  }

  if (!storage) {
    return null
  }

  const usingKeyring = storage.active_source === 'keyring'
  const usingFile = storage.active_source === 'file'
  const activeTone = usingKeyring ? 'success' : usingFile ? 'warning' : 'neutral'

  return (
    <div className="space-y-2 rounded-lg border border-border-subtle bg-surface-elevated/30 px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-ink-muted">Credential storage</span>
        <Badge tone={activeTone}>
          Active: {activeSourceLabel(storage.active_source)}
        </Badge>
      </div>

      <p className="text-[11px] text-ink-faint">
        Searches read the token from Rust only — never from this UI after save. On save, both
        keyring (best-effort) and file fallback are written; the active source is whichever Rust
        loads first (keyring wins when present).
      </p>

      <div className="space-y-1.5 rounded-md border border-border-subtle/80 bg-background/40 px-2.5 py-2">
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-ink-muted">
          {usingKeyring ? (
            <ShieldCheck className="h-3.5 w-3.5 text-success" aria-hidden />
          ) : (
            <KeyRound className="h-3.5 w-3.5 text-ink-faint" aria-hidden />
          )}
          OS keyring
        </div>
        <Row label="Service" value={storage.keyring.service} mono />
        <Row label="User" value={storage.keyring.user} mono />
        <Row
          label="Entry"
          value={
            storage.keyring.present
              ? 'Present (encrypted by Secret Service / Keychain)'
              : storage.keyring.reachable
                ? 'Empty — not used for reads'
                : 'Unavailable'
          }
        />
        <Row
          label="Reachable"
          value={storage.keyring.reachable ? 'Yes' : 'No — using file fallback for reads'}
        />
        {storage.keyring.error && (
          <Row label="Error" value={storage.keyring.error} mono />
        )}
        {!storage.keyring.reachable && (
          <p className="text-[11px] text-ink-faint">
            On Arch/Hyprland: ensure <span className="font-mono">gnome-keyring-daemon</span> runs
            in your session and the login keyring is unlocked (
            <span className="font-mono">gnome-keyring-daemon --unlock</span>). Rebuild the app with{' '}
            <span className="font-mono">sync-secret-service</span> enabled in{' '}
            <span className="font-mono">src-tauri/Cargo.toml</span>.
          </p>
        )}
      </div>

      <div className="space-y-1.5 rounded-md border border-border-subtle/80 bg-background/40 px-2.5 py-2">
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-ink-muted">
          <FileKey className="h-3.5 w-3.5 text-ink-faint" aria-hidden />
          File fallback
        </div>
        <Row
          label="Present"
          value={storage.file.present ? 'Yes (always written on save)' : 'No'}
        />
        {storage.file.path && <Row label="Path" value={storage.file.path} mono />}
        <Row label="Encrypted" value={storage.file.encrypted ? 'Yes' : 'No — plaintext UTF-8'} />
        <Row label="Permissions" value={storage.file.permissions} />
        {storage.file.why_not_encrypted && (
          <p className="flex gap-1.5 text-[11px] text-warning">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            {storage.file.why_not_encrypted}
          </p>
        )}
      </div>
    </div>
  )
}