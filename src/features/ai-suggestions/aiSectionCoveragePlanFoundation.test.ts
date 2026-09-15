import { describe, expect, it } from 'vitest'
import { createQaSource } from '../../test/qaSourceFactory'
import { createQaSourceSectionIndex } from '../qa-sources/qaSourceSections'
import {
  AI_SECTION_COVERAGE_PLAN_MAX_VISIBLE_CHARACTERS,
  resolveAiSectionCoveragePlanContext,
} from './aiSectionCoveragePlanContext'
import { AI_SECTION_COVERAGE_PLAN_SCHEMA_VERSION } from './aiSectionCoveragePlanTypes'
import {
  AI_SECTION_COVERAGE_PLAN_EVIDENCE_MAX_LENGTH,
  parseAiSectionCoveragePlanResponse,
} from './aiSectionCoveragePlanValidation'

function createProviderResponse(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: AI_SECTION_COVERAGE_PLAN_SCHEMA_VERSION,
    coverageAreas: [
      {
        name: 'Locked account recovery',
        summary: 'Review support-assisted recovery for locked accounts.',
        behaviors: ['Locked accounts require support review.'],
        evidence: ['Locked accounts require support review.'],
      },
    ],
    actors: ['Support agent'],
    states: ['Locked'],
    inputs: ['Account identifier'],
    failureModes: ['Support is unavailable'],
    integrationRisks: [],
    permissionsSecurity: ['Only support can unlock an account'],
    dataPersistenceConcerns: ['Unlock actions should be auditable'],
    ambiguities: [
      {
        question: 'What proves account ownership?',
        whyItMatters: 'Recovery tests need a defined verification boundary.',
        severity: 'high',
      },
    ],
    nextCoverage: [
      {
        title: 'Account ownership verification',
        rationale: 'The verification rule is not specified.',
        priority: 'high',
      },
    ],
    warnings: [],
    ...overrides,
  }
}

function resolveSection(
  content: string,
  sectionIndex: number,
  options: { maxVisibleCharacters?: number } = {},
) {
  const qaSource = createQaSource({
    id: 'source-1',
    content,
    createdAt: '2026-07-18T08:00:00.000Z',
    updatedAt: '2026-07-18T08:00:00.000Z',
  })
  const index = createQaSourceSectionIndex(
    qaSource,
    '2026-07-18T08:01:00.000Z',
  )
  const section = index.sections[sectionIndex]

  return {
    qaSource,
    index,
    section,
    result: resolveAiSectionCoveragePlanContext({
      qaSource,
      sectionIndex: index,
      selectedSection: {
        sectionId: section.id,
        stableKey: section.stableKey,
      },
      maxVisibleCharacters: options.maxVisibleCharacters,
    }),
  }
}

describe('section coverage plan canonical context', () => {
  it('resolves exactly one middle section without neighboring content', () => {
    const content = [
      '# Authentication',
      'auth-neighbor-only behavior.',
      '',
      '## Locked accounts',
      'Locked accounts require support review.',
      '',
      '# Billing',
      'billing-neighbor-only behavior.',
    ].join('\n')
    const { qaSource, index, section, result } = resolveSection(content, 1)

    expect(result.ok).toBe(true)
    expect(result.context?.visibleSection.content).toContain(
      'Locked accounts require support review.',
    )
    expect(result.context?.visibleSection.content).not.toContain(
      'auth-neighbor-only',
    )
    expect(result.context?.visibleSection.content).not.toContain(
      'billing-neighbor-only',
    )
    expect(result.context).toMatchObject({
      sourceIdentity: {
        qaSourceId: qaSource.id,
        qaSourceCreatedAt: qaSource.createdAt,
        qaSourceUpdatedAt: qaSource.updatedAt,
        sourceFingerprint: index.sourceFingerprint,
      },
      sectionIdentity: {
        sectionId: section.id,
        stableKey: section.stableKey,
        contentFingerprint: section.contentFingerprint,
        sectionSchemaVersion: index.schemaVersion,
        sectionerVersion: index.sectionerVersion,
      },
      sectionSnapshot: {
        ordinal: section.ordinal,
        title: section.title,
        path: section.path,
        startLine: section.startLine,
        endLine: section.endLine,
        characterCount: section.characterCount,
      },
    })
    expect(result.context?.visibleSection.packedCharacterCount).toBe(
      result.context?.visibleSection.content.length,
    )
    expect(result.context?.visibleSection.truncated).toBe(false)
  })

  it('rejects wrong, mismatched, padded, and excluded section identities', () => {
    const { qaSource, index, section } = resolveSection(
      '# One\nFirst behavior.\n# Two\nSecond behavior.',
      0,
    )
    const secondSection = index.sections[1]

    const resolve = (
      sectionId: string,
      stableKey: string,
      candidateIndex = index,
    ) =>
      resolveAiSectionCoveragePlanContext({
        qaSource,
        sectionIndex: candidateIndex,
        selectedSection: { sectionId, stableKey },
      })

    expect(resolve('unknown', section.stableKey).ok).toBe(false)
    expect(resolve(section.id, secondSection.stableKey).ok).toBe(false)
    expect(resolve(` ${section.id}`, section.stableKey).ok).toBe(false)
    expect(resolve(section.id, `${section.stableKey} `).ok).toBe(false)
    expect(
      resolve(section.id, section.stableKey, {
        ...index,
        sections: index.sections.map((candidate) =>
          candidate.id === section.id
            ? { ...candidate, includedInCoverage: false }
            : candidate,
        ),
      }).ok,
    ).toBe(false)
    expect(
      resolveAiSectionCoveragePlanContext({
        qaSource: { ...qaSource, id: 'different-source' },
        sectionIndex: index,
        selectedSection: {
          sectionId: section.id,
          stableKey: section.stableKey,
        },
      }).ok,
    ).toBe(false)
  })

  it('rejects forged and stale indexes rather than trusting cached metadata', () => {
    const { qaSource, index, section } = resolveSection(
      '# Authentication\nUsers sign in.',
      0,
    )

    const forgedIndex = {
      ...index,
      sections: [
        {
          ...section,
          endOffset: section.endOffset - 1,
          characterCount: section.characterCount - 1,
        },
      ],
    }
    const staleIndex = {
      ...index,
      qaSourceUpdatedAt: '2026-07-18T07:59:00.000Z',
    }

    expect(
      resolveAiSectionCoveragePlanContext({
        qaSource,
        sectionIndex: forgedIndex,
        selectedSection: {
          sectionId: section.id,
          stableKey: section.stableKey,
        },
      }).ok,
    ).toBe(false)
    expect(
      resolveAiSectionCoveragePlanContext({
        qaSource,
        sectionIndex: staleIndex,
        selectedSection: {
          sectionId: section.id,
          stableKey: section.stableKey,
        },
      }).ok,
    ).toBe(false)
  })

  it('preserves nested paths, duplicate headings, Hebrew, and CRLF content', () => {
    const content = [
      '# התחברות',
      'משתמש יכול להתחבר.',
      '## חשבון נעול',
      'חשבון נעול דורש תמיכה.',
      '# התחברות',
      'כניסה נוספת.',
    ].join('\r\n')
    const { index, result } = resolveSection(content, 1)

    expect(index.sections[1].path).toEqual(['התחברות', 'חשבון נעול'])
    expect(index.sections[0].stableKey).not.toBe(index.sections[2].stableKey)
    expect(result.context?.visibleSection.content).toContain(
      'חשבון נעול דורש תמיכה.',
    )
    expect(result.context?.visibleSection.content).toContain('\r\n')
  })

  it('truncates at a valid Unicode boundary and never mutates inputs', () => {
    const content = `# Emoji\n${'a'.repeat(31)}😀tail`
    const qaSource = createQaSource({ content })
    const index = createQaSourceSectionIndex(qaSource)
    const originalSource = structuredClone(qaSource)
    const originalIndex = structuredClone(index)
    const section = index.sections[0]
    const highSurrogateBoundary = content.indexOf('😀') + 1
    const result = resolveAiSectionCoveragePlanContext({
      qaSource,
      sectionIndex: index,
      selectedSection: {
        sectionId: section.id,
        stableKey: section.stableKey,
      },
      maxVisibleCharacters: highSurrogateBoundary,
    })

    expect(result.ok).toBe(true)
    expect(result.context?.visibleSection.truncated).toBe(true)
    expect(result.context?.visibleSection.content.endsWith('\ud83d')).toBe(false)
    expect(result.context?.visibleSection.packedCharacterCount).toBeLessThanOrEqual(
      highSurrogateBoundary,
    )
    expect(qaSource).toEqual(originalSource)
    expect(index).toEqual(originalIndex)
  })

  it('uses the approved default visible-section cap', () => {
    expect(AI_SECTION_COVERAGE_PLAN_MAX_VISIBLE_CHARACTERS).toBe(24_000)
  })
})

describe('section coverage plan response validation', () => {
  const visibleSectionContent =
    'Locked accounts require support review. Only support can unlock an account.'

  it('normalizes a valid semantic response with app-owned IDs and evidenceSupport', () => {
    const result = parseAiSectionCoveragePlanResponse(createProviderResponse(), {
      visibleSectionContent,
    })

    expect(result.ok).toBe(true)
    expect(result.plan?.coverageAreas[0]).toMatchObject({
      id: 'section-coverage-area-1-locked-account-recovery',
      evidence: ['Locked accounts require support review.'],
      evidenceSupport: 'needs_review',
    })
    expect(result.plan?.ambiguities[0].id).toBe('section-ambiguity-1')
    expect(result.plan?.nextCoverage[0].id).toBe('section-next-coverage-1')
    expect(result.plan).not.toHaveProperty('sourceIdentity')
  })

  it('rejects provider-controlled IDs, evidenceSupport, readiness, and provenance', () => {
    const forbiddenResponses = [
      createProviderResponse({ id: 'provider-id' }),
      createProviderResponse({ evidenceSupport: 'source_backed' }),
      createProviderResponse({ readiness: 'approved' }),
      createProviderResponse({ sourceIdentity: { qaSourceId: 'source-1' } }),
      createProviderResponse({ path: ['Authentication'] }),
      createProviderResponse({ startLine: 10, endLine: 12 }),
      createProviderResponse({ providerUsage: { tokens: 99 } }),
    ]

    forbiddenResponses.forEach((response) => {
      expect(
        parseAiSectionCoveragePlanResponse(response, {
          visibleSectionContent,
        }),
      ).toMatchObject({ ok: false, plan: null })
    })
  })

  it('validates evidence independently, removes fabricated and duplicate excerpts, and derives support', () => {
    const result = parseAiSectionCoveragePlanResponse(
      createProviderResponse({
        coverageAreas: [
          {
            name: 'Mixed evidence',
            summary: 'Contains valid and fabricated evidence.',
            behaviors: [],
            evidence: [
              'Locked accounts require support review.',
              'Fabricated behavior.',
              'Locked accounts require support review.',
            ],
          },
          {
            name: 'Unsupported area',
            summary: 'No evidence matches.',
            behaviors: [],
            evidence: ['locked accounts require support review.'],
          },
        ],
      }),
      { visibleSectionContent },
    )

    expect(result.plan?.coverageAreas).toEqual([
      expect.objectContaining({
        evidence: ['Locked accounts require support review.'],
        evidenceSupport: 'needs_review',
      }),
      expect.objectContaining({
        name: 'Unsupported area',
        evidence: [],
        evidenceSupport: 'needs_review',
      }),
    ])
    expect(result.validationWarnings).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/evidence excerpts were ignored/i),
        expect.stringMatching(/no validated evidence/i),
      ]),
    )
  })

  it('requires exact evidence whitespace rather than canonicalizing a padded excerpt', () => {
    const paddedEvidence = '  Locked accounts require support review.  '
    const result = parseAiSectionCoveragePlanResponse(
      createProviderResponse({
        coverageAreas: [
          {
            name: 'Padded evidence',
            summary: 'Evidence must match the transmitted text exactly.',
            behaviors: [],
            evidence: [paddedEvidence],
          },
        ],
      }),
      { visibleSectionContent },
    )

    expect(result.plan?.coverageAreas[0]).toMatchObject({
      evidence: [],
      evidenceSupport: 'needs_review',
    })
    expect(result.validationWarnings).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/evidence excerpts were ignored/i),
      ]),
    )
  })

  it('rejects overlong evidence before matching and preserves Unicode exact matches', () => {
    const overlongEvidence = 'x'.repeat(
      AI_SECTION_COVERAGE_PLAN_EVIDENCE_MAX_LENGTH + 1,
    )
    const unicodeEvidence = 'חשבון נעול דורש תמיכה.'
    const result = parseAiSectionCoveragePlanResponse(
      createProviderResponse({
        coverageAreas: [
          {
            name: 'Unicode evidence',
            summary: 'Unicode matching remains exact.',
            behaviors: [],
            evidence: [overlongEvidence, unicodeEvidence],
          },
        ],
      }),
      {
        visibleSectionContent: `${overlongEvidence} ${unicodeEvidence}`,
      },
    )

    expect(result.plan?.coverageAreas[0]).toMatchObject({
      evidence: [unicodeEvidence],
      evidenceSupport: 'needs_review',
    })
    expect(result.validationWarnings).toEqual(
      expect.arrayContaining([expect.stringMatching(/overlong evidence/i)]),
    )
  })

  it('isolates ordinary malformed siblings but fails forbidden nested controls', () => {
    const isolated = parseAiSectionCoveragePlanResponse(
      createProviderResponse({
        coverageAreas: [
          {
            name: 'Valid area',
            summary: 'Valid area summary.',
            behaviors: [],
            evidence: ['Locked accounts require support review.'],
          },
          {
            name: '',
            summary: 'Malformed sibling.',
            behaviors: [],
            evidence: [],
          },
        ],
      }),
      { visibleSectionContent },
    )
    const forbidden = parseAiSectionCoveragePlanResponse(
      createProviderResponse({
        coverageAreas: [
          {
            name: 'Unsafe area',
            summary: 'Unsafe area summary.',
            behaviors: [],
            evidence: [],
            id: 'provider-area-id',
          },
        ],
      }),
      { visibleSectionContent },
    )

    expect(isolated.ok).toBe(true)
    expect(isolated.plan?.coverageAreas).toHaveLength(1)
    expect(isolated.validationWarnings).toEqual(
      expect.arrayContaining([expect.stringMatching(/malformed coverage area/i)]),
    )
    expect(forbidden).toMatchObject({ ok: false, plan: null })
  })

  it('does not retain the raw provider object or inject review copy into provider-authored fields', () => {
    const response = createProviderResponse({
      coverageAreas: [
        {
          name: 'Unverified recovery behavior',
          summary: 'Provider-authored summary remains unchanged.',
          behaviors: [],
          evidence: [],
        },
      ],
    })
    const result = parseAiSectionCoveragePlanResponse(response, {
      visibleSectionContent,
    })

    expect(result.plan?.coverageAreas[0]).toMatchObject({
      name: 'Unverified recovery behavior',
      summary: 'Provider-authored summary remains unchanged.',
      evidenceSupport: 'needs_review',
    })
    expect(result).not.toHaveProperty('rawResponse')
    expect(result).not.toHaveProperty('providerPayload')
    expect(JSON.stringify(result.plan)).not.toContain('providerUsage')
  })
})
