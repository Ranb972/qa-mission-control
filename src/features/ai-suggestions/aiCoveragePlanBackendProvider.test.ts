import { afterEach, describe, expect, it, vi } from 'vitest'
import { createQaSource } from '../../test/qaSourceFactory'
import { packQaSourceForAiSuggestions } from './aiSuggestionContext'
import { buildAiCoveragePlanRequest } from './aiCoveragePlanPrompt'
import { parseAiCoveragePlanResponse } from './aiCoveragePlanValidation'
import { backendAiCoveragePlanProvider } from './aiCoveragePlanBackendProvider'
import {
  AI_COVERAGE_PLAN_BACKEND_ENDPOINT,
  type AiCoveragePlanBackendResponse,
} from './aiCoveragePlanBackendContract'
import { AI_COVERAGE_PLAN_SCHEMA_VERSION } from './aiCoveragePlanTypes'

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
      'Billing owner can cancel an active subscription and non-owners cannot change billing.',
  })

  return buildAiCoveragePlanRequest(packQaSourceForAiSuggestions(source))
}

function mockBackendResponse(status: number, body: AiCoveragePlanBackendResponse) {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(createFetchResponse(status, body))

  vi.stubGlobal('fetch', fetchMock)

  return fetchMock
}

function createBackendCoveragePlan() {
  return {
    schemaVersion: AI_COVERAGE_PLAN_SCHEMA_VERSION,
    sourceScope: {
      qaSourceId: 'source-1',
      visibleSourceOnly: true,
      sourceTruncated: false,
      coverageCompleteness: 'visible_source_only',
      sectionContext: null,
    },
    coverageAreas: [
      {
        name: 'Billing cancellation',
        summary: 'Coverage for cancellation confirmation and access behavior.',
        behaviors: ['Billing owner can cancel an active subscription.'],
        risks: ['Non-owners may change billing.'],
        evidence: ['Billing owner can cancel an active subscription'],
        ambiguities: [],
        generationReadiness: 'source_backed',
        sourceSectionRefs: [],
      },
    ],
    actors: ['Billing owner', 'Non-owner'],
    states: ['Active', 'Canceled'],
    inputs: [],
    failureModes: [],
    integrationRisks: [],
    permissionsSecurity: ['non-owners cannot change billing'],
    dataPersistenceRules: [],
    ambiguities: [],
    nextGenerationAreas: [
      {
        title: 'Cancellation cases',
        rationale: 'Cancellation affects renewal and access.',
        priority: 'High',
        relatedAreaNames: ['Billing cancellation'],
        suggestedTestCount: 4,
        sourceSectionRefs: [],
      },
    ],
    warnings: [],
  }
}

describe('backendAiCoveragePlanProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('calls only the relative coverage backend endpoint with selected source context', async () => {
    const fetchMock = mockBackendResponse(200, {
      ok: true,
      coveragePlan: createBackendCoveragePlan(),
      warnings: ['Backend contract warning.'],
    })

    const response = await backendAiCoveragePlanProvider.generateCoveragePlan(
      createRequest(),
    )
    const parsedResponse = parseAiCoveragePlanResponse(response.coveragePlan, {
      qaSourceId: 'source-1',
      sourceContent:
        'Billing owner can cancel an active subscription and non-owners cannot change billing.',
      sourceTruncated: false,
    })
    const [, requestInit] = fetchMock.mock.calls[0]
    const requestBody = JSON.parse(String((requestInit as RequestInit).body))

    expect(fetchMock).toHaveBeenCalledWith(
      AI_COVERAGE_PLAN_BACKEND_ENDPOINT,
      expect.objectContaining({
        method: 'POST',
        credentials: 'omit',
        redirect: 'error',
        headers: {
          'Content-Type': 'application/json',
        },
      }),
    )
    expect(requestBody).toMatchObject({
      requestVersion: 'v2',
      qaSourceId: 'source-1',
      sourceTitle: 'Billing Coverage LLD',
      sourceType: 'LLD',
      sourceStatus: 'Ready for test design',
      content:
        'Billing owner can cancel an active subscription and non-owners cannot change billing.',
    })
    expect(requestBody).not.toHaveProperty('prompt')
    expect(requestBody.sourceSections).toMatchObject({
      available: false,
      sections: [],
    })
    expect(requestBody).not.toHaveProperty('testCases')
    expect(requestBody).not.toHaveProperty('bugs')
    expect(parsedResponse.ok).toBe(true)
    expect(response.warnings).toContain('Backend contract warning.')
  })

  it.each([
    [400, 'AI coverage plan request is missing required source fields.'],
    [429, 'AI provider is rate limited. Try again later.'],
    [500, 'AI coverage planning failed safely.'],
  ])('maps %i backend errors to safe messages', async (status, message) => {
    mockBackendResponse(status, {
      ok: false,
      error: {
        code: status === 429 ? 'rate_limited' : 'bad_request',
        message,
        retryable: status !== 400,
      },
    })

    await expect(
      backendAiCoveragePlanProvider.generateCoveragePlan(createRequest()),
    ).rejects.toThrow(message)
  })

  it('surfaces provider_unavailable without fake coverage planning', async () => {
    mockBackendResponse(503, {
      ok: false,
      error: {
        code: 'provider_unavailable',
        message:
          'AI coverage planning requires a configured server-side provider and is not enabled yet.',
        retryable: true,
      },
    })

    await expect(
      backendAiCoveragePlanProvider.generateCoveragePlan(createRequest()),
    ).rejects.toThrow(
      'AI coverage planning requires a configured server-side provider and is not enabled yet.',
    )
  })

  it('rejects malformed backend responses safely', async () => {
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
      backendAiCoveragePlanProvider.generateCoveragePlan(createRequest()),
    ).rejects.toThrow('AI coverage planner backend returned an unsafe response.')
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
      backendAiCoveragePlanProvider.generateCoveragePlan(createRequest()),
    ).rejects.toThrow(
      'AI coverage planner backend did not return JSON (HTTP 404). Start the local serverless backend for /api/ai routes; plain Vite does not serve them.',
    )
  })
})
