import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AI_COVERAGE_PLAN_MERGE_BACKEND_MAX_REQUEST_UTF8_BYTES,
  AI_COVERAGE_PLAN_MERGE_BACKEND_REQUEST_VERSION,
  AI_COVERAGE_PLAN_MERGE_DECISION_SCHEMA_VERSION,
  type AiCoveragePlanMergeBackendRequest,
} from '../../src/features/ai-suggestions/aiCoveragePlanMergeBackendContract'
import handler from './coverage-plan-merge'

function alias(prefix: string, index: number) {
  return `${prefix}${String(index).padStart(31, '0')}`
}

function createRequest(): AiCoveragePlanMergeBackendRequest {
  return {
    requestVersion: AI_COVERAGE_PLAN_MERGE_BACKEND_REQUEST_VERSION,
    findings: [
      {
        alias: alias('f', 1),
        sectionAlias: alias('s', 1),
        kind: 'behavior',
        text: 'Customer can recover a locked account.',
        context: 'Authentication recovery',
      },
      {
        alias: alias('f', 2),
        sectionAlias: alias('s', 2),
        kind: 'behavior',
        text: 'Locked customers can request recovery.',
        context: 'Account support flow',
      },
    ],
    candidatePairs: [
      {
        pairAlias: alias('p', 1),
        leftAlias: alias('f', 1),
        rightAlias: alias('f', 2),
      },
    ],
  }
}

function createClassification(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: AI_COVERAGE_PLAN_MERGE_DECISION_SCHEMA_VERSION,
    decisions: [
      {
        pairAlias: alias('p', 1),
        relation: 'likely_overlap',
        reasonCode: 'same_intent',
      },
    ],
    ...overrides,
  }
}

function createGroqBody(content: unknown) {
  return {
    choices: [{ message: { content: JSON.stringify(content) } }],
  }
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
    response: { status },
    getStatusCode: () => statusCode,
    getJsonBody: () => jsonBody,
  }
}

describe('AI coverage-plan merge Vercel route', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('is POST-only, requires JSON, and invokes no provider for invalid input', async () => {
    const invalidRequests = [
      {
        method: 'GET',
        headers: { 'content-type': 'application/json' },
        body: createRequest(),
      },
      {
        method: 'POST',
        headers: { 'content-type': 'text/plain' },
        body: createRequest(),
      },
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: { ...createRequest(), sourceContent: 'SECRET_SOURCE' },
      },
    ]
    const fetchMock = vi.fn()
    vi.stubEnv('GROQ_API_KEY', 'server-key')
    vi.stubGlobal('fetch', fetchMock)

    for (const request of invalidRequests) {
      const response = createResponse()
      await handler(request, response.response)
      expect(response.getStatusCode()).toBeGreaterThanOrEqual(400)
      expect(JSON.stringify(response.getJsonBody())).not.toContain('SECRET_SOURCE')
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects oversized requests before a provider call', async () => {
    const fetchMock = vi.fn()
    const response = createResponse()
    vi.stubEnv('GROQ_API_KEY', 'server-key')
    vi.stubGlobal('fetch', fetchMock)

    await handler(
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': String(
            AI_COVERAGE_PLAN_MERGE_BACKEND_MAX_REQUEST_UTF8_BYTES + 1,
          ),
        },
        body: createRequest(),
      },
      response.response,
    )

    expect(response.getStatusCode()).toBe(413)
    expect(response.getJsonBody()).toMatchObject({
      ok: false,
      error: { code: 'too_large' },
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns provider_unavailable without a key and makes no live call', async () => {
    const fetchMock = vi.fn()
    const response = createResponse()
    vi.stubEnv('GROQ_API_KEY', '')
    vi.stubGlobal('fetch', fetchMock)

    await handler(
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: createRequest(),
      },
      response.response,
    )

    expect(response.getStatusCode()).toBe(503)
    expect(response.getJsonBody()).toMatchObject({
      ok: false,
      error: { code: 'provider_unavailable' },
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('maps one accepted request to exactly one Groq classifier request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(createGroqBody(createClassification())), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    const response = createResponse()
    vi.stubEnv('GROQ_API_KEY', 'server-key')
    vi.stubGlobal('fetch', fetchMock)

    await handler(
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: createRequest(),
      },
      response.response,
    )

    expect(response.getStatusCode()).toBe(200)
    expect(response.getJsonBody()).toEqual({
      ok: true,
      classification: createClassification(),
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('rejects missing, duplicate, and forbidden decisions without leaking output', async () => {
    const unsafeClassifications = [
      createClassification({ decisions: [] }),
      createClassification({
        decisions: [
          createClassification().decisions[0],
          createClassification().decisions[0],
        ],
      }),
      createClassification({ rawProviderResponse: 'SECRET_PROVIDER_BODY' }),
    ]

    for (const classification of unsafeClassifications) {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(createGroqBody(classification)), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      const response = createResponse()
      vi.stubEnv('GROQ_API_KEY', 'server-key')
      vi.stubGlobal('fetch', fetchMock)

      await handler(
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: createRequest(),
        },
        response.response,
      )

      expect(response.getStatusCode()).toBe(502)
      expect(response.getJsonBody()).toMatchObject({
        ok: false,
        error: { code: 'invalid_provider_response' },
      })
      expect(JSON.stringify(response.getJsonBody())).not.toContain(
        'SECRET_PROVIDER_BODY',
      )
      expect(fetchMock).toHaveBeenCalledTimes(1)
    }
  })

  it('maps rate-limit and provider failures to safe envelopes without retry', async () => {
    const cases = [
      { status: 429, expectedStatus: 429, code: 'rate_limited' },
      { status: 500, expectedStatus: 500, code: 'internal_error' },
    ]

    for (const testCase of cases) {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response('SECRET_PROVIDER_FAILURE_BODY', {
          status: testCase.status,
        }),
      )
      const response = createResponse()
      vi.stubEnv('GROQ_API_KEY', 'server-key')
      vi.stubGlobal('fetch', fetchMock)

      await handler(
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: createRequest(),
        },
        response.response,
      )

      expect(response.getStatusCode()).toBe(testCase.expectedStatus)
      expect(response.getJsonBody()).toMatchObject({
        ok: false,
        error: { code: testCase.code },
      })
      expect(JSON.stringify(response.getJsonBody())).not.toContain(
        'SECRET_PROVIDER_FAILURE_BODY',
      )
      expect(fetchMock).toHaveBeenCalledTimes(1)
    }
  })
})
