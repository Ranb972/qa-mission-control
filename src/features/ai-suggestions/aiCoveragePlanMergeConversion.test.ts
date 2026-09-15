import { describe, expect, it } from 'vitest'
import type { AiSectionCoveragePlan } from './aiSectionCoveragePlanTypes'
import { AI_SECTION_COVERAGE_PLAN_SCHEMA_VERSION } from './aiSectionCoveragePlanTypes'
import {
  AI_COVERAGE_PLAN_MERGE_ORIGIN_SCHEMA_VERSION,
  type AiCoveragePlanMergeSectionScope,
  type AiCoveragePlanMergeSelectedAnalysisRef,
  type AiCoveragePlanMergeSourceRevision,
} from './aiCoveragePlanMergeTypes'
import { preprocessAiCoveragePlanMerge } from './aiCoveragePlanMergePreprocessing'
import {
  applyAiCoveragePlanMergeDecisions,
  createGlobalCoverageMergeCandidate,
  validateAiCoveragePlanMergeDecisions,
} from './aiCoveragePlanMergeValidation'
import {
  buildAiCoveragePlanMergeDraft,
  convertGlobalCoverageMergeCandidate,
} from './aiCoveragePlanMergeConversion'
import { enumerateAiCoveragePlanMergeOutputIdentities } from './aiCoveragePlanMergeOutputIdentity'

const sourceRevision: AiCoveragePlanMergeSourceRevision = {
  qaSourceId: 'source-1',
  qaSourceCreatedAt: '2026-07-18T09:00:00.000Z',
  qaSourceUpdatedAt: '2026-07-18T09:30:00.000Z',
  sourceFingerprint: 'source-fingerprint',
  sectionSchemaVersion: 'qa-source-sections-json-v1',
  sectionerVersion: 'qa-source-sectioner-v1',
  sectionSetFingerprint: 'section-set-fingerprint',
}

function createAnalysisRef(index: number): AiCoveragePlanMergeSelectedAnalysisRef {
  return {
    analysisRefId: `analysis-${index}`,
    sectionPlanRecordId: `record-${index}`,
    analyzedAt: `2026-07-18T10:0${index}:00.000Z`,
    planFingerprint: `plan-fingerprint-${index}`,
    sectionId: `section-${index}`,
    stableKey: `stable-${index}`,
    contentFingerprint: `content-${index}`,
  }
}

function createPlan(
  overrides: Partial<AiSectionCoveragePlan> = {},
): AiSectionCoveragePlan {
  return {
    schemaVersion: AI_SECTION_COVERAGE_PLAN_SCHEMA_VERSION,
    coverageAreas: [],
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
    ...overrides,
  }
}

function createAnalysis(index: number, plan: AiSectionCoveragePlan) {
  return {
    analysisRef: createAnalysisRef(index),
    sectionOrdinal: index,
    plan,
  }
}

function createScope(
  { truncated = false }: { truncated?: boolean } = {},
): AiCoveragePlanMergeSectionScope {
  return {
    selected: [1, 2].map((index) => ({
      analysisRefId: `analysis-${index}`,
      sectionId: `section-${index}`,
      stableKey: `stable-${index}`,
      contentFingerprint: `content-${index}`,
      ordinal: index,
      title: `Section ${index}`,
      path: [`Section ${index}`],
      startLine: index === 1 ? 1 : 10,
      endLine: index === 1 ? 8 : 18,
      visibleEndLine: truncated && index === 1 ? 4 : index === 1 ? 8 : 18,
      characterCount: 500,
      visibleCharacterCount: truncated && index === 1 ? 200 : 500,
      truncated: truncated && index === 1,
    })),
    unselected: [],
    stale: [],
    unanalyzed: [],
    excluded: [],
  }
}

function classify(
  firstPlan: AiSectionCoveragePlan,
  secondPlan: AiSectionCoveragePlan,
  relation: 'likely_overlap' | 'conflict' | 'distinct' | 'needs_qa_review' =
    'distinct',
) {
  const preprocessing = preprocessAiCoveragePlanMerge({
    analyses: [createAnalysis(1, firstPlan), createAnalysis(2, secondPlan)],
  })
  if (!preprocessing.ok) throw new Error(preprocessing.error)

  const response =
    preprocessing.candidatePairs.length === 0
      ? undefined
      : {
          schemaVersion: 'coverage-plan-merge-decisions-json-v1',
          decisions: preprocessing.candidatePairs.map((pair) => ({
            pairAlias: pair.pairAlias,
            relation,
            reasonCode:
              relation === 'conflict'
                ? ('contradictory_claim' as const)
                : ('overlapping_scope' as const),
          })),
        }
  const validated = validateAiCoveragePlanMergeDecisions(
    response,
    preprocessing.candidatePairs,
  )
  if (!validated.ok) throw new Error(validated.error)

  return applyAiCoveragePlanMergeDecisions(preprocessing, validated.decisions)
}

describe('coverage plan merge app-owned conversion', () => {
  it.each(['partial', 'legacy', 'unsupported'] as const)('does not promote %s section evidence through an exact duplicate merge', (state) => {
    const area = {
      id: 'audit', name: 'Audit', summary: 'Record user and time.',
      behaviors: ['Record user.', 'Record time.'], evidence: state === 'unsupported' ? [] : ['Record user.'],
      evidenceSupport: 'needs_review' as const,
      ...(state === 'legacy' ? {} : { behaviorEvidence: [
        { behavior: 'Record user.', evidence: state === 'unsupported' ? [] : ['Record user.'] },
        { behavior: 'Record time.', evidence: [] },
      ] }),
    }
    const linked = { ...area, id: 'linked', evidence: ['Record user.', 'Record time.'], evidenceSupport: 'source_backed' as const,
      behaviorEvidence: area.behaviors.map(behavior => ({ behavior, evidence: [behavior] })) }
    const classified = classify(createPlan({ coverageAreas: [area] }), createPlan({ coverageAreas: [linked] }))
    const draft = buildAiCoveragePlanMergeDraft({ sourceRevision, sectionScope: createScope(), ...classified })
    expect(draft.plan.coverageAreas).toHaveLength(1)
    expect(draft.plan.coverageAreas[0].generationReadiness).toBe('needs_review')
    expect(draft.plan.coverageAreas[0].behaviors).toEqual(area.behaviors)
    expect(draft.plan.coverageAreas[0].evidence).toEqual(['Record user.', 'Record time.'])
    expect(draft.plan.warnings).toHaveLength(1)
    expect(enumerateAiCoveragePlanMergeOutputIdentities(draft.plan).length).toBe(draft.outputProvenance.length + 1)
  })
  it('maps section findings into AiCoveragePlan v2 without invented risks, links, or counts', () => {
    const classified = classify(
      createPlan({
        coverageAreas: [
          {
            id: 'area-1',
            name: 'Account recovery',
            summary: 'Support unlocks a verified account.',
            behaviors: ['Verify ownership'],
            evidence: ['Support unlocks a verified account.'],
            behaviorEvidence: [{ behavior: 'Verify ownership', evidence: ['Support unlocks a verified account.'] }],
            evidenceSupport: 'source_backed',
          },
        ],
        dataPersistenceConcerns: ['Audit every unlock'],
        nextCoverage: [
          {
            id: 'next-1',
            title: 'Ownership proof',
            rationale: 'The proof mechanism needs coverage.',
            priority: 'high',
          },
        ],
      }),
      createPlan({ actors: ['Support agent'] }),
    )

    const draft = buildAiCoveragePlanMergeDraft({
      sourceRevision,
      sectionScope: createScope(),
      ...classified,
    })

    expect(draft.plan).toMatchObject({
      schemaVersion: 'ai-coverage-plan-json-v2',
      sourceScope: {
        qaSourceId: 'source-1',
        visibleSourceOnly: true,
        sourceTruncated: false,
        coverageCompleteness: 'visible_source_only',
      },
      dataPersistenceRules: ['Audit every unlock'],
      nextGenerationAreas: [
        {
          title: 'Ownership proof',
          priority: 'High',
          relatedAreaIds: [],
          suggestedTestCount: 0,
        },
      ],
    })
    expect(draft.plan.coverageAreas[0]).toMatchObject({
      risks: [],
      generationReadiness: 'source_backed',
      sourceSectionRefs: [
        {
          sectionId: 'section-1',
          visibility: 'full',
          startLine: 1,
          endLine: 8,
        },
      ],
    })
  })

  it.each([
    ['likely_overlap', 'needs_review'],
    ['needs_qa_review', 'needs_review'],
    ['conflict', 'blocked_by_ambiguity'],
  ] as const)('derives %s readiness app-side as %s', (relation, readiness) => {
    const area = (id: string, summary: string) =>
      createPlan({
        coverageAreas: [
          {
            id,
            name: 'Account recovery',
            summary,
            behaviors: ['Recover account'],
            evidence: [summary],
            evidenceSupport: 'source_backed',
          },
        ],
      })
    const classified = classify(
      area('area-1', 'Support recovers the account.'),
      area('area-2', 'Customer recovers the account.'),
      relation,
    )
    const draft = buildAiCoveragePlanMergeDraft({
      sourceRevision,
      sectionScope: createScope(),
      ...classified,
    })

    expect(draft.plan.coverageAreas).toHaveLength(2)
    expect(
      draft.plan.coverageAreas.every(
        (coverageArea) => coverageArea.generationReadiness === readiness,
      ),
    ).toBe(true)
  })

  it('does not leave areas source-backed while any non-area review relation is unresolved', () => {
    const classified = classify(
      createPlan({
        coverageAreas: [
          {
            id: 'area-1',
            name: 'Recovery',
            summary: 'Recover the account.',
            behaviors: [],
            evidence: ['Recover the account.'],
            evidenceSupport: 'source_backed',
          },
        ],
        actors: ['Support agent'],
      }),
      createPlan({ actors: ['Support-agent reviewer'] }),
      'likely_overlap',
    )
    const draft = buildAiCoveragePlanMergeDraft({
      sourceRevision,
      sectionScope: createScope(),
      ...classified,
    })

    expect(draft.reviewRelations).toHaveLength(1)
    expect(draft.plan.coverageAreas[0].generationReadiness).toBe('needs_review')
  })
  it('uses needs_review for missing evidence and blocked_by_ambiguity for unresolved ambiguity', () => {
    const missingEvidence = classify(
      createPlan({
        coverageAreas: [
          {
            id: 'area-1',
            name: 'Recovery',
            summary: 'Recover the account.',
            behaviors: [],
            evidence: [],
            evidenceSupport: 'needs_review',
          },
        ],
      }),
      createPlan({ states: ['Locked'] }),
    )
    expect(
      buildAiCoveragePlanMergeDraft({
        sourceRevision,
        sectionScope: createScope(),
        ...missingEvidence,
      }).plan.coverageAreas[0].generationReadiness,
    ).toBe('needs_review')

    const ambiguous = classify(
      createPlan({
        coverageAreas: [
          {
            id: 'area-2',
            name: 'Ownership',
            summary: 'Verify ownership.',
            behaviors: [],
            evidence: ['Verify ownership.'],
            evidenceSupport: 'source_backed',
          },
        ],
        ambiguities: [
          {
            id: 'ambiguity-1',
            question: 'Which proof is accepted?',
            whyItMatters: 'The requirement is unresolved.',
            severity: 'high',
          },
        ],
      }),
      createPlan({ actors: ['Customer'] }),
    )
    expect(
      buildAiCoveragePlanMergeDraft({
        sourceRevision,
        sectionScope: createScope(),
        ...ambiguous,
      }).plan.coverageAreas[0].generationReadiness,
    ).toBe('blocked_by_ambiguity')
  })

  it('derives partial and insufficient completeness and always adds safe scope counts', () => {
    const classified = classify(
      createPlan({ actors: ['Customer'] }),
      createPlan({ states: ['Locked'] }),
    )
    const partialScope = createScope({ truncated: true })
    partialScope.unselected.push({
      ...partialScope.selected[1],
      sectionId: 'section-3',
      stableKey: 'stable-3',
      contentFingerprint: 'content-3',
      ordinal: 3,
      title: 'Section 3',
      path: ['Section 3'],
    })
    const partial = buildAiCoveragePlanMergeDraft({
      sourceRevision,
      sectionScope: partialScope,
      ...classified,
    }).plan

    expect(partial.sourceScope).toMatchObject({
      sourceTruncated: true,
      coverageCompleteness: 'partial_due_to_truncation',
    })
    expect(partial.warnings.at(-1)).toMatch(
      /selected: 2; current but unselected: 1; stale: 0; unanalyzed: 0; excluded: 0/i,
    )
    expect(partial.coverageAreas).toEqual([])

    const insufficientScope = createScope()
    insufficientScope.unanalyzed.push({
      ...insufficientScope.selected[1],
      sectionId: 'section-3',
      stableKey: 'stable-3',
      contentFingerprint: 'content-3',
      ordinal: 3,
      title: 'Section 3',
      path: ['Section 3'],
    })
    expect(
      buildAiCoveragePlanMergeDraft({
        sourceRevision,
        sectionScope: insufficientScope,
        ...classified,
      }).plan.sourceScope.coverageCompleteness,
    ).toBe('insufficient_source')
  })

  it('preserves partial section bounds and supports more than 12 merged areas without slicing', () => {
    const makeAreas = (prefix: string, count: number) =>
      Array.from({ length: count }, (_, index) => ({
        id: `${prefix}-${index}`,
        name: `${prefix} area ${index}`,
        summary: `${prefix} summary ${index}`,
        behaviors: [],
        evidence: [`${prefix} summary ${index}`],
        evidenceSupport: 'source_backed' as const,
      }))
    const classified = classify(
      createPlan({ coverageAreas: makeAreas('first', 7) }),
      createPlan({ coverageAreas: makeAreas('second', 7) }),
    )
    const draft = buildAiCoveragePlanMergeDraft({
      sourceRevision,
      sectionScope: createScope({ truncated: true }),
      ...classified,
    })

    expect(draft.plan.coverageAreas).toHaveLength(14)
    expect(draft.plan.coverageAreas[0].sourceSectionRefs[0]).toMatchObject({
      visibility: 'partial',
      startLine: 1,
      endLine: 4,
    })
  })

  it('creates a transient candidate then returns only v2 plus compact app-owned origin', () => {
    const classified = classify(
      createPlan({ actors: ['Support agent'] }),
      createPlan({ actors: ['Support-agent reviewer'] }),
      'likely_overlap',
    )
    const draft = buildAiCoveragePlanMergeDraft({
      sourceRevision,
      sectionScope: createScope(),
      ...classified,
    })
    const candidate = createGlobalCoverageMergeCandidate({
      candidateId: 'merge-candidate-1',
      builtAt: '2026-07-18T11:00:00.000Z',
      sourceRevision,
      selectedAnalyses: [createAnalysisRef(1), createAnalysisRef(2)],
      sectionScope: createScope(),
      planDraft: draft.plan,
      outputProvenance: draft.outputProvenance,
      reviewRelations: draft.reviewRelations,
      exactDuplicateSummary: classified.exactDuplicateSummary,
      warnings: draft.plan.warnings,
    })
    const converted = convertGlobalCoverageMergeCandidate(candidate)

    expect(converted.plan.schemaVersion).toBe('ai-coverage-plan-json-v2')
    expect(converted.origin).toMatchObject({
      kind: 'section_merge',
      originSchemaVersion: AI_COVERAGE_PLAN_MERGE_ORIGIN_SCHEMA_VERSION,
      selectedAnalyses: candidate.selectedAnalyses,
    })
    expect(JSON.stringify(converted)).not.toMatch(
      /pairAlias|reasonCode|provider|candidatePairs|similarity/i,
    )

    const validOutputIds = new Set(
      enumerateAiCoveragePlanMergeOutputIdentities(converted.plan).map(
        (identity) => identity.outputFindingId,
      ),
    )
    expect(
      converted.origin.outputProvenance.every((item) =>
        validOutputIds.has(item.outputFindingId),
      ),
    ).toBe(true)
  })

  it('constructs candidates from exact app-owned fields and enforces the 512 KiB bound', () => {
    const classified = classify(
      createPlan({ actors: ['Customer'] }),
      createPlan({ states: ['Locked'] }),
    )
    const draft = buildAiCoveragePlanMergeDraft({
      sourceRevision,
      sectionScope: createScope(),
      ...classified,
    })
    const base = {
      candidateId: 'merge-candidate-exact',
      builtAt: '2026-07-18T11:00:00.000Z',
      sourceRevision,
      selectedAnalyses: [createAnalysisRef(1), createAnalysisRef(2)],
      sectionScope: createScope(),
      planDraft: draft.plan,
      outputProvenance: draft.outputProvenance,
      reviewRelations: draft.reviewRelations,
      exactDuplicateSummary: classified.exactDuplicateSummary,
      warnings: draft.plan.warnings,
    }
    const candidate = createGlobalCoverageMergeCandidate({
      ...base,
      providerAliases: ['must-not-survive'],
    } as Parameters<typeof createGlobalCoverageMergeCandidate>[0])

    expect(candidate).not.toHaveProperty('providerAliases')
    expect(() =>
      createGlobalCoverageMergeCandidate({
        ...base,
        warnings: ['x'.repeat(512 * 1024)],
      }),
    ).toThrow(/512|large|size/i)
  })
})
