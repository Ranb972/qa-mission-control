import { describe, expect, it, vi } from 'vitest'
import { createQaSource } from '../../test/qaSourceFactory'
import { packQaSourceForAiSuggestions } from './aiSuggestionContext'
import {
  AI_COVERAGE_AREA_SUGGESTION_BACKEND_RAW_BODY_OVERHEAD_CHARACTERS,
  AI_COVERAGE_AREA_SUGGESTION_BACKEND_SOURCE_MAX_CHARACTERS,
  createAiCoverageAreaSuggestionBackendRequest,
  handleAiCoverageAreaSuggestionBackendRequest,
} from './aiCoverageAreaSuggestionBackendContract'
import { AI_COVERAGE_AREA_SUGGESTION_SCHEMA_VERSION } from './aiCoverageAreaSuggestionTypes'

function createSelectedArea(overrides: Record<string, unknown> = {}) {
  return {
    id: 'coverage-area-1-billing-cancellation',
    name: 'Billing cancellation',
    summary: 'Coverage for cancellation and renewal behavior.',
    behaviors: ['Billing owner can cancel an active subscription.'],
    risks: ['Renewal may remain enabled after cancellation.'],
    evidence: ['Billing owner can cancel an active subscription.'],
    ambiguities: [],
    generationReadiness: 'source_backed',
    ...overrides,
  }
}

function createValidBackendRequest(overrides: Record<string, unknown> = {}) {
  return {
    ...createAiCoverageAreaSuggestionBackendRequest(
      packQaSourceForAiSuggestions(
        createQaSource({
          id: 'source-1',
          title: 'Billing Coverage LLD',
          sourceType: 'LLD',
          status: 'Ready for test design',
          content:
            'Billing owner can cancel an active subscription. Cancellation disables renewal.',
        }),
        {
          maxCharacterCount:
            AI_COVERAGE_AREA_SUGGESTION_BACKEND_SOURCE_MAX_CHARACTERS,
        },
      ),
      createSelectedArea(),
    ),
    ...overrides,
  }
}

function submitRequest(body: unknown, method = 'POST') {
  return handleAiCoverageAreaSuggestionBackendRequest({
    method,
    headers: {
      'content-type': 'application/json',
    },
    body,
  })
}

describe('AI coverage area suggestion backend contract', () => {
  it('strips refs and diagnostics from the selected-area wire request', () => {
    const packedSource = packQaSourceForAiSuggestions(
      createQaSource({
        id: 'source-1',
        title: 'Billing Coverage LLD',
        sourceType: 'LLD',
        status: 'Ready for test design',
        content: 'Billing owner can cancel an active subscription.',
      }),
      {
        maxCharacterCount:
          AI_COVERAGE_AREA_SUGGESTION_BACKEND_SOURCE_MAX_CHARACTERS,
      },
    )
    const selectedArea = {
      ...createSelectedArea(),
      sourceSectionRefs: [
        {
          sectionId: 'stale-section-id',
          stableKey: 'stale-section-key',
          ordinal: 1,
          title: 'App-only display title',
          path: ['App-only display path'],
          startLine: 1,
          endLine: 2,
          visibility: 'full',
        },
      ],
      validationWarnings: ['Technical section-ref warning'],
      validationDiagnostics: ['App-only diagnostic'],
      providerParsingError: 'Provider parsing failed',
      displayLabel: 'App-only label',
    } as never

    const request = createAiCoverageAreaSuggestionBackendRequest(
      packedSource,
      selectedArea,
    )

    expect(request.selectedArea).toEqual(createSelectedArea())
    expect(JSON.stringify(request.selectedArea)).not.toMatch(
      /sourceSectionRefs|validationWarnings|validationDiagnostics|providerParsingError|displayLabel|stale-section-id/,
    )
  })

  it('rejects wrong method, bad content type, invalid JSON, and oversized bodies', async () => {
    expect((await submitRequest(createValidBackendRequest(), 'GET')).body).toMatchObject({
      ok: false,
      error: { code: 'bad_request' },
    })

    expect(
      (
        await handleAiCoverageAreaSuggestionBackendRequest({
          method: 'POST',
          headers: { 'content-type': 'text/plain' },
          body: createValidBackendRequest(),
        })
      ).body,
    ).toMatchObject({
      ok: false,
      error: { code: 'bad_request' },
    })

    expect((await submitRequest('{not json')).body).toMatchObject({
      ok: false,
      error: { code: 'bad_request' },
    })

    const oversizedRawBody = `{${' '.repeat(
      AI_COVERAGE_AREA_SUGGESTION_BACKEND_SOURCE_MAX_CHARACTERS +
        AI_COVERAGE_AREA_SUGGESTION_BACKEND_RAW_BODY_OVERHEAD_CHARACTERS +
        1,
    )}`

    expect(await submitRequest(oversizedRawBody)).toMatchObject({
      status: 413,
      body: { ok: false, error: { code: 'too_large' } },
    })
  })

  it('rejects unsupported fields, invalid metadata, invalid area, and non-matching area evidence', async () => {
    expect(
      (await submitRequest({ ...createValidBackendRequest(), prompt: 'nope' }))
        .body,
    ).toMatchObject({
      ok: false,
      error: {
        message:
          'AI coverage area suggestion request includes unsupported fields.',
      },
    })

    expect(
      (
        await submitRequest({
          ...createValidBackendRequest(),
          sourceTitle: '',
        })
      ).body,
    ).toMatchObject({
      ok: false,
      error: { code: 'bad_request' },
    })

    expect(
      (
        await submitRequest({
          ...createValidBackendRequest(),
          selectedArea: createSelectedArea({ extra: 'unsupported' }),
        })
      ).body,
    ).toMatchObject({
      ok: false,
      error: { message: 'Selected coverage area includes unsupported fields.' },
    })

    expect(
      (
        await submitRequest({
          ...createValidBackendRequest(),
          selectedArea: createSelectedArea({
            evidence: ['This evidence is absent.'],
          }),
        })
      ).body,
    ).toMatchObject({
      ok: false,
      error: {
        message:
          'Selected coverage area evidence does not match the visible source.',
      },
    })
  })

  it('returns provider_unavailable without echoing source content', async () => {
    const response = await submitRequest({
      ...createValidBackendRequest(),
      responseSchemaVersion: AI_COVERAGE_AREA_SUGGESTION_SCHEMA_VERSION,
    })

    expect(response).toMatchObject({
      status: 503,
      body: {
        ok: false,
        error: {
          code: 'provider_unavailable',
          message:
            'AI coverage area suggestion generation requires a configured server-side provider and is not enabled yet.',
        },
      },
    })
    expect(JSON.stringify(response.body)).not.toContain('Billing owner')
  })

  it('short-circuits blocked areas with no provider call and no Ready suggestions', async () => {
    const provider = {
      generateCoverageAreaSuggestions: vi.fn(),
    }

    const response = await handleAiCoverageAreaSuggestionBackendRequest(
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: createValidBackendRequest({
          selectedArea: createSelectedArea({
            ambiguities: ['Cancellation role is unresolved.'],
            generationReadiness: 'blocked_by_ambiguity',
          }),
        }),
      },
      { provider },
    )

    expect(response.status).toBe(200)
    expect(provider.generateCoverageAreaSuggestions).not.toHaveBeenCalled()
    expect(response.body).toMatchObject({
      ok: true,
      areaSuggestionResult: {
        testCaseSuggestions: [],
        coverageAssessment: {
          coverageLevel: 'Low',
          blockedAmbiguousItems: ['Cancellation role is unresolved.'],
        },
      },
    })
  })
})
