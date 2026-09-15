import type { AiSectionCoveragePlanContext } from './aiSectionCoveragePlanTypes'

export type AiSectionCoveragePlanRequestIdentity = Readonly<{
  sourceId: string
  sourceCreatedAt: string
  sourceUpdatedAt: string
  sourceFingerprint: string
  sectionId: string
  sectionStableKey: string
  sectionContentFingerprint: string
  requestToken: number
}>

export type AiSectionCoveragePlanGuardedRequest = {
  identity: AiSectionCoveragePlanRequestIdentity
  signal: AbortSignal
}

export function createAiSectionCoveragePlanRequestIdentity(
  context: AiSectionCoveragePlanContext,
  requestToken: number,
): AiSectionCoveragePlanRequestIdentity {
  if (!Number.isSafeInteger(requestToken) || requestToken <= 0) {
    throw new TypeError('Section analysis request token must be a positive integer.')
  }

  return Object.freeze({
    sourceId: context.sourceIdentity.qaSourceId,
    sourceCreatedAt: context.sourceIdentity.qaSourceCreatedAt,
    sourceUpdatedAt: context.sourceIdentity.qaSourceUpdatedAt,
    sourceFingerprint: context.sourceIdentity.sourceFingerprint,
    sectionId: context.sectionIdentity.sectionId,
    sectionStableKey: context.sectionIdentity.stableKey,
    sectionContentFingerprint: context.sectionIdentity.contentFingerprint,
    requestToken,
  })
}

export function isAiSectionCoveragePlanRequestIdentityCurrent(
  identity: AiSectionCoveragePlanRequestIdentity,
  currentContext: AiSectionCoveragePlanContext | null,
  currentRequestToken: number,
) {
  return Boolean(
    currentContext &&
      identity.requestToken === currentRequestToken &&
      identity.sourceId === currentContext.sourceIdentity.qaSourceId &&
      identity.sourceCreatedAt ===
        currentContext.sourceIdentity.qaSourceCreatedAt &&
      identity.sourceUpdatedAt ===
        currentContext.sourceIdentity.qaSourceUpdatedAt &&
      identity.sourceFingerprint ===
        currentContext.sourceIdentity.sourceFingerprint &&
      identity.sectionId === currentContext.sectionIdentity.sectionId &&
      identity.sectionStableKey ===
        currentContext.sectionIdentity.stableKey &&
      identity.sectionContentFingerprint ===
        currentContext.sectionIdentity.contentFingerprint,
  )
}

export function createAiSectionCoveragePlanRequestGuard() {
  let requestToken = 0
  let activeRequest:
    | {
        identity: AiSectionCoveragePlanRequestIdentity
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
    context: AiSectionCoveragePlanContext,
  ): AiSectionCoveragePlanGuardedRequest {
    invalidate()
    requestToken += 1

    const abortController = new AbortController()
    const identity = createAiSectionCoveragePlanRequestIdentity(
      context,
      requestToken,
    )
    activeRequest = { identity, abortController }

    return { identity, signal: abortController.signal }
  }

  function canAccept(
    identity: AiSectionCoveragePlanRequestIdentity,
    currentContext: AiSectionCoveragePlanContext | null,
  ) {
    return Boolean(
      activeRequest &&
        !activeRequest.abortController.signal.aborted &&
        activeRequest.identity.requestToken === identity.requestToken &&
        activeRequest.identity === identity &&
        isAiSectionCoveragePlanRequestIdentityCurrent(
          identity,
          currentContext,
          requestToken,
        ),
    )
  }

  function invalidateIfContextChanged(
    currentContext: AiSectionCoveragePlanContext | null,
  ) {
    if (!activeRequest) {
      return false
    }

    if (
      isAiSectionCoveragePlanRequestIdentityCurrent(
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
    identity: AiSectionCoveragePlanRequestIdentity,
    currentContext: AiSectionCoveragePlanContext | null,
    accept: () => void,
  ) {
    if (!canAccept(identity, currentContext)) {
      return false
    }

    activeRequest = null
    accept()
    return true
  }

  return {
    begin,
    invalidate,
    invalidateIfContextChanged,
    canAccept,
    acceptIfCurrent,
  }
}
