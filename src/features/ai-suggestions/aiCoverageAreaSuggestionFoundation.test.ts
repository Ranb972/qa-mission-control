import { describe, expect, it } from 'vitest'
import { createQaSource } from '../../test/qaSourceFactory'
import { packQaSourceForAiSuggestions } from './aiSuggestionContext'
import { buildAiCoverageAreaSuggestionRequest } from './aiCoverageAreaSuggestionPrompt'
import {
  AI_COVERAGE_AREA_SUGGESTION_SCHEMA_VERSION,
  type AiCoverageAreaSuggestionSelectedArea,
} from './aiCoverageAreaSuggestionTypes'
import {
  parseAiCoverageAreaSuggestionResponse,
} from './aiCoverageAreaSuggestionValidation'

const sourceContent =
  'Billing owner can cancel an active subscription. Cancellation disables renewal. Exact cancellation copy is not finalized.'

const selectedArea: AiCoverageAreaSuggestionSelectedArea = {
  id: 'coverage-area-1-billing-cancellation',
  name: 'Billing cancellation',
  summary: 'Coverage for cancellation and renewal behavior.',
  behaviors: [
    'Billing owner can cancel an active subscription.',
    'Cancellation disables renewal.',
  ],
  risks: ['Renewal could remain enabled after cancellation.'],
  evidence: ['Billing owner can cancel an active subscription.'],
  ambiguities: [],
  generationReadiness: 'source_backed',
}

function createAreaResponse(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: AI_COVERAGE_AREA_SUGGESTION_SCHEMA_VERSION,
    sourceScope: {
      qaSourceId: 'source-1',
      visibleSourceOnly: true,
      sourceTruncated: false,
      analysisScope: 'visible_source_only',
    },
    areaScope: {
      name: 'Billing cancellation',
      summary: 'Coverage for cancellation and renewal behavior.',
      evidence: ['Billing owner can cancel an active subscription.'],
      generationReadiness: 'source_backed',
    },
    testCaseSuggestions: [
      {
        status: 'Ready',
        confidence: 'High',
        title: 'Billing owner cancels active subscription',
        area: 'Billing cancellation',
        priority: 'High',
        type: 'Functional',
        preconditions: 'Billing owner has an active subscription.',
        structuredSteps: [
          {
            action: 'Cancel the active subscription as the billing owner.',
            expectedResult: 'The subscription is canceled.',
          },
          {
            action: 'Review the renewal state after cancellation.',
            expectedResult: 'Renewal is disabled.',
          },
        ],
        evidence: [
          'Billing owner can cancel an active subscription.',
          'Cancellation disables renewal.',
        ],
        assumptions: [],
        warnings: [],
      },
    ],
    coverageAssessment: {
      coverageLevel: 'High',
      coveredBehaviors: [
        'Billing owner can cancel an active subscription.',
        'Cancellation disables renewal.',
      ],
      missingBehaviors: [],
      blockedAmbiguousItems: [],
      suggestedFollowUpCoverage: [],
      stopReason:
        'Generated 1 suggestion. Stopped because additional cases would be duplicate, speculative, unsupported, or low-value.',
    },
    warnings: [],
    ...overrides,
  }
}

describe('AI coverage area suggestion foundation helpers', () => {
  it('builds an area-specific browser request without prompt-shaped fields', () => {
    const packedSource = packQaSourceForAiSuggestions(
      createQaSource({
        id: 'source-1',
        title: 'Billing LLD',
        sourceType: 'LLD',
        status: 'Ready for test design',
        content: sourceContent,
      }),
      { maxCharacterCount: 24_000 },
    )

    const request = buildAiCoverageAreaSuggestionRequest(
      packedSource,
      selectedArea,
    )

    expect(request).toEqual({
      source: packedSource,
      selectedArea,
    })
    expect(request).not.toHaveProperty('prompt')
    expect(request).not.toHaveProperty('responseSchema')
  })

  it('validates Ready suggestions only when evidence matches the visible source', () => {
    const result = parseAiCoverageAreaSuggestionResponse(createAreaResponse(), {
      qaSourceId: 'source-1',
      sourceContent,
      sourceTruncated: false,
      selectedArea,
    })

    expect(result.ok).toBe(true)
    expect(result.areaSuggestionResult?.coverageAssessment.coverageLevel).toBe(
      'High',
    )
    expect(result.areaSuggestionResult?.testCaseSuggestions[0]).toMatchObject({
      id: 'ai-area-suggestion-1',
      status: 'Ready',
      confidence: 'High',
    })
  })

  it('downgrades unmatched evidence and invalid High coverage levels', () => {
    const result = parseAiCoverageAreaSuggestionResponse(
      createAreaResponse({
        testCaseSuggestions: [
          {
            status: 'Ready',
            confidence: 'High',
            title: 'Billing owner cancels active subscription',
            area: 'Billing cancellation',
            priority: 'High',
            type: 'Functional',
            preconditions: '',
            structuredSteps: [
              {
                action: 'Cancel the active subscription.',
                expectedResult: 'The subscription is canceled.',
              },
            ],
            evidence: ['This exact evidence is absent.'],
            assumptions: [],
            warnings: [],
          },
        ],
      }),
      {
        qaSourceId: 'source-1',
        sourceContent,
        sourceTruncated: false,
        selectedArea,
      },
    )

    expect(result.areaSuggestionResult?.testCaseSuggestions[0]).toMatchObject({
      status: 'Needs review',
      warnings: expect.arrayContaining([
        'One or more evidence excerpts were not found in the visible packed source.',
      ]),
    })
    expect(result.areaSuggestionResult?.coverageAssessment.coverageLevel).toBe(
      'Low',
    )
    expect(result.warnings).toContain(
      'Coverage level was downgraded because High requires safe Ready suggestions, represented core behaviors, no blockers, no unmatched evidence, no major ambiguity, and no in-scope missing behavior.',
    )
  })

  it('keeps blocked areas from returning import-ready suggestions', () => {
    const blockedArea = {
      ...selectedArea,
      ambiguities: ['Cancellation approval role is unresolved.'],
      generationReadiness: 'blocked_by_ambiguity' as const,
    }
    const result = parseAiCoverageAreaSuggestionResponse(createAreaResponse(), {
      qaSourceId: 'source-1',
      sourceContent,
      sourceTruncated: false,
      selectedArea: blockedArea,
    })

    expect(result.areaSuggestionResult?.testCaseSuggestions).toEqual([])
    expect(result.areaSuggestionResult?.coverageAssessment).toMatchObject({
      coverageLevel: 'Low',
      blockedAmbiguousItems: ['Cancellation approval role is unresolved.'],
    })
    expect(result.warnings).toContain(
      'Selected area is blocked by ambiguity; no import-ready suggestions were returned.',
    )
  })

  it('downgrades provider-blocked area output so Ready suggestions are not importable', () => {
    const result = parseAiCoverageAreaSuggestionResponse(
      createAreaResponse({
        areaScope: {
          name: 'Billing cancellation',
          summary: 'Coverage for cancellation and renewal behavior.',
          evidence: ['Billing owner can cancel an active subscription.'],
          generationReadiness: 'blocked_by_ambiguity',
        },
        coverageAssessment: {
          coverageLevel: 'High',
          coveredBehaviors: [
            'Billing owner can cancel an active subscription.',
            'Cancellation disables renewal.',
          ],
          missingBehaviors: [],
          blockedAmbiguousItems: ['Cancellation approval role is unresolved.'],
          suggestedFollowUpCoverage: [
            'Clarify cancellation approval before generating import-ready tests.',
          ],
          stopReason:
            'Generated 1 suggestion. Stopped because additional cases would be duplicate, speculative, unsupported, or low-value.',
        },
      }),
      {
        qaSourceId: 'source-1',
        sourceContent,
        sourceTruncated: false,
        selectedArea,
      },
    )

    expect(result.areaSuggestionResult?.areaScope.generationReadiness).toBe(
      'blocked_by_ambiguity',
    )
    expect(result.areaSuggestionResult?.testCaseSuggestions).toHaveLength(1)
    expect(
      result.areaSuggestionResult?.testCaseSuggestions.filter(
        (suggestion) => suggestion.status === 'Ready',
      ),
    ).toEqual([])
    expect(result.areaSuggestionResult?.testCaseSuggestions[0]).toMatchObject({
      status: 'Needs review',
      warnings: expect.arrayContaining([
        'Blocked areas cannot produce import-ready suggestions.',
      ]),
    })
    expect(result.areaSuggestionResult?.coverageAssessment.coverageLevel).toBe(
      'Low',
    )
    expect(result.warnings).toContain(
      'Provider marked the selected area as blocked by ambiguity; blocked areas cannot produce import-ready suggestions.',
    )
  })

  it('downgrades assumptions, provider warnings, invalid steps, duplicates, and invalid levels', () => {
    const result = parseAiCoverageAreaSuggestionResponse(
      createAreaResponse({
        testCaseSuggestions: [
          {
            status: 'Ready',
            confidence: 'High',
            title: 'Billing owner cancels active subscription',
            area: 'Billing cancellation',
            priority: 'High',
            type: 'Functional',
            preconditions: '',
            structuredSteps: [
              {
                action: 'Cancel the active subscription.',
                expectedResult: '',
              },
            ],
            evidence: ['Billing owner can cancel an active subscription.'],
            assumptions: ['Owner account exists.'],
            warnings: ['Exact cancellation copy is not finalized.'],
          },
          {
            status: 'Ready',
            confidence: 'High',
            title: 'Billing owner cancels active subscription',
            area: 'Billing cancellation',
            priority: 'High',
            type: 'Functional',
            preconditions: '',
            structuredSteps: [
              {
                action: 'Cancel the active subscription.',
                expectedResult: 'The subscription is canceled.',
              },
            ],
            evidence: ['Billing owner can cancel an active subscription.'],
            assumptions: [],
            warnings: [],
          },
          {
            status: 'Ready',
            confidence: 'High',
            title: 'Billing owner cancels active subscription',
            area: 'Billing cancellation',
            priority: 'High',
            type: 'Functional',
            preconditions: '',
            structuredSteps: [
              {
                action: 'Cancel the active subscription.',
                expectedResult: 'The subscription is canceled.',
              },
            ],
            evidence: ['Billing owner can cancel an active subscription.'],
            assumptions: [],
            warnings: [],
          },
        ],
        coverageAssessment: {
          coverageLevel: 'Complete',
          coveredBehaviors: ['Billing owner can cancel an active subscription.'],
          missingBehaviors: [],
          blockedAmbiguousItems: [],
          suggestedFollowUpCoverage: [],
          stopReason:
            'Generated 2 suggestions. Stopped because additional cases would be duplicate.',
        },
      }),
      {
        qaSourceId: 'source-1',
        sourceContent,
        sourceTruncated: false,
        selectedArea,
      },
    )

    expect(result.areaSuggestionResult?.coverageAssessment.coverageLevel).toBe(
      'Partial',
    )
    expect(result.warnings).toContain(
      'Coverage level "Complete" is not supported and was downgraded.',
    )
    expect(result.areaSuggestionResult?.testCaseSuggestions).toEqual([
      expect.objectContaining({
        status: 'Needs review',
        warnings: expect.arrayContaining([
          'Step 1 must include both an action and an expected result.',
          'Assumptions require QA review before import.',
          'Exact cancellation copy is not finalized.',
        ]),
      }),
      expect.objectContaining({ status: 'Ready' }),
      expect.objectContaining({
        status: 'Needs review',
        warnings: expect.arrayContaining([
          'Suggestion appears to duplicate an earlier scenario and needs QA review.',
        ]),
      }),
    ])
  })
})
