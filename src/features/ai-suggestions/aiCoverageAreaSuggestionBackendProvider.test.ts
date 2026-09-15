import { afterEach, describe, expect, it, vi } from 'vitest'
import { createQaSource } from '../../test/qaSourceFactory'
import { packQaSourceForAiSuggestions } from './aiSuggestionContext'
import { buildAiCoverageAreaSuggestionRequest } from './aiCoverageAreaSuggestionPrompt'
import { backendAiCoverageAreaSuggestionProvider } from './aiCoverageAreaSuggestionBackendProvider'
import {
  AI_COVERAGE_AREA_SUGGESTION_BACKEND_ENDPOINT,
  type AiCoverageAreaSuggestionBackendResponse,
} from './aiCoverageAreaSuggestionBackendContract'
import { AI_COVERAGE_AREA_SUGGESTION_SCHEMA_VERSION } from './aiCoverageAreaSuggestionTypes'

function createFetchResponse(
  status: number,
  body: unknown,
  ok = status >= 200 && status < 300,
) {
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response
}

function createRequest() {
  const source = createQaSource({
    id: 'source-1',
    title: 'Billing Coverage LLD',
    sourceType: 'LLD',
    status: 'Ready for test design',
    content:
      'Billing owner can cancel an active subscription. Cancellation disables renewal.',
  })

  return buildAiCoverageAreaSuggestionRequest(
    packQaSourceForAiSuggestions(source, { maxCharacterCount: 24_000 }),
    {
      id: 'coverage-area-1-billing-cancellation',
      name: 'Billing cancellation',
      summary: 'Coverage for cancellation and renewal behavior.',
      behaviors: ['Billing owner can cancel an active subscription.'],
      risks: ['Renewal may remain enabled after cancellation.'],
      evidence: ['Billing owner can cancel an active subscription.'],
      ambiguities: [],
      generationReadiness: 'source_backed',
    },
  )
}

function mockBackendResponse(
  status: number,
  body: AiCoverageAreaSuggestionBackendResponse,
) {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(createFetchResponse(status, body))

  vi.stubGlobal('fetch', fetchMock)

  return fetchMock
}

function createAreaResult() {
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
    testCaseSuggestions: [],
    coverageAssessment: {
      coverageLevel: 'Low',
      coveredBehaviors: [],
      missingBehaviors: ['Cancellation disables renewal.'],
      blockedAmbiguousItems: [],
      suggestedFollowUpCoverage: [],
      stopReason:
        'Generated 0 suggestions. Stopped because the visible source is too thin.',
    },
    warnings: [],
  }
}

describe('backendAiCoverageAreaSuggestionProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('calls only the relative backend endpoint with selected source and selected area', async () => {
    const fetchMock = mockBackendResponse(200, {
      ok: true,
      areaSuggestionResult: createAreaResult(),
      warnings: ['Backend area warning.'],
    })

    const request = createRequest()

    expect(request).not.toHaveProperty('prompt')
    expect(request).not.toHaveProperty('responseSchema')

    const response =
      await backendAiCoverageAreaSuggestionProvider.generateCoverageAreaSuggestions(
        request,
      )
    const [, requestInit] = fetchMock.mock.calls[0]
    const requestBody = JSON.parse(String((requestInit as RequestInit).body))

    expect(fetchMock).toHaveBeenCalledWith(
      AI_COVERAGE_AREA_SUGGESTION_BACKEND_ENDPOINT,
      expect.objectContaining({
        method: 'POST',
        credentials: 'omit',
        redirect: 'error',
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    expect(requestBody).toMatchObject({
      requestVersion: 'v1',
      qaSourceId: 'source-1',
      sourceTitle: 'Billing Coverage LLD',
      selectedArea: {
        id: 'coverage-area-1-billing-cancellation',
        name: 'Billing cancellation',
      },
    })
    expect(requestBody).not.toHaveProperty('prompt')
    expect(requestBody).not.toHaveProperty('responseSchema')
    expect(requestBody).not.toHaveProperty('coveragePlan')
    expect(requestBody).not.toHaveProperty('testCases')
    expect(requestBody).not.toHaveProperty('bugs')
    expect(response.warnings).toContain('Backend area warning.')
  })

  it('maps backend errors to safe messages and rejects malformed responses', async () => {
    mockBackendResponse(503, {
      ok: false,
      error: {
        code: 'provider_unavailable',
        message:
          'AI coverage area suggestion generation requires a configured server-side provider and is not enabled yet.',
        retryable: true,
      },
    })

    await expect(
      backendAiCoverageAreaSuggestionProvider.generateCoverageAreaSuggestions(
        createRequest(),
      ),
    ).rejects.toThrow(
      'AI coverage area suggestion generation requires a configured server-side provider and is not enabled yet.',
    )

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        createFetchResponse(200, {
          ok: true,
          warnings: [],
        }),
      ),
    )

    await expect(
      backendAiCoverageAreaSuggestionProvider.generateCoverageAreaSuggestions(
        createRequest(),
      ),
    ).rejects.toThrow(
      'AI coverage area suggestion backend returned an unsafe response.',
    )
  })

  it('reports non-JSON backend responses with safe HTTP status context', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: vi.fn().mockRejectedValue(new SyntaxError('Unexpected end of JSON input')),
      } as unknown as Response),
    )

    await expect(
      backendAiCoverageAreaSuggestionProvider.generateCoverageAreaSuggestions(
        createRequest(),
      ),
    ).rejects.toThrow(
      'AI coverage area suggestion backend did not return JSON (HTTP 404). Start the local serverless backend for /api/ai routes; plain Vite does not serve them.',
    )
  })

  it('maps rate-limited backend responses to clear safe retry guidance', async () => {
    mockBackendResponse(429, {
      ok: false,
      error: {
        code: 'rate_limited',
        message: 'AI provider is rate limited. Try again later.',
        retryable: true,
      },
    })

    await expect(
      backendAiCoverageAreaSuggestionProvider.generateCoverageAreaSuggestions(
        createRequest(),
      ),
    ).rejects.toThrow(
      'AI provider rate limit reached (HTTP 429). Please wait and try again.',
    )
  })
})
