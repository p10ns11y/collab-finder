import { KeyRound, Loader2, ShieldCheck, Trash2 } from 'lucide-react'
import type { ConnectionFlow } from '../../core/finder/flows'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Input } from '../ui/input'
import { Label } from '../ui/label'

type Props = {
  flow: ConnectionFlow
  draft: string
  notice: string | null
  busy: boolean
  onDraftChange: (draft: string) => void
  onSave: () => void
  onClear: () => void
}

export function CredentialsPanel({
  flow,
  draft,
  notice,
  busy,
  onDraftChange,
  onSave,
  onClear,
}: Props) {
  const connected = flow === 'connected' || flow === 'clearing'
  const checking = flow === 'checking'

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-3.5 w-3.5 text-accent" aria-hidden />
            X connection
          </CardTitle>
          <CardDescription>
            Bearer token lives in the OS keychain only — never in React memory after save.
          </CardDescription>
        </div>
        <Badge tone={connected ? 'success' : checking ? 'neutral' : 'warning'}>
          {checking ? 'Checking…' : connected ? 'Connected' : 'Required'}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        {!connected && !checking && (
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
        {connected && (
          <div className="flex items-center gap-2 rounded-lg border border-success/20 bg-success/5 px-3 py-2 text-xs text-success">
            <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden />
            Keychain active — searches use Rust-side credentials.
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {!connected && !checking && (
            <Button
              variant="primary"
              size="sm"
              onClick={onSave}
              disabled={busy || !draft.trim()}
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
              Save to keychain
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