import { useEffect, useMemo, useRef, useState } from 'react'
import { AppShell, type AppView } from '../components/layout/AppShell'
import type { ExecutionStatusFilter } from '../features/executions/executionWorkspace'
import { AiSuggestionsPage } from '../features/ai-suggestions/AiSuggestionsPage'
import { backendAiCoverageAreaSuggestionProvider } from '../features/ai-suggestions/aiCoverageAreaSuggestionBackendProvider'
import { backendAiCoveragePlanProvider } from '../features/ai-suggestions/aiCoveragePlanBackendProvider'
import { backendAiCoveragePlanMergeProvider } from '../features/ai-suggestions/aiCoveragePlanMergeBackendProvider'
import { AI_COVERAGE_PLAN_MERGE_BACKEND_REQUEST_VERSION } from '../features/ai-suggestions/aiCoveragePlanMergeBackendContract'
import {
  buildAiCoveragePlanMergeDraft,
  convertGlobalCoverageMergeCandidate,
} from '../features/ai-suggestions/aiCoveragePlanMergeConversion'
import {
  createAiCoveragePlanMergeSelectedSetDigest,
  resolveAiCoveragePlanMergeEligibility,
} from '../features/ai-suggestions/aiCoveragePlanMergeEligibility'
import { preprocessAiCoveragePlanMerge } from '../features/ai-suggestions/aiCoveragePlanMergePreprocessing'
import {
  createAiCoveragePlanMergeRequestContext,
  createAiCoveragePlanMergeRequestGuard,
} from '../features/ai-suggestions/aiCoveragePlanMergeRequestGuard'
import type {
  AiCoveragePlanMergeSourceRevision,
  GlobalCoverageMergeCandidate,
} from '../features/ai-suggestions/aiCoveragePlanMergeTypes'
import {
  applyAiCoveragePlanMergeDecisions,
  createGlobalCoverageMergeCandidate,
  validateAiCoveragePlanMergeDecisions,
} from '../features/ai-suggestions/aiCoveragePlanMergeValidation'
import type { GlobalCoverageMergeReviewState } from '../features/ai-suggestions/GlobalCoverageMergeCandidateReview'
import { backendAiSectionCoveragePlanProvider } from '../features/ai-suggestions/aiSectionCoveragePlanBackendProvider'
import type { PersistedSectionCoveragePlanRecord } from '../features/ai-suggestions/aiSectionCoveragePlanTypes'
import { backendAiSuggestionProvider } from '../features/ai-suggestions/aiSuggestionBackendProvider'
import { createInitialAiSuggestionsWorkflowState } from '../features/ai-suggestions/aiSuggestionsWorkflowState'
import { packQaSourceForAiSuggestions } from '../features/ai-suggestions/aiSuggestionContext'
import { BugsPage } from '../features/bugs/BugsPage'
import { DashboardPage } from '../features/dashboard/DashboardPage'
import { ExecutionsPage } from '../features/executions/ExecutionsPage'
import { QaSourcesPage } from '../features/qa-sources/QaSourcesPage'
import { ReleaseReportPage } from '../features/release-report/ReleaseReportPage'
import { ReleasesPage } from '../features/releases/ReleasesPage'
import { RisksPage } from '../features/risks/RisksPage'
import { TestCaseImportPage } from '../features/test-case-import/TestCaseImportPage'
import { TestCasesPage } from '../features/test-cases/TestCasesPage'
import { TestSuitesPage } from '../features/test-suites/TestSuitesPage'
import { loadBugs, saveBugs } from '../lib/storage/bugStorage'
import {
  createPersistedCoveragePlanRecord,
  createQaSourceFingerprint,
  findCoveragePlanForSource,
  loadCoveragePlans,
  saveCoveragePlans,
  upsertCoveragePlanRecord,
} from '../lib/storage/coveragePlanStorage'
import { loadExecutions, saveExecutions } from '../lib/storage/executionStorage'
import {
  createResolvedQaSourceSectionIndexes,
  loadQaSourceSectionIndexes,
  saveQaSourceSectionIndexes,
} from '../lib/storage/qaSourceSectionStorage'
import { loadQaSources, saveQaSources } from '../lib/storage/qaSourceStorage'
import {
  loadSectionCoveragePlans,
  saveSectionCoveragePlans,
  upsertSectionCoveragePlanRecord,
} from '../lib/storage/sectionCoveragePlanStorage'
import { loadReleases, saveReleases } from '../lib/storage/releaseStorage'
import { loadRisks, saveRisks } from '../lib/storage/riskStorage'
import { loadTestCases, saveTestCases } from '../lib/storage/testCaseStorage'
import { loadTestSuites, saveTestSuites } from '../lib/storage/testSuiteStorage'
import { usePersistedCollection } from '../lib/storage/usePersistedCollection'
import { useWorkspace } from '../lib/workspace/workspaceContext'
import { createQaSourceSectionSourceFingerprint } from '../features/qa-sources/qaSourceSections'

function isSameQaSourceRevision(
  currentSource: ReturnType<typeof loadQaSources>['qaSources'][number] | null,
  nextSource: ReturnType<typeof loadQaSources>['qaSources'][number] | null,
) {
  if (!currentSource || !nextSource) {
    return currentSource === nextSource
  }

  return (
    currentSource.id === nextSource.id &&
    currentSource.createdAt === nextSource.createdAt &&
    currentSource.updatedAt === nextSource.updatedAt &&
    createQaSourceFingerprint(currentSource) ===
      createQaSourceFingerprint(nextSource)
  )
}

function areMergeSourceRevisionsEqual(
  left: AiCoveragePlanMergeSourceRevision,
  right: AiCoveragePlanMergeSourceRevision,
) {
  return (
    left.qaSourceId === right.qaSourceId &&
    left.qaSourceCreatedAt === right.qaSourceCreatedAt &&
    left.qaSourceUpdatedAt === right.qaSourceUpdatedAt &&
    left.sourceFingerprint === right.sourceFingerprint &&
    left.sectionSchemaVersion === right.sectionSchemaVersion &&
    left.sectionerVersion === right.sectionerVersion &&
    left.sectionSetFingerprint === right.sectionSetFingerprint
  )
}

function getCoveragePlanTargetKey(
  record: ReturnType<typeof loadCoveragePlans>['coveragePlans'][number] | null,
) {
  if (!record) return null

  return [
    record.id,
    record.sourceIdentity.qaSourceId,
    record.sourceIdentity.sourceFingerprint,
    record.analysis.analyzedAt,
    record.origin.kind,
  ].join('\u001f')
}

const COVERAGE_PLAN_STORAGE_CHECK_ERROR =
  'Saved Global Coverage Plan data could not be checked safely. Existing browser data was not changed.'

function getLegacyCoveragePlansForMergeTarget() {
  const currentLoad = loadCoveragePlans()

  return currentLoad.error
    ? { ok: false as const }
    : { ok: true as const, coveragePlans: currentLoad.coveragePlans }
}
function getMergeReviewSourceId(state: GlobalCoverageMergeReviewState | null) {
  if (!state) return null
  if (state.status === 'building' || state.status === 'failed') {
    return state.sourceId
  }
  if (state.status === 'stale') {
    return state.candidate?.sourceRevision.qaSourceId ?? null
  }
  return state.candidate.sourceRevision.qaSourceId
}

function isAbortError(error: unknown) {
  return (
    error instanceof DOMException
      ? error.name === 'AbortError'
      : typeof error === 'object' &&
        error !== null &&
        'name' in error &&
        error.name === 'AbortError'
  )
}
function App() {
  const workspace = useWorkspace()
  const testCaseCollection = usePersistedCollection({
    collection: 'testCases',
    load: () => {
      const result = loadTestCases()
      return { items: result.testCases, error: result.error }
    },
    save: saveTestCases,
  })
  const bugCollection = usePersistedCollection({
    collection: 'bugs',
    load: () => {
      const result = loadBugs()
      return { items: result.bugs, error: result.error }
    },
    save: saveBugs,
  })
  const riskCollection = usePersistedCollection({
    collection: 'risks',
    load: () => {
      const result = loadRisks()
      return { items: result.risks, error: result.error }
    },
    save: saveRisks,
  })
  const releaseCollection = usePersistedCollection({
    collection: 'releases',
    load: () => {
      const result = loadReleases()
      return { items: result.releases, error: result.error }
    },
    save: saveReleases,
  })
  const executionCollection = usePersistedCollection({
    collection: 'executions',
    load: () => {
      const result = loadExecutions()
      return { items: result.executions, error: result.error }
    },
    save: saveExecutions,
  })
  const testSuiteCollection = usePersistedCollection({
    collection: 'testSuites',
    load: () => {
      const result = loadTestSuites()
      return { items: result.testSuites, error: result.error }
    },
    save: saveTestSuites,
  })
  const qaSourceCollection = usePersistedCollection({
    collection: 'sources',
    load: () => {
      const result = loadQaSources()
      return { items: result.qaSources, error: result.error }
    },
    save: saveQaSources,
  })
  const coveragePlanCollection = usePersistedCollection({
    collection: 'coveragePlans',
    load: () => {
      const result = loadCoveragePlans()
      return { items: result.coveragePlans, error: result.error }
    },
    save: saveCoveragePlans,
  })
  const qaSourceSectionIndexCollection = usePersistedCollection({
    collection: 'sectionIndexes',
    load: () => {
      const result = loadQaSourceSectionIndexes()
      return { items: result.sectionIndexes, error: result.error }
    },
    save: saveQaSourceSectionIndexes,
  })
  const [initialSectionCoveragePlanLoad] = useState(() => workspace
    ? { records: workspace.get('sectionPlans').items, error: null as string | null }
    : loadSectionCoveragePlans())
  const [sectionCoveragePlanRecords, setSectionCoveragePlanRecords] = useState(
    initialSectionCoveragePlanLoad.records,
  )
  const [sectionCoveragePlanError, setSectionCoveragePlanError] = useState(
    initialSectionCoveragePlanLoad.error,
  )
  const [selectedMergeRecords, setSelectedMergeRecords] = useState<
    PersistedSectionCoveragePlanRecord[]
  >([])
  const [globalCoverageMergeReviewState, setGlobalCoverageMergeReviewState] =
    useState<GlobalCoverageMergeReviewState | null>(null)
  const [mergeRequestGuard] = useState(createAiCoveragePlanMergeRequestGuard)
  const mergeSaveInFlight = useRef(false)
  const qaSourcesRef = useRef(qaSourceCollection.items)
  const sectionIndexesRef = useRef<ReturnType<
    typeof createResolvedQaSourceSectionIndexes
  >>([])
  const sectionCoveragePlanRecordsRef = useRef(sectionCoveragePlanRecords)
  const selectedMergeRecordsRef = useRef(selectedMergeRecords)
  const mergeReviewStateRef = useRef(globalCoverageMergeReviewState)
  const [activeView, setActiveView] = useState<AppView>('dashboard')
  const [executionEntry, setExecutionEntry] = useState<{ releaseId: string; status: ExecutionStatusFilter } | null>(null)
  const [selectedAiSourceId, setSelectedAiSourceId] = useState('')
  const [aiSuggestionsWorkflowState, setAiSuggestionsWorkflowState] = useState(
    createInitialAiSuggestionsWorkflowState,
  )
  const storageErrors = [
    ...(workspace?.migrationWarnings ?? []),
    testCaseCollection.error,
    testSuiteCollection.error,
    qaSourceCollection.error,
    bugCollection.error,
    riskCollection.error,
    releaseCollection.error,
    executionCollection.error,
    coveragePlanCollection.error,
    qaSourceSectionIndexCollection.error,
    sectionCoveragePlanError,
  ].filter(Boolean)
  const isSavingWorkspace = [testCaseCollection, bugCollection, riskCollection, releaseCollection,
    executionCollection, testSuiteCollection, qaSourceCollection, coveragePlanCollection, qaSourceSectionIndexCollection]
    .some((collection) => collection.isSaving)

  useEffect(() => {
    if (!isSavingWorkspace) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [isSavingWorkspace])
  const resolvedQaSourceSectionIndexes = useMemo(() => createResolvedQaSourceSectionIndexes(
    qaSourceCollection.items,
    qaSourceSectionIndexCollection.items,
  ), [qaSourceCollection.items, qaSourceSectionIndexCollection.items])

  useEffect(() => {
    qaSourcesRef.current = qaSourceCollection.items
    sectionIndexesRef.current = resolvedQaSourceSectionIndexes
    sectionCoveragePlanRecordsRef.current = sectionCoveragePlanRecords
    selectedMergeRecordsRef.current = selectedMergeRecords
    mergeReviewStateRef.current = globalCoverageMergeReviewState
  }, [
    globalCoverageMergeReviewState,
    qaSourceCollection.items,
    resolvedQaSourceSectionIndexes,
    sectionCoveragePlanRecords,
    selectedMergeRecords,
  ])

  useEffect(() => {
    return () => {
      mergeRequestGuard.invalidate()
    }
  }, [mergeRequestGuard])

  function publishMergeReviewState(
    state: GlobalCoverageMergeReviewState | null,
  ) {
    mergeReviewStateRef.current = state
    setGlobalCoverageMergeReviewState(state)
  }

  function replaceSelectedMergeRecords(
    records: PersistedSectionCoveragePlanRecord[],
  ) {
    selectedMergeRecordsRef.current = records
    setSelectedMergeRecords(records)
  }

  function getCurrentSelectedMergeRecords(
    records: readonly PersistedSectionCoveragePlanRecord[],
  ) {
    const currentById = new Map(
      sectionCoveragePlanRecordsRef.current.map((record) => [record.id, record]),
    )

    return records
      .map((record) => currentById.get(record.id))
      .filter(
        (record): record is PersistedSectionCoveragePlanRecord =>
          record !== undefined,
      )
  }

  function resolveCurrentMergeEligibility(
    sourceId: string,
    records: readonly PersistedSectionCoveragePlanRecord[] =
      selectedMergeRecordsRef.current,
  ) {
    const qaSource =
      qaSourcesRef.current.find((source) => source.id === sourceId) ?? null
    const sectionIndex =
      sectionIndexesRef.current.find(
        (candidate) => candidate.qaSourceId === sourceId,
      ) ?? null
    const currentRecords = getCurrentSelectedMergeRecords(records)

    if (!qaSource || !sectionIndex || currentRecords.length !== records.length) {
      return null
    }

    const eligibility = resolveAiCoveragePlanMergeEligibility({
      qaSource,
      sectionIndex,
      selectedRecords: currentRecords,
      allRecords: sectionCoveragePlanRecordsRef.current,
    })

    return eligibility.ok ? eligibility : null
  }

  function createCurrentMergeRequestContext(sourceId: string) {
    const eligibility = resolveCurrentMergeEligibility(sourceId)

    if (!eligibility) return null

    try {
      return createAiCoveragePlanMergeRequestContext({
        sourceRevision: eligibility.sourceRevision,
        selectedAnalyses: eligibility.selectedAnalyses.map(
          (analysis) => analysis.analysisRef,
        ),
      })
    } catch {
      return null
    }
  }

  function markMergeReviewStale(message: string) {
    mergeRequestGuard.invalidate()
    const currentState = mergeReviewStateRef.current
    const selectedAnalysisCount =
      currentState &&
      currentState.status !== 'building' &&
      currentState.status !== 'failed'
        ? currentState.candidate?.selectedAnalyses.length ??
          selectedMergeRecordsRef.current.length
        : currentState?.selectedAnalysisCount ??
          selectedMergeRecordsRef.current.length
    const candidate =
      currentState &&
      currentState.status !== 'building' &&
      currentState.status !== 'failed'
        ? currentState.candidate
        : null

    replaceSelectedMergeRecords([])

    if (currentState) {
      publishMergeReviewState({
        status: 'stale',
        candidate,
        selectedAnalysisCount,
        message,
      })
    }
  }

  function isCandidateCurrent(candidate: GlobalCoverageMergeCandidate) {
    const eligibility = resolveCurrentMergeEligibility(
      candidate.sourceRevision.qaSourceId,
    )

    return Boolean(
      eligibility &&
        areMergeSourceRevisionsEqual(
          eligibility.sourceRevision,
          candidate.sourceRevision,
        ) &&
        eligibility.selectedSetDigest ===
          createAiCoveragePlanMergeSelectedSetDigest(
            candidate.selectedAnalyses,
          ),
    )
  }

  function handleSelectedMergeRecordsChange(
    records: PersistedSectionCoveragePlanRecord[],
  ) {
    if (mergeRequestGuard.isInFlight() || mergeReviewStateRef.current) {
      markMergeReviewStale(
        'The selected section analyses changed. Build a new candidate.',
      )
    }

    replaceSelectedMergeRecords(records)
  }
  function createAiWorkflowStateForSource(sourceId: string) {
    const nextState = createInitialAiSuggestionsWorkflowState()
    const savedPlan = findCoveragePlanForSource(
      coveragePlanCollection.items,
      sourceId,
    )

    return savedPlan
      ? {
          ...nextState,
          coveragePlan: savedPlan.plan,
        }
      : nextState
  }

  function publishMergeFailure(
    sourceId: string,
    selectedAnalysisCount: number,
    message: string,
  ) {
    setSelectedAiSourceId(sourceId)
    setAiSuggestionsWorkflowState(createAiWorkflowStateForSource(sourceId))
    publishMergeReviewState({
      status: 'failed',
      sourceId,
      selectedAnalysisCount,
      message,
    })
    setActiveView('ai-suggestions')
  }

  async function handleBuildGlobalCoveragePlan(
    sourceId: string,
    records: PersistedSectionCoveragePlanRecord[],
  ) {
    if (mergeRequestGuard.isInFlight()) return

    replaceSelectedMergeRecords(records)
    const eligibility = resolveCurrentMergeEligibility(sourceId, records)

    if (!eligibility) {
      publishMergeFailure(
        sourceId,
        records.length,
        'Select 2–8 Current section analyses from the exact same source revision.',
      )
      return
    }

    const preprocessing = preprocessAiCoveragePlanMerge({
      analyses: eligibility.selectedAnalyses.map((analysis) => ({
        analysisRef: analysis.analysisRef,
        sectionOrdinal: analysis.section.ordinal,
        plan: analysis.record.plan,
      })),
    })

    if (!preprocessing.ok) {
      publishMergeFailure(sourceId, records.length, preprocessing.error)
      return
    }

    const requestContext = createAiCoveragePlanMergeRequestContext({
      sourceRevision: eligibility.sourceRevision,
      selectedAnalyses: eligibility.selectedAnalyses.map(
        (analysis) => analysis.analysisRef,
      ),
    })
    const guardedRequest = mergeRequestGuard.begin(requestContext)

    if (!guardedRequest) return

    setSelectedAiSourceId(sourceId)
    setAiSuggestionsWorkflowState(createAiWorkflowStateForSource(sourceId))
    publishMergeReviewState({
      status: 'building',
      sourceId,
      selectedAnalysisCount: records.length,
    })
    setActiveView('ai-suggestions')

    try {
      const rawDecisions =
        preprocessing.candidatePairs.length === 0
          ? null
          : await backendAiCoveragePlanMergeProvider.classifyCoveragePlanMergePairs(
              {
                requestVersion:
                  AI_COVERAGE_PLAN_MERGE_BACKEND_REQUEST_VERSION,
                findings: preprocessing.providerFindings.map((finding) => ({
                  alias: finding.alias,
                  sectionAlias: finding.sectionAlias,
                  kind: finding.kind,
                  text: finding.text,
                  context: finding.context,
                })),
                candidatePairs: preprocessing.candidatePairs.map((pair) => ({
                  pairAlias: pair.pairAlias,
                  leftAlias: pair.leftAlias,
                  rightAlias: pair.rightAlias,
                })),
              },
              { signal: guardedRequest.signal },
            )
      const decisionResult = validateAiCoveragePlanMergeDecisions(
        rawDecisions,
        preprocessing.candidatePairs,
      )

      if (!decisionResult.ok) {
        throw new Error(decisionResult.error)
      }

      const classified = applyAiCoveragePlanMergeDecisions(
        preprocessing,
        decisionResult.decisions,
      )
      const draft = buildAiCoveragePlanMergeDraft({
        sourceRevision: eligibility.sourceRevision,
        sectionScope: eligibility.sectionScope,
        ...classified,
      })
      const builtAt = new Date().toISOString()
      const candidate = createGlobalCoverageMergeCandidate({
        candidateId: `global-coverage-merge-${eligibility.selectedSetDigest}-${builtAt}`,
        builtAt,
        sourceRevision: eligibility.sourceRevision,
        selectedAnalyses: eligibility.selectedAnalyses.map(
          (analysis) => analysis.analysisRef,
        ),
        planDraft: draft.plan,
        outputProvenance: draft.outputProvenance,
        reviewRelations: draft.reviewRelations,
        sectionScope: eligibility.sectionScope,
        exactDuplicateSummary: classified.exactDuplicateSummary,
        warnings: [...draft.plan.warnings],
      })
      const currentContext = createCurrentMergeRequestContext(sourceId)

      mergeRequestGuard.acceptIfCurrent(
        guardedRequest.identity,
        currentContext,
        () =>
          publishMergeReviewState({
            status: 'ready',
            candidate,
            error: null,
          }),
      )
    } catch (error) {
      if (isAbortError(error)) return

      if (mergeRequestGuard.releaseIfCurrent(guardedRequest.identity)) {
        publishMergeReviewState({
          status: 'failed',
          sourceId,
          selectedAnalysisCount: records.length,
          message:
            error instanceof Error
              ? error.message
              : 'The merge candidate could not be built safely.',
        })
      }
    }
  }

  async function getCurrentCoveragePlansForMergeTarget() {
    if (!workspace) return getLegacyCoveragePlansForMergeTarget()
    try {
      const saved = await workspace.refresh('coveragePlans')
      return { ok: true as const, coveragePlans: saved.items }
    } catch { return { ok: false as const } }
  }

  async function handleRequestGlobalCoverageMergeSave() {
    const currentState = mergeReviewStateRef.current
    if (!currentState || currentState.status !== 'ready') return

    if (!isCandidateCurrent(currentState.candidate)) {
      markMergeReviewStale(
        'The source or a selected analysis changed. Build a new candidate.',
      )
      return
    }

    const currentCoveragePlansResult = await getCurrentCoveragePlansForMergeTarget()
    if (mergeReviewStateRef.current !== currentState || !isCandidateCurrent(currentState.candidate)) return

    if (!currentCoveragePlansResult.ok) {
      publishMergeReviewState({
        ...currentState,
        error: COVERAGE_PLAN_STORAGE_CHECK_ERROR,
      })
      return
    }

    const currentCoveragePlans = currentCoveragePlansResult.coveragePlans
    const currentTarget = findCoveragePlanForSource(
      currentCoveragePlans,
      currentState.candidate.sourceRevision.qaSourceId,
    )

    publishMergeReviewState({
      status: 'confirmation_required',
      candidate: currentState.candidate,
      mode: currentTarget ? 'replace' : 'create',
      expectedTargetKey: getCoveragePlanTargetKey(currentTarget),
      error: null,
    })
  }

  function handleCancelGlobalCoverageMergeSave() {
    const currentState = mergeReviewStateRef.current
    if (!currentState || currentState.status !== 'confirmation_required') return

    publishMergeReviewState({
      status: 'ready',
      candidate: currentState.candidate,
      error: null,
    })
  }

  async function handleConfirmGlobalCoverageMergeSave() {
    if (mergeSaveInFlight.current) return
    mergeSaveInFlight.current = true
    try { await commitGlobalCoverageMergeSave() }
    finally { mergeSaveInFlight.current = false }
  }

  async function commitGlobalCoverageMergeSave() {
    const currentState = mergeReviewStateRef.current
    if (!currentState || currentState.status !== 'confirmation_required') return

    const { candidate } = currentState
    const sourceId = candidate.sourceRevision.qaSourceId

    if (!isCandidateCurrent(candidate)) {
      markMergeReviewStale(
        'The source, section index, or a selected analysis changed. Build a new candidate.',
      )
      return
    }

    const qaSource =
      qaSourcesRef.current.find((source) => source.id === sourceId) ?? null
    if (!qaSource) {
      markMergeReviewStale(
        'The source no longer exists. Build a new candidate from a current source.',
      )
      return
    }

    const currentCoveragePlansResult = await getCurrentCoveragePlansForMergeTarget()
    if (mergeReviewStateRef.current !== currentState || !isCandidateCurrent(candidate)) return

    if (!currentCoveragePlansResult.ok) {
      publishMergeReviewState({
        ...currentState,
        error: COVERAGE_PLAN_STORAGE_CHECK_ERROR,
      })
      return
    }

    const currentCoveragePlans = currentCoveragePlansResult.coveragePlans
    const currentTarget = findCoveragePlanForSource(
      currentCoveragePlans,
      sourceId,
    )
    const currentTargetKey = getCoveragePlanTargetKey(currentTarget)

    if (currentTargetKey !== currentState.expectedTargetKey) {
      publishMergeReviewState({
        status: 'confirmation_required',
        candidate,
        mode: currentTarget ? 'replace' : 'create',
        expectedTargetKey: currentTargetKey,
        error: currentTarget
          ? 'The saved Global Coverage Plan changed. Confirm replacement again.'
          : 'The previous replacement target no longer exists. Confirm creation again.',
      })
      return
    }

    let converted: ReturnType<typeof convertGlobalCoverageMergeCandidate>

    try {
      converted = convertGlobalCoverageMergeCandidate(candidate)
    } catch {
      publishMergeReviewState({
        ...currentState,
        error: 'The candidate could not be validated for saving.',
      })
      return
    }

    const nextRecord = createPersistedCoveragePlanRecord({
      qaSource,
      packedSource: packQaSourceForAiSuggestions(qaSource),
      plan: converted.plan,
      origin: converted.origin,
    })
    const nextCoveragePlans = upsertCoveragePlanRecord(
      currentCoveragePlans,
      nextRecord,
    )
    let saveResult: { ok: boolean; error: string | null }
    if (workspace) {
      try {
        const savedSource = await workspace.repository.readRecord<typeof qaSource>('sources', sourceId)
        if (!savedSource || !isSameQaSourceRevision(savedSource.value, qaSource) || !isCandidateCurrent(candidate)) {
          markMergeReviewStale('The saved source changed. Build a new candidate from Current analyses.')
          return
        }
        saveResult = await workspace.save('coveragePlans', nextCoveragePlans, {
          recordChecks: [{ collection: 'sources', id: sourceId, version: savedSource.version }],
          collectionChecks: [
            { collection: 'coveragePlans', version: workspace.get('coveragePlans').version },
            { collection: 'sectionPlans', version: workspace.get('sectionPlans').version },
            { collection: 'sectionIndexes', version: workspace.get('sectionIndexes').version },
          ],
        })
      } catch { saveResult = { ok: false, error: COVERAGE_PLAN_STORAGE_CHECK_ERROR } }
    } else saveResult = saveCoveragePlans(nextCoveragePlans)

    if (!saveResult.ok) {
      publishMergeReviewState({
        ...currentState,
        error:
          saveResult.error ??
          'The merged coverage plan could not be saved to browser storage.',
      })
      return
    }

    coveragePlanCollection.acceptSavedItems(nextCoveragePlans)
    if (!isCandidateCurrent(candidate)) {
      markMergeReviewStale('The source changed after this plan was saved. Its references require review.')
      return
    }
    replaceSelectedMergeRecords([])
    publishMergeReviewState(null)
    setSelectedAiSourceId(sourceId)
    setAiSuggestionsWorkflowState({
      ...createInitialAiSuggestionsWorkflowState(),
      coveragePlan: converted.plan,
    })
  }

  function handleDiscardGlobalCoverageMergeCandidate() {
    const sourceId = getMergeReviewSourceId(mergeReviewStateRef.current)
    mergeRequestGuard.invalidate()
    replaceSelectedMergeRecords([])
    publishMergeReviewState(null)

    if (sourceId) {
      setSelectedAiSourceId(sourceId)
      setAiSuggestionsWorkflowState(createAiWorkflowStateForSource(sourceId))
    }
  }
  function handleQaSourcesChange(nextQaSources: typeof qaSourceCollection.items) {
    const nextSectionIndexes = createResolvedQaSourceSectionIndexes(
      nextQaSources,
      qaSourceSectionIndexCollection.items,
    )
    const mergeSourceId =
      getMergeReviewSourceId(mergeReviewStateRef.current) ??
      selectedMergeRecordsRef.current[0]?.sourceIdentity.qaSourceId ??
      null

    if (mergeSourceId) {
      const currentMergeSource =
        qaSourcesRef.current.find((source) => source.id === mergeSourceId) ?? null
      const nextMergeSource =
        nextQaSources.find((source) => source.id === mergeSourceId) ?? null

      if (!isSameQaSourceRevision(currentMergeSource, nextMergeSource)) {
        qaSourcesRef.current = nextQaSources
        sectionIndexesRef.current = nextSectionIndexes
        markMergeReviewStale(
          nextMergeSource
            ? 'The QA Source changed. Build a new candidate from Current analyses.'
            : 'The QA Source was deleted. The previous merge result was ignored.',
        )
      }
    }

    const currentSelectedSource =
      qaSourceCollection.items.find(
        (source) => source.id === selectedAiSourceId,
      ) ?? null
    const nextSelectedSource =
      nextQaSources.find((source) => source.id === selectedAiSourceId) ?? null

    if (
      selectedAiSourceId &&
      !isSameQaSourceRevision(currentSelectedSource, nextSelectedSource)
    ) {
      setAiSuggestionsWorkflowState((currentState) => ({
        ...createAiWorkflowStateForSource(selectedAiSourceId),
        activeMode: currentState.activeMode,
      }))
    }

    qaSourcesRef.current = nextQaSources
    sectionIndexesRef.current = nextSectionIndexes
    qaSourceCollection.onChange(nextQaSources)
    qaSourceSectionIndexCollection.onChange(nextSectionIndexes)
  }

  async function handleUpsertSectionCoveragePlan(
    record: PersistedSectionCoveragePlanRecord,
    replacedRecordId?: string,
  ) {
    let nextRecords: PersistedSectionCoveragePlanRecord[]

    try {
      nextRecords = upsertSectionCoveragePlanRecord(
        sectionCoveragePlanRecords,
        record,
        replacedRecordId,
      )
    } catch {
      const error = 'Section coverage plan data could not be updated safely.'
      setSectionCoveragePlanError(error)
      return { ok: false, error }
    }

    let saveResult: { ok: boolean; error: string | null }
    if (workspace) {
      try {
        const source = qaSourcesRef.current.find((item) => item.id === record.sourceIdentity.qaSourceId)
        const saved = await workspace.repository.readRecord<NonNullable<typeof source>>('sources', record.sourceIdentity.qaSourceId)
        if (!source || !saved || !isSameQaSourceRevision(source, saved.value) ||
          createQaSourceSectionSourceFingerprint(source) !== record.sourceIdentity.sourceFingerprint) {
          return { ok: false, error: 'The source changed before this analysis could be saved.' }
        }
        saveResult = await workspace.save('sectionPlans', nextRecords, {
          recordChecks: [{ collection: 'sources', id: source.id, version: saved.version }],
          collectionChecks: [{ collection: 'sectionIndexes', version: workspace.get('sectionIndexes').version }],
        })
      } catch { saveResult = { ok: false, error: 'Section analysis could not be saved safely. Existing data was preserved.' } }
    } else saveResult = saveSectionCoveragePlans(nextRecords)
    setSectionCoveragePlanError(saveResult.error)

    if (saveResult.ok) {
      sectionCoveragePlanRecordsRef.current = nextRecords
      const replacedId = replacedRecordId ?? record.id
      const reviewState = mergeReviewStateRef.current
      const candidate =
        reviewState &&
        reviewState.status !== 'building' &&
        reviewState.status !== 'failed'
          ? reviewState.candidate
          : null
      const selectedAnalysisChanged =
        selectedMergeRecordsRef.current.some(
          (selectedRecord) => selectedRecord.id === replacedId,
        ) ||
        Boolean(
          candidate?.selectedAnalyses.some(
            (analysis) => analysis.sectionPlanRecordId === replacedId,
          ),
        )

      if (selectedAnalysisChanged) {
        markMergeReviewStale(
          'A selected Section Coverage Plan changed. Build a new candidate.',
        )
      }

      setSectionCoveragePlanRecords(nextRecords)
    }

    return saveResult
  }

  function handleSelectedAiSourceChange(sourceId: string) {
    if (
      sourceId !== selectedAiSourceId &&
      (mergeRequestGuard.isInFlight() || mergeReviewStateRef.current)
    ) {
      mergeRequestGuard.invalidate()
      replaceSelectedMergeRecords([])
      publishMergeReviewState(null)
    }

    setSelectedAiSourceId(sourceId)
  }

  function handleCoveragePlansChange(
    nextCoveragePlans: typeof coveragePlanCollection.items,
  ) {
    return coveragePlanCollection.commitChange(nextCoveragePlans)
  }

  return (
    <AppShell activeView={activeView} onNavigate={setActiveView}>
      {isSavingWorkspace ? <p className="workspace-save-status" role="status">Saving workspace changes…</p> : null}
      {storageErrors.length > 0 ? (
        <div className="storage-alert" role="status">
          {storageErrors.join(' ')}
        </div>
      ) : null}

      {activeView === 'dashboard' && (
        <DashboardPage
          testCases={testCaseCollection.items}
          executions={executionCollection.items}
          bugs={bugCollection.items}
          risks={riskCollection.items}
          releases={releaseCollection.items}
          onNavigate={setActiveView}
        />
      )}

      {activeView === 'test-cases' && (
        <TestCasesPage
          testCases={testCaseCollection.items}
          onChange={testCaseCollection.onChange}
        />
      )}

      {activeView === 'import' && (
        <TestCaseImportPage
          testCases={testCaseCollection.items}
          onChange={testCaseCollection.onChange}
          onViewTestCases={() => setActiveView('test-cases')}
        />
      )}

      {activeView === 'test-suites' && (
        <TestSuitesPage
          testSuites={testSuiteCollection.items}
          testCases={testCaseCollection.items}
          onChange={testSuiteCollection.onChange}
        />
      )}

      {activeView === 'qa-sources' && (
        <QaSourcesPage
          qaSources={qaSourceCollection.items}
          sourceSectionIndexes={resolvedQaSourceSectionIndexes}
          sectionCoveragePlanRecords={sectionCoveragePlanRecords}
          sectionCoveragePlanProvider={backendAiSectionCoveragePlanProvider}
          onUpsertSectionCoveragePlan={handleUpsertSectionCoveragePlan}
          selectedMergeRecords={selectedMergeRecords}
          onSelectedMergeRecordsChange={handleSelectedMergeRecordsChange}
          onBuildGlobalCoveragePlan={handleBuildGlobalCoveragePlan}
          isBuildingGlobalCoveragePlan={
            globalCoverageMergeReviewState?.status === 'building'
          }
          onChange={handleQaSourcesChange}
          onSuggestTestCases={(sourceId) => {
            if (sourceId !== selectedAiSourceId) {
              setAiSuggestionsWorkflowState(createAiWorkflowStateForSource(sourceId))
            }
            handleSelectedAiSourceChange(sourceId)
            setActiveView('ai-suggestions')
          }}
        />
      )}

      {activeView === 'ai-suggestions' && (
        <AiSuggestionsPage
          onNavigate={setActiveView}
          qaSources={qaSourceCollection.items}
          testCases={testCaseCollection.items}
          onChange={testCaseCollection.onChange}
          selectedQaSourceId={selectedAiSourceId}
          onSelectedQaSourceChange={handleSelectedAiSourceChange}
          workflowState={aiSuggestionsWorkflowState}
          onWorkflowStateChange={setAiSuggestionsWorkflowState}
          savedCoveragePlans={coveragePlanCollection.items}
          onSavedCoveragePlansChange={handleCoveragePlansChange}
          sourceSectionIndexes={resolvedQaSourceSectionIndexes}
          sectionCoveragePlanRecords={sectionCoveragePlanRecords}
          coverageAreaSuggestionProvider={backendAiCoverageAreaSuggestionProvider}
          coveragePlanProvider={backendAiCoveragePlanProvider}
          provider={backendAiSuggestionProvider}
          globalCoverageMergeReviewState={globalCoverageMergeReviewState}
          onRequestGlobalCoverageMergeSave={
            handleRequestGlobalCoverageMergeSave
          }
          onCancelGlobalCoverageMergeSave={
            handleCancelGlobalCoverageMergeSave
          }
          onConfirmGlobalCoverageMergeSave={
            handleConfirmGlobalCoverageMergeSave
          }
          onDiscardGlobalCoverageMergeCandidate={
            handleDiscardGlobalCoverageMergeCandidate
          }
        />
      )}

      {activeView === 'bugs' && (
        <BugsPage
          bugs={bugCollection.items}
          testCases={testCaseCollection.items}
          onChange={bugCollection.onChange}
        />
      )}

      {activeView === 'risks' && (
        <RisksPage
          risks={riskCollection.items}
          onChange={riskCollection.onChange}
        />
      )}

      {activeView === 'releases' && (
        <ReleasesPage
          releases={releaseCollection.items}
          onChange={releaseCollection.onChange}
        />
      )}

      {activeView === 'executions' && (
        <ExecutionsPage
          onNavigate={setActiveView}
          initialReleaseId={executionEntry?.releaseId}
          initialStatusFilter={executionEntry?.status}
          releases={releaseCollection.items}
          testCases={testCaseCollection.items}
          testSuites={testSuiteCollection.items}
          executions={executionCollection.items}
          bugs={bugCollection.items}
          risks={riskCollection.items}
          onChange={executionCollection.onChange}
        />
      )}

      {activeView === 'release-report' && (
        <ReleaseReportPage
          onNavigate={setActiveView}
          onReviewExecutions={(releaseId, status) => { setExecutionEntry({ releaseId, status }); setActiveView('executions') }}
          releases={releaseCollection.items}
          testCases={testCaseCollection.items}
          executions={executionCollection.items}
          bugs={bugCollection.items}
          risks={riskCollection.items}
        />
      )}
    </AppShell>
  )
}

export default App
