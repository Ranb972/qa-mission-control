import {
  AI_COVERAGE_PLAN_SCHEMA_VERSION,
  type AiCoveragePlan,
  type AiCoveragePlanPriority,
  type AiCoverageSourceSectionRef,
} from './aiCoveragePlanTypes'
import {
  createAiCoveragePlanMergeBehaviorOutputFindingId,
  createAiCoveragePlanMergeScalarOutputFindingId,
} from './aiCoveragePlanMergeOutputIdentity'
import {
  AI_COVERAGE_PLAN_MERGE_ORIGIN_SCHEMA_VERSION,
  type AiCoveragePlanMergeDurableRelation,
  type AiCoveragePlanMergeExactDuplicateSummary,
  type AiCoveragePlanMergeNormalizedFinding,
  type AiCoveragePlanMergeOutputProvenance,
  type AiCoveragePlanSectionMergeOrigin,
  type AiCoveragePlanMergeSectionScope,
  type AiCoveragePlanMergeSourceRevision,
  type GlobalCoverageMergeCandidate,
} from './aiCoveragePlanMergeTypes'

export type AiCoveragePlanMergeClassifiedFindings = {
  findings: AiCoveragePlanMergeNormalizedFinding[]
  outputProvenance: AiCoveragePlanMergeOutputProvenance[]
  reviewRelations: AiCoveragePlanMergeDurableRelation[]
  exactDuplicateSummary: AiCoveragePlanMergeExactDuplicateSummary
}

export type AiCoveragePlanMergeDraft = {
  plan: AiCoveragePlan
  outputProvenance: AiCoveragePlanMergeOutputProvenance[]
  reviewRelations: AiCoveragePlanMergeDurableRelation[]
}

function compareCodeUnits(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0
}

function mapPriority(priority: 'high' | 'medium' | 'low'): AiCoveragePlanPriority {
  switch (priority) {
    case 'high':
      return 'High'
    case 'medium':
      return 'Medium'
    case 'low':
      return 'Low'
  }
}

function createSectionRef(
  section: AiCoveragePlanMergeSectionScope['selected'][number],
): AiCoverageSourceSectionRef {
  return {
    sectionId: section.sectionId,
    stableKey: section.stableKey,
    ordinal: section.ordinal,
    title: section.title,
    path: [...section.path],
    startLine: section.startLine,
    endLine: section.truncated ? section.visibleEndLine : section.endLine,
    visibility: section.truncated ? 'partial' : 'full',
  }
}

function createRefsForFinding(
  finding: AiCoveragePlanMergeNormalizedFinding,
  selectedSectionByAnalysisRefId: ReadonlyMap<
    string,
    AiCoveragePlanMergeSectionScope['selected'][number]
  >,
) {
  const refs = finding.contributors
    .map((contributor) =>
      selectedSectionByAnalysisRefId.get(contributor.analysisRefId),
    )
    .filter(
      (
        section,
      ): section is AiCoveragePlanMergeSectionScope['selected'][number] =>
        section !== undefined,
    )
    .map(createSectionRef)
  const bySectionId = new Map<string, AiCoverageSourceSectionRef>()

  for (const ref of refs) {
    const existing = bySectionId.get(ref.sectionId)

    if (
      !existing ||
      (existing.visibility === 'full' && ref.visibility === 'partial') ||
      (existing.visibility === 'partial' &&
        ref.visibility === 'partial' &&
        ref.endLine < existing.endLine)
    ) {
      bySectionId.set(ref.sectionId, ref)
    }
  }

  return [...bySectionId.values()].sort(
    (left, right) =>
      left.ordinal - right.ordinal || compareCodeUnits(left.sectionId, right.sectionId),
  )
}

function relationKindsForFinding(
  findingId: string,
  relations: readonly AiCoveragePlanMergeDurableRelation[],
) {
  return new Set(
    relations
      .filter((relation) => relation.outputFindingIds.includes(findingId))
      .map((relation) => relation.kind),
  )
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values))
}

function remapProvenance(
  outputProvenance: readonly AiCoveragePlanMergeOutputProvenance[],
  durableIdByTransientId: ReadonlyMap<string, string>,
) {
  return outputProvenance.map((item) => {
    const outputFindingId = durableIdByTransientId.get(item.outputFindingId)
    if (!outputFindingId) {
      throw new TypeError(
        `Merge provenance could not be mapped for ${item.outputFindingKind}.`,
      )
    }

    return {
      ...structuredClone(item),
      outputFindingId,
    }
  })
}

function remapRelations(
  relations: readonly AiCoveragePlanMergeDurableRelation[],
  durableIdByTransientId: ReadonlyMap<string, string>,
) {
  return relations.map((relation) => {
    const left = durableIdByTransientId.get(relation.outputFindingIds[0])
    const right = durableIdByTransientId.get(relation.outputFindingIds[1])

    if (!left || !right || left === right) {
      throw new TypeError('A merge relation could not be mapped safely.')
    }

    return {
      ...structuredClone(relation),
      outputFindingIds: [left, right] as [string, string],
    }
  })
}

export function buildAiCoveragePlanMergeDraft({
  sourceRevision,
  sectionScope,
  findings,
  outputProvenance,
  reviewRelations,
}: {
  sourceRevision: AiCoveragePlanMergeSourceRevision
  sectionScope: AiCoveragePlanMergeSectionScope
} & AiCoveragePlanMergeClassifiedFindings): AiCoveragePlanMergeDraft {
  const selectedSectionByAnalysisRefId = new Map(
    sectionScope.selected.map((section) => [section.analysisRefId, section]),
  )
  const durableIdByTransientId = new Map<string, string>()
  const areaFindings = findings.filter(
    (
      finding,
    ): finding is Extract<
      AiCoveragePlanMergeNormalizedFinding,
      { kind: 'coverage_area' }
    > => finding.kind === 'coverage_area',
  )
  const behaviorFindings = findings.filter(
    (
      finding,
    ): finding is Extract<
      AiCoveragePlanMergeNormalizedFinding,
      { kind: 'behavior' }
    > => finding.kind === 'behavior',
  )
  const ambiguityFindings = findings.filter(
    (
      finding,
    ): finding is Extract<
      AiCoveragePlanMergeNormalizedFinding,
      { kind: 'ambiguity' }
    > => finding.kind === 'ambiguity',
  )
  const nextCoverageFindings = findings.filter(
    (
      finding,
    ): finding is Extract<
      AiCoveragePlanMergeNormalizedFinding,
      { kind: 'next_coverage' }
    > => finding.kind === 'next_coverage',
  )
  const hasAnyConflict = reviewRelations.some(
    (relation) => relation.kind === 'conflict',
  )
  const hasAnyReviewRelation = reviewRelations.some(
    (relation) =>
      relation.kind === 'likely_overlap' ||
      relation.kind === 'needs_qa_review',
  )
  const hasUnresolvedAmbiguity = ambiguityFindings.length > 0

  const coverageAreas = areaFindings.map((finding) => {
    const areaId = finding.findingId
    durableIdByTransientId.set(finding.findingId, areaId)
    const areaBehaviorFindings = behaviorFindings.filter(
      (behavior) =>
        behavior.semanticData.parentCoverageAreaFindingId === finding.findingId,
    )
    const behaviors = areaBehaviorFindings.map((behavior, index) => {
      durableIdByTransientId.set(
        behavior.findingId,
        createAiCoveragePlanMergeBehaviorOutputFindingId(areaId, index),
      )
      return behavior.semanticData.text
    })
    const relationKinds = new Set([
      ...relationKindsForFinding(finding.findingId, reviewRelations),
      ...areaBehaviorFindings.flatMap((behavior) =>
        [...relationKindsForFinding(behavior.findingId, reviewRelations)],
      ),
    ])
    const evidence = finding.validatedEvidence.map((item) => item.excerpt)
    const generationReadiness =
      hasAnyConflict ||
      hasUnresolvedAmbiguity ||
      relationKinds.has('conflict')
        ? ('blocked_by_ambiguity' as const)
        : evidence.length === 0 ||
            finding.allBehaviorEvidenceLinked !== true ||
            hasAnyReviewRelation ||
            relationKinds.has('likely_overlap') ||
            relationKinds.has('needs_qa_review')
          ? ('needs_review' as const)
          : ('source_backed' as const)

    return {
      id: areaId,
      name: finding.semanticData.name,
      summary: finding.semanticData.summary,
      behaviors,
      risks: [],
      evidence,
      ambiguities: [],
      generationReadiness,
      sourceSectionRefs: createRefsForFinding(
        finding,
        selectedSectionByAnalysisRefId,
      ),
    }
  })

  const textFindingKinds = [
    ['actor', 'actors'],
    ['state', 'states'],
    ['input', 'inputs'],
    ['failure_mode', 'failureModes'],
    ['integration_risk', 'integrationRisks'],
    ['permissions_security', 'permissionsSecurity'],
    ['data_persistence', 'dataPersistenceRules'],
    ['warning', 'warnings'],
  ] as const
  const textLists = new Map<string, string[]>()

  for (const [kind, key] of textFindingKinds) {
    const matching = findings.filter(
      (
        finding,
      ): finding is Extract<
        AiCoveragePlanMergeNormalizedFinding,
        { kind: typeof kind }
      > => finding.kind === kind,
    )
    textLists.set(
      key,
      matching.map((finding, index) => {
        durableIdByTransientId.set(
          finding.findingId,
          createAiCoveragePlanMergeScalarOutputFindingId(kind, index),
        )
        return finding.semanticData.text
      }),
    )
  }

  const ambiguities = ambiguityFindings.map((finding) => {
    durableIdByTransientId.set(finding.findingId, finding.findingId)
    return {
      id: finding.findingId,
      question: finding.semanticData.question,
      whyItMatters: finding.semanticData.whyItMatters,
      severity: mapPriority(finding.semanticData.severity),
      sourceSectionRefs: createRefsForFinding(
        finding,
        selectedSectionByAnalysisRefId,
      ),
    }
  })
  const nextGenerationAreas = nextCoverageFindings.map((finding) => {
    durableIdByTransientId.set(finding.findingId, finding.findingId)
    return {
      id: finding.findingId,
      title: finding.semanticData.title,
      rationale: finding.semanticData.rationale,
      priority: mapPriority(finding.semanticData.priority),
      relatedAreaIds: [],
      suggestedTestCount: 0,
      sourceSectionRefs: createRefsForFinding(
        finding,
        selectedSectionByAnalysisRefId,
      ),
    }
  })

  const sourceTruncated = sectionScope.selected.some(
    (section) => section.truncated,
  )
  const hasIncompleteIncludedScope =
    sectionScope.unselected.length > 0 ||
    sectionScope.stale.length > 0 ||
    sectionScope.unanalyzed.length > 0
  const coverageCompleteness = sourceTruncated
    ? ('partial_due_to_truncation' as const)
    : hasIncompleteIncludedScope
      ? ('insufficient_source' as const)
      : ('visible_source_only' as const)
  const scopeWarning = [
    'Merged section-analysis scope counts',
    `selected: ${sectionScope.selected.length}`,
    `current but unselected: ${sectionScope.unselected.length}`,
    `stale: ${sectionScope.stale.length}`,
    `unanalyzed: ${sectionScope.unanalyzed.length}`,
    `excluded: ${sectionScope.excluded.length}`,
  ].join('; ')
  const totalSectionCount =
    sectionScope.selected.length +
    sectionScope.unselected.length +
    sectionScope.stale.length +
    sectionScope.unanalyzed.length +
    sectionScope.excluded.length
  const plan: AiCoveragePlan = {
    schemaVersion: AI_COVERAGE_PLAN_SCHEMA_VERSION,
    sourceScope: {
      qaSourceId: sourceRevision.qaSourceId,
      visibleSourceOnly: true,
      sourceTruncated,
      coverageCompleteness,
      sectionContext: {
        available: true,
        sectionSchemaVersion: sourceRevision.sectionSchemaVersion,
        sectionerVersion: sourceRevision.sectionerVersion,
        sectionSetFingerprint: sourceRevision.sectionSetFingerprint,
        totalSectionCount,
        visibleSectionCount: sectionScope.selected.length,
        omittedSectionCount: totalSectionCount - sectionScope.selected.length,
      },
    },
    coverageAreas,
    actors: textLists.get('actors') ?? [],
    states: textLists.get('states') ?? [],
    inputs: textLists.get('inputs') ?? [],
    failureModes: textLists.get('failureModes') ?? [],
    integrationRisks: textLists.get('integrationRisks') ?? [],
    permissionsSecurity: textLists.get('permissionsSecurity') ?? [],
    dataPersistenceRules: textLists.get('dataPersistenceRules') ?? [],
    ambiguities,
    nextGenerationAreas,
    // Durable warnings must retain exact contributing-finding provenance.
    // App-derived review advice belongs in the UI, not this persisted list.
    warnings: uniqueStrings([...(textLists.get('warnings') ?? []), scopeWarning]),
  }

  return {
    plan,
    outputProvenance: remapProvenance(
      outputProvenance,
      durableIdByTransientId,
    ),
    reviewRelations: remapRelations(
      reviewRelations,
      durableIdByTransientId,
    ),
  }
}

export function convertGlobalCoverageMergeCandidate(
  candidate: GlobalCoverageMergeCandidate,
): {
  plan: AiCoveragePlan
  origin: AiCoveragePlanSectionMergeOrigin
} {
  return structuredClone({
    plan: candidate.planDraft,
    origin: {
      kind: 'section_merge' as const,
      originSchemaVersion: AI_COVERAGE_PLAN_MERGE_ORIGIN_SCHEMA_VERSION,
      selectedAnalyses: candidate.selectedAnalyses,
      outputProvenance: candidate.outputProvenance,
      reviewRelations: candidate.reviewRelations,
    },
  })
}
