import { KeyRound, Loader2, Trash2 } from 'lucide-react'
import type { BearerStorageStatus } from '../../core/domain/credentials'
import { activeSourceLabel } from '../../core/domain/credentials'
import type { ConnectionFlow } from '../../core/finder/flows'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { CredentialsStorageDetails } from './credentials-storage-details'

type Props = {
  flow: ConnectionFlow
  draft: string
  notice: string | null
  busy: boolean
  storage: BearerStorageStatus | null
  checking: boolean
  onDraftChange: (draft: string) => void
  onSave: () => void
  onClear: () => void
}

export function CredentialsPanel({
  flow,
  draft,
  notice,
  busy,
  storage,
  checking,
  onDraftChange,
  onSave,
  onClear,
}: Props) {
  const connected = flow === 'connected' || flow === 'clearing'
  const isChecking = flow === 'checking' || checking

  const activeLabel = storage ? activeSourceLabel(storage.active_source) : null

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-3.5 w-3.5 text-accent" aria-hidden />
            X connection
          </CardTitle>
          <CardDescription>
            Bearer token is stored in Rust (keyring + file fallback) — never kept in React state
            after save.
          </CardDescription>
        </div>
        <Badge tone={connected ? 'success' : isChecking ? 'neutral' : 'warning'}>
          {isChecking ? 'Checking…' : connected ? 'Connected' : 'Required'}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <CredentialsStorageDetails storage={storage} checking={isChecking} />

        {!connected && !isChecking && (
          <div className="space-y-2">
            <Label htmlFor="x-bearer">App-only bearer token</Label>
            <Input
              id="x-bearer"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="Paste from X Developer Portal → Keys"
              value={draft}
              onChange={(e) => onDraftChange(e.target.value)}
              className="font-mono text-xs"
            />
          </div>
        )}

        {connected && activeLabel && (
          <p className="text-xs text-success">
            Connected — searches use <strong className="font-medium">{activeLabel}</strong>.
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          {!connected && !isChecking && (
            <Button
              variant="primary"
              size="sm"
              onClick={onSave}
              disabled={busy || !draft.trim()}
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
              Save credentials
            </Button>
          )}
          {connected && (
            <Button variant="ghost" size="sm" onClick={onClear} disabled={busy}>
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              )}
              Disconnect
            </Button>
          )}
        </div>
        {notice && <p className="text-xs text-ink-muted">{notice}</p>}
      </CardContent>
    </Card>
  )
}