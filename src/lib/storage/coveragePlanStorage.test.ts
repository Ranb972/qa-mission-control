import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createQaSource } from '../../test/qaSourceFactory'
import { packQaSourceForAiSuggestions } from '../../features/ai-suggestions/aiSuggestionContext'
import type { AiCoveragePlan } from '../../features/ai-suggestions/aiCoveragePlanTypes'
import {
  AI_COVERAGE_PLAN_LEGACY_SCHEMA_VERSION,
  AI_COVERAGE_PLAN_SCHEMA_VERSION,
} from '../../features/ai-suggestions/aiCoveragePlanTypes'
import { createAiCoveragePlanSectionCatalog } from '../../features/ai-suggestions/aiCoveragePlanSectionContext'
import {
  AI_COVERAGE_PLAN_MERGE_ORIGIN_SCHEMA_VERSION,
  type AiCoveragePlanMergeContributorRef,
  type AiCoveragePlanMergeSelectedAnalysisRef,
  type AiCoveragePlanSectionMergeOrigin,
} from '../../features/ai-suggestions/aiCoveragePlanMergeTypes'
import type { QaSourceSectionIndex } from '../../features/qa-sources/qaSourceSections'
import { SECTION_COVERAGE_PLAN_STORAGE_KEY } from './sectionCoveragePlanStorage'
import {
  COVERAGE_PLAN_STORAGE_KEY,
  COVERAGE_PLAN_STORAGE_SCHEMA_VERSION,
  COVERAGE_PLAN_STORAGE_VALIDATOR_VERSION,
  createPersistedCoveragePlanRecord,
  createQaSourceFingerprint,
  findCoveragePlanForSource,
  getCoveragePlanFreshness,
  getCoveragePlanSectionReferenceFreshness,
  loadCoveragePlans,
  removeCoveragePlanForSource,
  saveCoveragePlans,
  upsertCoveragePlanRecord,
} from './coveragePlanStorage'

const sectionRef = {
  sectionId: 'source-section-1-payment',
  stableKey: 'payment::abc::1',
  ordinal: 1,
  title: 'Payment authorization',
  path: ['Payment authorization'],
  startLine: 1,
  endLine: 4,
  visibility: 'full' as const,
}

const sectionContext = {
  available: true,
  sectionSchemaVersion: 'qa-source-sections-json-v1',
  sectionerVersion: 'qa-source-sectioner-v1',
  sectionSetFingerprint: 'section-set-fingerprint',
  totalSectionCount: 1,
  visibleSectionCount: 1,
  omittedSectionCount: 0,
}

const qaSource = createQaSource({
  id: 'source-1',
  title: 'Checkout payment LLD',
  sourceType: 'LLD',
  status: 'Ready for test design',
  content:
    'Payment authorization must handle approved, declined, and timeout responses.',
  createdAt: '2026-05-12T08:00:00.000Z',
  updatedAt: '2026-05-12T08:00:00.000Z',
})

function createCoveragePlan(
  overrides: Partial<AiCoveragePlan> = {},
): AiCoveragePlan {
  return {
    schemaVersion: AI_COVERAGE_PLAN_SCHEMA_VERSION,
    sourceScope: {
      qaSourceId: 'source-1',
      visibleSourceOnly: true,
      sourceTruncated: false,
      coverageCompleteness: 'visible_source_only',
      sectionContext,
    },
    coverageAreas: [
      {
        id: 'coverage-area-1-payment-authorization',
        name: 'Payment authorization outcomes',
        summary: 'Coverage for approved, declined, and timeout responses.',
        behaviors: ['handle approved responses'],
        risks: ['Declined payments may look approved.'],
        evidence: [
          'Payment authorization must handle approved, declined, and timeout responses.',
        ],
        ambiguities: [],
        generationReadiness: 'source_backed',
        sourceSectionRefs: [sectionRef],
      },
    ],
    actors: ['Checkout user'],
    states: ['Approved', 'Declined', 'Timeout'],
    inputs: ['Card details'],
    failureModes: ['Gateway timeout'],
    integrationRisks: [],
    permissionsSecurity: [],
    dataPersistenceRules: [],
    ambiguities: [
      {
        id: 'ambiguity-1',
        question: 'Is timeout copy final?',
        whyItMatters: 'Generated tests should not assert unstable copy.',
        severity: 'Medium',
        sourceSectionRefs: [sectionRef],
      },
    ],
    nextGenerationAreas: [
      {
        id: 'next-generation-area-1',
        title: 'Timeout recovery',
        rationale: 'Timeout handling needs focused generation.',
        priority: 'High',
        relatedAreaIds: ['coverage-area-1-payment-authorization'],
        suggestedTestCount: 3,
        sourceSectionRefs: [sectionRef],
      },
    ],
    warnings: [],
    ...overrides,
  }
}

const MERGED_SCOPE_WARNING =
  'Merged section-analysis scope counts; selected: 2; current but unselected: 0; stale: 0; unanalyzed: 0; excluded: 0'

function createMergedCoveragePlan(
  overrides: Partial<AiCoveragePlan> = {},
): AiCoveragePlan {
  const base = createCoveragePlan()

  return {
    ...base,
    sourceScope: {
      ...base.sourceScope,
      sectionContext: {
        ...sectionContext,
        totalSectionCount: 2,
        visibleSectionCount: 2,
        omittedSectionCount: 0,
      },
    },
    coverageAreas: base.coverageAreas.map((area) => ({
      ...area,
      behaviors: [],
    })),
    actors: [],
    states: [],
    inputs: [],
    failureModes: [],
    integrationRisks: [],
    permissionsSecurity: [],
    dataPersistenceRules: [],
    ambiguities: [],
    nextGenerationAreas: [],
    warnings: [MERGED_SCOPE_WARNING],
    ...overrides,
  }
}

function createLegacyCoveragePlanPayload() {
  return {
    schemaVersion: AI_COVERAGE_PLAN_LEGACY_SCHEMA_VERSION,
    sourceScope: {
      qaSourceId: 'source-1',
      visibleSourceOnly: true,
      sourceTruncated: false,
      coverageCompleteness: 'visible_source_only',
    },
    coverageAreas: [
      {
        id: 'coverage-area-1-payment-authorization',
        name: 'Payment authorization outcomes',
        summary: 'Coverage for approved, declined, and timeout responses.',
        behaviors: ['handle approved responses'],
        risks: ['Declined payments may look approved.'],
        evidence: [
          'Payment authorization must handle approved, declined, and timeout responses.',
        ],
        ambiguities: [],
        generationReadiness: 'source_backed',
      },
    ],
    actors: ['Checkout user'],
    states: ['Approved', 'Declined', 'Timeout'],
    inputs: ['Card details'],
    failureModes: ['Gateway timeout'],
    integrationRisks: [],
    permissionsSecurity: [],
    dataPersistenceRules: [],
    ambiguities: [],
    nextGenerationAreas: [],
    warnings: [],
  }
}

function createRecord(plan = createCoveragePlan()) {
  return createPersistedCoveragePlanRecord({
    qaSource,
    packedSource: packQaSourceForAiSuggestions(qaSource),
    plan,
    analyzedAt: '2026-05-12T08:01:00.000Z',
  })
}

function withoutCoveragePlanOrigin(
  record: ReturnType<typeof createRecord>,
) {
  const originlessRecord = structuredClone(record) as Partial<typeof record>
  delete originlessRecord.origin
  return originlessRecord
}

function createLegacyRecord() {
  return {
    ...withoutCoveragePlanOrigin(createRecord()),
    analysis: {
      analyzedAt: '2026-05-12T08:01:00.000Z',
      coveragePlanSchemaVersion: AI_COVERAGE_PLAN_LEGACY_SCHEMA_VERSION,
      storageValidatorVersion: COVERAGE_PLAN_STORAGE_VALIDATOR_VERSION,
    },
    plan: createLegacyCoveragePlanPayload(),
  }
}

function createSelectedAnalysisRef(
  index: number,
): AiCoveragePlanMergeSelectedAnalysisRef {
  return {
    analysisRefId: `analysis-ref-${index}`,
    sectionPlanRecordId: `section-plan-record-${index}`,
    analyzedAt: `2026-05-12T08:0${index}:00.000Z`,
    planFingerprint: `plan-fingerprint-${index}`,
    sectionId: `source-section-${index}`,
    stableKey: `source-section-key-${index}`,
    contentFingerprint: `section-content-fingerprint-${index}`,
  }
}

function createContributor(
  index: number,
  sourceFindingId = `source-coverage-area-${index}`,
): AiCoveragePlanMergeContributorRef {
  return {
    analysisRefId: `analysis-ref-${index}`,
    sourceFindingKind: 'coverage_area',
    sourceFindingId,
  }
}

function createMergedOrigin(
  overrides: Partial<AiCoveragePlanSectionMergeOrigin> = {},
): AiCoveragePlanSectionMergeOrigin {
  const contributors = [createContributor(2), createContributor(1)]

  return {
    kind: 'section_merge',
    originSchemaVersion: AI_COVERAGE_PLAN_MERGE_ORIGIN_SCHEMA_VERSION,
    selectedAnalyses: [createSelectedAnalysisRef(2), createSelectedAnalysisRef(1)],
    outputProvenance: [
      {
        outputFindingId: 'coverage-area-1-payment-authorization',
        outputFindingKind: 'coverage_area',
        contributors,
        disposition: 'exact_duplicate',
        evidenceOrigins: [
          {
            outputEvidenceIndex: 0,
            contributors,
          },
        ],
      },
    ],
    reviewRelations: [],
    ...overrides,
  }
}

function createMergedRecord({
  plan = createMergedCoveragePlan(),
  origin = createMergedOrigin(),
}: {
  plan?: AiCoveragePlan
  origin?: AiCoveragePlanSectionMergeOrigin
} = {}) {
  return createPersistedCoveragePlanRecord({
    qaSource,
    packedSource: packQaSourceForAiSuggestions(qaSource),
    plan,
    analyzedAt: '2026-05-12T08:10:00.000Z',
    origin,
  })
}

describe('coveragePlanStorage', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.restoreAllMocks()
  })

  it('loads a direct v2 record without rewriting its stored bytes', () => {
    const directRecord = withoutCoveragePlanOrigin(createRecord())
    const rawValue = JSON.stringify({
      storageSchemaVersion: COVERAGE_PLAN_STORAGE_SCHEMA_VERSION,
      records: [directRecord],
    })
    window.localStorage.setItem(COVERAGE_PLAN_STORAGE_KEY, rawValue)

    const result = loadCoveragePlans()

    expect(result.error).toBeNull()
    expect(result.coveragePlans).toHaveLength(1)
    expect(result.coveragePlans[0]).toHaveProperty('origin', {
      kind: 'direct_source_analysis',
    })
    expect(window.localStorage.getItem(COVERAGE_PLAN_STORAGE_KEY)).toBe(rawValue)
  })

  it('round-trips a merged origin and deterministically orders its durable data', () => {
    const record = createMergedRecord()

    expect(saveCoveragePlans([record])).toEqual({ ok: true, error: null })

    const result = loadCoveragePlans()
    const origin = result.coveragePlans[0].origin

    expect(result.error).toBeNull()
    expect(origin.kind).toBe('section_merge')
    if (origin.kind !== 'section_merge') {
      throw new Error('Expected a merged coverage plan origin.')
    }
    expect(origin.selectedAnalyses.map((item) => item.analysisRefId)).toEqual([
      'analysis-ref-1',
      'analysis-ref-2',
    ])
    expect(
      origin.outputProvenance[0].contributors.map(
        (item) => item.analysisRefId,
      ),
    ).toEqual(['analysis-ref-1', 'analysis-ref-2'])
    expect(
      origin.outputProvenance[0].evidenceOrigins[0].contributors.map(
        (item) => item.analysisRefId,
      ),
    ).toEqual(['analysis-ref-1', 'analysis-ref-2'])
    expect(JSON.stringify(origin)).not.toMatch(
      /alias|candidatePair|reasonCode|rawProvider|similarity|confirmationState/,
    )
  })

  it('keeps provenance when a source warning equals the scope warning', () => {
    const warningContributor = {
      analysisRefId: 'analysis-ref-1',
      sourceFindingKind: 'warning' as const,
      sourceFindingId: 'source-warning-1',
    }
    const origin = createMergedOrigin({
      outputProvenance: [
        ...createMergedOrigin().outputProvenance,
        {
          outputFindingId: 'warning:0',
          outputFindingKind: 'warning',
          contributors: [warningContributor],
          disposition: 'single',
          evidenceOrigins: [],
        },
      ],
    })

    expect(saveCoveragePlans([createMergedRecord({ origin })]).ok).toBe(true)
    const loadedOrigin = loadCoveragePlans().coveragePlans[0].origin
    expect(loadedOrigin.kind).toBe('section_merge')
    if (loadedOrigin.kind !== 'section_merge') {
      throw new Error('Expected a merged coverage plan origin.')
    }
    expect(
      loadedOrigin.outputProvenance.map((item) => item.outputFindingId),
    ).toEqual([
      'coverage-area-1-payment-authorization',
      'warning:0',
    ])
  })

  it('round-trips finalized durable relations using valid plan output IDs', () => {
    const basePlan = createMergedCoveragePlan()
    const secondArea = {
      ...basePlan.coverageAreas[0],
      id: 'coverage-area-2-timeout-recovery',
      name: 'Timeout recovery',
    }
    const plan = {
      ...basePlan,
      coverageAreas: [basePlan.coverageAreas[0], secondArea],
    }
    const firstProvenance = createMergedOrigin().outputProvenance[0]
    const secondContributor = createContributor(2, 'source-timeout-area-2')
    const origin = createMergedOrigin({
      outputProvenance: [
        {
          outputFindingId: secondArea.id,
          outputFindingKind: 'coverage_area',
          contributors: [secondContributor],
          disposition: 'single',
          evidenceOrigins: [
            {
              outputEvidenceIndex: 0,
              contributors: [secondContributor],
            },
          ],
        },
        firstProvenance,
      ],
      reviewRelations: [
        {
          relationId: 'relation-timeout-overlap',
          kind: 'likely_overlap',
          outputFindingIds: [secondArea.id, firstProvenance.outputFindingId],
        },
      ],
    })

    expect(saveCoveragePlans([createMergedRecord({ plan, origin })]).ok).toBe(
      true,
    )
    const loadedOrigin = loadCoveragePlans().coveragePlans[0].origin

    expect(loadedOrigin.kind).toBe('section_merge')
    if (loadedOrigin.kind !== 'section_merge') {
      throw new Error('Expected a merged coverage plan origin.')
    }
    expect(
      loadedOrigin.outputProvenance.map((item) => item.outputFindingId),
    ).toEqual([
      'coverage-area-1-payment-authorization',
      'coverage-area-2-timeout-recovery',
    ])
    expect(loadedOrigin.reviewRelations).toEqual([
      {
        relationId: 'relation-timeout-overlap',
        kind: 'likely_overlap',
        outputFindingIds: [
          'coverage-area-1-payment-authorization',
          'coverage-area-2-timeout-recovery',
        ],
      },
    ])
  })

  it('rejects one source contributor claimed by two merged outputs', () => {
    const basePlan = createMergedCoveragePlan()
    const secondArea = {
      ...basePlan.coverageAreas[0],
      id: 'coverage-area-2-timeout-recovery',
      name: 'Timeout recovery',
    }
    const plan = {
      ...basePlan,
      coverageAreas: [basePlan.coverageAreas[0], secondArea],
    }
    const firstProvenance = createMergedOrigin().outputProvenance[0]
    const duplicatedContributor = firstProvenance.contributors[0]
    const origin = createMergedOrigin({
      outputProvenance: [
        firstProvenance,
        {
          outputFindingId: secondArea.id,
          outputFindingKind: 'coverage_area',
          contributors: [duplicatedContributor],
          disposition: 'single',
          evidenceOrigins: [
            {
              outputEvidenceIndex: 0,
              contributors: [duplicatedContributor],
            },
          ],
        },
      ],
    })

    expect(saveCoveragePlans([createMergedRecord({ plan, origin })]).ok).toBe(
      false,
    )
  })

  it('rejects two semantic relation kinds for the same output pair', () => {
    const basePlan = createMergedCoveragePlan()
    const secondArea = {
      ...basePlan.coverageAreas[0],
      id: 'coverage-area-2-timeout-recovery',
      name: 'Timeout recovery',
    }
    const plan = {
      ...basePlan,
      coverageAreas: [basePlan.coverageAreas[0], secondArea],
    }
    const firstProvenance = createMergedOrigin().outputProvenance[0]
    const secondContributor = createContributor(2, 'source-timeout-area-2')
    const origin = createMergedOrigin({
      outputProvenance: [
        firstProvenance,
        {
          outputFindingId: secondArea.id,
          outputFindingKind: 'coverage_area',
          contributors: [secondContributor],
          disposition: 'single',
          evidenceOrigins: [
            {
              outputEvidenceIndex: 0,
              contributors: [secondContributor],
            },
          ],
        },
      ],
      reviewRelations: [
        {
          relationId: 'relation-overlap',
          kind: 'likely_overlap',
          outputFindingIds: [firstProvenance.outputFindingId, secondArea.id],
        },
        {
          relationId: 'relation-conflict',
          kind: 'conflict',
          outputFindingIds: [firstProvenance.outputFindingId, secondArea.id],
        },
      ],
    })

    expect(saveCoveragePlans([createMergedRecord({ plan, origin })]).ok).toBe(
      false,
    )
  })

  it('loads mixed direct and merged siblings while preserving their origins', () => {
    const directRecord = createRecord()
    const mergedRecord = createMergedRecord()
    window.localStorage.setItem(
      COVERAGE_PLAN_STORAGE_KEY,
      JSON.stringify({
        storageSchemaVersion: COVERAGE_PLAN_STORAGE_SCHEMA_VERSION,
        records: [directRecord, mergedRecord],
      }),
    )

    const result = loadCoveragePlans()

    expect(result.error).toBeNull()
    expect(result.coveragePlans.map((record) => record.origin.kind)).toEqual([
      'direct_source_analysis',
      'section_merge',
    ])
  })

  it('isolates a malformed merged-origin sibling', () => {
    const malformedMergedRecord = {
      ...createMergedRecord(),
      id: 'malformed-merged-record',
      origin: {
        ...createMergedOrigin(),
        providerReasonCode: 'same_intent',
      },
    }
    const validRecord = createRecord()
    window.localStorage.setItem(
      COVERAGE_PLAN_STORAGE_KEY,
      JSON.stringify({
        storageSchemaVersion: COVERAGE_PLAN_STORAGE_SCHEMA_VERSION,
        records: [malformedMergedRecord, validRecord],
      }),
    )

    const result = loadCoveragePlans()

    expect(result.coveragePlans).toHaveLength(1)
    expect(result.coveragePlans[0].id).toBe(validRecord.id)
    expect(result.error).toContain(
      'Some saved AI coverage plans could not be loaded',
    )
  })

  it('rejects a merged origin that covers only a subset of plan outputs', () => {
    const record = createMergedRecord({
      plan: createCoveragePlan(),
      origin: createMergedOrigin(),
    })

    expect(saveCoveragePlans([record])).toEqual({
      ok: false,
      error:
        'AI coverage plan changes were not saved because the data was not in the expected safe format.',
    })
  })

  it.each([
    ['unknown contributor analysis', (origin: AiCoveragePlanSectionMergeOrigin) => {
      origin.outputProvenance[0].contributors[0].analysisRefId = 'unknown-analysis'
    }],
    ['mismatched contributor finding kind', (origin: AiCoveragePlanSectionMergeOrigin) => {
      origin.outputProvenance[0].contributors[0].sourceFindingKind = 'actor'
    }],
    ['duplicate contributor', (origin: AiCoveragePlanSectionMergeOrigin) => {
      origin.outputProvenance[0].contributors.push(
        structuredClone(origin.outputProvenance[0].contributors[0]),
      )
    }],
    ['missing output provenance', (origin: AiCoveragePlanSectionMergeOrigin) => {
      origin.outputProvenance = []
    }],
    ['missing evidence provenance', (origin: AiCoveragePlanSectionMergeOrigin) => {
      origin.outputProvenance[0].evidenceOrigins = []
    }],
    ['invalid evidence index', (origin: AiCoveragePlanSectionMergeOrigin) => {
      origin.outputProvenance[0].evidenceOrigins[0].outputEvidenceIndex = 1
    }],
    ['unknown relation output', (origin: AiCoveragePlanSectionMergeOrigin) => {
      origin.reviewRelations = [
        {
          relationId: 'relation-1',
          kind: 'likely_overlap',
          outputFindingIds: [
            'coverage-area-1-payment-authorization',
            'unknown-output',
          ],
        },
      ]
    }],
  ])('rejects merged origin with %s', (_label, mutateOrigin) => {
    const origin = createMergedOrigin()
    mutateOrigin(origin)
    const record = createMergedRecord({ origin })

    expect(saveCoveragePlans([record])).toEqual({
      ok: false,
      error:
        'AI coverage plan changes were not saved because the data was not in the expected safe format.',
    })
  })

  it.each([
    ['provider aliases', { providerAliases: ['finding-alias-1'] }],
    ['candidate pairs', { candidatePairs: [{ pairAlias: 'pair-alias-1' }] }],
    ['raw provider decisions', { rawProviderDecisions: [{ relation: 'distinct' }] }],
    ['similarity scores', { similarityScores: [0.99] }],
    ['UI confirmation state', { uiConfirmationState: { confirmed: true } }],
  ])('recursively rejects merged origin containing %s', (_label, forbiddenData) => {
    const origin = {
      ...createMergedOrigin(),
      outputProvenance: createMergedOrigin().outputProvenance.map((item) => ({
        ...item,
        transient: forbiddenData,
      })),
    }
    const record = createMergedRecord({
      origin: origin as AiCoveragePlanSectionMergeOrigin,
    })

    expect(saveCoveragePlans([record]).ok).toBe(false)
  })

  it('rejects a merged record above 512 KiB without changing stored bytes', () => {
    const previousBytes = JSON.stringify({
      storageSchemaVersion: COVERAGE_PLAN_STORAGE_SCHEMA_VERSION,
      records: [createRecord()],
    })
    window.localStorage.setItem(COVERAGE_PLAN_STORAGE_KEY, previousBytes)
    const oversizedRecord = createMergedRecord({
      plan: createCoveragePlan({
        warnings: ['x'.repeat(512 * 1024)],
      }),
    })

    expect(saveCoveragePlans([oversizedRecord]).ok).toBe(false)
    expect(window.localStorage.getItem(COVERAGE_PLAN_STORAGE_KEY)).toBe(
      previousBytes,
    )
  })

  it('preserves old bytes when merged-origin storage hits quota', () => {
    const previousBytes = JSON.stringify({
      storageSchemaVersion: COVERAGE_PLAN_STORAGE_SCHEMA_VERSION,
      records: [createRecord()],
    })
    window.localStorage.setItem(COVERAGE_PLAN_STORAGE_KEY, previousBytes)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })

    expect(saveCoveragePlans([createMergedRecord()]).ok).toBe(false)
    expect(window.localStorage.getItem(COVERAGE_PLAN_STORAGE_KEY)).toBe(
      previousBytes,
    )
  })

  it('does not read or rewrite v0.21 section-plan storage', () => {
    const sectionPlanBytes = '{"v0.21":"unchanged"}'
    window.localStorage.setItem(
      SECTION_COVERAGE_PLAN_STORAGE_KEY,
      sectionPlanBytes,
    )

    expect(saveCoveragePlans([createMergedRecord()]).ok).toBe(true)
    expect(loadCoveragePlans().coveragePlans).toHaveLength(1)
    expect(window.localStorage.getItem(SECTION_COVERAGE_PLAN_STORAGE_KEY)).toBe(
      sectionPlanBytes,
    )
  })

  it('saves and loads valid persisted coverage plans', () => {
    const record = createRecord()

    expect(saveCoveragePlans([record])).toEqual({ ok: true, error: null })

    const result = loadCoveragePlans()

    expect(result.error).toBeNull()
    expect(result.coveragePlans).toHaveLength(1)
    expect(result.coveragePlans[0]).toMatchObject({
      sourceIdentity: {
        qaSourceId: 'source-1',
        qaSourceCreatedAt: qaSource.createdAt,
        qaSourceUpdatedAt: qaSource.updatedAt,
        sourceFingerprint: createQaSourceFingerprint(qaSource),
      },
      analysis: {
        analyzedAt: '2026-05-12T08:01:00.000Z',
        coveragePlanSchemaVersion: AI_COVERAGE_PLAN_SCHEMA_VERSION,
        storageValidatorVersion: COVERAGE_PLAN_STORAGE_VALIDATOR_VERSION,
      },
    })
    expect(result.coveragePlans[0].plan.coverageAreas[0].generationReadiness).toBe(
      'source_backed',
    )
    expect(result.coveragePlans[0].plan.coverageAreas[0].sourceSectionRefs).toEqual([
      sectionRef,
    ])
  })

  it('loads legacy v1 coverage plans and normalizes missing section refs', () => {
    const legacyRecord = createLegacyRecord()

    window.localStorage.setItem(
      COVERAGE_PLAN_STORAGE_KEY,
      JSON.stringify({
        storageSchemaVersion: COVERAGE_PLAN_STORAGE_SCHEMA_VERSION,
        records: [legacyRecord],
      }),
    )

    const result = loadCoveragePlans()

    expect(result.error).toBeNull()
    expect(result.coveragePlans).toHaveLength(1)
    expect(result.coveragePlans[0].plan.schemaVersion).toBe(
      AI_COVERAGE_PLAN_SCHEMA_VERSION,
    )
    expect(result.coveragePlans[0].plan.sourceScope.sectionContext).toBeNull()
    expect(result.coveragePlans[0].analysis.coveragePlanSchemaVersion).toBe(
      AI_COVERAGE_PLAN_SCHEMA_VERSION,
    )
    expect(result.coveragePlans[0].plan.coverageAreas[0].sourceSectionRefs).toEqual([])
    expect(getCoveragePlanFreshness(result.coveragePlans[0], qaSource)).toEqual({
      isFresh: true,
      reasons: [],
    })
  })

  it('round-trips a loaded v1 record through canonical v2 persistence', () => {
    window.localStorage.setItem(
      COVERAGE_PLAN_STORAGE_KEY,
      JSON.stringify({
        storageSchemaVersion: COVERAGE_PLAN_STORAGE_SCHEMA_VERSION,
        records: [createLegacyRecord()],
      }),
    )

    const firstLoad = loadCoveragePlans()
    expect(firstLoad.coveragePlans).toHaveLength(1)
    expect(saveCoveragePlans(firstLoad.coveragePlans)).toEqual({
      ok: true,
      error: null,
    })

    const persistedStore = JSON.parse(
      window.localStorage.getItem(COVERAGE_PLAN_STORAGE_KEY) ?? '{}',
    )
    expect(persistedStore.records[0]).toMatchObject({
      analysis: {
        coveragePlanSchemaVersion: AI_COVERAGE_PLAN_SCHEMA_VERSION,
      },
      plan: {
        schemaVersion: AI_COVERAGE_PLAN_SCHEMA_VERSION,
        sourceScope: { sectionContext: null },
        coverageAreas: [
          expect.objectContaining({ sourceSectionRefs: [] }),
        ],
      },
    })
    expect(JSON.stringify(persistedStore)).not.toMatch(
      /prompt|rawResponse|providerPayload|testCaseSuggestions|selectedIds|importSummary/,
    )

    const secondLoad = loadCoveragePlans()
    expect(secondLoad.error).toBeNull()
    expect(secondLoad.coveragePlans).toHaveLength(1)
    expect(secondLoad.coveragePlans[0].plan.schemaVersion).toBe(
      AI_COVERAGE_PLAN_SCHEMA_VERSION,
    )
  })

  it('preserves a migrated legacy sibling when another record is upserted or removed', () => {
    window.localStorage.setItem(
      COVERAGE_PLAN_STORAGE_KEY,
      JSON.stringify({
        storageSchemaVersion: COVERAGE_PLAN_STORAGE_SCHEMA_VERSION,
        records: [createLegacyRecord()],
      }),
    )
    const legacyRuntimeRecord = loadCoveragePlans().coveragePlans[0]
    const secondSource = createQaSource({
      ...qaSource,
      id: 'source-2',
      title: 'Second source',
    })
    const secondRecord = createPersistedCoveragePlanRecord({
      qaSource: secondSource,
      packedSource: packQaSourceForAiSuggestions(secondSource),
      plan: {
        ...createCoveragePlan(),
        sourceScope: {
          ...createCoveragePlan().sourceScope,
          qaSourceId: secondSource.id,
        },
      },
    })
    const withSecondRecord = upsertCoveragePlanRecord(
      [legacyRuntimeRecord],
      secondRecord,
    )

    expect(saveCoveragePlans(withSecondRecord).ok).toBe(true)
    expect(
      loadCoveragePlans().coveragePlans.map(
        (record) => record.sourceIdentity.qaSourceId,
      ),
    ).toEqual(['source-2', 'source-1'])

    const withoutSecondRecord = removeCoveragePlanForSource(
      loadCoveragePlans().coveragePlans,
      'source-2',
    )
    expect(saveCoveragePlans(withoutSecondRecord).ok).toBe(true)
    expect(
      loadCoveragePlans().coveragePlans.map(
        (record) => record.sourceIdentity.qaSourceId,
      ),
    ).toEqual(['source-1'])
  })

  it('keeps valid siblings when one persisted record is malformed', () => {
    const validRecord = createRecord()
    const malformedRecord = {
      ...createLegacyRecord(),
      id: 'malformed-record',
      plan: { schemaVersion: 'unsupported' },
    }
    window.localStorage.setItem(
      COVERAGE_PLAN_STORAGE_KEY,
      JSON.stringify({
        storageSchemaVersion: COVERAGE_PLAN_STORAGE_SCHEMA_VERSION,
        records: [malformedRecord, validRecord],
      }),
    )

    const result = loadCoveragePlans()


    expect(result.coveragePlans).toHaveLength(1)
    expect(result.coveragePlans[0].id).toBe(validRecord.id)
    expect(result.error).toContain(
      'Some saved AI coverage plans could not be loaded',
    )
  })

  it('deduplicates and deterministically orders persisted v2 section refs', () => {
    const secondSectionRef = {
      ...sectionRef,
      sectionId: 'source-section-2-timeout',
      stableKey: 'timeout::def::1',
      ordinal: 2,
      title: 'Timeout handling',
      path: ['Timeout handling'],
      startLine: 5,
      endLine: 8,
    }
    const record = createRecord({
      ...createCoveragePlan(),
      sourceScope: {
        ...createCoveragePlan().sourceScope,
        sectionContext: {
          ...sectionContext,
          totalSectionCount: 2,
          visibleSectionCount: 2,
        },
      },
      coverageAreas: [
        {
          ...createCoveragePlan().coverageAreas[0],
          sourceSectionRefs: [secondSectionRef, sectionRef, { ...sectionRef }],
        },
      ],
    })

    window.localStorage.setItem(
      COVERAGE_PLAN_STORAGE_KEY,
      JSON.stringify({
        storageSchemaVersion: COVERAGE_PLAN_STORAGE_SCHEMA_VERSION,
        records: [record],
      }),
    )

    const result = loadCoveragePlans()

    expect(result.error).toBeNull()
    expect(result.coveragePlans[0].plan.coverageAreas[0].sourceSectionRefs).toEqual([
      sectionRef,
      secondSectionRef,
    ])
  })

  it('rejects invalid persisted numeric fields without deleting a valid sibling', () => {
    const validRecord = createRecord()
    const invalidRecord = {
      ...createRecord(),
      id: 'invalid-numeric-record',
      sourceIdentity: {
        ...createRecord().sourceIdentity,
        qaSourceId: 'source-invalid',
      },
      sourceSnapshot: {
        ...createRecord().sourceSnapshot,
        contentLength: -1,
      },
      plan: {
        ...createCoveragePlan(),
        sourceScope: {
          ...createCoveragePlan().sourceScope,
          qaSourceId: 'source-invalid',
          sectionContext: {
            ...sectionContext,
            visibleSectionCount: 2.5,
          },
        },
      },
    }

    window.localStorage.setItem(
      COVERAGE_PLAN_STORAGE_KEY,
      JSON.stringify({
        storageSchemaVersion: COVERAGE_PLAN_STORAGE_SCHEMA_VERSION,
        records: [invalidRecord, validRecord],
      }),
    )

    const result = loadCoveragePlans()

    expect(result.coveragePlans).toHaveLength(1)
    expect(result.coveragePlans[0].id).toBe(validRecord.id)
    expect(result.error).toContain(
      'Some saved AI coverage plans could not be loaded',
    )
  })

  it('rejects padded source IDs without blocking a valid sibling', () => {
    const validRecord = createRecord()
    const paddedRecord = {
      ...createRecord(),
      id: 'padded-source-record',
      sourceIdentity: {
        ...createRecord().sourceIdentity,
        qaSourceId: ' source-padded ',
      },
      plan: {
        ...createCoveragePlan(),
        sourceScope: {
          ...createCoveragePlan().sourceScope,
          qaSourceId: ' source-padded ',
        },
      },
    }

    window.localStorage.setItem(
      COVERAGE_PLAN_STORAGE_KEY,
      JSON.stringify({
        storageSchemaVersion: COVERAGE_PLAN_STORAGE_SCHEMA_VERSION,
        records: [paddedRecord, validRecord],
      }),
    )

    const result = loadCoveragePlans()

    expect(result.coveragePlans).toHaveLength(1)
    expect(result.coveragePlans[0].id).toBe(validRecord.id)
    expect(result.error).toContain(
      'Some saved AI coverage plans could not be loaded',
    )
    expect(saveCoveragePlans(result.coveragePlans)).toEqual({
      ok: true,
      error: null,
    })
  })

  it('does not overwrite corrupt JSON on load', () => {
    window.localStorage.setItem(COVERAGE_PLAN_STORAGE_KEY, '{not valid json')

    const result = loadCoveragePlans()

    expect(result.coveragePlans).toEqual([])
    expect(result.error).toContain('could not be read')
    expect(window.localStorage.getItem(COVERAGE_PLAN_STORAGE_KEY)).toBe(
      '{not valid json',
    )
  })

  it('rejects a wrong root storage shape without rewriting storage', () => {
    window.localStorage.setItem(
      COVERAGE_PLAN_STORAGE_KEY,
      JSON.stringify([{ records: [] }]),
    )

    const result = loadCoveragePlans()

    expect(result.coveragePlans).toEqual([])
    expect(result.error).toContain('not in the expected format')
    expect(window.localStorage.getItem(COVERAGE_PLAN_STORAGE_KEY)).toBe(
      JSON.stringify([{ records: [] }]),
    )
  })

  it('rejects invalid coverage plan schema records', () => {
    const record = createRecord({
      ...createCoveragePlan(),
      schemaVersion: 'unsupported-schema' as AiCoveragePlan['schemaVersion'],
    })

    window.localStorage.setItem(
      COVERAGE_PLAN_STORAGE_KEY,
      JSON.stringify({
        storageSchemaVersion: COVERAGE_PLAN_STORAGE_SCHEMA_VERSION,
        records: [record],
      }),
    )

    const result = loadCoveragePlans()

    expect(result.coveragePlans).toEqual([])
    expect(result.error).toContain('Some saved AI coverage plans could not be loaded')
  })

  it('rejects records containing raw-provider or prompt-shaped keys', () => {
    const record = {
      ...createRecord(),
      rawResponse: { choices: [] },
      prompt: 'do not persist this',
    }

    window.localStorage.setItem(
      COVERAGE_PLAN_STORAGE_KEY,
      JSON.stringify({
        storageSchemaVersion: COVERAGE_PLAN_STORAGE_SCHEMA_VERSION,
        records: [record],
      }),
    )

    const result = loadCoveragePlans()

    expect(result.coveragePlans).toEqual([])
    expect(result.error).toContain('not in the expected format')
  })

  it('rejects root storage containing raw-provider-shaped keys', () => {
    window.localStorage.setItem(
      COVERAGE_PLAN_STORAGE_KEY,
      JSON.stringify({
        storageSchemaVersion: COVERAGE_PLAN_STORAGE_SCHEMA_VERSION,
        records: [createRecord()],
        rawResponse: { choices: [] },
      }),
    )

    const result = loadCoveragePlans()

    expect(result.coveragePlans).toEqual([])
    expect(result.error).toContain('not in the expected format')
  })

  it('detects source mismatch, stale timestamps, stale fingerprints, and orphaned sources', () => {
    const record = createRecord()

    expect(getCoveragePlanFreshness(record, qaSource)).toEqual({
      isFresh: true,
      reasons: [],
    })

    expect(
      getCoveragePlanFreshness(record, {
        ...qaSource,
        id: 'source-2',
      }).isFresh,
    ).toBe(false)
    expect(
      getCoveragePlanFreshness(record, {
        ...qaSource,
        updatedAt: '2026-05-12T09:00:00.000Z',
      }).reasons,
    ).toContain('The QA Source was edited after this plan was saved.')
    expect(
      getCoveragePlanFreshness(record, {
        ...qaSource,
        content: 'Changed content.',
      }).reasons,
    ).toContain('The QA Source content or metadata no longer matches this plan.')
    expect(getCoveragePlanFreshness(record, null)).toEqual({
      isFresh: false,
      reasons: ['The saved plan source no longer exists.'],
    })
  })

  it('reports stale section references separately from source freshness', () => {
    const record = createRecord()
    const packedSource = packQaSourceForAiSuggestions(qaSource)
    const matchingSectionIndex = {
      qaSourceId: qaSource.id,
      qaSourceCreatedAt: qaSource.createdAt,
      qaSourceUpdatedAt: qaSource.updatedAt,
      sourceFingerprint: 'source-fingerprint',
      schemaVersion: sectionContext.sectionSchemaVersion,
      sectionerVersion: sectionContext.sectionerVersion,
      indexedAt: '2026-05-12T08:00:30.000Z',
      sourceLength: qaSource.content.length,
      sectionSetFingerprint: sectionContext.sectionSetFingerprint,
      sections: [
        {
          id: sectionRef.sectionId,
          stableKey: sectionRef.stableKey,
          ordinal: sectionRef.ordinal,
          title: sectionRef.title,
          level: 1,
          path: sectionRef.path,
          startOffset: 0,
          endOffset: qaSource.content.length,
          startLine: sectionRef.startLine,
          endLine: sectionRef.endLine,
          characterCount: qaSource.content.length,
          contentFingerprint: 'section-content-fingerprint',
          preview: qaSource.content,
          includedInCoverage: true,
        },
      ],
      warnings: [],
    } as QaSourceSectionIndex
    const matchingCatalog = createAiCoveragePlanSectionCatalog(
      matchingSectionIndex,
      packedSource,
    )
    const missingSectionIndex = {
      ...matchingSectionIndex,
      sections: [],
    }
    const missingSectionCatalog = createAiCoveragePlanSectionCatalog(
      missingSectionIndex,
      packedSource,
    )
    const changedSectionSetIndex = {
      ...matchingSectionIndex,
      sectionSetFingerprint: 'changed-section-set',
    }
    const changedSectionSetCatalog = createAiCoveragePlanSectionCatalog(
      changedSectionSetIndex,
      packedSource,
    )

    expect(
      getCoveragePlanSectionReferenceFreshness(
        record,
        matchingSectionIndex,
        matchingCatalog,
      ),
    ).toEqual({
      isFresh: true,
      reasons: [],
    })
    expect(
      getCoveragePlanSectionReferenceFreshness(
        record,
        missingSectionIndex,
        missingSectionCatalog,
      ),
    ).toEqual({
      isFresh: false,
      reasons: ['3 saved source section references could not be revalidated.'],
    })
    expect(
      getCoveragePlanSectionReferenceFreshness(
        record,
        changedSectionSetIndex,
        changedSectionSetCatalog,
      ).reasons,
    ).toContain(
      'The saved plan section references no longer match the source structure.',
    )
    expect(getCoveragePlanFreshness(record, qaSource)).toEqual({
      isFresh: true,
      reasons: [],
    })
  })

  it('preserves blocked_by_ambiguity readiness after load', () => {
    const record = createRecord({
      ...createCoveragePlan(),
      coverageAreas: [
        {
          ...createCoveragePlan().coverageAreas[0],
          generationReadiness: 'blocked_by_ambiguity',
          ambiguities: ['Approval criteria are unresolved.'],
        },
      ],
    })

    saveCoveragePlans([record])

    const result = loadCoveragePlans()

    expect(result.coveragePlans[0].plan.coverageAreas[0].generationReadiness).toBe(
      'blocked_by_ambiguity',
    )
  })

  it('reports quota or blocked storage failures without throwing', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })

    expect(saveCoveragePlans([createRecord()])).toEqual({
      ok: false,
      error:
        'AI coverage plan changes are visible in this session, but they could not be saved to browser storage.',
    })
  })

  it('finds, upserts, and removes source-scoped records', () => {
    const firstRecord = createRecord()
    const secondSource = createQaSource({
      ...qaSource,
      id: 'source-2',
      title: 'Profile settings PRD',
    })
    const secondRecord = createPersistedCoveragePlanRecord({
      qaSource: secondSource,
      packedSource: packQaSourceForAiSuggestions(secondSource),
      plan: {
        ...createCoveragePlan(),
        sourceScope: {
          ...createCoveragePlan().sourceScope,
          qaSourceId: 'source-2',
        },
      },
      analyzedAt: '2026-05-12T08:03:00.000Z',
    })
    const replacementRecord = {
      ...firstRecord,
      id: 'coverage-plan-replacement',
      analysis: {
        ...firstRecord.analysis,
        analyzedAt: '2026-05-12T08:05:00.000Z',
      },
    }

    const upsertedRecords = upsertCoveragePlanRecord(
      [firstRecord, secondRecord],
      replacementRecord,
    )

    expect(upsertedRecords).toHaveLength(2)
    expect(findCoveragePlanForSource(upsertedRecords, 'source-1')?.id).toBe(
      'coverage-plan-replacement',
    )
    expect(findCoveragePlanForSource(upsertedRecords, 'missing-source')).toBeNull()
    expect(removeCoveragePlanForSource(upsertedRecords, 'source-1')).toEqual([
      secondRecord,
    ])
  })
})
