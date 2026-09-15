import { describe, expect, it } from 'vitest'
import type { AiSectionCoveragePlan } from './aiSectionCoveragePlanTypes'
import { AI_SECTION_COVERAGE_PLAN_SCHEMA_VERSION } from './aiSectionCoveragePlanTypes'
import type { AiCoveragePlanMergeSelectedAnalysisRef } from './aiCoveragePlanMergeTypes'
import {
  AI_COVERAGE_PLAN_MERGE_MAX_CANDIDATE_PAIRS,
  AI_COVERAGE_PLAN_MERGE_MAX_PROVIDER_FINDINGS_PER_SECTION,
  AI_COVERAGE_PLAN_MERGE_MAX_PROVIDER_FINDINGS_TOTAL,
  preprocessAiCoveragePlanMerge,
  strictCoveragePlanMergeKey,
} from './aiCoveragePlanMergePreprocessing'

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

function createAnalysis(
  index: number,
  plan: AiSectionCoveragePlan,
): {
  analysisRef: AiCoveragePlanMergeSelectedAnalysisRef
  sectionOrdinal: number
  plan: AiSectionCoveragePlan
} {
  return {
    analysisRef: {
      analysisRefId: `analysis-ref-${index}`,
      sectionPlanRecordId: `section-plan-record-${index}`,
      analyzedAt: `2026-07-18T10:0${index}:00.000Z`,
      planFingerprint: `plan-fingerprint-${index}`,
      sectionId: `source-section-${index}`,
      stableKey: `section-${index}::stable`,
      contentFingerprint: `section-content-${index}`,
    },
    sectionOrdinal: index,
    plan,
  }
}

describe('coverage plan merge deterministic preprocessing', () => {
  it('rejects preprocessing outside the bounded 2-8 selected-plan set', () => {
    expect(
      preprocessAiCoveragePlanMerge({
        analyses: [createAnalysis(1, createPlan())],
      }),
    ).toMatchObject({ ok: false })
    expect(
      preprocessAiCoveragePlanMerge({
        analyses: Array.from({ length: 9 }, (_, index) =>
          createAnalysis(index + 1, createPlan()),
        ),
      }),
    ).toMatchObject({ ok: false })
  })
  it('collapses only exact area cores and unions exact evidence provenance', () => {
    const first = createAnalysis(
      1,
      createPlan({
        coverageAreas: [
          {
            id: 'area-first',
            name: 'Account recovery',
            summary: 'Locked users contact support.',
            behaviors: ['Verify ownership', 'Unlock the account'],
            evidence: ['Locked users contact support.'],
            evidenceSupport: 'source_backed',
          },
        ],
      }),
    )
    const second = createAnalysis(
      2,
      createPlan({
        coverageAreas: [
          {
            id: 'area-second',
            name: '  ACCOUNT   RECOVERY ',
            summary: 'Locked users contact support.',
            behaviors: ['Unlock the account', 'Verify ownership'],
            evidence: [
              'Locked users contact support.',
              'Support records the unlock.',
            ],
            evidenceSupport: 'source_backed',
          },
        ],
      }),
    )

    const result = preprocessAiCoveragePlanMerge({ analyses: [second, first] })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    const areas = result.findings.filter(
      (finding) => finding.kind === 'coverage_area',
    )
    expect(areas).toHaveLength(1)
    expect(areas[0].contributors).toHaveLength(2)
    expect(areas[0].validatedEvidence.map((item) => item.excerpt)).toEqual([
      'Locked users contact support.',
      'Support records the unlock.',
    ])
    expect(areas[0].validatedEvidence[0].contributors).toHaveLength(2)
    expect(
      result.outputProvenance.find(
        (item) => item.outputFindingId === areas[0].findingId,
      )?.disposition,
    ).toBe('exact_duplicate')
    expect(result.exactDuplicateSummary).toMatchObject({
      groupCount: 3,
      collapsedFindingCount: 3,
    })
  })

  it('keeps same-title different-meaning and lexical near-duplicate findings separate', () => {
    const result = preprocessAiCoveragePlanMerge({
      analyses: [
        createAnalysis(
          1,
          createPlan({
            coverageAreas: [
              {
                id: 'area-a',
                name: 'Account recovery',
                summary: 'Support unlocks a verified customer.',
                behaviors: ['Support unlocks the account'],
                evidence: ['Support unlocks a verified customer.'],
                evidenceSupport: 'source_backed',
              },
            ],
            actors: ['Support agent'],
          }),
        ),
        createAnalysis(
          2,
          createPlan({
            coverageAreas: [
              {
                id: 'area-b',
                name: 'Account recovery',
                summary: 'A customer resets a forgotten password.',
                behaviors: ['Customer resets the password'],
                evidence: ['A customer resets a forgotten password.'],
                evidenceSupport: 'source_backed',
              },
            ],
            actors: ['Support-agent reviewer'],
          }),
        ),
      ],
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(
      result.findings.filter((finding) => finding.kind === 'coverage_area'),
    ).toHaveLength(2)
    expect(result.candidatePairs.length).toBeGreaterThan(0)
    expect(result.outputProvenance.every((item) => item.disposition === 'single')).toBe(
      true,
    )
  })

  it('uses kind-specific exact rules for every supported list and object category', () => {
    const shared = createPlan({
      actors: ['QA Lead'],
      states: ['Locked'],
      inputs: ['Account ID'],
      failureModes: ['Support unavailable'],
      integrationRisks: ['CRM timeout'],
      permissionsSecurity: ['Support role required'],
      dataPersistenceConcerns: ['Audit unlock actions'],
      ambiguities: [
        {
          id: 'ambiguity-a',
          question: 'Who verifies ownership?',
          whyItMatters: 'Recovery requires a trusted actor.',
          severity: 'high',
        },
      ],
      nextCoverage: [
        {
          id: 'next-a',
          title: 'Ownership proof',
          rationale: 'The proof is not specified.',
          priority: 'high',
        },
      ],
      warnings: ['Visible section only'],
    })
    const second = structuredClone(shared)
    second.ambiguities[0].id = 'ambiguity-b'
    second.nextCoverage[0].id = 'next-b'

    const result = preprocessAiCoveragePlanMerge({
      analyses: [createAnalysis(1, shared), createAnalysis(2, second)],
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    const kinds = [
      'actor',
      'state',
      'input',
      'failure_mode',
      'integration_risk',
      'permissions_security',
      'data_persistence',
      'ambiguity',
      'next_coverage',
      'warning',
    ] as const

    for (const kind of kinds) {
      const findings = result.findings.filter((finding) => finding.kind === kind)
      expect(findings, kind).toHaveLength(1)
      expect(findings[0].contributors, kind).toHaveLength(2)
    }
  })

  it('preserves punctuation meaning while normalizing NFKC, quotes, dashes, case, and whitespace', () => {
    expect(strictCoveragePlanMergeKey('  Ａ “Mixed”\tVALUE—בדיקה  ')).toBe(
      'a "mixed" value-בדיקה',
    )
    expect(strictCoveragePlanMergeKey('allow: deny')).not.toBe(
      strictCoveragePlanMergeKey('allow deny'),
    )
    expect(strictCoveragePlanMergeKey('אבג — English')).toBe('אבג - english')
  })

  it('produces deterministic IDs, order, aliases, and pairs under input permutations', () => {
    const first = createAnalysis(
      1,
      createPlan({ actors: ['Support agent'], states: ['Account locked'] }),
    )
    const second = createAnalysis(
      2,
      createPlan({ actors: ['Support-agent'], states: ['Account lock state'] }),
    )

    const left = preprocessAiCoveragePlanMerge({ analyses: [first, second] })
    const right = preprocessAiCoveragePlanMerge({ analyses: [second, first] })

    expect(left).toEqual(right)
    expect(left.ok).toBe(true)
    if (!left.ok) return

    for (const finding of left.providerFindings) {
      expect(finding.alias).toMatch(/^[a-z0-9]{32}$/)
      expect(finding.sectionAlias).toMatch(/^[a-z0-9]{32}$/)
      expect(finding.alias).not.toContain('source-section')
      expect(finding.alias).not.toContain('section-plan-record')
    }
  })

  it('transmits only uncertain-pair participants and never prior warning text', () => {
    const result = preprocessAiCoveragePlanMerge({
      analyses: [
        createAnalysis(
          1,
          createPlan({
            actors: ['Support agent'],
            states: ['Locked'],
            warnings: ['Previous provider warning shared text'],
          }),
        ),
        createAnalysis(
          2,
          createPlan({
            actors: ['Support-agent reviewer'],
            inputs: ['Account ID'],
            warnings: ['Previous provider warning shared wording'],
          }),
        ),
      ],
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    const referencedAliases = new Set(
      result.candidatePairs.flatMap((pair) => [pair.leftAlias, pair.rightAlias]),
    )
    expect(result.providerFindings).toHaveLength(2)
    expect(
      result.providerFindings.every((finding) =>
        referencedAliases.has(finding.alias),
      ),
    ).toBe(true)
    expect(JSON.stringify(result.providerFindings)).not.toMatch(
      /warning|locked|account id/i,
    )
  })

  it('nominates only cross-section pairs with distinct opaque section aliases', () => {
    const result = preprocessAiCoveragePlanMerge({
      analyses: [
        createAnalysis(
          1,
          createPlan({ actors: ['Support-agent reviewer', 'Support agent'] }),
        ),
        createAnalysis(2, createPlan({ actors: ['Support agent'] })),
        createAnalysis(3, createPlan({ actors: ['Support-agent administrator'] })),
      ],
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    const sectionAliasByFindingAlias = new Map(
      result.providerFindings.map((finding) => [
        finding.alias,
        finding.sectionAlias,
      ]),
    )
    expect(result.candidatePairs.length).toBeGreaterThan(0)
    expect(
      result.candidatePairs.every(
        (pair) =>
          sectionAliasByFindingAlias.get(pair.leftAlias) !==
          sectionAliasByFindingAlias.get(pair.rightAlias),
      ),
    ).toBe(true)
  })
  it('builds locally with zero pairs and no provider-visible catalog for unrelated findings', () => {
    const result = preprocessAiCoveragePlanMerge({
      analyses: [
        createAnalysis(1, createPlan({ actors: ['Customer'] })),
        createAnalysis(2, createPlan({ states: ['Suspended'] })),
      ],
    })

    expect(result).toMatchObject({
      ok: true,
      candidatePairs: [],
      providerFindings: [],
    })
  })

  it('enforces exact provider-visible finding limits without silent omission', () => {
    const makeActors = (prefix: string, count: number) =>
      Array.from({ length: count }, (_, index) => `${prefix}${index} shared${index}`)
    const atLimit = preprocessAiCoveragePlanMerge({
      analyses: [
        createAnalysis(
          1,
          createPlan({
            actors: makeActors(
              'left-',
              AI_COVERAGE_PLAN_MERGE_MAX_PROVIDER_FINDINGS_PER_SECTION,
            ),
          }),
        ),
        createAnalysis(
          2,
          createPlan({
            actors: makeActors(
              'right-',
              AI_COVERAGE_PLAN_MERGE_MAX_PROVIDER_FINDINGS_PER_SECTION,
            ),
          }),
        ),
      ],
    })

    expect(AI_COVERAGE_PLAN_MERGE_MAX_PROVIDER_FINDINGS_TOTAL).toBe(80)
    expect(atLimit.ok).toBe(true)

    const overLimit = preprocessAiCoveragePlanMerge({
      analyses: [
        createAnalysis(
          1,
          createPlan({
            actors: makeActors(
              'left-',
              AI_COVERAGE_PLAN_MERGE_MAX_PROVIDER_FINDINGS_PER_SECTION + 1,
            ),
          }),
        ),
        createAnalysis(
          2,
          createPlan({
            actors: makeActors(
              'right-',
              AI_COVERAGE_PLAN_MERGE_MAX_PROVIDER_FINDINGS_PER_SECTION + 1,
            ),
          }),
        ),
      ],
    })

    expect(overLimit).toMatchObject({ ok: false })
    if (!overLimit.ok) expect(overLimit.error).toMatch(/fewer|limit/i)
  })

  it('rejects candidate-pair limit-plus-one instead of slicing pairs', () => {
    const sharedActors = (prefix: string) =>
      Array.from({ length: 16 }, (_, index) => `${prefix}-${index} shared actor`)
    const result = preprocessAiCoveragePlanMerge({
      analyses: [
        createAnalysis(1, createPlan({ actors: sharedActors('left') })),
        createAnalysis(2, createPlan({ actors: sharedActors('right') })),
      ],
    })

    expect(AI_COVERAGE_PLAN_MERGE_MAX_CANDIDATE_PAIRS).toBe(120)
    expect(result).toMatchObject({ ok: false })
    if (!result.ok) expect(result.error).toMatch(/pair|fewer/i)
  })
})
