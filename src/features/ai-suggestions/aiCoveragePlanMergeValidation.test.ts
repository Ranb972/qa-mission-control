import { describe, expect, it } from 'vitest'
import type { AiSectionCoveragePlan } from './aiSectionCoveragePlanTypes'
import { AI_SECTION_COVERAGE_PLAN_SCHEMA_VERSION } from './aiSectionCoveragePlanTypes'
import type { AiCoveragePlanMergeSelectedAnalysisRef } from './aiCoveragePlanMergeTypes'
import { preprocessAiCoveragePlanMerge } from './aiCoveragePlanMergePreprocessing'
import {
  applyAiCoveragePlanMergeDecisions,
  validateAiCoveragePlanMergeDecisions,
} from './aiCoveragePlanMergeValidation'

function createAnalysis(
  index: number,
  actor: string,
): {
  analysisRef: AiCoveragePlanMergeSelectedAnalysisRef
  sectionOrdinal: number
  plan: AiSectionCoveragePlan
} {
  return {
    analysisRef: {
      analysisRefId: `analysis-${index}`,
      sectionPlanRecordId: `record-${index}`,
      analyzedAt: `2026-07-18T10:0${index}:00.000Z`,
      planFingerprint: `fingerprint-${index}`,
      sectionId: `section-${index}`,
      stableKey: `stable-${index}`,
      contentFingerprint: `content-${index}`,
    },
    sectionOrdinal: index,
    plan: {
      schemaVersion: AI_SECTION_COVERAGE_PLAN_SCHEMA_VERSION,
      coverageAreas: [],
      actors: [actor],
      states: [],
      inputs: [],
      failureModes: [],
      integrationRisks: [],
      permissionsSecurity: [],
      dataPersistenceConcerns: [],
      ambiguities: [],
      nextCoverage: [],
      warnings: [],
    },
  }
}

function createPreprocessing() {
  const result = preprocessAiCoveragePlanMerge({
    analyses: [
      createAnalysis(1, 'Support agent'),
      createAnalysis(2, 'Support-agent reviewer'),
    ],
  })

  if (!result.ok || result.candidatePairs.length !== 1) {
    throw new Error('Expected one deterministic candidate pair in test setup.')
  }

  return result
}

describe('coverage plan merge semantic classification validation', () => {
  it('accepts a closed-set bijection and normalizes provider order to request order', () => {
    const preprocessing = createPreprocessing()
    const extraPair = {
      ...preprocessing.candidatePairs[0],
      pairAlias: 'p'.repeat(32),
      leftFindingId: preprocessing.candidatePairs[0].rightFindingId,
      rightFindingId: preprocessing.candidatePairs[0].leftFindingId,
    }
    const pairs = [preprocessing.candidatePairs[0], extraPair]
    const response = {
      schemaVersion: 'coverage-plan-merge-decisions-json-v1',
      decisions: [
        {
          pairAlias: extraPair.pairAlias,
          relation: 'distinct',
          reasonCode: 'different_scope',
        },
        {
          pairAlias: pairs[0].pairAlias,
          relation: 'likely_overlap',
          reasonCode: 'same_intent',
        },
      ],
    }

    const result = validateAiCoveragePlanMergeDecisions(response, pairs)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.decisions.map((decision) => decision.pairAlias)).toEqual(
      pairs.map((pair) => pair.pairAlias),
    )
  })

  it.each([
    ['missing', (response: Record<string, unknown>) => ({ ...response, decisions: [] })],
    [
      'duplicate',
      (response: Record<string, unknown>) => ({
        ...response,
        decisions: [
          ...(response.decisions as unknown[]),
          ...(response.decisions as unknown[]),
        ],
      }),
    ],
    [
      'unknown',
      (response: Record<string, unknown>) => ({
        ...response,
        decisions: [
          {
            ...(response.decisions as Array<Record<string, unknown>>)[0],
            pairAlias: 'u'.repeat(32),
          },
        ],
      }),
    ],
    [
      'extra key',
      (response: Record<string, unknown>) => ({
        ...response,
        decisions: [
          {
            ...(response.decisions as Array<Record<string, unknown>>)[0],
            evidence: ['provider-authored'],
          },
        ],
      }),
    ],
    [
      'forbidden nested control data',
      (response: Record<string, unknown>) => ({
        ...response,
        metadata: { plan: { readiness: 'source_backed' } },
      }),
    ],
  ])('rejects %s decisions as an all-or-nothing failure', (_label, mutate) => {
    const preprocessing = createPreprocessing()
    const response = {
      schemaVersion: 'coverage-plan-merge-decisions-json-v1',
      decisions: [
        {
          pairAlias: preprocessing.candidatePairs[0].pairAlias,
          relation: 'likely_overlap',
          reasonCode: 'overlapping_scope',
        },
      ],
    }

    expect(
      validateAiCoveragePlanMergeDecisions(
        mutate(response),
        preprocessing.candidatePairs,
      ),
    ).toMatchObject({ ok: false, decisions: null })
  })

  it.each([
    ['likely_overlap', 'likely_overlap'],
    ['conflict', 'conflict'],
    ['needs_qa_review', 'needs_qa_review'],
  ] as const)(
    'keeps both findings and creates an app-owned %s relation',
    (providerRelation, durableRelation) => {
      const preprocessing = createPreprocessing()
      const validation = validateAiCoveragePlanMergeDecisions(
        {
          schemaVersion: 'coverage-plan-merge-decisions-json-v1',
          decisions: [
            {
              pairAlias: preprocessing.candidatePairs[0].pairAlias,
              relation: providerRelation,
              reasonCode:
                providerRelation === 'conflict'
                  ? 'contradictory_claim'
                  : 'overlapping_scope',
            },
          ],
        },
        preprocessing.candidatePairs,
      )

      expect(validation.ok).toBe(true)
      if (!validation.ok) return

      const applied = applyAiCoveragePlanMergeDecisions(
        preprocessing,
        validation.decisions,
      )

      expect(applied.findings).toHaveLength(preprocessing.findings.length)
      expect(applied.reviewRelations).toHaveLength(1)
      expect(applied.reviewRelations[0]).toMatchObject({
        kind: durableRelation,
        outputFindingIds: [
          preprocessing.candidatePairs[0].leftFindingId,
          preprocessing.candidatePairs[0].rightFindingId,
        ],
      })
      expect(JSON.stringify(applied)).not.toContain('reasonCode')
      expect(JSON.stringify(applied)).not.toContain(
        preprocessing.candidatePairs[0].pairAlias,
      )
    },
  )

  it('keeps distinct findings separate without creating a durable relation', () => {
    const preprocessing = createPreprocessing()
    const validation = validateAiCoveragePlanMergeDecisions(
      {
        schemaVersion: 'coverage-plan-merge-decisions-json-v1',
        decisions: [
          {
            pairAlias: preprocessing.candidatePairs[0].pairAlias,
            relation: 'distinct',
            reasonCode: 'different_scope',
          },
        ],
      },
      preprocessing.candidatePairs,
    )

    expect(validation.ok).toBe(true)
    if (!validation.ok) return
    expect(
      applyAiCoveragePlanMergeDecisions(preprocessing, validation.decisions),
    ).toMatchObject({
      findings: preprocessing.findings,
      reviewRelations: [],
    })
  })

  it('requires no response and makes no semantic changes when there are zero pairs', () => {
    const preprocessing = preprocessAiCoveragePlanMerge({
      analyses: [
        createAnalysis(1, 'Customer'),
        {
          ...createAnalysis(2, 'unused'),
          plan: {
            ...createAnalysis(2, 'unused').plan,
            actors: [],
            states: ['Suspended'],
          },
        },
      ],
    })

    expect(preprocessing.ok).toBe(true)
    if (!preprocessing.ok) return
    expect(preprocessing.candidatePairs).toEqual([])

    const validation = validateAiCoveragePlanMergeDecisions(
      undefined,
      preprocessing.candidatePairs,
    )
    expect(validation).toEqual({ ok: true, decisions: [], error: null })
  })
})
