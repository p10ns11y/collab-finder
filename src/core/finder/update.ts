import { idle, type AsyncState } from '../async'
import { appError, errorMessage } from '../error'
import type { Cmd } from '../mvu/engine'
import type { FinderModel } from './model'
import type { FinderMsg } from './msg'
import type { OpportunityTargetResult } from '../domain/opportunity-target'
import { harvestFromHuntLeads, leadsFromSavedOpportunities, mergeHarvested } from '../domain/hunt-rails'
import { parseQuestKind } from '../domain/quest'
import { parseQuestContextIds } from '../domain/quest-context'

export type FinderUpdate = (
  model: FinderModel,
  msg: FinderMsg,
) => readonly [model: FinderModel, cmd?: Cmd<FinderMsg> | Cmd<FinderMsg>[]]

/** Pure transition function — no I/O. */
export function updateFinder(model: FinderModel, msg: FinderMsg): ReturnType<FinderUpdate> {
  switch (msg.type) {
    case 'AppStarted':
      return [model]

    case 'GlobalError':
      return [{ ...model, banner: msg.error }]

    case 'BannerDismissed':
      return [{ ...model, banner: null }]

    case 'PaletteToggled':
      return [{ ...model, paletteOpen: !model.paletteOpen }]

    case 'PaletteClosed':
      return [{ ...model, paletteOpen: false }]
    case 'QuestToggled':
      return [{ ...model, questOpen: !model.questOpen, paletteOpen: false }]
    case 'QuestClosed':
      return [{ ...model, questOpen: false }]
    case 'QuestKindChanged':
      return [{ ...model, questKind: msg.kind }]
    case 'QuestDraftChanged':
      return [{ ...model, questDraft: msg.draft }]
    case 'QuestContextToggled': {
      const on = model.questContextIds.includes(msg.id)
      return [
        {
          ...model,
          questContextIds: on
            ? model.questContextIds.filter((id) => id !== msg.id)
            : [...model.questContextIds, msg.id],
        },
      ]
    }
    case 'QuestRequested': {
      const text = model.questDraft.trim()
      return [
        {
          ...model,
          questSessionId: model.questSessionId || crypto.randomUUID(),
          quest: { status: 'loading' },
          questTurns: text
            ? [...model.questTurns, { role: 'user', text }]
            : model.questTurns,
          banner: null,
        },
      ]
    }
    case 'QuestSucceeded':
      return [
        {
          ...model,
          quest: { status: 'ready', data: msg.result },
          questSessionId: msg.result.session_id || model.questSessionId,
          questDraft: '',
          questTurns: msg.result.answer
            ? [...model.questTurns, { role: 'assistant', text: msg.result.answer }]
            : model.questTurns,
        },
      ]
    case 'QuestFailed':
      return [{ ...model, quest: { status: 'failed', error: msg.error } }]
    case 'QuestThreadCleared':
      return [
        {
          ...model,
          questSessionId: undefined,
          questTurns: [],
          quest: { status: 'idle' },
          questDraft: '',
          questHits: [],
        },
      ]
    case 'QuestThreadHydrated': {
      const turns = msg.thread.turns
        .map((t) => ({
          role: t.role === 'assistant' ? ('assistant' as const) : ('user' as const),
          text: t.text,
        }))
        .filter((t) => t.text.trim().length > 0)
      return [
        {
          ...model,
          questSessionId: msg.thread.session_id,
          questKind: parseQuestKind(msg.thread.kind),
          questContextIds: parseQuestContextIds(msg.thread.context_ids),
          questTurns: turns,
          quest: { status: 'idle' },
          questDraft: '',
        },
      ]
    }
    case 'QuestRecentLoaded':
      return [{ ...model, questRecent: msg.threads }]
    case 'QuestLookupChanged':
      return [{ ...model, questLookupQ: msg.q }]
    case 'QuestSearchLoaded':
      return [{ ...model, questHits: msg.hits }]
    case 'QuestThreadLoadRequested':
    case 'QuestSearchRequested':
      return [model]

    case 'QueryChanged':
      return [{ ...model, query: msg.query }]

    case 'CvSummaryChanged':
      return [{ ...model, cvSummary: msg.cvSummary }]

    case 'CvSummaryLoaded':
      return [{ ...model, cvSummary: msg.cvSummary }]

    case 'OpportunitySelected':
      return [
        {
          ...model,
          lastActiveOppId: msg.id,
          // Set url if provided (from Data row or restore); enables exact "Open URL" + prep re-use with correct source after hydrate.
          ...(msg.url !== undefined ? { opportunityTargetUrl: msg.url } : {}),
          // Mark loading for the hydrate path (succeeded will populate from DB data; no re-xAI).
          opportunityTarget: { status: 'loading' } as AsyncState<OpportunityTargetResult>,
          banner: null,
        },
      ]

    case 'PresetSelected':
      return [{ ...model, query: msg.query }]

    case 'CredentialsChecked':
      return [
        {
          ...model,
          credentials: {
            ...model.credentials,
            connected: msg.storage.connected,
            storage: msg.storage,
            checking: false,
          },
        },
      ]

    case 'CredentialsDraftChanged':
      return [
        {
          ...model,
          credentials: { ...model.credentials, draft: msg.draft, notice: null },
        },
      ]

    case 'CredentialsSaveRequested':
      return [
        {
          ...model,
          credentials: { ...model.credentials, busy: true, notice: null },
          banner: null,
        },
      ]

    case 'CredentialsSaveSucceeded':
      return [
        {
          ...model,
          credentials: {
            ...model.credentials,
            connected: true,
            checking: false,
            draft: '',
            busy: false,
            notice: null,
            storage: msg.storage,
          },
        },
      ]

    case 'CredentialsSaveFailed':
      return [
        {
          ...model,
          credentials: { ...model.credentials, busy: false },
          banner: msg.error,
        },
      ]

    case 'CredentialsClearRequested':
      return [
        {
          ...model,
          credentials: { ...model.credentials, busy: true, notice: null },
        },
      ]

    case 'CredentialsClearSucceeded':
      return [
        {
          ...model,
          credentials: {
            connected: false,
            checking: false,
            draft: '',
            busy: false,
            notice: null,
            storage: msg.storage,
          },
          search: idle(),
        },
      ]

    case 'CredentialsClearFailed':
      return [
        {
          ...model,
          credentials: { ...model.credentials, busy: false },
          banner: msg.error,
        },
      ]

    case 'SearchRequested':
      return [{ ...model, search: { status: 'loading' }, banner: null }]

    case 'SearchSucceeded':
      return [{ ...model, search: { status: 'ready', data: msg.tweets } }]

    case 'SearchFailed':
      return [
        {
          ...model,
          search: { status: 'failed', error: msg.error },
          banner: msg.error,
        },
      ]

    case 'CycleRequested':
      return [{ ...model, cycle: { status: 'loading' }, banner: null }]

    case 'CycleSucceeded': {
      const { decision, tweets } = msg.result
      const pauses =
        decision.guards_triggered.length > 0
          ? [
              ...model.pauses,
              `PAUSED on guards: ${JSON.stringify(decision.guards_triggered)}`,
            ]
          : model.pauses
      const banner =
        decision.guards_triggered.length > 0
          ? {
              code: 'reactor' as const,
              message: `Guards triggered — review before continuing.`,
              cause: JSON.stringify(decision.guards_triggered),
            }
          : model.banner
      return [
        {
          ...model,
          cycle: { status: 'ready', data: decision },
          decision,
          search: tweets.length > 0 ? { status: 'ready', data: tweets } : model.search,
          pauses,
          banner,
        },
      ]
    }

    case 'CycleFailed':
      return [
        {
          ...model,
          cycle: { status: 'failed', error: msg.error },
          banner: msg.error,
        },
      ]

    case 'ReactorRefreshSucceeded':
      return [{ ...model, reactorState: msg.state }]

    case 'ReactorRefreshFailed':
      return [{ ...model, banner: msg.error }]

    case 'PromoteSucceeded':
      return [
        {
          ...model,
          // Prefer a clear banner for the honest audit result (not a fake "confirm" pause).
          banner: null,
          pauses: [
            ...model.pauses,
            `X insights: ${msg.message}`,
          ],
        },
      ]

    case 'PromoteFailed':
      return [{ ...model, banner: msg.error }]

    case 'CvSidecarProposeSucceeded':
      return [
        {
          ...model,
          banner: null,
          lastSidecarProposal: { preview: msg.preview, sidecar_path: msg.sidecar_path },
          pauses: [...model.pauses, `CV sidecar proposed (${msg.suggestions_count} suggestions) — sidecar artifact written (sidecar-first, no master mutation).`],
        },
      ]
    case 'CvSidecarProposeFailed':
      return [{ ...model, banner: msg.error }]

    case 'ApplicationPackExportRequested':
      return [{ ...model, banner: null }]
    case 'ApplicationPackExportSucceeded':
      return [
        {
          ...model,
          banner: null,
          lastApplicationPackExport: {
            opportunity_id: msg.opportunity_id,
            pack_dir: msg.pack_dir,
            pack_slug: msg.pack_slug,
            company: msg.company,
            title: msg.title,
            files: msg.files,
            file_count: msg.file_count,
          },
          pauses: [
            ...model.pauses,
            `Application pack exported (${msg.file_count} files) → ${msg.pack_slug || msg.pack_dir}`,
          ],
        },
      ]
    case 'ApplicationPackExportFailed':
      return [{ ...model, banner: msg.error }]

    case 'GenerateApplyCvRequested':
      return [{ ...model, banner: null }]
    case 'GenerateApplyCvSucceeded': {
      const exportFiles = msg.export_files ?? model.lastApplicationPackExport?.files ?? []
      const exportCount =
        msg.export_file_count ??
        (exportFiles.length > 0 ? exportFiles.length : model.lastApplicationPackExport?.file_count ?? 0)
      return [
        {
          ...model,
          banner: null,
          lastApplyCv: {
            opportunity_id: msg.opportunity_id,
            pack_slug: msg.pack_slug,
            pack_dir: msg.pack_dir,
            pdf_path: msg.pdf_path,
            flat_pdf_path: msg.flat_pdf_path,
            submit_pdf_path: msg.submit_pdf_path,
          },
          lastApplicationPackExport: {
            opportunity_id: msg.opportunity_id,
            pack_dir: msg.pack_dir,
            pack_slug: msg.pack_slug,
            company: model.lastApplicationPackExport?.company ?? null,
            title: model.lastApplicationPackExport?.title ?? null,
            files: exportFiles,
            file_count: exportCount,
          },
          pauses: [
            ...model.pauses,
            `Apply CV: pack ${msg.pack_slug || 'ok'} (${exportCount} files) → PDF ${msg.pdf_path}`,
          ],
        },
      ]
    }
    case 'GenerateApplyCvFailed':
      return [{ ...model, banner: msg.error }]

    case 'OpportunityStatusChangeRequested':
      return [{ ...model, banner: null }]
    case 'OpportunityStatusChangeSucceeded': {
      // Optimistic patch of opportunities list so rail updates before history refresh returns.
      const h = { ...model.history }
      if (h.opportunities.status === 'ready' && Array.isArray(h.opportunities.data)) {
        h.opportunities = {
          status: 'ready',
          data: h.opportunities.data.map((o) =>
            o.id === msg.id ? { ...o, status: msg.status } : o,
          ),
        }
      }
      return [{ ...model, history: h, banner: null }]
    }
    case 'OpportunityStatusChangeFailed':
      return [{ ...model, banner: msg.error }]

    case 'HistoryRefreshRequested':
      // Do NOT blank all slices to loading (old behavior caused History + Data to appear empty
      // immediately after evaluate/prep/search/cycle until a full AppStarted refresh or manual re-open).
      // The background historyRefreshCmd will emit incremental HistoryRefreshed as each slice arrives.
      // Previous ready data (if any) remains visible in selectors + screens during the refresh window.
      // This directly addresses the post-evaluate "History/Data show empty (data not lost on restart)" symptom
      // and the related fan-out race noted in tech-debt-deep-dive TD-009 + UX reviews.
      return [
        {
          ...model,
          banner: null,
        },
      ]

    case 'HistoryRefreshed': {
      const h = { ...model.history }
      if (msg.searches) h.searches = { status: 'ready', data: msg.searches }
      if (msg.leads) h.leads = { status: 'ready', data: msg.leads }
      if (msg.pauses) h.pauses = { status: 'ready', data: msg.pauses }
      if (msg.events) h.events = { status: 'ready', data: msg.events }
      if (msg.stats) h.stats = { status: 'ready', data: msg.stats }
      if (msg.opportunities) h.opportunities = { status: 'ready', data: msg.opportunities }
      h.lastRefreshed = Date.now()
      const next = { ...model, history: h }
      if (msg.opportunities && model.platsbanken.status === 'idle') {
        const saved = leadsFromSavedOpportunities(msg.opportunities)
        if (saved.length > 0) {
          return [{ ...next, platsbanken: { status: 'ready', data: saved } }]
        }
      }
      return [next]
    }

    case 'HistoryFailed':
      return [
        {
          ...model,
          history: {
            ...model.history,
            searches: { status: 'failed', error: msg.error },
            leads: { status: 'failed', error: msg.error },
            pauses: { status: 'failed', error: msg.error },
            events: { status: 'failed', error: msg.error },
            stats: { status: 'failed', error: msg.error },
            opportunities: { status: 'failed', error: msg.error },
          },
          banner: msg.error,
        },
      ]

    case 'PersistFailed':
      return [
        {
          ...model,
          banner: appError('persist', msg.message),
        },
      ]

    case 'UiEventLogged':
      // Pure UI intent logged via backend (no model change needed).
      return [model]

    case 'ScreenChanged': {
      const next = { ...model, activeScreen: msg.screen }
      if (
        msg.screen === 'sweden' &&
        model.platsbanken.status === 'idle' &&
        model.history.opportunities.status === 'ready'
      ) {
        const saved = leadsFromSavedOpportunities(model.history.opportunities.data)
        if (saved.length > 0) {
          return [{ ...next, platsbanken: { status: 'ready', data: saved } }]
        }
      }
      return [next]
    }

    case 'LookupQueryChanged':
      return [{ ...model, lookupQuery: msg.query }]

    case 'LookupRequested':
      return [{ ...model, lookup: { status: 'loading' }, banner: null }]

    case 'LookupSucceeded':
      return [{ ...model, lookup: { status: 'ready', data: msg.tweets } }]

    case 'LookupFailed':
      return [
        {
          ...model,
          lookup: { status: 'failed', error: msg.error },
          banner: msg.error,
        },
      ]

    case 'SearchRunSelected':
      return [
        {
          ...model,
          selectedRunId: msg.id,
          selectedRun: { status: 'loading' },
          hydrate: idle(),
        },
      ]

    case 'SearchRunLoaded':
      return [{ ...model, selectedRun: { status: 'ready', data: msg.run } }]

    case 'SearchRunLoadFailed':
      return [
        {
          ...model,
          selectedRun: { status: 'failed', error: msg.error },
          banner: msg.error,
        },
      ]

    case 'HydrateRequested':
      return [{ ...model, hydrate: { status: 'loading' } }]

    case 'HydrateSucceeded':
      return [{ ...model, hydrate: { status: 'ready', data: msg.tweet } }]

    case 'HydrateFailed':
      return [
        {
          ...model,
          hydrate: { status: 'failed', error: msg.error },
          banner: msg.error,
        },
      ]

    case 'LookupCleared':
      return [{ ...model, lookup: idle(), lookupQuery: '', selectedRunId: null, selectedRun: idle(), hydrate: idle() }]

    case 'HydrateCleared':
      return [{ ...model, hydrate: idle() }]

    // Opportunity target MVU (no raw invoke in views)
    case 'OpportunityTargetAnalyzeRequested':
      return [
        {
          ...model,
          opportunityTarget: { status: 'loading' },
          opportunityTargetUrl: msg.url,
          opportunityTargetPastedJd: msg.pasted_jd,
          banner: null,
        },
      ]
    case 'OpportunityTargetAnalyzeSucceeded':
      return [
        {
          ...model,
          opportunityTarget: { status: 'ready', data: msg.result },
          lastActiveOppId: msg.result.opportunity_id,
        },
      ]
    case 'OpportunityTargetAnalyzeFailed':
      return [
        {
          ...model,
          opportunityTarget: { status: 'failed', error: msg.error },
          banner: msg.error,
        },
      ]
    case 'OpportunityTargetCleared':
      return [
        {
          ...model,
          opportunityTarget: idle(),
          opportunityTargetUrl: undefined,
          opportunityTargetPastedJd: undefined,
          lastSidecarProposal: undefined,
          lastApplicationPackExport: undefined,
          lastApplyCv: undefined,
        },
      ]

    case 'OpportunityTargetUrlSet':
      // Pure setter (no I/O effect) used by restore/load paths to sync the display url (for panel "Open" button + prep dispatch) without triggering analyze.
      return [{ ...model, opportunityTargetUrl: msg.url }]

    case 'OpportunityTargetJdSet':
      // Hydrate from DB: never wipe a paste the user already typed this session.
      return [
        {
          ...model,
          opportunityTargetPastedJd:
            msg.pasted_jd && msg.pasted_jd.trim()
              ? msg.pasted_jd
              : model.opportunityTargetPastedJd,
        },
      ]

    case 'OpportunityTargetPastedJdChanged':
      return [{ ...model, opportunityTargetPastedJd: msg.pasted_jd }]

    // Opportunity target prep (Slice C)
    case 'OpportunityTargetPrepRequested':
      // Preserve previous ready data (the fit analysis) on the loading state.
      // The AsyncState<'loading'> type doesn't declare .data, but we carry it
      // here so the Succeeded reducer below can merge the prep artifacts
      // without losing the original fit/score (the root cause of the 0/100 low fit
      // bug after clicking the prep CTA in the panel).
      // (Cheap carry hack preserved per design; no new state machinery or model fields added.)
      // Only pull from 'ready' here (a 'loading' carry from a concurrent/prior prep request would be stale anyway; the effects previous_fit path handles the transient loading+data case).
      const prevForPrep: OpportunityTargetResult | undefined = (model.opportunityTarget && model.opportunityTarget.status === 'ready')
        ? model.opportunityTarget.data
        : undefined
      return [
        {
          ...model,
          // SAFETY: intentional structural escape to carry .data on the loading arm (AsyncState<loading> has no data per async.ts:6-8); see design PR2 "cheap carry hack preserved (no new state machinery)", TD-006 + prior 0/100 prep bug. NOT `as any`; downstream uses 'in' guards + union.
          opportunityTarget: { status: 'loading', data: prevForPrep } as AsyncState<OpportunityTargetResult>,
          banner: null,
        },
      ]
    case 'OpportunityTargetPrepSucceeded':
      // Merge prep artifacts into the previous data (carried through the loading
      // state) so the original fit analysis remains visible alongside the prep pack.
      const prevData: OpportunityTargetResult | undefined =
        model.opportunityTarget &&
        (model.opportunityTarget.status === 'ready' || model.opportunityTarget.status === 'loading') &&
        'data' in model.opportunityTarget
          ? (model.opportunityTarget as { data?: OpportunityTargetResult }).data
          : undefined
      // SAFETY: the two `as` below are narrow escapes only for the preserved carry hack (see Requested case SAFETY + design); no `as any`, no behavior change.
      const merged: OpportunityTargetResult = { ...(prevData ?? ({} as OpportunityTargetResult)), ...msg.result } as OpportunityTargetResult
      return [
        {
          ...model,
          opportunityTarget: { status: 'ready', data: merged },
          lastActiveOppId: msg.result.opportunity_id,
        },
      ]
    case 'OpportunityTargetPrepFailed':
      return [
        {
          ...model,
          opportunityTarget: { status: 'failed', error: msg.error },
          banner: msg.error,
        },
      ]

    case 'HireBoardQChanged':
      return [{ ...model, hireBoardQ: msg.q }]
    case 'HireBoardGeoToggled': {
      const set = new Set(model.hireBoardGeo)
      if (set.has(msg.tag)) set.delete(msg.tag)
      else set.add(msg.tag)
      return [{ ...model, hireBoardGeo: [...set] }]
    }
    case 'HireBoardRefreshRequested':
      return [
        {
          ...model,
          banner: null,
          hireBoard: { status: 'loading' },
        },
      ]
    case 'HireBoardRefreshSucceeded':
      return [{ ...model, hireBoard: { status: 'ready', data: msg.leads } }]
    case 'HireBoardRefreshFailed':
      return [
        {
          ...model,
          hireBoard: { status: 'failed', error: msg.error },
          banner: msg.error,
        },
      ]
    case 'HireBoardSelectRequested':
      return [{ ...model, banner: null }]
    case 'HireBoardSelectSucceeded': {
      const h = { ...model.history }
      if (h.opportunities.status === 'ready' && Array.isArray(h.opportunities.data)) {
        const exists = h.opportunities.data.some((o) => o.id === msg.opportunity.id)
        h.opportunities = {
          status: 'ready',
          data: exists
            ? h.opportunities.data.map((o) => (o.id === msg.opportunity.id ? msg.opportunity : o))
            : [msg.opportunity, ...h.opportunities.data],
        }
      }
      return [
        {
          ...model,
          history: h,
          lastActiveOppId: msg.opportunity.id,
          opportunityTargetUrl: msg.opportunity.source_url || model.opportunityTargetUrl,
          hireBoard:
            model.hireBoard.status === 'ready'
              ? {
                  status: 'ready',
                  data: model.hireBoard.data.map((l) =>
                    l.career_url === msg.opportunity.source_url ||
                    l.company === msg.opportunity.company
                      ? {
                          ...l,
                          already_in_db: true,
                          opportunity_id: msg.opportunity.id,
                        }
                      : l,
                  ),
                }
              : model.hireBoard,
        },
      ]
    }
    case 'HireBoardSelectFailed':
      return [{ ...model, banner: msg.error }]
    case 'HireBoardEvaluateRequested':
      return [
        {
          ...model,
          banner: null,
          opportunityTargetUrl: msg.lead.career_url || model.opportunityTargetUrl,
          opportunityTarget: { status: 'loading' },
        },
      ]

    case 'PlatsbankenQChanged':
      return [{ ...model, platsbankenQ: msg.q }]
    case 'HuntRailChipApplied':
      return [
        {
          ...model,
          huntRail: msg.rail,
          platsbankenQ: msg.surface === 'sweden' ? msg.q : model.platsbankenQ,
          platsbankenMunicipality:
            msg.surface === 'sweden' && msg.municipality
              ? msg.municipality
              : model.platsbankenMunicipality,
          missionFirmsQ: msg.surface === 'mission' ? msg.q : model.missionFirmsQ,
        },
      ]
    case 'HuntHarvestKeyApplied':
      return [
        {
          ...model,
          platsbankenQ: msg.surface === 'sweden' ? msg.key : model.platsbankenQ,
          missionFirmsQ: msg.surface === 'mission' ? msg.key : model.missionFirmsQ,
        },
      ]
    case 'PlatsbankenMunicipalityChanged':
      return [{ ...model, platsbankenMunicipality: msg.municipality }]
    case 'PlatsbankenSearchRequested':
      return [
        {
          ...model,
          banner: null,
          platsbanken: { status: 'loading' },
        },
      ]
    case 'PlatsbankenSearchSucceeded':
      return [
        {
          ...model,
          platsbanken: { status: 'ready', data: msg.leads },
          huntHarvested: mergeHarvested(model.huntHarvested, harvestFromHuntLeads(msg.leads)),
        },
      ]
    case 'PlatsbankenSearchFailed':
      return [
        {
          ...model,
          platsbanken: { status: 'failed', error: msg.error },
          banner: msg.error,
        },
      ]
    case 'PlatsbankenImportRequested':
      return [{ ...model, banner: null }]
    case 'PlatsbankenImportSucceeded': {
      const h = { ...model.history }
      if (h.opportunities.status === 'ready' && Array.isArray(h.opportunities.data)) {
        const exists = h.opportunities.data.some((o) => o.id === msg.opportunity.id)
        h.opportunities = {
          status: 'ready',
          data: exists
            ? h.opportunities.data.map((o) => (o.id === msg.opportunity.id ? msg.opportunity : o))
            : [msg.opportunity, ...h.opportunities.data],
        }
      }
      return [
        {
          ...model,
          history: h,
          lastActiveOppId: msg.opportunity.id,
          opportunityTargetUrl: msg.opportunity.source_url || model.opportunityTargetUrl,
          platsbanken:
            model.platsbanken.status === 'ready'
              ? {
                  status: 'ready',
                  data: model.platsbanken.data.map((lead) =>
                    lead.webpage_url === msg.opportunity.source_url ||
                    lead.ad_id === (msg.opportunity.source_ref || '')
                      ? {
                          ...lead,
                          already_in_db: true,
                          opportunity_id: msg.opportunity.id,
                        }
                      : lead,
                  ),
                }
              : model.platsbanken,
        },
      ]
    }
    case 'PlatsbankenImportFailed':
      return [{ ...model, banner: msg.error }]
    case 'PlatsbankenRemoveRequested':
      return [{ ...model, banner: null }]
    case 'PlatsbankenRemoveSucceeded':
      return [
        {
          ...model,
          platsbanken:
            model.platsbanken.status === 'ready'
              ? {
                  status: 'ready',
                  data: model.platsbanken.data.map((lead) =>
                    lead.ad_id === msg.adId
                      ? { ...lead, already_in_db: false, opportunity_id: null }
                      : lead,
                  ),
                }
              : model.platsbanken,
        },
      ]
    case 'PlatsbankenRemoveFailed':
      return [{ ...model, banner: msg.error }]
    case 'PlatsbankenEvaluateRequested':
      return [
        {
          ...model,
          banner: null,
          opportunityTargetUrl: msg.lead.webpage_url || model.opportunityTargetUrl,
          opportunityTarget: { status: 'loading' },
        },
      ]

    case 'MissionFirmsQChanged':
      return [{ ...model, missionFirmsQ: msg.q }]
    case 'MissionFirmsFirmToggled': {
      const set = new Set(model.missionFirmsSelected)
      if (set.has(msg.firmId)) set.delete(msg.firmId)
      else set.add(msg.firmId)
      return [{ ...model, missionFirmsSelected: [...set] }]
    }
    case 'MissionFirmsTexasOnlyToggled':
      return [{ ...model, missionFirmsTexasOnly: !model.missionFirmsTexasOnly }]
    case 'MissionFirmsTerafabBiasToggled':
      return [{ ...model, missionFirmsTerafabBias: !model.missionFirmsTerafabBias }]
    case 'MissionFirmsSearchRequested':
      return [
        {
          ...model,
          banner: null,
          missionFirms: { status: 'loading' },
        },
      ]
    case 'MissionFirmsSearchSucceeded':
      return [
        {
          ...model,
          missionFirms: { status: 'ready', data: msg.leads },
          huntHarvested: mergeHarvested(model.huntHarvested, harvestFromHuntLeads(msg.leads)),
        },
      ]
    case 'MissionFirmsSearchFailed':
      return [
        {
          ...model,
          missionFirms: { status: 'failed', error: msg.error },
          banner: msg.error,
        },
      ]
    case 'MissionFirmsImportRequested':
      return [{ ...model, banner: null }]
    case 'MissionFirmsImportSucceeded': {
      const h = { ...model.history }
      if (h.opportunities.status === 'ready' && Array.isArray(h.opportunities.data)) {
        const exists = h.opportunities.data.some((o) => o.id === msg.opportunity.id)
        h.opportunities = {
          status: 'ready',
          data: exists
            ? h.opportunities.data.map((o) => (o.id === msg.opportunity.id ? msg.opportunity : o))
            : [msg.opportunity, ...h.opportunities.data],
        }
      }
      return [
        {
          ...model,
          history: h,
          lastActiveOppId: msg.opportunity.id,
          opportunityTargetUrl: msg.opportunity.source_url || model.opportunityTargetUrl,
          missionFirms:
            model.missionFirms.status === 'ready'
              ? {
                  status: 'ready',
                  data: model.missionFirms.data.map((lead) =>
                    lead.absolute_url === msg.opportunity.source_url
                      ? {
                          ...lead,
                          already_in_db: true,
                          opportunity_id: msg.opportunity.id,
                        }
                      : lead,
                  ),
                }
              : model.missionFirms,
        },
      ]
    }
    case 'MissionFirmsImportFailed':
      return [{ ...model, banner: msg.error }]
    case 'MissionFirmsEvaluateRequested':
      return [
        {
          ...model,
          banner: null,
          opportunityTargetUrl: msg.lead.absolute_url || model.opportunityTargetUrl,
          opportunityTarget: { status: 'loading' },
        },
      ]

    case 'NetworkFilterChanged':
      return [{ ...model, networkFilter: msg.filter }]
    case 'NetworkLoadRequested':
      return [
        {
          ...model,
          banner: null,
          networkBusyAction: 'load',
          network: { status: 'loading' },
        },
      ]
    case 'NetworkLoadSucceeded':
      return [
        {
          ...model,
          network: { status: 'ready', data: msg.graph },
          networkBusyAction: 'idle',
        },
      ]
    case 'NetworkLoadFailed':
      return [
        {
          ...model,
          network: { status: 'failed', error: msg.error },
          networkBusyAction: 'idle',
          banner: msg.error,
        },
      ]
    case 'NetworkResolveXRequested':
      return [{ ...model, banner: null, networkBusyAction: 'resolve_x' }]
    case 'NetworkResolveXSucceeded':
      return [
        {
          ...model,
          network: { status: 'ready', data: msg.graph },
          networkBusyAction: 'idle',
        },
      ]
    case 'NetworkResolveXFailed':
      return [{ ...model, networkBusyAction: 'idle', banner: msg.error }]
    case 'NetworkEnrichLinkedInRequested':
      return [{ ...model, banner: null, networkBusyAction: 'enrich_li' }]
    case 'NetworkEnrichLinkedInSucceeded':
      return [
        {
          ...model,
          network: { status: 'ready', data: msg.graph },
          networkBusyAction: 'idle',
        },
      ]
    case 'NetworkEnrichLinkedInFailed':
      return [{ ...model, networkBusyAction: 'idle', banner: msg.error }]

    default:
      return [model]
  }
}

export function searchResults(model: FinderModel) {
  return model.search.status === 'ready' ? model.search.data : []
}

export function bannerText(model: FinderModel): string | null {
  return errorMessage(model.banner)
}