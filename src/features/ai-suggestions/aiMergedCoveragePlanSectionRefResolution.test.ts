import { describe, expect, it, vi } from 'vitest'
import {
  createPersistedCoveragePlanRecord,
  type PersistedCoveragePlanRecord,
} from '../../lib/storage/coveragePlanStorage'
import { createPersistedSectionCoveragePlanRecord } from '../../lib/storage/sectionCoveragePlanStorage'
import { createQaSource } from '../../test/qaSourceFactory'
import { createQaSourceSectionIndex } from '../qa-sources/qaSourceSections'
import type { QaSource } from '../qa-sources/qaSourceTypes'
import { createAiCoveragePlanMergeSelectedAnalysisRef } from './aiCoveragePlanMergeEligibility'
import {
  AI_COVERAGE_PLAN_MERGE_ORIGIN_SCHEMA_VERSION,
  type AiCoveragePlanSectionMergeOrigin,
} from './aiCoveragePlanMergeTypes'
import {
  createAiCoveragePlanSectionCatalog,
  getAiCoveragePlanSectionCatalogRuntimeContext,
} from './aiCoveragePlanSectionContext'
import { resolveAiCoveragePlanSectionRefs } from './aiCoveragePlanSectionRefResolution'
import type {
  AiCoveragePlan,
  AiCoverageSourceSectionRef,
} from './aiCoveragePlanTypes'
import {
  AI_SECTION_COVERAGE_PLAN_SCHEMA_VERSION,
  type AiSectionCoveragePlan,
  type PersistedSectionCoveragePlanRecord,
} from './aiSectionCoveragePlanTypes'
import { resolveAiSectionCoveragePlanContext } from './aiSectionCoveragePlanContext'
import { packQaSourceForAiSuggestions } from './aiSuggestionContext'
import { resolveAiMergedCoveragePlanSectionRefs } from './aiMergedCoveragePlanSectionRefResolution'

const MANY_SECTION_CONTENT = Array.from({ length: 42 }, (_, index) =>
  [`# Section ${index + 1}`, `Rule ${index + 1} must be covered.`].join('\n'),
).join('\n\n')

type Fixture = {
  qaSource: QaSource
  sectionIndex: ReturnType<typeof createQaSourceSectionIndex>
  records: PersistedSectionCoveragePlanRecord[]
}

function createSectionPlan(evidence: string): AiSectionCoveragePlan {
  return {
    schemaVersion: AI_SECTION_COVERAGE_PLAN_SCHEMA_VERSION,
    coverageAreas: [
      {
        id: 'section-area-1',
        name: 'Section behavior',
        summary: evidence,
        behaviors: [],
        evidence: [evidence],
        evidenceSupport: 'source_backed',
      },
    ],
    actors: [],
    states: [],
    inputs: [],
    failureModes: [],
    integrationRisks: [],
    permissionsSecurity: [],
    dataPersistenceConcerns: [],
    ambiguities: [],
    nextCoverage: [],
    warnings: [],
  }
}

function createFixture(
  content = MANY_SECTION_CONTENT,
  selectedIndexes = [0, 1],
): Fixture {
  const qaSource = createQaSource({
    id: 'source-1',
    content,
    createdAt: '2026-07-18T08:00:00.000Z',
    updatedAt: '2026-07-18T08:00:00.000Z',
  })
  const sectionIndex = createQaSourceSectionIndex(
    qaSource,
    '2026-07-18T08:01:00.000Z',
  )
  const records = selectedIndexes.map((sectionIndexPosition, recordIndex) => {
    const section = sectionIndex.sections[sectionIndexPosition]
    const contextResult = resolveAiSectionCoveragePlanContext({
      qaSource,
      sectionIndex,
      selectedSection: {
        sectionId: section.id,
        stableKey: section.stableKey,
      },
    })

    if (!contextResult.ok) {
      throw new Error(contextResult.error)
    }

    const evidence = contextResult.context.visibleSection.content
      .slice(0, 120)
      .trim()

    return createPersistedSectionCoveragePlanRecord({
      context: contextResult.context,
      plan: createSectionPlan(evidence),
      analyzedAt: `2026-07-18T08:1${recordIndex}:00.000Z`,
    })
  })

  return { qaSource, sectionIndex, records }
}

function getVisibleEndLine(
  qaSource: QaSource,
  fixture: Fixture,
  record: PersistedSectionCoveragePlanRecord,
) {
  const section = fixture.sectionIndex.sections.find(
    (item) =>
      item.id === record.sectionIdentity.sectionId &&
      item.stableKey === record.sectionIdentity.stableKey,
  )!
  const visibleContent = qaSource.content.slice(
    section.startOffset,
    section.startOffset + record.sectionSnapshot.visibleCharacterCount,
  )
  const finalVisibleIndex = Math.max(0, visibleContent.length - 1)
  let line = section.startLine

  for (let index = 0; index < finalVisibleIndex; index += 1) {
    if (visibleContent[index] === '\n') {
      line += 1
    }
  }

  return line
}

function createSavedRef(
  fixture: Fixture,
  record: PersistedSectionCoveragePlanRecord,
): AiCoverageSourceSectionRef {
  const section = fixture.sectionIndex.sections.find(
    (item) =>
      item.id === record.sectionIdentity.sectionId &&
      item.stableKey === record.sectionIdentity.stableKey,
  )!

  return {
    sectionId: section.id,
    stableKey: section.stableKey,
    ordinal: section.ordinal,
    title: section.title,
    path: [...section.path],
    startLine: section.startLine,
    endLine: record.sectionSnapshot.truncated
      ? getVisibleEndLine(fixture.qaSource, fixture, record)
      : section.endLine,
    visibility: record.sectionSnapshot.truncated ? 'partial' : 'full',
  }
}

function createMergedRecord(
  fixture: Fixture,
  refs = fixture.records.map((record) => createSavedRef(fixture, record)),
  selectedRecords = fixture.records,
): PersistedCoveragePlanRecord {
  const plan: AiCoveragePlan = {
    schemaVersion: 'ai-coverage-plan-json-v2',
    sourceScope: {
      qaSourceId: fixture.qaSource.id,
      visibleSourceOnly: true,
      sourceTruncated: selectedRecords.some(
        (record) => record.sectionSnapshot.truncated,
      ),
      coverageCompleteness: 'insufficient_source',
      sectionContext: {
        available: true,
        sectionSchemaVersion: fixture.sectionIndex.schemaVersion,
        sectionerVersion: fixture.sectionIndex.sectionerVersion,
        sectionSetFingerprint: fixture.sectionIndex.sectionSetFingerprint,
        totalSectionCount: fixture.sectionIndex.sections.length,
        visibleSectionCount: selectedRecords.length,
        omittedSectionCount:
          fixture.sectionIndex.sections.length - selectedRecords.length,
      },
    },
    coverageAreas: [
      {
        id: 'merged-area-1',
        name: 'Merged area',
        summary: 'Merged section coverage.',
        behaviors: [],
        risks: [],
        evidence: ['Merged section coverage.'],
        ambiguities: [],
        generationReadiness: 'source_backed',
        sourceSectionRefs: refs,
      },
    ],
    actors: [],
    states: [],
    inputs: [],
    failureModes: [],
    integrationRisks: [],
    permissionsSecurity: [],
    dataPersistenceRules: [],
    ambiguities: [],
    nextGenerationAreas: [],
    warnings: [],
  }
  const selectedAnalyses = selectedRecords.map(
    createAiCoveragePlanMergeSelectedAnalysisRef,
  )
  const contributors = selectedAnalyses.map((analysis) => ({
    analysisRefId: analysis.analysisRefId,
    sourceFindingKind: 'coverage_area' as const,
    sourceFindingId: 'section-area-1',
  }))
  const origin: AiCoveragePlanSectionMergeOrigin = {
    kind: 'section_merge',
    originSchemaVersion: AI_COVERAGE_PLAN_MERGE_ORIGIN_SCHEMA_VERSION,
    selectedAnalyses,
    outputProvenance: [
      {
        outputFindingId: 'merged-area-1',
        outputFindingKind: 'coverage_area',
        contributors,
        disposition: contributors.length > 1 ? 'exact_duplicate' : 'single',
        evidenceOrigins: [
          {
            outputEvidenceIndex: 0,
            contributors,
          },
        ],
      },
    ],
    reviewRelations: [],
  }

  return createPersistedCoveragePlanRecord({
    qaSource: fixture.qaSource,
    packedSource: packQaSourceForAiSuggestions(fixture.qaSource),
    plan,
    analyzedAt: '2026-07-18T08:30:00.000Z',
    origin,
  })
}

function resolveFixture(
  fixture: Fixture,
  record = createMergedRecord(fixture),
  currentSectionPlanRecords: readonly unknown[] = fixture.records,
  qaSource: QaSource | null = fixture.qaSource,
) {
  return resolveAiMergedCoveragePlanSectionRefs({
    record,
    qaSource,
    currentIndex: fixture.sectionIndex,
    currentSectionPlanRecords,
  })
}

function allRefs(plan: AiCoveragePlan) {
  return [
    ...plan.coverageAreas.flatMap((area) => area.sourceSectionRefs),
    ...plan.ambiguities.flatMap((ambiguity) => ambiguity.sourceSectionRefs),
    ...plan.nextGenerationAreas.flatMap((area) => area.sourceSectionRefs),
  ]
}

describe('resolveAiMergedCoveragePlanSectionRefs', () => {
  it('downgrades historical pooled-evidence merge readiness without rewriting stored data', () => {
    const fixture = createFixture()
    const record = createMergedRecord(fixture)
    const before = structuredClone(record)
    expect(resolveFixture(fixture, record).resolvedPlan.coverageAreas[0].generationReadiness).toBe('needs_review')
    expect(record).toEqual(before)
  })
  it('preserves linked current contributors but never promotes partial or blocked inputs', () => {
    const fixture = createFixture()
    for (const record of fixture.records) {
      const area = record.plan.coverageAreas[0]
      area.behaviors = ['Cover the section rule.']
      area.behaviorEvidence = [{ behavior: area.behaviors[0], evidence: area.evidence }]
    }
    const linked = createMergedRecord(fixture)
    expect(resolveFixture(fixture, linked).resolvedPlan.coverageAreas[0].generationReadiness).toBe('source_backed')
    for (const readiness of ['needs_review', 'blocked_by_ambiguity'] as const) {
      const existing = structuredClone(linked); existing.plan.coverageAreas[0].generationReadiness = readiness
      expect(resolveFixture(fixture, existing).resolvedPlan.coverageAreas[0].generationReadiness).toBe(readiness)
    }
    fixture.records[0].plan.coverageAreas[0].behaviorEvidence![0].evidence = []
    fixture.records[0].plan.coverageAreas[0].evidenceSupport = 'needs_review'
    const partial = createMergedRecord(fixture)
    expect(resolveFixture(fixture, partial).resolvedPlan.coverageAreas[0].generationReadiness).toBe('needs_review')
  })
  it('cannot present source-backed merged areas when their contributing context or references cannot be validated', () => {
    const fixture = createFixture()
    const record = createMergedRecord(fixture)
    expect(resolveFixture(fixture, record, []).resolvedPlan.coverageAreas[0].generationReadiness).toBe('needs_review')
    expect(resolveFixture(fixture, record, fixture.records, null).resolvedPlan.coverageAreas[0].generationReadiness).toBe('needs_review')
    expect(resolveFixture(fixture, createMergedRecord(fixture, [])).resolvedPlan.coverageAreas[0].generationReadiness).toBe('needs_review')
    record.origin = undefined
    expect(resolveFixture(fixture, record).resolvedPlan.coverageAreas[0].generationReadiness).toBe('needs_review')
  })
  it('resolves selected current analyses against canonical full-index metadata without writes', () => {
    const fixture = createFixture()
    const record = createMergedRecord(fixture)
    const write = vi.spyOn(Storage.prototype, 'setItem')

    const result = resolveFixture(fixture, record)

    expect(result).toMatchObject({
      status: 'resolved',
      isFresh: true,
      hasSavedRefs: true,
      canDisplayResolvedRefs: true,
      storedRefCount: 2,
      resolvedRefCount: 2,
      rejectedRefCount: 0,
    })
    expect(allRefs(result.resolvedPlan).map((ref) => ref.ordinal)).toEqual([1, 2])
    expect(write).not.toHaveBeenCalled()
    expect(record.plan.coverageAreas[0].sourceSectionRefs).toHaveLength(2)
  })

  it('resolves a selected 42nd section outside the direct v0.20 40-entry catalog', () => {
    const fixture = createFixture(MANY_SECTION_CONTENT, [0, 41])
    const mergedRecord = createMergedRecord(fixture)
    const mergedResult = resolveFixture(fixture, mergedRecord)
    const packedSource = packQaSourceForAiSuggestions(fixture.qaSource)
    const directCatalog = createAiCoveragePlanSectionCatalog(
      fixture.sectionIndex,
      packedSource,
    )
    const directPlan = structuredClone(mergedRecord.plan)
    directPlan.sourceScope.sectionContext =
      getAiCoveragePlanSectionCatalogRuntimeContext(directCatalog)!.sectionContext
    const directResult = resolveAiCoveragePlanSectionRefs(
      directPlan,
      fixture.sectionIndex,
      directCatalog,
    )

    expect(directCatalog.sections).toHaveLength(40)
    expect(allRefs(mergedResult.resolvedPlan).map((ref) => ref.ordinal)).toEqual([
      1,
      42,
    ])
    expect(allRefs(directResult.resolvedPlan).map((ref) => ref.ordinal)).toEqual([
      1,
    ])
    expect(directResult.resolvedPlan.coverageAreas[0].generationReadiness).toBe('source_backed')
  })

  it('rejects an otherwise canonical ref to an unselected section', () => {
    const fixture = createFixture(MANY_SECTION_CONTENT, [0, 1, 2])
    const selectedRecords = fixture.records.slice(0, 2)
    const unselectedRef = createSavedRef(fixture, fixture.records[2])
    const record = createMergedRecord(fixture, [unselectedRef], selectedRecords)

    const result = resolveFixture(fixture, record, fixture.records)

    expect(result.status).toBe('resolved_with_omissions')
    expect(result.resolvedPlan.coverageAreas[0].sourceSectionRefs).toEqual([])
    expect(result.rejectedRefCount).toBe(1)
  })

  it.each([
    ['a replaced analyzedAt', (record: PersistedSectionCoveragePlanRecord) => {
      record.analyzedAt = '2026-07-18T09:00:00.000Z'
    }],
    ['a changed plan fingerprint', (record: PersistedSectionCoveragePlanRecord) => {
      record.plan.actors.push('Changed actor')
    }],
  ])('hides every ref when the selected record has %s', (_label, mutate) => {
    const fixture = createFixture()
    const savedRecord = createMergedRecord(fixture)
    const currentRecords = structuredClone(fixture.records)
    mutate(currentRecords[0])

    const result = resolveFixture(fixture, savedRecord, currentRecords)

    expect(result.status).toBe('stale_context')
    expect(result.isFresh).toBe(false)
    expect(result.canDisplayResolvedRefs).toBe(false)
    expect(allRefs(result.resolvedPlan)).toEqual([])
  })

  it('hides refs when the exact source revision changes', () => {
    const fixture = createFixture()
    const editedSource = {
      ...fixture.qaSource,
      updatedAt: '2026-07-18T10:00:00.000Z',
    }

    const result = resolveFixture(
      fixture,
      createMergedRecord(fixture),
      fixture.records,
      editedSource,
    )

    expect(result.status).toBe('stale_context')
    expect(result.isFresh).toBe(false)
    expect(allRefs(result.resolvedPlan)).toEqual([])
  })

  it('rejects a malformed merged origin before displaying refs', () => {
    const fixture = createFixture()
    const record = createMergedRecord(fixture)
    record.origin = {
      ...record.origin,
      candidatePairs: [],
    } as typeof record.origin

    const result = resolveFixture(fixture, record)

    expect(result.status).toBe('stale_context')
    expect(allRefs(result.resolvedPlan)).toEqual([])
  })

  it('preserves a selected analysis partial bound without expanding it', () => {
    const fixture = createFixture(
      ['# Long section', 'x'.repeat(25_000), '', '# Second section', 'Done.'].join(
        '\n',
      ),
      [0, 1],
    )
    const record = createMergedRecord(fixture)
    const savedPartialRef = record.plan.coverageAreas[0].sourceSectionRefs[0]

    const result = resolveFixture(fixture, record)
    const resolvedPartialRef = result.resolvedPlan.coverageAreas[0].sourceSectionRefs[0]

    expect(fixture.records[0].sectionSnapshot.truncated).toBe(true)
    expect(savedPartialRef.visibility).toBe('partial')
    expect(resolvedPartialRef).toEqual(savedPartialRef)
    expect(resolvedPartialRef.endLine).toBeLessThanOrEqual(
      fixture.records[0].sectionSnapshot.endLine,
    )
  })
})
