import * as React from 'react'
import { ExternalLink, BookOpen, FileText } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { ArtifactReader, type ArtifactTreeNode } from './artifact-reader'
import {
  buildEmailApplyDraft,
  type OpportunityTargetResult,
  type OpportunityTargetFit,
  type OpportunityTargetPrep,
} from '../../core/domain/opportunity-target'
import { shouldShowRestoredCvWarning } from '../../core/domain/opportunity-target-ipc'
import { displayOpportunityUrl, normalizeOpportunityUrl } from '../../core/domain/opportunity-url'
import {
  normalizePipelineStatus,
  pipelineStatusLabel,
  type PipelineStatus,
} from '../../core/domain/opportunity-pipeline'
import { safeInvoke } from '../../adapters/tauri/safe-invoke'
import {
  canRequestPrepBundle,
  isRelaxedFitMode,
  parseFitMode,
  type FitMode,
} from '../../core/domain/fit-mode'

type Props = {
  result: OpportunityTargetResult | null
  error: string | null
  busy: boolean
  sourceUrl?: string
  pipelineStatus?: string
  fitMode?: FitMode
  onClear?: () => void
  onPrepRequested?: (opportunityId?: number) => void
  onProposeSidecar?: (opportunityId?: number) => void
  onExportPack?: (opportunityId?: number) => void
  onGenerateApplyCv?: (opportunityId?: number) => void
  onStatusChange?: (id: number, status: PipelineStatus) => void
  lastSidecarProposal?: { preview: string; sidecar_path: string }
  lastApplicationPackExport?: {
    opportunity_id: number
    pack_dir: string
    pack_slug?: string
    company?: string | null
    title?: string | null
    files: string[]
    file_count: number
  }
  lastApplyCv?: {
    opportunity_id: number
    pack_slug: string
    pack_dir: string
    pdf_path: string
    flat_pdf_path?: string | null
    submit_pdf_path?: string | null
  }
  companyName?: string | null
  roleTitle?: string | null
}

export function OpportunityTargetFitPanel({
  result,
  error,
  busy,
  sourceUrl,
  pipelineStatus,
  fitMode: fitModeProp,
  onClear,
  onPrepRequested,
  onProposeSidecar,
  onExportPack,
  onGenerateApplyCv,
  onStatusChange,
  lastSidecarProposal,
  lastApplicationPackExport,
  lastApplyCv,
  companyName,
  roleTitle,
}: Props) {
  const [modelLabel, setModelLabel] = React.useState('grok-4.6')
  const [showMore, setShowMore] = React.useState(false)
  const [readerOpen, setReaderOpen] = React.useState(false)
  const [readerFocus, setReaderFocus] = React.useState<string | null>(null)
  const [listedPack, setListedPack] = React.useState<
    { name: string; path: string; kind: string }[]
  >([])

  React.useEffect(() => {
    safeInvoke<string>('get_xai_model_cmd', {})
      .then((r) => {
        if (r.ok && r.value) setModelLabel(r.value)
      })
      .catch(() => {})
  }, [])

  React.useEffect(() => {
    const dir = lastApplicationPackExport?.pack_dir || lastApplyCv?.pack_dir
    if (!dir) {
      setListedPack([])
      return
    }
    void safeInvoke<{ name: string; path: string; kind: string }[]>('list_pack_dir', { dir }).then(
      (res) => {
        if (res.ok) setListedPack(res.value)
        else setListedPack([])
      },
    )
  }, [lastApplicationPackExport?.pack_dir, lastApplyCv?.pack_dir])

  const artifactNodes = React.useMemo((): ArtifactTreeNode[] => {
    const nodes: ArtifactTreeNode[] = []
    const prepObj = result && 'prep' in result ? result.prep : undefined
    const company = companyName || lastApplicationPackExport?.company || ''
    const title = roleTitle || lastApplicationPackExport?.title || ''
    if (lastApplyCv?.pdf_path) {
      nodes.push({
        id: 'pdf-primary',
        label: lastApplyCv.pdf_path.split('/').pop() || 'apply.pdf',
        group: 'CV PDF',
        path: lastApplyCv.pdf_path,
      })
    }
    if (lastApplyCv?.flat_pdf_path) {
      nodes.push({
        id: 'pdf-flat',
        label: lastApplyCv.flat_pdf_path.split('/').pop() || 'flat.pdf',
        group: 'CV PDF',
        path: lastApplyCv.flat_pdf_path,
      })
    }
    if (lastApplyCv?.submit_pdf_path) {
      nodes.push({
        id: 'pdf-submit',
        label: lastApplyCv.submit_pdf_path.split('/').pop() || 'submit.pdf',
        group: 'CV PDF',
        path: lastApplyCv.submit_pdf_path,
      })
    }
    const emailDraft =
      prepObj?.email_draft?.trim() ||
      (prepObj?.cover_letter
        ? buildEmailApplyDraft(prepObj.cover_letter, company, title)
        : '')
    if (emailDraft) {
      nodes.push({
        id: 'prep-email',
        label: 'email-draft.md',
        group: 'Email',
        text: emailDraft,
      })
    }
    if (prepObj?.cover_letter) {
      nodes.push({
        id: 'prep-cover',
        label: 'cover-letter.md',
        group: 'Prep',
        text: prepObj.cover_letter,
      })
    }
    if (prepObj?.research_notes) {
      nodes.push({
        id: 'prep-research',
        label: 'research-notes.md',
        group: 'Prep',
        text: prepObj.research_notes,
      })
    }
    if (prepObj?.exceptional_work_example) {
      nodes.push({
        id: 'prep-ew',
        label: 'exceptional-work.md',
        group: 'Prep',
        text: prepObj.exceptional_work_example,
      })
    }
    if (prepObj?.cv_suggestions?.length) {
      nodes.push({
        id: 'prep-suggestions',
        label: 'cv-suggestions.md',
        group: 'Prep',
        text: prepObj.cv_suggestions.map((s) => `- ${s}`).join('\n'),
      })
    }
    const seenPdfPaths = new Set(
      nodes.filter((n) => n.group === 'CV PDF' && n.path).map((n) => n.path as string),
    )
    const seenLabels = new Set(nodes.map((n) => n.label.toLowerCase()))
    const packDir = lastApplicationPackExport?.pack_dir
    if (listedPack.length > 0) {
      for (const item of listedPack) {
        const isPdf = item.kind === 'pdf' || item.name.toLowerCase().endsWith('.pdf')
        const baseName = item.name.split('/').pop()?.toLowerCase() || item.name.toLowerCase()
        if (isPdf) {
          if (seenPdfPaths.has(item.path)) continue
          seenPdfPaths.add(item.path)
          nodes.push({
            id: `pdf-pack-${item.path}`,
            label: item.name,
            group: 'PDF',
            path: item.path,
          })
          continue
        }
        if (seenLabels.has(baseName)) continue
        seenLabels.add(baseName)
        nodes.push({
          id: `pack-${item.path}`,
          label: item.name,
          group: 'Pack',
          path: item.path,
        })
      }
    } else if (packDir && lastApplicationPackExport?.files) {
      for (const fileName of lastApplicationPackExport.files) {
        const isPdf = fileName.toLowerCase().endsWith('.pdf')
        nodes.push({
          id: isPdf ? `pdf-pack-${fileName}` : `pack-${fileName}`,
          label: fileName,
          group: isPdf ? 'CV PDF' : 'Pack',
          path: `${packDir.replace(/\/$/, '')}/${fileName}`,
        })
      }
    }
    return nodes
  }, [result, listedPack, lastApplicationPackExport, lastApplyCv, companyName, roleTitle])

  const pdfNode = artifactNodes.find(
    (node) => node.group === 'CV PDF' || node.group === 'PDF' || node.label.toLowerCase().endsWith('.pdf'),
  )

  const openWorkspace = React.useCallback(
    (focusId?: string) => {
      const fallback = pdfNode?.id ?? artifactNodes[0]?.id ?? null
      setReaderFocus(focusId ?? fallback)
      setReaderOpen(true)
    },
    [artifactNodes, pdfNode],
  )

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
          <CardTitle className="text-sm text-danger">Target step failed</CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-ink-muted">{error}</CardContent>
      </Card>
    )
  }

  if (!result) return null
  const fit: OpportunityTargetFit | undefined = 'fit' in result ? result.fit : undefined
  const prep: OpportunityTargetPrep | undefined = 'prep' in result ? result.prep : undefined
  if (!fit && !prep) return null

  const resultMode =
    'fit_mode' in result && typeof (result as { fit_mode?: string }).fit_mode === 'string'
      ? (result as { fit_mode?: string }).fit_mode
      : undefined
  const activeMode = parseFitMode(resultMode ?? fitModeProp)
  const relaxed = isRelaxedFitMode(activeMode)

  const score = fit?.overall ?? 0
  const candidateToRole = fit?.candidate_to_role
  const roleToCandidate = fit?.role_to_candidate
  const tone = score >= 75 ? 'success' : score >= 55 ? 'accent' : 'warning'
  const showDualFit = !relaxed && (candidateToRole != null || roleToCandidate != null)
  const canPrep = canRequestPrepBundle({
    fitMode: activeMode,
    overall: fit?.overall,
    candidateToRole: fit?.candidate_to_role,
  })
  const opportunityId = 'opportunity_id' in result ? result.opportunity_id : undefined
  const estCost = 'est_cost_usd' in result ? result.est_cost_usd : undefined
  const packetPreview = 'packet_preview' in result ? result.packet_preview : undefined
  const cvCharsSent = 'cv_chars_sent' in result ? result.cv_chars_sent : undefined
  const cvIpcChars = 'cv_ipc_chars' in result ? result.cv_ipc_chars : undefined
  const cvUsedFallback = 'cv_used_fallback' in result ? result.cv_used_fallback : undefined
  const previewTruncated =
    'packet_preview_truncated' in result ? result.packet_preview_truncated : undefined
  const promptTokens = 'prompt_tokens' in result ? result.prompt_tokens : undefined
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
  const coverExcerpt = prep?.cover_letter?.trim() ?? ''
  const hasMustGaps = Boolean(fit?.gaps_must?.length)
  const hasNiceGaps = Boolean(fit?.gaps_nice?.length)

  return (
    <Card className="border-border-subtle">
      <CardHeader className="px-6 pt-6 pb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <CardTitle className="text-[15px] font-semibold tracking-tight">
              {roleTitle || companyName
                ? [roleTitle, companyName].filter(Boolean).join(' · ')
                : prep
                  ? 'Prepared'
                  : 'Fit'}
            </CardTitle>
            <p className="text-[13px] text-ink-faint">
              #{opportunityId ?? '—'}
              {relaxed ? ' · relaxed' : ' · strict'}
              {` · ${pipelineStatusLabel(statusNorm).toLowerCase()}`}
              {estCost != null ? ` · ~$${estCost.toFixed(3)}` : ''}
            </p>
          </div>
          <Badge tone={tone} className="shrink-0 normal-case tracking-normal">
            {score}/100
          </Badge>
        </div>
        {externalHref ? (
          <a
            href={externalHref}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-3 inline-flex max-w-full items-center gap-1.5 text-[13px] text-ink-muted hover:text-accent"
            title={externalHref}
          >
            <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="truncate">{externalLabel || externalHref}</span>
          </a>
        ) : null}
        {isRestoredHydrate ? (
          <p className="mt-3 text-[13px] text-warning">Restored from history — re-evaluate to ground on the current CV.</p>
        ) : null}
      </CardHeader>

      <CardContent className="space-y-8 px-6 pb-8 pt-0">
        {fit?.rationale ? (
          <p className="max-w-[65ch] text-[15px] leading-7 text-ink-muted">{fit.rationale}</p>
        ) : null}

        {showDualFit ? (
          <p className="text-[13px] text-ink-faint">
            You → role {candidateToRole ?? '—'}
            <span className="mx-2 text-border-strong">·</span>
            Role → you {roleToCandidate ?? '—'}
          </p>
        ) : null}

        {(hasMustGaps || hasNiceGaps) && (
          <div className="grid max-w-[65ch] gap-6 sm:grid-cols-2">
            {hasMustGaps ? (
              <div>
                <h3 className="mb-2 text-[13px] font-medium text-ink">Gaps</h3>
                <ul className="space-y-1.5 text-[13px] leading-6 text-ink-muted">
                  {fit?.gaps_must?.map((gap) => (
                    <li key={gap}>{gap}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {hasNiceGaps ? (
              <div>
                <h3 className="mb-2 text-[13px] font-medium text-ink">Nice</h3>
                <ul className="space-y-1.5 text-[13px] leading-6 text-ink-muted">
                  {fit?.gaps_nice?.map((gap) => (
                    <li key={gap}>{gap}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )}

        {dealBreakers.length > 0 ? (
          <div>
            <h3 className="mb-2 text-[13px] font-medium text-warning">Deal-breakers</h3>
            <ul className="max-w-[65ch] space-y-1.5 text-[13px] leading-6 text-warning">
              {dealBreakers.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {roleConcerns.length > 0 ? (
          <div>
            <h3 className="mb-2 text-[13px] font-medium text-ink">Role concerns</h3>
            <ul className="max-w-[65ch] space-y-1.5 text-[13px] leading-6 text-ink-muted">
              {roleConcerns.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {fit?.recommended_action ? (
          <p className="max-w-[65ch] text-[15px] leading-7 text-ink">{fit.recommended_action}</p>
        ) : null}

        {coverExcerpt ? (
          <p className="max-w-[65ch] line-clamp-5 text-[15px] leading-7 text-ink-muted">{coverExcerpt}</p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          {!prep && onPrepRequested && canPrep ? (
            <Button variant="primary" size="sm" onClick={() => onPrepRequested(opportunityId)}>
              Prepare
            </Button>
          ) : null}
          {prep && pdfNode ? (
            <Button variant="primary" size="sm" onClick={() => openWorkspace(pdfNode.id)}>
              <FileText className="h-3.5 w-3.5" />
              Open PDF
            </Button>
          ) : null}
          {prep && !pdfNode && onGenerateApplyCv && opportunityId ? (
            <Button variant="primary" size="sm" onClick={() => onGenerateApplyCv(opportunityId)}>
              Generate apply CV
            </Button>
          ) : null}
          {prep && artifactNodes.length > 0 ? (
            <Button variant="secondary" size="sm" onClick={() => openWorkspace()}>
              <BookOpen className="h-3.5 w-3.5" />
              Artifacts
            </Button>
          ) : null}
          {onStatusChange && opportunityId != null && opportunityId > 0 ? (
            <Button
              variant={statusNorm === 'applied' ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => onStatusChange(opportunityId, 'applied')}
            >
              Applied
            </Button>
          ) : null}
        </div>

        <div>
          <button
            type="button"
            className="text-[13px] text-ink-faint hover:text-ink"
            onClick={() => setShowMore((open) => !open)}
          >
            {showMore ? 'Less' : 'More'}
          </button>
          {showMore ? (
            <div className="mt-4 flex flex-col gap-3">
              <div className="flex flex-wrap gap-2">
                {prep && onPrepRequested && canPrep ? (
                  <Button variant="ghost" size="sm" onClick={() => onPrepRequested(opportunityId)}>
                    Regenerate prep
                  </Button>
                ) : null}
                {prep && pdfNode && onGenerateApplyCv && opportunityId ? (
                  <Button variant="ghost" size="sm" onClick={() => onGenerateApplyCv(opportunityId)}>
                    Regenerate PDF
                  </Button>
                ) : null}
                {onProposeSidecar && prep && opportunityId ? (
                  <Button variant="ghost" size="sm" onClick={() => onProposeSidecar(opportunityId)}>
                    Propose sidecar
                  </Button>
                ) : null}
                {onExportPack && prep && opportunityId ? (
                  <Button variant="ghost" size="sm" onClick={() => onExportPack(opportunityId)}>
                    Export pack
                  </Button>
                ) : null}
                {onStatusChange && opportunityId != null && opportunityId > 0
                  ? (
                      [
                        ['passed', 'Pass'],
                        ['archived', 'Archive'],
                        ['prepped', 'Prepped'],
                      ] as const
                    ).map(([status, label]) => (
                      <Button
                        key={status}
                        variant={statusNorm === status ? 'secondary' : 'ghost'}
                        size="sm"
                        onClick={() => onStatusChange(opportunityId, status)}
                      >
                        {label}
                      </Button>
                    ))
                  : null}
                {onClear ? (
                  <Button variant="ghost" size="sm" onClick={onClear}>
                    Clear
                  </Button>
                ) : null}
              </div>
              {lastSidecarProposal ? (
                <p className="max-w-[65ch] text-[13px] leading-6 text-ink-faint">
                  Sidecar written (no master change).
                </p>
              ) : null}
              {(cvCharsSent !== undefined || packetPreview) && !isRestoredHydrate ? (
                <p className="font-mono text-[11px] text-ink-faint">
                  CV sent={cvCharsSent ?? '—'} · ipc={cvIpcChars ?? 0}
                  {cvUsedFallback ? ' · fallback' : ''}
                  {previewTruncated ? ' · truncated' : ''}
                  {promptTokens != null ? ` · tokens=${promptTokens}` : ''}
                  {` · ${modelLabel}`}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </CardContent>
      {readerOpen && artifactNodes.length > 0 ? (
        <ArtifactReader
          key={readerFocus ?? 'workspace'}
          nodes={artifactNodes}
          initialId={readerFocus ?? undefined}
          onClose={() => setReaderOpen(false)}
        />
      ) : null}
    </Card>
  )
}
