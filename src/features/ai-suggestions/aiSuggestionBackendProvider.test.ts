import { afterEach, describe, expect, it, vi } from 'vitest'
import { createQaSource } from '../../test/qaSourceFactory'
import { packQaSourceForAiSuggestions } from './aiSuggestionContext'
import { buildAiSuggestionRequest } from './aiSuggestionPrompt'
import { parseAiSuggestionResponse } from './aiSuggestionValidation'
import { backendAiSuggestionProvider } from './aiSuggestionBackendProvider'
import {
  AI_BACKEND_ENDPOINT,
  type AiSuggestionBackendResponse,
} from './aiSuggestionBackendContract'

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
    title: 'Checkout LLD',
    sourceType: 'LLD',
    status: 'Ready for test design',
    content: 'Checkout must handle approved and declined card responses.',
  })

  return buildAiSuggestionRequest(packQaSourceForAiSuggestions(source))
}

function mockBackendResponse(status: number, body: AiSuggestionBackendResponse) {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(createFetchResponse(status, body))

  vi.stubGlobal('fetch', fetchMock)

  return fetchMock
}

describe('backendAiSuggestionProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('calls only the relative backend endpoint with selected source context', async () => {
    const fetchMock = mockBackendResponse(200, {
      ok: true,
      suggestions: [
        {
          id: 'provider-id',
          title: 'Checkout approves valid card',
          area: 'Checkout',
          priority: 'High',
          type: 'Functional',
          structuredSteps: [
            {
              action: 'Submit valid card details.',
              expectedResult: 'Payment is approved.',
            },
          ],
          evidence: ['Checkout must handle approved card responses.'],
        },
      ],
      warnings: ['Backend contract warning.'],
    })

    const response = await backendAiSuggestionProvider.generateTestCaseSuggestions(
      createRequest(),
    )
    const parsedResponse = parseAiSuggestionResponse(response, {
      qaSourceId: 'source-1',
    })
    const [, requestInit] = fetchMock.mock.calls[0]
    const requestBody = JSON.parse(String((requestInit as RequestInit).body))

    expect(fetchMock).toHaveBeenCalledWith(
      AI_BACKEND_ENDPOINT,
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
      requestVersion: 'v1',
      qaSourceId: 'source-1',
      sourceTitle: 'Checkout LLD',
      sourceType: 'LLD',
      sourceStatus: 'Ready for test design',
      content: 'Checkout must handle approved and declined card responses.',
    })
    expect(requestBody).not.toHaveProperty('prompt')
    expect(requestBody).not.toHaveProperty('testCases')
    expect(parsedResponse.ok).toBe(true)
    expect(parsedResponse.warnings).toContain('Backend contract warning.')
    expect(parsedResponse.suggestions[0]).toMatchObject({
      id: 'ai-suggestion-1',
      status: 'ready',
    })
  })

  it.each([
    [400, 'AI suggestion request is missing required source fields.'],
    [429, 'AI generation is rate limited. Try again later.'],
    [500, 'AI backend failed safely.'],
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
      backendAiSuggestionProvider.generateTestCaseSuggestions(createRequest()),
    ).rejects.toThrow(message)
  })

  it('surfaces provider_unavailable without fake generation', async () => {
    mockBackendResponse(503, {
      ok: false,
      error: {
        code: 'provider_unavailable',
        message:
          'AI generation requires a configured server-side provider and is not enabled yet.',
        retryable: true,
      },
    })

    await expect(
      backendAiSuggestionProvider.generateTestCaseSuggestions(createRequest()),
    ).rejects.toThrow(
      'AI generation requires a configured server-side provider and is not enabled yet.',
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
      backendAiSuggestionProvider.generateTestCaseSuggestions(createRequest()),
    ).rejects.toThrow('AI backend returned an unsafe response.')
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
      backendAiSuggestionProvider.generateTestCaseSuggestions(createRequest()),
    ).rejects.toThrow(
      'AI suggestion backend did not return JSON (HTTP 404). Start the local serverless backend for /api/ai routes; plain Vite does not serve them.',
    )
  })
})
