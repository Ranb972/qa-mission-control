import { afterEach, describe, expect, it, vi } from 'vitest'
import { createQaSource } from '../../src/test/qaSourceFactory'
import { packQaSourceForAiSuggestions } from '../../src/features/ai-suggestions/aiSuggestionContext'
import { createAiCoveragePlanBackendRequest } from '../../src/features/ai-suggestions/aiCoveragePlanBackendContract'
import {
  AI_COVERAGE_PLAN_SOURCE_CONTEXT_MAX_CHARACTERS,
} from '../../src/features/ai-suggestions/aiCoveragePlanPrompt'
import handler from './coverage-plan'

function createValidBackendRequest() {
  return createAiCoveragePlanBackendRequest(
    packQaSourceForAiSuggestions(
      createQaSource({
        id: 'source-1',
        title: 'Billing Coverage LLD',
        sourceType: 'LLD',
        status: 'Ready for test design',
        content: 'Billing owner can cancel an active subscription.',
      }),
      {
        maxCharacterCount: AI_COVERAGE_PLAN_SOURCE_CONTEXT_MAX_CHARACTERS,
      },
    ),
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

describe('AI coverage plan Vercel route', () => {
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
