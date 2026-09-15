import {
  createQaSourceFingerprint,
  parsePersistedCoveragePlanOrigin,
  type PersistedCoveragePlanRecord,
} from '../../lib/storage/coveragePlanStorage'
import type { QaSource } from '../qa-sources/qaSourceTypes'
import type { QaSourceSectionIndex } from '../qa-sources/qaSourceSections'
import {
  resolveAiCoveragePlanMergeEligibility,
  type AiCoveragePlanMergeEligibleAnalysis,
} from './aiCoveragePlanMergeEligibility'
import type { AiCoveragePlanMergeSelectedAnalysisRef } from './aiCoveragePlanMergeTypes'
import type {
  AiCoveragePlan,
  AiCoverageSourceSectionRef,
} from './aiCoveragePlanTypes'
import type { AiCoveragePlanSectionRefResolution } from './aiCoveragePlanSectionRefResolution'
import { getSectionBehaviorGrounding } from './aiSectionCoveragePlanTypes'

type ResolveAiMergedCoveragePlanSectionRefsInput = {
  record: PersistedCoveragePlanRecord
  qaSource: QaSource | null
  currentIndex: QaSourceSectionIndex | null
  currentSectionPlanRecords: readonly unknown[]
}

type RefCollectionResolution = {
  refs: AiCoverageSourceSectionRef[]
  rejectedRefCount: number
  deduplicatedRefCount: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function countSavedRefs(plan: AiCoveragePlan) {
  return (
    plan.coverageAreas.reduce(
      (count, area) => count + area.sourceSectionRefs.length,
      0,
    ) +
    plan.ambiguities.reduce(
      (count, ambiguity) => count + ambiguity.sourceSectionRefs.length,
      0,
    ) +
    plan.nextGenerationAreas.reduce(
      (count, area) => count + area.sourceSectionRefs.length,
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
      sourceSectionRefs: resolveRefs(area.sourceSectionRefs),
    })),
    ambiguities: plan.ambiguities.map((ambiguity) => ({
      ...ambiguity,
      sourceSectionRefs: resolveRefs(ambiguity.sourceSectionRefs),
    })),
    nextGenerationAreas: plan.nextGenerationAreas.map((area) => ({
      ...area,
      sourceSectionRefs: resolveRefs(area.sourceSectionRefs),
    })),
  }
}

function withoutSectionRefs(plan: AiCoveragePlan) {
  return replaceAllRefs(plan, () => [])
}

/** Derived display/generation guard only: do not rewrite historical saved plans. */
function withVerifiedBehaviorReadiness(plan: AiCoveragePlan, canRetain: (areaId: string) => boolean = () => false): AiCoveragePlan {
  const coverageAreas = plan.coverageAreas.map(area => area.generationReadiness === 'source_backed' && !canRetain(area.id)
    ? { ...area, generationReadiness: 'needs_review' as const } : area)
  return { ...plan, coverageAreas,
    warnings: coverageAreas.some((area, index) => area.generationReadiness !== plan.coverageAreas[index].generationReadiness)
      ? [...new Set([...plan.warnings, 'Merged behavior evidence cannot be fully revalidated from the exact current contributing analyses. Review is required; the saved plan has not been rewritten.'])]
      : plan.warnings,
  }
}

function createPlanLevelFailure({
  record,
  status,
  reason,
}: {
  record: PersistedCoveragePlanRecord
  status: 'stale_context' | 'unavailable_index'
  reason: string
}): AiCoveragePlanSectionRefResolution {
  const storedRefCount = countSavedRefs(record.plan)

  return {
    resolvedPlan: withVerifiedBehaviorReadiness(withoutSectionRefs(record.plan)),
    status,
    isFresh: false,
    hasSavedRefs: storedRefCount > 0,
    canDisplayResolvedRefs: false,
    storedRefCount,
    resolvedRefCount: 0,
    rejectedRefCount: storedRefCount,
    deduplicatedRefCount: 0,
    reasons: [reason],
  }
}

function hasMatchingSourceRevision(
  record: PersistedCoveragePlanRecord,
  qaSource: QaSource,
) {
  return (
    record.sourceIdentity.qaSourceId === qaSource.id &&
    record.sourceIdentity.qaSourceCreatedAt === qaSource.createdAt &&
    record.sourceIdentity.qaSourceUpdatedAt === qaSource.updatedAt &&
    record.sourceIdentity.sourceFingerprint === createQaSourceFingerprint(qaSource) &&
    record.plan.sourceScope.qaSourceId === qaSource.id
  )
}

function selectedAnalysisRefsMatch(
  persisted: AiCoveragePlanMergeSelectedAnalysisRef,
  current: AiCoveragePlanMergeSelectedAnalysisRef,
) {
  return (
    persisted.analysisRefId === current.analysisRefId &&
    persisted.sectionPlanRecordId === current.sectionPlanRecordId &&
    persisted.analyzedAt === current.analyzedAt &&
    persisted.planFingerprint === current.planFingerprint &&
    persisted.sectionId === current.sectionId &&
    persisted.stableKey === current.stableKey &&
    persisted.contentFingerprint === current.contentFingerprint
  )
}

function findSelectedRecords(
  selectedAnalyses: readonly AiCoveragePlanMergeSelectedAnalysisRef[],
  currentRecords: readonly unknown[],
) {
  const selectedRecords: unknown[] = []

  for (const selectedAnalysis of selectedAnalyses) {
    const matches = currentRecords.filter(
      (value) =>
        isRecord(value) && value.id === selectedAnalysis.sectionPlanRecordId,
    )

    if (matches.length !== 1) {
      return null
    }

    selectedRecords.push(matches[0])
  }

  return selectedRecords
}

function hasMatchingMergedContext(
  record: PersistedCoveragePlanRecord,
  currentIndex: QaSourceSectionIndex,
  selectedAnalyses: readonly AiCoveragePlanMergeEligibleAnalysis[],
) {
  const sectionContext = record.plan.sourceScope.sectionContext

  return Boolean(
    sectionContext?.available &&
      sectionContext.sectionSchemaVersion === currentIndex.schemaVersion &&
      sectionContext.sectionerVersion === currentIndex.sectionerVersion &&
      sectionContext.sectionSetFingerprint ===
        currentIndex.sectionSetFingerprint &&
      sectionContext.totalSectionCount === currentIndex.sections.length &&
      sectionContext.visibleSectionCount === selectedAnalyses.length &&
      sectionContext.omittedSectionCount ===
        currentIndex.sections.length - selectedAnalyses.length &&
      record.plan.sourceScope.sourceTruncated ===
        selectedAnalyses.some(
          (analysis) => analysis.record.sectionSnapshot.truncated,
        ),
  )
}

function resolveRef(
  savedRef: AiCoverageSourceSectionRef,
  selectedBySectionId: ReadonlyMap<string, AiCoveragePlanMergeEligibleAnalysis>,
) {
  const selected = selectedBySectionId.get(savedRef.sectionId)

  if (
    !selected ||
    selected.analysisRef.stableKey !== savedRef.stableKey ||
    !Number.isSafeInteger(savedRef.startLine) ||
    !Number.isSafeInteger(savedRef.endLine)
  ) {
    return null
  }

  const current = selected.section

  if (savedRef.visibility === 'full') {
    if (
      current.truncated ||
      savedRef.startLine !== current.startLine ||
      savedRef.endLine !== current.endLine
    ) {
      return null
    }
  } else if (savedRef.visibility === 'partial') {
    if (
      savedRef.startLine !== current.startLine ||
      savedRef.endLine < savedRef.startLine ||
      savedRef.endLine > current.visibleEndLine
    ) {
      return null
    }
  } else {
    return null
  }

  return {
    sectionId: current.sectionId,
    stableKey: current.stableKey,
    ordinal: current.ordinal,
    title: current.title,
    path: [...current.path],
    startLine: current.startLine,
    endLine: savedRef.visibility === 'partial' ? savedRef.endLine : current.endLine,
    visibility: savedRef.visibility,
  } satisfies AiCoverageSourceSectionRef
}

function preferNarrowerRef(
  existing: AiCoverageSourceSectionRef,
  candidate: AiCoverageSourceSectionRef,
) {
  if (existing.visibility === 'full' && candidate.visibility === 'partial') {
    return candidate
  }

  if (
    existing.visibility === 'partial' &&
    candidate.visibility === 'partial' &&
    candidate.endLine < existing.endLine
  ) {
    return candidate
  }

  return existing
}

function resolveRefCollection(
  savedRefs: AiCoverageSourceSectionRef[],
  selectedBySectionId: ReadonlyMap<string, AiCoveragePlanMergeEligibleAnalysis>,
): RefCollectionResolution {
  const acceptedBySectionId = new Map<string, AiCoverageSourceSectionRef>()
  let rejectedRefCount = 0
  let deduplicatedRefCount = 0

  for (const savedRef of savedRefs) {
    const resolvedRef = resolveRef(savedRef, selectedBySectionId)

    if (!resolvedRef) {
      rejectedRefCount += 1
      continue
    }

    const existing = acceptedBySectionId.get(resolvedRef.sectionId)

    if (existing) {
      deduplicatedRefCount += 1
      acceptedBySectionId.set(
        resolvedRef.sectionId,
        preferNarrowerRef(existing, resolvedRef),
      )
    } else {
      acceptedBySectionId.set(resolvedRef.sectionId, resolvedRef)
    }
  }

  return {
    refs: [...acceptedBySectionId.values()].sort(
      (left, right) => left.ordinal - right.ordinal,
    ),
    rejectedRefCount,
    deduplicatedRefCount,
  }
}

export function resolveAiMergedCoveragePlanSectionRefs({
  record,
  qaSource,
  currentIndex,
  currentSectionPlanRecords,
}: ResolveAiMergedCoveragePlanSectionRefsInput): AiCoveragePlanSectionRefResolution {
  if (!qaSource || !currentIndex) {
    return createPlanLevelFailure({
      record,
      status: 'unavailable_index',
      reason:
        'The saved merged-plan section references cannot be checked right now.',
    })
  }

  const origin = parsePersistedCoveragePlanOrigin(record.origin, record.plan)

  if (!origin || origin.kind !== 'section_merge') {
    return createPlanLevelFailure({
      record,
      status: 'stale_context',
      reason: 'The saved merged-plan origin is not valid.',
    })
  }

  if (!hasMatchingSourceRevision(record, qaSource)) {
    return createPlanLevelFailure({
      record,
      status: 'stale_context',
      reason: 'The saved merged plan no longer matches the current QA Source revision.',
    })
  }

  const selectedRecords = findSelectedRecords(
    origin.selectedAnalyses,
    currentSectionPlanRecords,
  )

  if (!selectedRecords) {
    return createPlanLevelFailure({
      record,
      status: 'stale_context',
      reason:
        'The saved merged plan no longer matches the selected section analyses.',
    })
  }

  const eligibility = resolveAiCoveragePlanMergeEligibility({
    qaSource,
    sectionIndex: currentIndex,
    selectedRecords,
    allRecords: currentSectionPlanRecords,
  })

  if (!eligibility.ok) {
    return createPlanLevelFailure({
      record,
      status: 'stale_context',
      reason:
        'The saved merged plan no longer matches the current section analyses.',
    })
  }

  const currentByAnalysisRefId = new Map(
    eligibility.selectedAnalyses.map((analysis) => [
      analysis.analysisRef.analysisRefId,
      analysis.analysisRef,
    ]),
  )
  const exactSelectedAnalysesMatch = origin.selectedAnalyses.every(
    (persisted) => {
      const current = currentByAnalysisRefId.get(persisted.analysisRefId)
      return Boolean(current && selectedAnalysisRefsMatch(persisted, current))
    },
  )

  if (
    currentByAnalysisRefId.size !== origin.selectedAnalyses.length ||
    !exactSelectedAnalysesMatch ||
    !hasMatchingMergedContext(record, currentIndex, eligibility.selectedAnalyses)
  ) {
    return createPlanLevelFailure({
      record,
      status: 'stale_context',
      reason:
        'The saved merged plan no longer matches the current section analyses.',
    })
  }

  const storedRefCount = countSavedRefs(record.plan)

  if (storedRefCount === 0) {
    return {
      resolvedPlan: withVerifiedBehaviorReadiness(withoutSectionRefs(record.plan)),
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

  const selectedBySectionId = new Map(
    eligibility.selectedAnalyses.map((analysis) => [
      analysis.analysisRef.sectionId,
      analysis,
    ]),
  )
  let rejectedRefCount = 0
  let deduplicatedRefCount = 0
  let resolvedRefCount = 0
  const resolveRefs = (refs: AiCoverageSourceSectionRef[]) => {
    const resolution = resolveRefCollection(refs, selectedBySectionId)
    rejectedRefCount += resolution.rejectedRefCount
    deduplicatedRefCount += resolution.deduplicatedRefCount
    resolvedRefCount += resolution.refs.length
    return resolution.refs
  }
  const resolvedPlan = replaceAllRefs(record.plan, resolveRefs)
  const hasOmissions = rejectedRefCount > 0
  const analysesById = new Map(eligibility.selectedAnalyses.map(analysis => [analysis.analysisRef.analysisRefId, analysis]))
  const canRetainReadiness = (areaId: string) => {
    if (hasOmissions) return false
    const provenance = origin.outputProvenance.find(item => item.outputFindingId === areaId && item.outputFindingKind === 'coverage_area')
    return !!provenance?.contributors.length && provenance.contributors.every(contributor => {
      if (contributor.sourceFindingKind !== 'coverage_area') return false
      const area = analysesById.get(contributor.analysisRefId)?.record.plan.coverageAreas.find(item => item.id === contributor.sourceFindingId)
      return !!area && getSectionBehaviorGrounding(area).status === 'linked'
    })
  }

  return {
    resolvedPlan: withVerifiedBehaviorReadiness(resolvedPlan, canRetainReadiness),
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
          `${rejectedRefCount} saved merged-plan source section ${
            rejectedRefCount === 1 ? 'reference' : 'references'
          } could not be revalidated.`,
        ]
      : [],
  }
}
