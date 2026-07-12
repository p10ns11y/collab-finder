import * as React from 'react'
import { Check, Copy, ExternalLink } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import type {
  OpportunityTargetResult,
  OpportunityTargetFit,
  OpportunityTargetPrep,
} from '../../core/domain/opportunity-target'
import { shouldShowRestoredCvWarning } from '../../core/domain/opportunity-target-ipc'
import { displayOpportunityUrl, normalizeOpportunityUrl } from '../../core/domain/opportunity-url'
import {
  normalizePipelineStatus,
  pipelineStatusLabel,
  type PipelineStatus,
} from '../../core/domain/opportunity-pipeline'
import { safeInvoke } from '../../adapters/tauri/safe-invoke'

type Props = {
  result: OpportunityTargetResult | null
  error: string | null
  busy: boolean
  sourceUrl?: string
  pipelineStatus?: string
  onClear?: () => void
  onPrepRequested?: (opportunityId?: number) => void
  onProposeSidecar?: (opportunityId?: number) => void
  onStatusChange?: (id: number, status: PipelineStatus) => void
  lastSidecarProposal?: { preview: string; sidecar_path: string }
}

function PrepSection({
  title,
  children,
  copyText,
}: {
  title: string
  children: React.ReactNode
  copyText?: string
}) {
  const [copied, setCopied] = React.useState(false)
  return (
    <div className="rounded-md border border-border-subtle/80 bg-surface-2/40">
      <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 border-b border-border-subtle/60">
        <div className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">{title}</div>
        {copyText ? (
          <button
            type="button"
            className="inline-flex items-center gap-1 text-[10px] text-ink-muted hover:text-accent"
            onClick={() => {
              navigator.clipboard?.writeText(copyText).then(() => {
                setCopied(true)
                window.setTimeout(() => setCopied(false), 1000)
              }).catch(() => {})
            }}
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        ) : null}
      </div>
      <div className="p-2.5 text-xs text-ink-muted leading-relaxed">{children}</div>
    </div>
  )
}

export function OpportunityTargetFitPanel({
  result,
  error,
  busy,
  sourceUrl,
  pipelineStatus,
  onClear,
  onPrepRequested,
  onProposeSidecar,
  onStatusChange,
  lastSidecarProposal,
}: Props) {
  const [modelLabel, setModelLabel] = React.useState('grok-4.5')
  const [actionCopied, setActionCopied] = React.useState(false)
  const [allCopied, setAllCopied] = React.useState(false)
  const [showGrounding, setShowGrounding] = React.useState(false)

  React.useEffect(() => {
    safeInvoke<string>('get_xai_model_cmd', {})
      .then((r) => {
        if (r.ok && r.value) setModelLabel(r.value)
      })
      .catch(() => {})
  }, [])

  if (busy) {
    return (
      <Card className="border-border-subtle">
        <CardHeader>
          <CardTitle className="text-sm">Working with {modelLabel}…</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-4 w-2/3 animate-pulse bg-surface-2 rounded" />
          <div className="mt-2 h-3 w-full animate-pulse bg-surface-2 rounded" />
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className="border-danger/30 bg-danger/5">
        <CardHeader>
          <CardTitle className="text-sm text-danger">Target analysis failed</CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-ink-muted">{error}</CardContent>
      </Card>
    )
  }

  if (!result) return null
  const fit: OpportunityTargetFit | undefined = 'fit' in result ? result.fit : undefined
  const prep: OpportunityTargetPrep | undefined = 'prep' in result ? result.prep : undefined
  if (!fit && !prep) return null

  const score = fit?.overall ?? 0
  const candidateToRole = fit?.candidate_to_role
  const roleToCandidate = fit?.role_to_candidate
  const tone = score >= 75 ? 'success' : score >= 55 ? 'accent' : 'warning'
  const opportunityId = 'opportunity_id' in result ? result.opportunity_id : undefined
  const estCost = 'est_cost_usd' in result ? result.est_cost_usd : undefined
  const packetPreview = 'packet_preview' in result ? result.packet_preview : undefined
  const cvCharsSent = 'cv_chars_sent' in result ? result.cv_chars_sent : undefined
  const cvIpcChars = 'cv_ipc_chars' in result ? result.cv_ipc_chars : undefined
  const cvUsedFallback = 'cv_used_fallback' in result ? result.cv_used_fallback : undefined
  const previewTruncated =
    'packet_preview_truncated' in result ? result.packet_preview_truncated : undefined
  const promptTokens = 'prompt_tokens' in result ? result.prompt_tokens : undefined
  const proofVariantId =
    ('proof_variant_id' in result && (result as { proof_variant_id?: string }).proof_variant_id) ||
    prep?.proof_variant_id
  const isRestoredHydrate =
    result && 'cv_chars_sent' in result
      ? shouldShowRestoredCvWarning(result as any)
      : cvCharsSent === 0 &&
        cvIpcChars === 0 &&
        !cvUsedFallback &&
        (estCost === 0 || estCost === undefined)

  const externalHref = normalizeOpportunityUrl(sourceUrl)
  const externalLabel = displayOpportunityUrl(sourceUrl, 64)
  const statusNorm = normalizePipelineStatus(pipelineStatus)
  const dealBreakers = fit?.deal_breakers_triggered ?? []
  const roleConcerns = fit?.role_concerns ?? []

  const prepBlob = prep
    ? [
        prep.cover_letter && `## Cover letter\n\n${prep.cover_letter}`,
        prep.cv_suggestions?.length &&
          `## CV suggestions\n\n${prep.cv_suggestions.map((s) => `- ${s}`).join('\n')}`,
        prep.research_notes && `## Research\n\n${prep.research_notes}`,
        prep.exceptional_work_example &&
          `## Exceptional work example\n\n${prep.exceptional_work_example}`,
        proofVariantId && `## Proof variant\n\n${proofVariantId}`,
      ]
        .filter(Boolean)
        .join('\n\n')
    : ''

  return (
    <Card className="border-border-subtle shadow-glow">
      <CardHeader className="pb-2 sticky top-0 z-10 bg-surface-1/95 backdrop-blur-sm border-b border-border-subtle/40">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-sm flex items-center gap-2 flex-wrap">
            {prep ? 'Fit + prep' : 'Fit analysis'}
            <span className="text-[10px] text-accent font-normal">{modelLabel}</span>
            <Badge tone="neutral" className="text-[10px]">
              {pipelineStatusLabel(statusNorm)}
            </Badge>
          </CardTitle>
          <Badge tone={tone}>{score}/100 mutual</Badge>
        </div>
        <div className="text-[11px] text-ink-faint">
          #{opportunityId ?? '—'}
          {estCost != null ? ` · ~$${estCost.toFixed(4)}` : ''}
          {score >= 75 ? ' · Strong fit' : score >= 55 ? ' · Moderate — review gaps' : ' · Low fit'}
          {candidateToRole != null ? ` · You→role ${candidateToRole}` : ''}
          {roleToCandidate != null ? ` · Role→you ${roleToCandidate}` : ''}
        </div>
        {externalHref ? (
          <a
            href={externalHref}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-1 inline-flex max-w-full items-center gap-1.5 text-xs text-accent hover:underline font-mono break-all"
            title={externalHref}
          >
            <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="truncate">{externalLabel || externalHref}</span>
          </a>
        ) : (
          <div className="mt-1 text-[11px] text-ink-faint">Paste-only target (no source URL).</div>
        )}
        {isRestoredHydrate && (
          <div className="mt-1 text-[11px] text-warning">
            Restored from DB — re-run Evaluate fit to ground on current CV.
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-4 text-sm pt-3">
        {fit?.rationale && (
          <div>
            <div className="text-[11px] uppercase tracking-wide text-ink-faint mb-1">Rationale</div>
            <p className="text-ink-muted leading-relaxed text-[13px]">{fit.rationale}</p>
          </div>
        )}

        {(candidateToRole != null || roleToCandidate != null) && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border border-border-subtle/80 bg-surface-2/30 px-2.5 py-2">
              <div className="text-[11px] uppercase tracking-wide text-ink-faint mb-0.5">
                You → role
              </div>
              <div className="text-sm font-medium text-ink">
                {candidateToRole != null ? `${candidateToRole}/100` : '—'}
              </div>
              <div className="text-[10px] text-ink-faint mt-0.5">Can you do this job?</div>
            </div>
            <div className="rounded-md border border-border-subtle/80 bg-surface-2/30 px-2.5 py-2">
              <div className="text-[11px] uppercase tracking-wide text-ink-faint mb-0.5">
                Role → you
              </div>
              <div className="text-sm font-medium text-ink">
                {roleToCandidate != null ? `${roleToCandidate}/100` : '—'}
              </div>
              <div className="text-[10px] text-ink-faint mt-0.5">Is this right for you?</div>
            </div>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-ink-faint mb-1">
              Must address (you → role)
            </div>
            {fit?.gaps_must && fit.gaps_must.length > 0 ? (
              <ul className="list-disc pl-4 text-xs space-y-0.5 text-ink-muted">
                {fit.gaps_must.map((g, i) => (
                  <li key={i}>{g}</li>
                ))}
              </ul>
            ) : (
              <div className="text-xs text-ink-faint">None flagged</div>
            )}
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-ink-faint mb-1">Nice to have</div>
            {fit?.gaps_nice && fit.gaps_nice.length > 0 ? (
              <ul className="list-disc pl-4 text-xs space-y-0.5 text-ink-muted">
                {fit.gaps_nice.map((g, i) => (
                  <li key={i}>{g}</li>
                ))}
              </ul>
            ) : (
              <div className="text-xs text-ink-faint">None flagged</div>
            )}
          </div>
        </div>

        {(candidateToRole != null ||
          roleToCandidate != null ||
          roleConcerns.length > 0 ||
          dealBreakers.length > 0 ||
          fit?.role_concerns != null ||
          fit?.deal_breakers_triggered != null) && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-ink-faint mb-1">
                Role concerns (role → you)
              </div>
              {roleConcerns.length > 0 ? (
                <ul className="list-disc pl-4 text-xs space-y-0.5 text-ink-muted">
                  {roleConcerns.map((g, i) => (
                    <li key={i}>{g}</li>
                  ))}
                </ul>
              ) : (
                <div className="text-xs text-ink-faint">None flagged</div>
              )}
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-warning mb-1">
                Deal-breakers triggered
              </div>
              {dealBreakers.length > 0 ? (
                <ul className="list-disc pl-4 text-xs space-y-0.5 text-warning">
                  {dealBreakers.map((g, i) => (
                    <li key={i}>{g}</li>
                  ))}
                </ul>
              ) : (
                <div className="text-xs text-ink-faint">None</div>
              )}
            </div>
          </div>
        )}

        {fit?.recommended_action && (
          <div className="pt-1 border-t border-border-subtle">
            <div className="text-[11px] uppercase tracking-wide text-ink-faint mb-1">
              Recommended next step
            </div>
            <p className="text-accent font-medium text-sm leading-relaxed">{fit.recommended_action}</p>
          </div>
        )}

        {prep && (
          <div className="space-y-2 border-t border-border-subtle pt-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[11px] uppercase tracking-wide text-ink-faint">
                Prep pack
                {proofVariantId ? (
                  <span className="ml-2 font-mono normal-case tracking-normal text-accent">
                    {proofVariantId}
                  </span>
                ) : null}
              </div>
              {prepBlob && (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-[10px] text-ink-muted hover:text-accent"
                  onClick={() => {
                    navigator.clipboard?.writeText(prepBlob).then(() => {
                      setAllCopied(true)
                      window.setTimeout(() => setAllCopied(false), 1200)
                    }).catch(() => {})
                  }}
                >
                  {allCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  {allCopied ? 'Copied all' : 'Copy all prep'}
                </button>
              )}
            </div>
            {prep.cover_letter && (
              <PrepSection title="Cover letter" copyText={prep.cover_letter}>
                <pre className="whitespace-pre-wrap font-sans max-h-56 overflow-auto m-0">
                  {prep.cover_letter}
                </pre>
              </PrepSection>
            )}
            {prep.cv_suggestions && prep.cv_suggestions.length > 0 && (
              <PrepSection
                title="CV suggestions"
                copyText={prep.cv_suggestions.map((s) => `- ${s}`).join('\n')}
              >
                <ul className="list-disc pl-4 space-y-0.5">
                  {prep.cv_suggestions.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </PrepSection>
            )}
            {prep.research_notes && (
              <PrepSection title="Research notes" copyText={prep.research_notes}>
                <p className="whitespace-pre-wrap m-0">{prep.research_notes}</p>
              </PrepSection>
            )}
            {prep.exceptional_work_example && (
              <PrepSection title="Exceptional work example" copyText={prep.exceptional_work_example}>
                <p className="whitespace-pre-wrap m-0">{prep.exceptional_work_example}</p>
              </PrepSection>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-1 border-t border-border-subtle">
          {externalHref && (
            <a
              href={externalHref}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 h-8 px-3 text-xs rounded-md border border-border-default bg-surface-3 text-ink hover:bg-surface-elevated"
            >
              <ExternalLink className="h-3 w-3" /> Open URL
            </a>
          )}
          {fit?.recommended_action && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                const text = fit.recommended_action || ''
                if (text) {
                  navigator.clipboard?.writeText(text).then(() => {
                    setActionCopied(true)
                    window.setTimeout(() => setActionCopied(false), 1200)
                  }).catch(() => {})
                }
              }}
            >
              {actionCopied ? 'Copied!' : 'Copy action'}
            </Button>
          )}
          {onPrepRequested && result && (fit?.overall ?? 0) >= 45 && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => onPrepRequested(opportunityId)}
              title={
                estCost != null
                  ? `Prior call ~$${estCost.toFixed(4)}; prep is an additional model call`
                  : 'Generate prep pack (additional model call)'
              }
            >
              {prep ? 'Regenerate prep' : 'Generate prep'}
            </Button>
          )}
          {onProposeSidecar && prep && opportunityId && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onProposeSidecar(opportunityId)}
              title="Propose CV suggestions as sidecar (no master mutation)"
            >
              Propose CV sidecar
            </Button>
          )}
          {onStatusChange && opportunityId != null && opportunityId > 0 && (
            <div className="flex flex-wrap gap-1 items-center">
              {(
                [
                  ['applied', 'Applied'],
                  ['passed', 'Pass'],
                  ['archived', 'Archive'],
                  ['prepped', 'Prepped'],
                ] as const
              ).map(([st, label]) => (
                <Button
                  key={st}
                  variant={statusNorm === st ? 'primary' : 'ghost'}
                  size="sm"
                  className="h-7 px-2 text-[10px]"
                  onClick={() => onStatusChange(opportunityId, st)}
                >
                  {label}
                </Button>
              ))}
            </div>
          )}
          {onClear && (
            <Button variant="ghost" size="sm" onClick={onClear} className="ml-auto">
              Clear
            </Button>
          )}
        </div>

        {lastSidecarProposal && (
          <div className="p-2.5 border border-accent/30 rounded-md text-[11px] bg-surface-1/50">
            <div className="font-medium text-xs">CV sidecar proposed (no master write)</div>
            <pre className="whitespace-pre-wrap mt-1 max-h-28 overflow-auto text-ink-muted text-[11px]">
              {lastSidecarProposal.preview}
            </pre>
            <div className="text-ink-faint mt-1">
              Artifact under app-local cv_proposals/. Apply UI: review path only for now.
            </div>
          </div>
        )}

        {(cvCharsSent !== undefined || packetPreview) && !isRestoredHydrate && (
          <div className="text-[11px]">
            <button
              type="button"
              className="text-ink-faint hover:text-ink"
              onClick={() => setShowGrounding((s) => !s)}
            >
              {showGrounding ? '▾' : '▸'} Technical details
            </button>
            {showGrounding && (
              <div className="mt-1 space-y-1 text-ink-faint font-mono text-[10px]">
                <div>
                  CV: sent={cvCharsSent ?? '—'} · ipc={cvIpcChars ?? 0}
                  {cvUsedFallback ? ' · DEFAULT_FALLBACK' : ''}
                  {previewTruncated ? ' · preview_truncated' : ''}
                  {promptTokens != null ? ` · tokens=${promptTokens}` : ''}
                </div>
                {packetPreview && (
                  <pre className="p-2 bg-surface-2 rounded overflow-auto max-h-36 whitespace-pre-wrap">
                    {packetPreview}
                  </pre>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
