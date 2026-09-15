import {
  AI_COVERAGE_PLAN_MERGE_MAX_SELECTED_RECORDS,
  AI_COVERAGE_PLAN_MERGE_MIN_SELECTED_RECORDS,
  createAiCoveragePlanMergeSelectedSetDigest,
} from './aiCoveragePlanMergeEligibility'
import type {
  AiCoveragePlanMergeSelectedAnalysisRef,
  AiCoveragePlanMergeSourceRevision,
} from './aiCoveragePlanMergeTypes'

export type AiCoveragePlanMergeRequestContext = Readonly<{
  sourceRevision: Readonly<AiCoveragePlanMergeSourceRevision>
  selectedAnalyses: ReadonlyArray<
    Readonly<AiCoveragePlanMergeSelectedAnalysisRef>
  >
  selectedSetDigest: string
}>

export type AiCoveragePlanMergeRequestIdentity = Readonly<{
  requestToken: number
  sourceRevision: Readonly<AiCoveragePlanMergeSourceRevision>
  selectedAnalyses: ReadonlyArray<
    Readonly<AiCoveragePlanMergeSelectedAnalysisRef>
  >
  selectedSetDigest: string
}>

export type AiCoveragePlanMergeGuardedRequest = {
  identity: AiCoveragePlanMergeRequestIdentity
  signal: AbortSignal
}

function compareCodeUnits(left: string, right: string) {
  if (left === right) {
    return 0
  }

  return left < right ? -1 : 1
}

function createSelectedAnalysisSortKey(
  analysisRef: Readonly<AiCoveragePlanMergeSelectedAnalysisRef>,
) {
  return [
    analysisRef.sectionId,
    analysisRef.stableKey,
    analysisRef.contentFingerprint,
    analysisRef.sectionPlanRecordId,
    analysisRef.analyzedAt,
    analysisRef.planFingerprint,
    analysisRef.analysisRefId,
  ].join('\u001f')
}

function cloneAndFreezeSourceRevision(
  sourceRevision: Readonly<AiCoveragePlanMergeSourceRevision>,
) {
  return Object.freeze({
    qaSourceId: sourceRevision.qaSourceId,
    qaSourceCreatedAt: sourceRevision.qaSourceCreatedAt,
    qaSourceUpdatedAt: sourceRevision.qaSourceUpdatedAt,
    sourceFingerprint: sourceRevision.sourceFingerprint,
    sectionSchemaVersion: sourceRevision.sectionSchemaVersion,
    sectionerVersion: sourceRevision.sectionerVersion,
    sectionSetFingerprint: sourceRevision.sectionSetFingerprint,
  })
}

function cloneAndFreezeSelectedAnalyses(
  selectedAnalyses: readonly Readonly<AiCoveragePlanMergeSelectedAnalysisRef>[],
) {
  return Object.freeze(
    selectedAnalyses
      .map((analysisRef) =>
        Object.freeze({
          analysisRefId: analysisRef.analysisRefId,
          sectionPlanRecordId: analysisRef.sectionPlanRecordId,
          analyzedAt: analysisRef.analyzedAt,
          planFingerprint: analysisRef.planFingerprint,
          sectionId: analysisRef.sectionId,
          stableKey: analysisRef.stableKey,
          contentFingerprint: analysisRef.contentFingerprint,
        }),
      )
      .sort((left, right) =>
        compareCodeUnits(
          createSelectedAnalysisSortKey(left),
          createSelectedAnalysisSortKey(right),
        ),
      ),
  )
}

function validateSelectedAnalyses(
  selectedAnalyses: readonly Readonly<AiCoveragePlanMergeSelectedAnalysisRef>[],
) {
  if (
    selectedAnalyses.length < AI_COVERAGE_PLAN_MERGE_MIN_SELECTED_RECORDS ||
    selectedAnalyses.length > AI_COVERAGE_PLAN_MERGE_MAX_SELECTED_RECORDS
  ) {
    throw new TypeError(
      'A merge request context must contain between 2 and 8 selected analyses.',
    )
  }

  const recordIds = new Set<string>()
  const sectionIdentities = new Set<string>()
  const analysisIdentities = new Set<string>()

  selectedAnalyses.forEach((analysisRef) => {
    const values = [
      analysisRef.analysisRefId,
      analysisRef.sectionPlanRecordId,
      analysisRef.analyzedAt,
      analysisRef.planFingerprint,
      analysisRef.sectionId,
      analysisRef.stableKey,
      analysisRef.contentFingerprint,
    ]

    if (values.some((value) => !value || value !== value.trim())) {
      throw new TypeError('Merge request analysis identities must be exact.')
    }

    const sectionIdentity = `${analysisRef.sectionId}\u001f${analysisRef.stableKey}`
    const analysisIdentity = [
      analysisRef.sectionPlanRecordId,
      analysisRef.analyzedAt,
      analysisRef.planFingerprint,
    ].join('\u001f')

    if (
      recordIds.has(analysisRef.sectionPlanRecordId) ||
      sectionIdentities.has(sectionIdentity) ||
      analysisIdentities.has(analysisIdentity)
    ) {
      throw new TypeError('Merge request analysis identities must be unique.')
    }

    recordIds.add(analysisRef.sectionPlanRecordId)
    sectionIdentities.add(sectionIdentity)
    analysisIdentities.add(analysisIdentity)
  })
}

export function createAiCoveragePlanMergeRequestContext({
  sourceRevision,
  selectedAnalyses,
}: {
  sourceRevision: Readonly<AiCoveragePlanMergeSourceRevision>
  selectedAnalyses: readonly Readonly<AiCoveragePlanMergeSelectedAnalysisRef>[]
}): AiCoveragePlanMergeRequestContext {
  validateSelectedAnalyses(selectedAnalyses)

  const frozenSelectedAnalyses = cloneAndFreezeSelectedAnalyses(selectedAnalyses)

  return Object.freeze({
    sourceRevision: cloneAndFreezeSourceRevision(sourceRevision),
    selectedAnalyses: frozenSelectedAnalyses,
    selectedSetDigest: createAiCoveragePlanMergeSelectedSetDigest(
      frozenSelectedAnalyses,
    ),
  })
}

function normalizeRequestContext(
  context: AiCoveragePlanMergeRequestContext,
): AiCoveragePlanMergeRequestContext {
  const normalized = createAiCoveragePlanMergeRequestContext({
    sourceRevision: context.sourceRevision,
    selectedAnalyses: context.selectedAnalyses,
  })

  if (normalized.selectedSetDigest !== context.selectedSetDigest) {
    throw new TypeError('The merge request selected-set digest is not current.')
  }

  return normalized
}

export function createAiCoveragePlanMergeRequestIdentity(
  context: AiCoveragePlanMergeRequestContext,
  requestToken: number,
): AiCoveragePlanMergeRequestIdentity {
  if (!Number.isSafeInteger(requestToken) || requestToken <= 0) {
    throw new TypeError('Merge request token must be a positive integer.')
  }

  const normalized = normalizeRequestContext(context)

  return Object.freeze({
    requestToken,
    sourceRevision: normalized.sourceRevision,
    selectedAnalyses: normalized.selectedAnalyses,
    selectedSetDigest: normalized.selectedSetDigest,
  })
}

function areSourceRevisionsEqual(
  left: Readonly<AiCoveragePlanMergeSourceRevision>,
  right: Readonly<AiCoveragePlanMergeSourceRevision>,
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

function areSelectedAnalysesEqual(
  left: readonly Readonly<AiCoveragePlanMergeSelectedAnalysisRef>[],
  right: readonly Readonly<AiCoveragePlanMergeSelectedAnalysisRef>[],
) {
  return (
    left.length === right.length &&
    left.every((analysisRef, index) => {
      const other = right[index]

      return (
        analysisRef.analysisRefId === other.analysisRefId &&
        analysisRef.sectionPlanRecordId === other.sectionPlanRecordId &&
        analysisRef.analyzedAt === other.analyzedAt &&
        analysisRef.planFingerprint === other.planFingerprint &&
        analysisRef.sectionId === other.sectionId &&
        analysisRef.stableKey === other.stableKey &&
        analysisRef.contentFingerprint === other.contentFingerprint
      )
    })
  )
}

export function isAiCoveragePlanMergeRequestIdentityCurrent(
  identity: AiCoveragePlanMergeRequestIdentity,
  currentContext: AiCoveragePlanMergeRequestContext | null,
  currentRequestToken: number,
) {
  if (!currentContext || identity.requestToken !== currentRequestToken) {
    return false
  }

  try {
    const normalized = normalizeRequestContext(currentContext)

    return (
      identity.selectedSetDigest === normalized.selectedSetDigest &&
      areSourceRevisionsEqual(
        identity.sourceRevision,
        normalized.sourceRevision,
      ) &&
      areSelectedAnalysesEqual(
        identity.selectedAnalyses,
        normalized.selectedAnalyses,
      )
    )
  } catch {
    return false
  }
}

export function createAiCoveragePlanMergeRequestGuard() {
  let requestToken = 0
  let disposed = false
  let activeRequest:
    | {
        identity: AiCoveragePlanMergeRequestIdentity
        abortController: AbortController
      }
    | null = null

  function invalidate() {
    if (!activeRequest) {
      return false
    }

    activeRequest.abortController.abort()
    activeRequest = null
    return true
  }

  function begin(
    context: AiCoveragePlanMergeRequestContext,
  ): AiCoveragePlanMergeGuardedRequest | null {
    if (disposed || activeRequest) {
      return null
    }

    requestToken += 1

    const abortController = new AbortController()
    const identity = createAiCoveragePlanMergeRequestIdentity(
      context,
      requestToken,
    )
    activeRequest = { identity, abortController }

    return { identity, signal: abortController.signal }
  }

  function replace(
    context: AiCoveragePlanMergeRequestContext,
  ): AiCoveragePlanMergeGuardedRequest | null {
    if (disposed) {
      return null
    }

    invalidate()
    return begin(context)
  }

  function canAccept(
    identity: AiCoveragePlanMergeRequestIdentity,
    currentContext: AiCoveragePlanMergeRequestContext | null,
  ) {
    return Boolean(
      activeRequest &&
        !activeRequest.abortController.signal.aborted &&
        activeRequest.identity === identity &&
        isAiCoveragePlanMergeRequestIdentityCurrent(
          identity,
          currentContext,
          requestToken,
        ),
    )
  }

  function invalidateIfContextChanged(
    currentContext: AiCoveragePlanMergeRequestContext | null,
  ) {
    if (!activeRequest) {
      return false
    }

    if (
      isAiCoveragePlanMergeRequestIdentityCurrent(
        activeRequest.identity,
        currentContext,
        requestToken,
      )
    ) {
      return false
    }

    return invalidate()
  }

  function acceptIfCurrent(
    identity: AiCoveragePlanMergeRequestIdentity,
    currentContext: AiCoveragePlanMergeRequestContext | null,
    accept: () => void,
  ) {
    if (!canAccept(identity, currentContext)) {
      return false
    }

    activeRequest = null
    accept()
    return true
  }

  function releaseIfCurrent(identity: AiCoveragePlanMergeRequestIdentity) {
    if (!activeRequest || activeRequest.identity !== identity) {
      return false
    }

    activeRequest = null
    return true
  }

  function dispose() {
    if (disposed) {
      return false
    }

    disposed = true
    const invalidated = invalidate()

    return invalidated
  }

  return {
    begin,
    replace,
    invalidate,
    invalidateIfContextChanged,
    canAccept,
    acceptIfCurrent,
    releaseIfCurrent,
    dispose,
    isInFlight: () => activeRequest !== null,
  }
}
