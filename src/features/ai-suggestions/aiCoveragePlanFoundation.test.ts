import { describe, expect, it } from 'vitest'
import { createQaSource } from '../../test/qaSourceFactory'
import { createQaSourceSectionIndex } from '../qa-sources/qaSourceSections'
import { createAiCoveragePlanSectionCatalog } from './aiCoveragePlanSectionContext'
import { packQaSourceForAiSuggestions } from './aiSuggestionContext'
import {
  AI_COVERAGE_PLAN_SOURCE_CONTEXT_MAX_CHARACTERS,
  buildAiCoveragePlanRequest,
} from './aiCoveragePlanPrompt'
import { AI_COVERAGE_PLAN_SCHEMA_VERSION } from './aiCoveragePlanTypes'
import {
  AI_COVERAGE_PLAN_AREA_MAX_COUNT,
  AI_COVERAGE_PLAN_TEXT_MAX_LENGTH,
  parseAiCoveragePlanResponse,
} from './aiCoveragePlanValidation'

function createCoveragePlan(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: AI_COVERAGE_PLAN_SCHEMA_VERSION,
    sourceScope: {
      qaSourceId: 'source-1',
      visibleSourceOnly: true,
      sourceTruncated: false,
      coverageCompleteness: 'visible_source_only',
    },
    coverageAreas: [
      {
        id: 'provider-controlled-id',
        name: 'Billing cancellation',
        summary: 'Coverage for cancellation confirmation and paid access.',
        behaviors: ['Billing owner can cancel an active subscription.'],
        risks: ['Renewal may remain enabled after cancellation.'],
        evidence: ['Billing owner can cancel an active subscription.'],
        ambiguities: [],
        generationReadiness: 'source_backed',
        ignored: 'provider extra field',
      },
    ],
    actors: ['Billing owner'],
    states: ['Active', 'Canceled'],
    inputs: ['Cancellation confirmation'],
    failureModes: ['Billing provider unavailable'],
    integrationRisks: ['Payment provider timeout'],
    permissionsSecurity: ['Non-owner cannot change billing'],
    dataPersistenceRules: ['Renewal is disabled after cancellation.'],
    ambiguities: [
      {
        question: 'Is cancellation copy finalized?',
        whyItMatters: 'Future generated tests should not assert exact copy yet.',
        severity: 'Medium',
      },
    ],
    nextGenerationAreas: [
      {
        title: 'Cancellation coverage',
        rationale: 'Cancellation affects renewal and paid access.',
        priority: 'High',
        relatedAreaNames: ['Billing cancellation'],
        relatedAreaIds: ['provider-controlled-id'],
        suggestedTestCount: 4,
      },
    ],
    warnings: [],
    ...overrides,
  }
}

describe('AI coverage planner foundation helpers', () => {
  it('builds a transport-only coverage-plan request without a browser prompt or response schema', () => {
    const packedSource = packQaSourceForAiSuggestions(
      createQaSource({
        id: 'source-1',
        title: 'Billing access LLD',
        sourceType: 'LLD',
        status: 'Ready for test design',
        content: 'Billing owner can cancel an active subscription.',
      }),
      {
        maxCharacterCount: AI_COVERAGE_PLAN_SOURCE_CONTEXT_MAX_CHARACTERS,
      },
    )

    const request = buildAiCoveragePlanRequest(packedSource)

    expect(request.source.maxCharacterCount).toBe(24_000)
    expect(request).not.toHaveProperty('prompt')
    expect(request).not.toHaveProperty('responseSchema')
  })

  it('rejects malformed JSON and invalid root schemas', () => {
    expect(
      parseAiCoveragePlanResponse('{not json', {
        qaSourceId: 'source-1',
        sourceContent: 'Billing owner can cancel an active subscription.',
        sourceTruncated: false,
      }),
    ).toMatchObject({
      ok: false,
      coveragePlan: null,
      error: 'AI coverage plan response was not valid JSON.',
    })

    expect(
      parseAiCoveragePlanResponse({ schemaVersion: AI_COVERAGE_PLAN_SCHEMA_VERSION }, {
        qaSourceId: 'source-1',
        sourceContent: 'Billing owner can cancel an active subscription.',
        sourceTruncated: false,
      }),
    ).toMatchObject({
      ok: false,
      coveragePlan: null,
      error: 'AI coverage plan response did not match the expected schema.',
    })
  })

  it('validates, caps, and normalizes a source-backed coverage map without trusting provider IDs', () => {
    const response = createCoveragePlan({
      coverageAreas: Array.from({
        length: AI_COVERAGE_PLAN_AREA_MAX_COUNT + 2,
      }).map((_, index) => ({
        id: 'provider-duplicate-id',
        name: `Billing cancellation ${index + 1}`,
        summary: 'x'.repeat(AI_COVERAGE_PLAN_TEXT_MAX_LENGTH + 50),
        behaviors: ['Billing owner can cancel an active subscription.'],
        risks: ['Renewal may remain enabled after cancellation.'],
        evidence: ['Billing owner can cancel an active subscription.'],
        ambiguities: [],
        generationReadiness: 'source_backed',
      })),
    })

    const result = parseAiCoveragePlanResponse(response, {
      qaSourceId: 'source-1',
      sourceContent: 'Billing owner can cancel an active subscription.',
      sourceTruncated: false,
    })

    expect(result.ok).toBe(true)
    expect(result.coveragePlan?.coverageAreas).toHaveLength(
      AI_COVERAGE_PLAN_AREA_MAX_COUNT,
    )
    expect(result.coveragePlan?.coverageAreas[0]).toMatchObject({
      id: 'coverage-area-1-billing-cancellation-1',
      generationReadiness: 'source_backed',
    })
    expect(result.coveragePlan?.coverageAreas[0].summary).toHaveLength(
      AI_COVERAGE_PLAN_TEXT_MAX_LENGTH,
    )
    expect(result.coveragePlan?.coverageAreas[0]).not.toHaveProperty('ignored')
  })

  it('downgrades coverage areas with missing or non-matching evidence to Needs review', () => {
    const result = parseAiCoveragePlanResponse(
      createCoveragePlan({
        coverageAreas: [
          {
            name: 'Missing evidence area',
            summary: 'Provider gave no evidence.',
            behaviors: ['Cancellation behavior exists.'],
            risks: [],
            evidence: [],
            ambiguities: [],
            generationReadiness: 'source_backed',
          },
          {
            name: 'Non-matching evidence area',
            summary: 'Provider evidence does not match packed source.',
            behaviors: ['Provider failure behavior exists.'],
            risks: [],
            evidence: ['This exact text is not in the source.'],
            ambiguities: [],
            generationReadiness: 'source_backed',
          },
        ],
      }),
      {
        qaSourceId: 'source-1',
        sourceContent: 'Billing owner can cancel an active subscription.',
        sourceTruncated: false,
      },
    )

    expect(result.coveragePlan?.coverageAreas).toEqual([
      expect.objectContaining({
        generationReadiness: 'needs_review',
        evidence: [],
        ambiguities: [],
      }),
      expect.objectContaining({
        generationReadiness: 'needs_review',
        evidence: [],
        ambiguities: [],
      }),
    ])
    expect(result.validationWarnings).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/evidence is missing/i),
        expect.stringMatching(/evidence excerpts were ignored/i),
      ]),
    )
  })

  it('handles invalid readiness enums and truncated sources safely', () => {
    const result = parseAiCoveragePlanResponse(
      createCoveragePlan({
        sourceScope: {
          qaSourceId: 'wrong-provider-id',
          visibleSourceOnly: false,
          sourceTruncated: false,
          coverageCompleteness: 'unknown',
        },
        coverageAreas: [
          {
            name: 'Billing cancellation',
            summary: 'Coverage for cancellation confirmation.',
            behaviors: ['Billing owner can cancel an active subscription.'],
            risks: [],
            evidence: ['Billing owner can cancel an active subscription.'],
            ambiguities: [],
            generationReadiness: 'definitely_ready',
          },
        ],
        warnings: [],
      }),
      {
        qaSourceId: 'source-1',
        sourceContent: 'Billing owner can cancel an active subscription.',
        sourceTruncated: true,
      },
    )

    expect(result.coveragePlan?.sourceScope).toEqual({
      qaSourceId: 'source-1',
      visibleSourceOnly: true,
      sourceTruncated: true,
      coverageCompleteness: 'partial_due_to_truncation',
      sectionContext: null,
    })
    expect(result.coveragePlan?.coverageAreas[0]).toMatchObject({
      generationReadiness: 'needs_review',
    })
    expect(result.coveragePlan?.warnings).toContain(
      'Selected source was truncated; coverage map only reflects visible packed content.',
    )
  })

  it('normalizes validated source section references from a fresh section index', () => {
    const qaSource = createQaSource({
      id: 'source-1',
      title: 'Billing sections',
      content: [
        '# Cancellation',
        'Billing owner can cancel an active subscription.',
        '',
        '# Provider failures',
        'Billing provider timeout must keep renewal state unchanged.',
      ].join('\n'),
    })
    const packedSource = packQaSourceForAiSuggestions(qaSource, {
      maxCharacterCount: AI_COVERAGE_PLAN_SOURCE_CONTEXT_MAX_CHARACTERS,
    })
    const sectionIndex = createQaSourceSectionIndex(qaSource)
    const sourceSectionCatalog = createAiCoveragePlanSectionCatalog(
      sectionIndex,
      packedSource,
    )
    const cancellationSection = sourceSectionCatalog.sections[0]
    const canonicalCancellationSection = sectionIndex.sections[0]
    const unknownRef = {
      sectionId: 'unknown-section',
      stableKey: cancellationSection.stableKey,
    }

    const result = parseAiCoveragePlanResponse(
      createCoveragePlan({
        sourceScope: {
          qaSourceId: 'source-1',
          visibleSourceOnly: true,
          sourceTruncated: false,
          coverageCompleteness: 'visible_source_only',
          sectionContext: {
            available: true,
            sectionSchemaVersion: sectionIndex.schemaVersion,
            sectionerVersion: sectionIndex.sectionerVersion,
            sectionSetFingerprint: sectionIndex.sectionSetFingerprint,
            totalSectionCount: sectionIndex.sections.length,
            visibleSectionCount: sourceSectionCatalog.sections.length,
            omittedSectionCount: 0,
          },
        },
        coverageAreas: [
          {
            name: 'Billing cancellation',
            summary: 'Coverage for subscription cancellation.',
            behaviors: ['Billing owner can cancel an active subscription.'],
            risks: ['Cancellation may not stop renewal.'],
            evidence: ['Billing owner can cancel an active subscription.'],
            ambiguities: [],
            generationReadiness: 'source_backed',
            sourceSectionRefs: [
              {
                sectionId: cancellationSection.sectionId,
                stableKey: cancellationSection.stableKey,
              },
              unknownRef,
              {
                sectionId: cancellationSection.sectionId,
                stableKey: cancellationSection.stableKey,
              },
            ],
          },
        ],
        ambiguities: [
          {
            question: 'Is cancellation copy final?',
            whyItMatters: 'Exact copy should not be asserted yet.',
            severity: 'Medium',
            sourceSectionRefs: [
              {
                sectionId: cancellationSection.sectionId,
                stableKey: cancellationSection.stableKey,
              },
            ],
          },
        ],
        nextGenerationAreas: [
          {
            title: 'Cancellation follow-up',
            rationale: 'Subscription cancellation affects renewal.',
            priority: 'High',
            relatedAreaNames: ['Billing cancellation'],
            suggestedTestCount: 2,
            sourceSectionRefs: [
              {
                sectionId: cancellationSection.sectionId,
                stableKey: cancellationSection.stableKey,
              },
            ],
          },
        ],
      }),
      {
        qaSourceId: 'source-1',
        sourceContent: packedSource.content,
        sourceTruncated: false,
        sourceSectionIndex: sectionIndex,
        sourceSectionCatalog,
      },
    )

    expect(result.ok).toBe(true)
    expect(result.coveragePlan?.sourceScope.sectionContext).toMatchObject({
      sectionSetFingerprint: sectionIndex.sectionSetFingerprint,
      visibleSectionCount: 2,
    })
    expect(result.coveragePlan?.coverageAreas[0].sourceSectionRefs).toEqual([
      expect.objectContaining({
        sectionId: canonicalCancellationSection.id,
        stableKey: canonicalCancellationSection.stableKey,
        title: 'Cancellation',
      }),
    ])
    expect(result.coveragePlan?.ambiguities[0].sourceSectionRefs).toHaveLength(1)
    expect(result.coveragePlan?.nextGenerationAreas[0].sourceSectionRefs).toHaveLength(1)
    expect(result.coveragePlan?.coverageAreas[0].ambiguities).toEqual([])
    expect(result.validationWarnings).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/section references were ignored/i),
      ]),
    )
  })

  it('does not invent refs or change readiness when provider refs are absent', () => {
    const qaSource = createQaSource({
      id: 'source-1',
      content: '# Cancellation\nBilling owner can cancel an active subscription.',
    })
    const packedSource = packQaSourceForAiSuggestions(qaSource, {
      maxCharacterCount: AI_COVERAGE_PLAN_SOURCE_CONTEXT_MAX_CHARACTERS,
    })
    const sectionIndex = createQaSourceSectionIndex(qaSource)
    const catalog = createAiCoveragePlanSectionCatalog(sectionIndex, packedSource)
    const result = parseAiCoveragePlanResponse(createCoveragePlan(), {
      qaSourceId: qaSource.id,
      sourceContent: packedSource.content,
      sourceTruncated: false,
      sourceSectionIndex: sectionIndex,
      sourceSectionCatalog: catalog,
    })

    expect(result.coveragePlan?.coverageAreas[0]).toMatchObject({
      generationReadiness: 'source_backed',
      sourceSectionRefs: [],
    })
  })

  it('keeps a valid explicit ref even when evidence is in another visible section', () => {
    const qaSource = createQaSource({
      id: 'source-1',
      content: [
        '# Cancellation',
        'Billing owner can cancel an active subscription.',
        '# Provider failure',
        'Provider timeout keeps renewal unchanged.',
      ].join('\n'),
    })
    const packedSource = packQaSourceForAiSuggestions(qaSource)
    const sectionIndex = createQaSourceSectionIndex(qaSource)
    const catalog = createAiCoveragePlanSectionCatalog(sectionIndex, packedSource)
    const providerFailure = catalog.sections[1]
    const canonicalProviderFailure = sectionIndex.sections[1]
    const result = parseAiCoveragePlanResponse(
      createCoveragePlan({
        coverageAreas: [
          {
            name: 'Billing cancellation',
            summary: 'Coverage for cancellation and provider recovery.',
            behaviors: ['Billing owner can cancel an active subscription.'],
            risks: [],
            evidence: ['Billing owner can cancel an active subscription.'],
            ambiguities: [],
            generationReadiness: 'source_backed',
            sourceSectionRefs: [
              {
                sectionId: providerFailure.sectionId,
                stableKey: providerFailure.stableKey,
              },
            ],
          },
        ],
      }),
      {
        qaSourceId: qaSource.id,
        sourceContent: packedSource.content,
        sourceTruncated: false,
        sourceSectionIndex: sectionIndex,
        sourceSectionCatalog: catalog,
      },
    )

    expect(result.coveragePlan?.coverageAreas[0]).toMatchObject({
      generationReadiness: 'source_backed',
      sourceSectionRefs: [
        expect.objectContaining({ sectionId: canonicalProviderFailure.id }),
      ],
    })
  })

  it('requires exact provider ref keys and rejects mismatched known pairs', () => {
    const qaSource = createQaSource({
      id: 'source-1',
      content: [
        '# Cancellation',
        'Billing owner can cancel an active subscription.',
        '# Provider failure',
        'Provider timeout keeps renewal unchanged.',
      ].join('\n'),
    })
    const packedSource = packQaSourceForAiSuggestions(qaSource)
    const sectionIndex = createQaSourceSectionIndex(qaSource)
    const catalog = createAiCoveragePlanSectionCatalog(sectionIndex, packedSource)
    const first = catalog.sections[0]
    const second = catalog.sections[1]
    const result = parseAiCoveragePlanResponse(
      createCoveragePlan({
        coverageAreas: [
          {
            name: 'Billing cancellation',
            summary: 'Coverage for cancellation.',
            behaviors: ['Billing owner can cancel an active subscription.'],
            risks: [],
            evidence: ['Billing owner can cancel an active subscription.'],
            ambiguities: [],
            generationReadiness: 'source_backed',
            sourceSectionRefs: [
              {
                sectionId: first.sectionId,
                stableKey: first.stableKey,
                title: 'Provider supplied title must be rejected',
              },
              {
                sectionId: first.sectionId,
                stableKey: second.stableKey,
              },
            ],
          },
        ],
      }),
      {
        qaSourceId: qaSource.id,
        sourceContent: packedSource.content,
        sourceTruncated: false,
        sourceSectionIndex: sectionIndex,
        sourceSectionCatalog: catalog,
      },
    )

    expect(result.coveragePlan?.coverageAreas[0]).toMatchObject({
      generationReadiness: 'source_backed',
      sourceSectionRefs: [],
      ambiguities: [],
    })
    expect(result.validationWarnings).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/section references were ignored/i),
      ]),
    )
  })

  it('retains only visible matching evidence and keeps technical warnings outside ambiguities', () => {
    const validEvidence = 'Billing owner can cancel an active subscription.'
    const fabricatedEvidence = 'Fabricated provider-only behavior.'
    const result = parseAiCoveragePlanResponse(
      createCoveragePlan({
        coverageAreas: [
          {
            name: 'Mixed evidence area',
            summary: 'Coverage with mixed evidence.',
            behaviors: ['Cancellation behavior.'],
            risks: [],
            evidence: [validEvidence, fabricatedEvidence],
            ambiguities: [],
            generationReadiness: 'source_backed',
            sourceSectionRefs: [],
          },
        ],
      }),
      {
        qaSourceId: 'source-1',
        sourceContent: validEvidence,
        sourceTruncated: false,
      },
    )

    expect(result.coveragePlan?.coverageAreas[0]).toMatchObject({
      evidence: [validEvidence],
      ambiguities: [],
      generationReadiness: 'needs_review',
    })
    expect(result.validationWarnings).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/evidence excerpts were ignored/i),
      ]),
    )
  })

  it.each([
    ['needs_review', 'needs_review'],
    ['blocked_by_ambiguity', 'blocked_by_ambiguity'],
  ] as const)(
    'keeps %s monotonic when all evidence is invalid',
    (providerReadiness, expectedReadiness) => {
      const result = parseAiCoveragePlanResponse(
        createCoveragePlan({
          coverageAreas: [
            {
              name: 'Invalid evidence area',
              summary: 'Coverage with invalid evidence.',
              behaviors: ['Cancellation behavior.'],
              risks: [],
              evidence: ['Fabricated provider-only behavior.'],
              ambiguities: ['Approval criteria are unresolved.'],
              generationReadiness: providerReadiness,
              sourceSectionRefs: [],
            },
          ],
        }),
        {
          qaSourceId: 'source-1',
          sourceContent: 'Billing owner can cancel an active subscription.',
          sourceTruncated: false,
        },
      )

      expect(result.coveragePlan?.coverageAreas[0]).toMatchObject({
        evidence: [],
        ambiguities: ['Approval criteria are unresolved.'],
        generationReadiness: expectedReadiness,
      })
      expect(result.validationWarnings).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/evidence excerpts were ignored/i),
        ]),
      )
    },
  )

  it('preserves partial visible bounds when enriching an explicit ref', () => {
    const qaSource = createQaSource({
      id: 'source-1',
      content: [
        '# Cancellation',
        'Billing owner can cancel an active subscription.',
        'Additional unseen detail '.repeat(20),
      ].join('\n'),
    })
    const packedSource = packQaSourceForAiSuggestions(qaSource, {
      maxCharacterCount: 70,
    })
    const sectionIndex = createQaSourceSectionIndex(qaSource)
    const catalog = createAiCoveragePlanSectionCatalog(sectionIndex, packedSource)
    const visibleSection = catalog.sections[0]
    const canonicalVisibleSection = sectionIndex.sections[0]
    const result = parseAiCoveragePlanResponse(
      createCoveragePlan({
        coverageAreas: [
          {
            name: 'Billing cancellation',
            summary: 'Coverage for cancellation.',
            behaviors: ['Billing owner can cancel an active subscription.'],
            risks: [],
            evidence: ['Billing owner can cancel an active subscription.'],
            ambiguities: [],
            generationReadiness: 'source_backed',
            sourceSectionRefs: [
              {
                sectionId: visibleSection.sectionId,
                stableKey: visibleSection.stableKey,
              },
            ],
          },
        ],
      }),
      {
        qaSourceId: qaSource.id,
        sourceContent: packedSource.content,
        sourceTruncated: true,
        sourceSectionIndex: sectionIndex,
        sourceSectionCatalog: catalog,
      },
    )

    expect(result.coveragePlan?.coverageAreas[0].sourceSectionRefs[0]).toEqual({
      sectionId: canonicalVisibleSection.id,
      stableKey: canonicalVisibleSection.stableKey,
      ordinal: canonicalVisibleSection.ordinal,
      title: visibleSection.title,
      path: visibleSection.path,
      startLine: visibleSection.startLine,
      endLine: visibleSection.endLine,
      visibility: 'partial',
    })
  })

  it('maps provider aliases to canonical runtime refs without persisting aliases', () => {
    const qaSource = createQaSource({
      id: 'source-1',
      content: '# Cancellation\nBilling owner can cancel an active subscription.',
    })
    const packedSource = packQaSourceForAiSuggestions(qaSource)
    const sectionIndex = createQaSourceSectionIndex(qaSource)
    const catalog = createAiCoveragePlanSectionCatalog(sectionIndex, packedSource)
    const providerSection = catalog.sections[0]
    const canonicalSection = sectionIndex.sections[0]
    const result = parseAiCoveragePlanResponse(
      createCoveragePlan({
        coverageAreas: [
          {
            name: 'Billing cancellation',
            summary: 'Coverage for cancellation.',
            behaviors: ['Billing owner can cancel an active subscription.'],
            risks: [],
            evidence: ['Billing owner can cancel an active subscription.'],
            ambiguities: [],
            generationReadiness: 'source_backed',
            sourceSectionRefs: [
              {
                sectionId: providerSection.sectionId,
                stableKey: providerSection.stableKey,
              },
            ],
          },
        ],
      }),
      {
        qaSourceId: qaSource.id,
        sourceContent: packedSource.content,
        sourceTruncated: false,
        sourceSectionIndex: sectionIndex,
        sourceSectionCatalog: catalog,
      },
    )

    expect(providerSection).not.toMatchObject({
      sectionId: canonicalSection.id,
      stableKey: canonicalSection.stableKey,
    })
    expect(result.coveragePlan?.coverageAreas[0].sourceSectionRefs).toEqual([
      expect.objectContaining({
        sectionId: canonicalSection.id,
        stableKey: canonicalSection.stableKey,
        title: 'Cancellation',
      }),
    ])
    expect(result.coveragePlan?.sourceScope.sectionContext).toMatchObject({
      sectionSetFingerprint: sectionIndex.sectionSetFingerprint,
    })
    expect(JSON.stringify(result.coveragePlan)).not.toContain(
      providerSection.sectionId,
    )
    expect(JSON.stringify(result.coveragePlan)).not.toContain(
      providerSection.stableKey,
    )
  })

  it('ignores provider-controlled relatedAreaIds and maps only related area names', () => {
    const result = parseAiCoveragePlanResponse(
      createCoveragePlan({
        nextGenerationAreas: [
          {
            title: 'Provider-controlled relationship',
            rationale: 'Provider IDs must not cross the trust boundary.',
            priority: 'High',
            relatedAreaNames: [],
            relatedAreaIds: ['coverage-area-1-billing-cancellation'],
            suggestedTestCount: 1,
            sourceSectionRefs: [],
          },
        ],
      }),
      {
        qaSourceId: 'source-1',
        sourceContent: 'Billing owner can cancel an active subscription.',
        sourceTruncated: false,
      },
    )

    expect(result.coveragePlan?.nextGenerationAreas[0].relatedAreaIds).toEqual(
      [],
    )
  })

  it('rejects legacy v1 payloads for new provider analysis', () => {
    const result = parseAiCoveragePlanResponse(
      createCoveragePlan({ schemaVersion: 'ai-coverage-plan-json-v1' }),
      {
        qaSourceId: 'source-1',
        sourceContent: 'Billing owner can cancel an active subscription.',
        sourceTruncated: false,
      },
    )

    expect(result).toMatchObject({
      ok: false,
      coveragePlan: null,
    })
  })
})
