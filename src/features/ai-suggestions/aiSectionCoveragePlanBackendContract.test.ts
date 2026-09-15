import { describe, expect, it, vi } from 'vitest'
import { createQaSource } from '../../test/qaSourceFactory'
import { createQaSourceSectionIndex } from '../qa-sources/qaSourceSections'
import { resolveAiSectionCoveragePlanContext } from './aiSectionCoveragePlanContext'
import {
  AI_SECTION_COVERAGE_PLAN_BACKEND_MAX_REQUEST_UTF8_BYTES,
  AI_SECTION_COVERAGE_PLAN_BACKEND_REQUEST_VERSION,
  createAiSectionCoveragePlanBackendRequest,
  handleAiSectionCoveragePlanBackendRequest,
  parseAiSectionCoveragePlanBackendResponse,
} from './aiSectionCoveragePlanBackendContract'
import { AI_SECTION_COVERAGE_PLAN_SCHEMA_VERSION } from './aiSectionCoveragePlanTypes'

function createProviderResponse() {
  return {
    schemaVersion: AI_SECTION_COVERAGE_PLAN_SCHEMA_VERSION,
    coverageAreas: [
      {
        name: 'Locked account recovery',
        summary: 'Review support-assisted recovery.',
        behaviors: ['Locked accounts require support review.'],
        evidence: ['Locked accounts require support review.'],
      },
    ],
    actors: ['Support agent'],
    states: ['Locked'],
    inputs: ['Account identifier'],
    failureModes: [],
    integrationRisks: [],
    permissionsSecurity: [],
    dataPersistenceConcerns: [],
    ambiguities: [],
    nextCoverage: [],
    warnings: [],
  }
}

function createContext() {
  const qaSource = createQaSource({
    id: 'source-1',
    content: [
      '# Authentication',
      'authentication-neighbor-only behavior.',
      '',
      '## Locked accounts',
      'Locked accounts require support review.',
      '',
      '# Billing',
      'billing-neighbor-only behavior.',
    ].join('\n'),
    createdAt: '2026-07-18T08:00:00.000Z',
    updatedAt: '2026-07-18T08:00:00.000Z',
  })
  const sectionIndex = createQaSourceSectionIndex(qaSource)
  const section = sectionIndex.sections[1]
  const result = resolveAiSectionCoveragePlanContext({
    qaSource,
    sectionIndex,
    selectedSection: {
      sectionId: section.id,
      stableKey: section.stableKey,
    },
  })

  if (!result.ok) {
    throw new Error(result.error)
  }

  return result.context
}

function createValidRequest() {
  return createAiSectionCoveragePlanBackendRequest(createContext())
}

function submitRequest(
  body: unknown,
  options: Parameters<typeof handleAiSectionCoveragePlanBackendRequest>[1] = {},
  headers: Record<string, string> = { 'content-type': 'application/json' },
) {
  return handleAiSectionCoveragePlanBackendRequest(
    { method: 'POST', headers, body },
    options,
  )
}

describe('AI section coverage plan backend contract', () => {
  it('creates an exact selected-section-only request without browser-controlled provider data', () => {
    const request = createValidRequest()

    expect(request.requestVersion).toBe(
      AI_SECTION_COVERAGE_PLAN_BACKEND_REQUEST_VERSION,
    )
    expect(Object.keys(request)).toEqual([
      'requestVersion',
      'sourceIdentity',
      'sectionIdentity',
      'sectionSnapshot',
      'visibleSection',
    ])
    expect(request.visibleSection.content).toContain(
      'Locked accounts require support review.',
    )
    expect(request.visibleSection.content).not.toContain(
      'authentication-neighbor-only',
    )
    expect(request.visibleSection.content).not.toContain(
      'billing-neighbor-only',
    )
    expect(request).not.toHaveProperty('prompt')
    expect(request).not.toHaveProperty('responseSchema')
    expect(request).not.toHaveProperty('apiKey')
    expect(request).not.toHaveProperty('authorization')
    expect(request).not.toHaveProperty('providerUrl')
  })

  it('rejects non-POST, invalid content type, malformed JSON, and extra fields', async () => {
    const provider = {
      generateSectionCoveragePlan: vi.fn(),
    }
    const nonPost = await handleAiSectionCoveragePlanBackendRequest(
      {
        method: 'GET',
        headers: { 'content-type': 'application/json' },
        body: createValidRequest(),
      },
      { provider },
    )
    const invalidContentType = await submitRequest(
      createValidRequest(),
      { provider },
      { 'content-type': 'text/plain; note=application/json' },
    )
    const malformed = await submitRequest('{not json', { provider })
    const extra = await submitRequest(
      { ...createValidRequest(), prompt: 'browser prompt' },
      { provider },
    )
    const nestedExtra = await submitRequest(
      {
        ...createValidRequest(),
        visibleSection: {
          ...createValidRequest().visibleSection,
          fullSourceContent: 'unsafe',
        },
      },
      { provider },
    )

    for (const response of [
      nonPost,
      invalidContentType,
      malformed,
      extra,
      nestedExtra,
    ]) {
      expect(response.body).toMatchObject({
        ok: false,
        error: { code: 'bad_request' },
      })
    }
    expect(provider.generateSectionCoveragePlan).not.toHaveBeenCalled()
  })

  it('enforces content-length, raw-body, and parsed UTF-8 request limits', async () => {
    const provider = {
      generateSectionCoveragePlan: vi.fn().mockResolvedValue({
        ok: true,
        analysis: createProviderResponse(),
        warnings: [],
      }),
    }
    const oversizedHeader = await submitRequest(
      createValidRequest(),
      { provider },
      {
        'content-type': 'application/json',
        'content-length': String(
          AI_SECTION_COVERAGE_PLAN_BACKEND_MAX_REQUEST_UTF8_BYTES + 1,
        ),
      },
    )
    const oversizedRaw = await submitRequest(
      `{${' '.repeat(
        AI_SECTION_COVERAGE_PLAN_BACKEND_MAX_REQUEST_UTF8_BYTES + 1,
      )}`,
      { provider },
    )
    const request = createValidRequest()
    const multibyte = 'א'.repeat(24_000)
    const oversizedParsed = await submitRequest(
      {
        ...request,
        sectionSnapshot: {
          ...request.sectionSnapshot,
          characterCount: multibyte.length,
        },
        visibleSection: {
          content: multibyte,
          packedCharacterCount: multibyte.length,
          truncated: false,
        },
      },
      { provider },
    )

    expect(oversizedHeader.status).toBe(413)
    expect(oversizedRaw.status).toBe(413)
    expect(oversizedParsed.status).toBe(200)
    expect(provider.generateSectionCoveragePlan).toHaveBeenCalledTimes(1)
  })

  it('rejects padded identities and malformed dates, versions, lines, counts, and truncation', async () => {
    const provider = { generateSectionCoveragePlan: vi.fn() }
    const request = createValidRequest()
    const invalidRequests = [
      {
        ...request,
        sourceIdentity: {
          ...request.sourceIdentity,
          qaSourceId: ` ${request.sourceIdentity.qaSourceId}`,
        },
      },
      {
        ...request,
        sourceIdentity: {
          ...request.sourceIdentity,
          qaSourceUpdatedAt: 'not-a-date',
        },
      },
      {
        ...request,
        sectionIdentity: {
          ...request.sectionIdentity,
          sectionSchemaVersion: 'old-schema',
        },
      },
      {
        ...request,
        sectionSnapshot: { ...request.sectionSnapshot, startLine: 0 },
      },
      {
        ...request,
        visibleSection: {
          ...request.visibleSection,
          packedCharacterCount: request.visibleSection.packedCharacterCount + 1,
        },
      },
      {
        ...request,
        visibleSection: { ...request.visibleSection, truncated: true },
      },
      { ...request, requestVersion: 'v0' },
    ]

    for (const invalidRequest of invalidRequests) {
      expect((await submitRequest(invalidRequest, { provider })).body).toMatchObject({
        ok: false,
        error: { code: 'bad_request' },
      })
    }
    expect(provider.generateSectionCoveragePlan).not.toHaveBeenCalled()
  })

  it('invokes the configured provider exactly once for one valid request', async () => {
    const provider = {
      generateSectionCoveragePlan: vi.fn().mockResolvedValue({
        ok: true,
        analysis: createProviderResponse(),
        warnings: [],
      }),
    }
    const request = createValidRequest()
    const response = await submitRequest(request, { provider })

    expect(response).toEqual({
      status: 200,
      body: {
        ok: true,
        analysis: createProviderResponse(),
        warnings: [],
      },
    })
    expect(provider.generateSectionCoveragePlan).toHaveBeenCalledTimes(1)
    expect(provider.generateSectionCoveragePlan).toHaveBeenCalledWith(request)
  })

  it('returns provider_unavailable without a provider and safely maps provider failures', async () => {
    const unavailable = await submitRequest(createValidRequest())
    const throwing = await submitRequest(createValidRequest(), {
      provider: {
        generateSectionCoveragePlan: vi
          .fn()
          .mockRejectedValue(new Error('secret source content stack')),
      },
    })

    expect(unavailable).toMatchObject({
      status: 503,
      body: { ok: false, error: { code: 'provider_unavailable' } },
    })
    expect(throwing).toMatchObject({
      status: 500,
      body: { ok: false, error: { code: 'internal_error' } },
    })
    expect(JSON.stringify(throwing)).not.toContain('secret source content stack')
  })

  it('rejects an unsafe success payload from the server/provider boundary', async () => {
    const response = await submitRequest(createValidRequest(), {
      provider: {
        generateSectionCoveragePlan: vi.fn().mockResolvedValue({
          ok: true,
          analysis: { ...createProviderResponse(), evidenceSupport: 'source_backed' },
          warnings: [],
        }),
      },
    })

    expect(response).toMatchObject({
      status: 502,
      body: { ok: false, error: { code: 'invalid_provider_response' } },
    })
  })

  it('strictly parses safe success and error envelopes', () => {
    const success = {
      ok: true,
      analysis: createProviderResponse(),
      warnings: [],
    }
    const error = {
      ok: false,
      error: {
        code: 'rate_limited',
        message: 'Try again later.',
        retryable: true,
      },
    }

    expect(parseAiSectionCoveragePlanBackendResponse(success)).toEqual(success)
    expect(parseAiSectionCoveragePlanBackendResponse(error)).toEqual(error)
    expect(
      parseAiSectionCoveragePlanBackendResponse({ ...success, rawResponse: {} }),
    ).toBeNull()
    expect(
      parseAiSectionCoveragePlanBackendResponse({
        ...error,
        error: { ...error.error, stack: 'unsafe' },
      }),
    ).toBeNull()
  })
})


describe('AI section coverage plan hard request ceiling', () => {
  it('does not allow a server option to raise the approved 24,000-character cap', async () => {
    const provider = {
      generateSectionCoveragePlan: vi.fn().mockResolvedValue({
        ok: true,
        analysis: createProviderResponse(),
        warnings: [],
      }),
    }
    const request = createValidRequest()
    const oversizedContent = 'a'.repeat(24_001)
    const response = await submitRequest(
      {
        ...request,
        sectionSnapshot: {
          ...request.sectionSnapshot,
          characterCount: oversizedContent.length,
        },
        visibleSection: {
          content: oversizedContent,
          packedCharacterCount: oversizedContent.length,
          truncated: false,
        },
      },
      { provider, sourceMaxCharacters: 30_000 },
    )

    expect(response).toMatchObject({
      status: 413,
      body: { ok: false, error: { code: 'too_large' } },
    })
    expect(provider.generateSectionCoveragePlan).not.toHaveBeenCalled()
  })
})
