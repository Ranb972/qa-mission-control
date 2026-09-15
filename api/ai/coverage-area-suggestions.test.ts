import { afterEach, describe, expect, it, vi } from 'vitest'
import { createQaSource } from '../../src/test/qaSourceFactory'
import { packQaSourceForAiSuggestions } from '../../src/features/ai-suggestions/aiSuggestionContext'
import { createAiCoverageAreaSuggestionBackendRequest } from '../../src/features/ai-suggestions/aiCoverageAreaSuggestionBackendContract'
import handler from './coverage-area-suggestions'

function createValidBackendRequest() {
  return createAiCoverageAreaSuggestionBackendRequest(
    packQaSourceForAiSuggestions(
      createQaSource({
        id: 'source-1',
        title: 'Billing Area LLD',
        sourceType: 'LLD',
        status: 'Ready for test design',
        content:
          'Billing owner can cancel an active subscription. Cancellation disables renewal.',
      }),
      { maxCharacterCount: 24_000 },
    ),
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

function createResponse() {
  let statusCode: number | null = null
  let jsonBody: unknown = null
  const json = vi.fn((body: unknown) => {
    jsonBody = body
  })
  const status = vi.fn((nextStatusCode: number) => {
    statusCode = nextStatusCode

    return { json }
  })

  return {
    response: {
      status,
    },
    getStatusCode: () => statusCode,
    getJsonBody: () => jsonBody,
  }
}

describe('AI coverage area suggestion Vercel route', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('returns provider_unavailable without a server Groq key or live provider call', async () => {
    const fetchMock = vi.fn()
    const routeResponse = createResponse()

    vi.stubEnv('GROQ_API_KEY', '')
    vi.stubGlobal('fetch', fetchMock)

    await handler(
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: createValidBackendRequest(),
      },
      routeResponse.response,
    )

    expect(routeResponse.getStatusCode()).toBe(503)
    expect(routeResponse.getJsonBody()).toMatchObject({
      ok: false,
      error: {
        code: 'provider_unavailable',
        message:
          'AI provider is not configured on the server: missing GROQ_API_KEY. Set GROQ_API_KEY server-side before starting npx vercel dev.',
      },
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
