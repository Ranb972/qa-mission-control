import { afterEach, describe, expect, it, vi } from 'vitest'
import { createQaSource } from '../../src/test/qaSourceFactory'
import { createQaSourceSectionIndex } from '../../src/features/qa-sources/qaSourceSections'
import { resolveAiSectionCoveragePlanContext } from '../../src/features/ai-suggestions/aiSectionCoveragePlanContext'
import { createAiSectionCoveragePlanBackendRequest } from '../../src/features/ai-suggestions/aiSectionCoveragePlanBackendContract'
import { AI_SECTION_COVERAGE_PLAN_SCHEMA_VERSION } from '../../src/features/ai-suggestions/aiSectionCoveragePlanTypes'
import handler from './section-coverage-plan'

function createBackendRequest() {
  const qaSource = createQaSource({
    content: '# Locked accounts\nLocked accounts require support review.',
  })
  const sectionIndex = createQaSourceSectionIndex(qaSource)
  const section = sectionIndex.sections[0]
  const context = resolveAiSectionCoveragePlanContext({
    qaSource,
    sectionIndex,
    selectedSection: {
      sectionId: section.id,
      stableKey: section.stableKey,
    },
  })

  if (!context.ok) {
    throw new Error(context.error)
  }

  return createAiSectionCoveragePlanBackendRequest(context.context)
}

function createProviderAnalysis(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: AI_SECTION_COVERAGE_PLAN_SCHEMA_VERSION,
    coverageAreas: [],
    actors: [],
    states: [],
    inputs: [],
    failureModes: [],
    integrationRisks: [],
    permissionsSecurity: [],
    dataPersistenceConcerns: [],
    ambiguities: [],
    nextCoverage: [],
    warnings: [],
    ...overrides,
  }
}

function createGroqBody(content: unknown) {
  return {
    choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(content) } }],
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

describe('AI section coverage plan Vercel route', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('is POST-only and invokes no provider for invalid input', async () => {
    const fetchMock = vi.fn()
    const response = createResponse()
    vi.stubEnv('GROQ_API_KEY', 'server-key')
    vi.stubGlobal('fetch', fetchMock)

    await handler(
      {
        method: 'GET',
        headers: { 'content-type': 'application/json' },
        body: createBackendRequest(),
      },
      response.response,
    )

    expect(response.getStatusCode()).toBe(405)
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
        body: createBackendRequest(),
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

  it('maps one accepted request to exactly one Groq request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(createGroqBody(createProviderAnalysis())), {
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
        body: createBackendRequest(),
      },
      response.response,
    )

    expect(response.getStatusCode()).toBe(200)
    expect(response.getJsonBody()).toEqual({
      ok: true,
      analysis: createProviderAnalysis(),
      warnings: [],
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('rejects forbidden provider fields without leaking raw output', async () => {
    const unsafeAnalysis = createProviderAnalysis({
      sourceIdentity: { qaSourceId: 'provider-controlled' },
      rawProviderResponse: 'SECRET_PROVIDER_BODY',
    })
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(createGroqBody(unsafeAnalysis)), {
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
        body: createBackendRequest(),
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
  })
})
