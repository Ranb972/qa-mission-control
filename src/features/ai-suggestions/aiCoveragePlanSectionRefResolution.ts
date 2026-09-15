import type { QaSourceSection, QaSourceSectionIndex } from '../qa-sources/qaSourceSections'
import type {
  AiCoveragePlan,
  AiCoveragePlanSectionCatalog,
  AiCoverageSourceSectionRef,
} from './aiCoveragePlanTypes'
import {
  createAiCoveragePlanSectionRefPairKey,
  getAiCoveragePlanSectionCatalogRuntimeContext,
} from './aiCoveragePlanSectionContext'

export type AiCoveragePlanSectionRefResolutionStatus =
  | 'no_refs'
  | 'resolved'
  | 'resolved_with_omissions'
  | 'stale_context'
  | 'unavailable_index'

export type AiCoveragePlanSectionRefResolution = {
  resolvedPlan: AiCoveragePlan
  status: AiCoveragePlanSectionRefResolutionStatus
  isFresh: boolean
  hasSavedRefs: boolean
  canDisplayResolvedRefs: boolean
  storedRefCount: number
  resolvedRefCount: number
  rejectedRefCount: number
  deduplicatedRefCount: number
  reasons: string[]
}

type RefCollectionResolution = {
  refs: AiCoverageSourceSectionRef[]
  rejectedRefCount: number
  deduplicatedRefCount: number
}

function countSavedRefs(plan: AiCoveragePlan) {
  return (
    plan.coverageAreas.reduce(
      (count, area) => count + (area.sourceSectionRefs?.length ?? 0),
      0,
    ) +
    plan.ambiguities.reduce(
      (count, ambiguity) =>
        count + (ambiguity.sourceSectionRefs?.length ?? 0),
      0,
    ) +
    plan.nextGenerationAreas.reduce(
      (count, area) => count + (area.sourceSectionRefs?.length ?? 0),
      0,
    )
  )
}

function replaceAllRefs(
  plan: AiCoveragePlan,
  resolveRefs: (
    refs: AiCoverageSourceSectionRef[],
  ) => AiCoverageSourceSectionRef[],
): AiCoveragePlan {
  return {
    ...plan,
    coverageAreas: plan.coverageAreas.map((area) => ({
      ...area,
      sourceSectionRefs: resolveRefs(area.sourceSectionRefs ?? []),
    })),
    ambiguities: plan.ambiguities.map((ambiguity) => ({
      ...ambiguity,
      sourceSectionRefs: resolveRefs(ambiguity.sourceSectionRefs ?? []),
    })),
    nextGenerationAreas: plan.nextGenerationAreas.map((area) => ({
      ...area,
      sourceSectionRefs: resolveRefs(area.sourceSectionRefs ?? []),
    })),
  }
}

function withoutSectionRefs(plan: AiCoveragePlan) {
  return replaceAllRefs(plan, () => [])
}

function hasSafeCurrentBounds(section: QaSourceSection) {
  return (
    Number.isInteger(section.startLine) &&
    Number.isInteger(section.endLine) &&
    section.startLine > 0 &&
    section.endLine >= section.startLine
  )
}

function resolveRef(
  savedRef: AiCoverageSourceSectionRef,
  sectionById: Map<string, QaSourceSection>,
  visibleCanonicalRefByPairKey: ReadonlyMap<
    string,
    AiCoverageSourceSectionRef
  >,
): AiCoverageSourceSectionRef | null {
  const currentSection = sectionById.get(savedRef.sectionId)
  const visibleCanonicalRef = visibleCanonicalRefByPairKey.get(
    createAiCoveragePlanSectionRefPairKey(
      savedRef.sectionId,
      savedRef.stableKey,
    ),
  )

  if (
    !currentSection ||
    !visibleCanonicalRef ||
    !currentSection.includedInCoverage ||
    currentSection.stableKey !== savedRef.stableKey ||
    !hasSafeCurrentBounds(currentSection) ||
    !Number.isInteger(savedRef.startLine) ||
    !Number.isInteger(savedRef.endLine)
  ) {
    return null
  }

  if (savedRef.visibility === 'full') {
    if (
      visibleCanonicalRef.visibility !== 'full' ||
      savedRef.startLine !== visibleCanonicalRef.startLine ||
      savedRef.endLine !== visibleCanonicalRef.endLine
    ) {
      return null
    }
  } else if (savedRef.visibility === 'partial') {
    if (
      savedRef.startLine !== visibleCanonicalRef.startLine ||
      savedRef.endLine < savedRef.startLine ||
      savedRef.endLine > visibleCanonicalRef.endLine
    ) {
      return null
    }
  } else {
    return null
  }

  return {
    sectionId: visibleCanonicalRef.sectionId,
    stableKey: visibleCanonicalRef.stableKey,
    ordinal: visibleCanonicalRef.ordinal,
    title: visibleCanonicalRef.title,
    path: [...visibleCanonicalRef.path],
    startLine: visibleCanonicalRef.startLine,
    endLine:
      savedRef.visibility === 'partial'
        ? savedRef.endLine
        : visibleCanonicalRef.endLine,
    visibility: savedRef.visibility,
  }
}

function preferNarrowerRef(
  existingRef: AiCoverageSourceSectionRef,
  candidateRef: AiCoverageSourceSectionRef,
) {
  if (existingRef.visibility === 'full' && candidateRef.visibility === 'partial') {
    return candidateRef
  }

  if (
    existingRef.visibility === 'partial' &&
    candidateRef.visibility === 'partial' &&
    candidateRef.endLine < existingRef.endLine
  ) {
    return candidateRef
  }

  return existingRef
}

function resolveRefCollection(
  savedRefs: AiCoverageSourceSectionRef[],
  sectionById: Map<string, QaSourceSection>,
  visibleCanonicalRefByPairKey: ReadonlyMap<
    string,
    AiCoverageSourceSectionRef
  >,
): RefCollectionResolution {
  const acceptedBySectionId = new Map<string, AiCoverageSourceSectionRef>()
  let rejectedRefCount = 0
  let deduplicatedRefCount = 0

  for (const savedRef of savedRefs) {
    const resolvedRef = resolveRef(
      savedRef,
      sectionById,
      visibleCanonicalRefByPairKey,
    )

    if (!resolvedRef) {
      rejectedRefCount += 1
      continue
    }

    const existingRef = acceptedBySectionId.get(resolvedRef.sectionId)

    if (existingRef) {
      deduplicatedRefCount += 1
      acceptedBySectionId.set(
        resolvedRef.sectionId,
        preferNarrowerRef(existingRef, resolvedRef),
      )
      continue
    }

    acceptedBySectionId.set(resolvedRef.sectionId, resolvedRef)
  }

  return {
    refs: [...acceptedBySectionId.values()].sort(
      (left, right) => left.ordinal - right.ordinal,
    ),
    rejectedRefCount,
    deduplicatedRefCount,
  }
}

function createPlanLevelFailure({
  plan,
  status,
  storedRefCount,
  reasons,
}: {
  plan: AiCoveragePlan
  status: Extract<
    AiCoveragePlanSectionRefResolutionStatus,
    'stale_context' | 'unavailable_index'
  >
  storedRefCount: number
  reasons: string[]
}): AiCoveragePlanSectionRefResolution {
  return {
    resolvedPlan: withoutSectionRefs(plan),
    status,
    isFresh: false,
    hasSavedRefs: true,
    canDisplayResolvedRefs: false,
    storedRefCount,
    resolvedRefCount: 0,
    rejectedRefCount: storedRefCount,
    deduplicatedRefCount: 0,
    reasons,
  }
}

export function resolveAiCoveragePlanSectionRefs(
  plan: AiCoveragePlan,
  currentIndex: QaSourceSectionIndex | null,
  currentCatalog: AiCoveragePlanSectionCatalog | null,
): AiCoveragePlanSectionRefResolution {
  const storedRefCount = countSavedRefs(plan)

  if (storedRefCount === 0) {
    return {
      resolvedPlan: withoutSectionRefs(plan),
      status: 'no_refs',
      isFresh: true,
      hasSavedRefs: false,
      canDisplayResolvedRefs: false,
      storedRefCount: 0,
      resolvedRefCount: 0,
      rejectedRefCount: 0,
      deduplicatedRefCount: 0,
      reasons: [],
    }
  }

  const catalogRuntimeContext =
    getAiCoveragePlanSectionCatalogRuntimeContext(currentCatalog)

  if (!currentIndex || !catalogRuntimeContext) {
    return createPlanLevelFailure({
      plan,
      status: 'unavailable_index',
      storedRefCount,
      reasons: [
        currentIndex
          ? 'The saved section references cannot be checked against the current visible source catalog.'
          : 'The saved section references cannot be checked right now.',
      ],
    })
  }

  const sectionContext = plan.sourceScope.sectionContext
  const currentSectionContext = catalogRuntimeContext.sectionContext
  const reasons: string[] = []

  if (plan.sourceScope.qaSourceId !== currentIndex.qaSourceId) {
    reasons.push(
      'The saved plan section references belong to a different QA Source.',
    )
  }

  if (!sectionContext?.available) {
    reasons.push('The saved plan has no usable source section context.')
  } else {
    if (
      sectionContext.sectionSchemaVersion !==
      currentSectionContext.sectionSchemaVersion
    ) {
      reasons.push('The saved plan references an older source section schema.')
    }

    if (
      sectionContext.sectionerVersion !== currentSectionContext.sectionerVersion
    ) {
      reasons.push('The saved plan references an older source sectioner version.')
    }

    if (
      sectionContext.sectionSetFingerprint !==
      currentSectionContext.sectionSetFingerprint
    ) {
      reasons.push(
        'The saved plan section references no longer match the source structure.',
      )
    }
  }

  if (
    currentSectionContext.sectionSchemaVersion !== currentIndex.schemaVersion ||
    currentSectionContext.sectionerVersion !== currentIndex.sectionerVersion ||
    currentSectionContext.sectionSetFingerprint !==
      currentIndex.sectionSetFingerprint
  ) {
    reasons.push(
      'The current visible source catalog no longer matches the source structure.',
    )
  }

  if (reasons.length > 0) {
    return createPlanLevelFailure({
      plan,
      status: 'stale_context',
      storedRefCount,
      reasons,
    })
  }

  const sectionById = new Map(
    currentIndex.sections.map((section) => [section.id, section]),
  )
  let rejectedRefCount = 0
  let deduplicatedRefCount = 0
  let resolvedRefCount = 0

  const resolveRefs = (refs: AiCoverageSourceSectionRef[]) => {
    const resolution = resolveRefCollection(
      refs,
      sectionById,
      catalogRuntimeContext.visibleCanonicalRefByPairKey,
    )
    rejectedRefCount += resolution.rejectedRefCount
    deduplicatedRefCount += resolution.deduplicatedRefCount
    resolvedRefCount += resolution.refs.length
    return resolution.refs
  }

  const resolvedPlan = replaceAllRefs(plan, resolveRefs)
  const hasOmissions = rejectedRefCount > 0

  return {
    resolvedPlan,
    status: hasOmissions ? 'resolved_with_omissions' : 'resolved',
    isFresh: !hasOmissions,
    hasSavedRefs: true,
    canDisplayResolvedRefs: resolvedRefCount > 0,
    storedRefCount,
    resolvedRefCount,
    rejectedRefCount,
    deduplicatedRefCount,
    reasons: hasOmissions
      ? [
          `${rejectedRefCount} saved source section ${
            rejectedRefCount === 1 ? 'reference' : 'references'
          } could not be revalidated.`,
        ]
      : [],
  }
}
