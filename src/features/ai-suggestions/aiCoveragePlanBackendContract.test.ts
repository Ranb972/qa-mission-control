import { describe, expect, it, vi } from 'vitest'
import { createQaSource } from '../../test/qaSourceFactory'
import { packQaSourceForAiSuggestions } from './aiSuggestionContext'
import {
  AI_COVERAGE_PLAN_BACKEND_REQUEST_VERSION,
  AI_COVERAGE_PLAN_BACKEND_SOURCE_MAX_CHARACTERS,
  createAiCoveragePlanBackendRequest,
  handleAiCoveragePlanBackendRequest,
} from './aiCoveragePlanBackendContract'
import { AI_COVERAGE_PLAN_SCHEMA_VERSION } from './aiCoveragePlanTypes'

const EXPECTED_MAX_REQUEST_UTF8_BYTES = 128 * 1024

function createValidBackendRequest() {
  return createAiCoveragePlanBackendRequest(
    packQaSourceForAiSuggestions(
      createQaSource({
        id: 'source-1',
        title: 'Billing Coverage LLD',
        sourceType: 'LLD',
        status: 'Ready for test design',
        content:
          'Billing owner can cancel an active subscription and non-owners cannot change billing.',
      }),
      {
        maxCharacterCount: AI_COVERAGE_PLAN_BACKEND_SOURCE_MAX_CHARACTERS,
      },
    ),
  )
}

function submitRequest(body: unknown, method = 'POST') {
  return handleAiCoveragePlanBackendRequest({
    method,
    headers: {
      'content-type': 'application/json',
    },
    body,
  })
}

describe('AI coverage plan backend contract', () => {
  it('rejects non-POST requests with a safe error', async () => {
    const response = await submitRequest(createValidBackendRequest(), 'GET')

    expect(response).toEqual({
      status: 405,
      body: {
        ok: false,
        error: {
          code: 'bad_request',
          message: 'AI coverage planning only accepts POST requests.',
          retryable: false,
        },
      },
    })
  })

  it('rejects missing JSON content type and invalid JSON bodies', async () => {
    expect(
      (
        await handleAiCoveragePlanBackendRequest({
          method: 'POST',
          headers: {
            'content-type': 'text/plain; note=application/json',
          },
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
  })

  it('rejects oversized raw JSON bodies before parsing', async () => {
    const oversizedRawBody = `{${' '.repeat(EXPECTED_MAX_REQUEST_UTF8_BYTES + 1)}`
    const response = await submitRequest(oversizedRawBody)

    expect(response).toMatchObject({
      status: 413,
      body: {
        ok: false,
        error: { code: 'too_large' },
      },
    })
  })

  it('rejects oversized content-length before parsing', async () => {
    const response = await handleAiCoveragePlanBackendRequest({
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': String(
          EXPECTED_MAX_REQUEST_UTF8_BYTES + 1,
        ),
      },
      body: JSON.stringify(createValidBackendRequest()),
    })

    expect(response).toMatchObject({
      status: 413,
      body: {
        ok: false,
        error: { code: 'too_large' },
      },
    })
  })

  it('rejects missing required fields, unsupported fields, and unsupported versions', async () => {
    expect(
      (await submitRequest({ ...createValidBackendRequest(), sourceTitle: '' }))
        .body,
    ).toMatchObject({
      ok: false,
      error: { code: 'bad_request' },
    })

    expect(
      (await submitRequest({ ...createValidBackendRequest(), testCases: [] }))
        .body,
    ).toMatchObject({
      ok: false,
      error: {
        code: 'bad_request',
        message: 'AI coverage plan request includes unsupported fields.',
      },
    })

    expect(
      (await submitRequest({ ...createValidBackendRequest(), requestVersion: 'v0' }))
        .body,
    ).toMatchObject({
      ok: false,
      error: {
        code: 'bad_request',
        message: 'AI coverage plan request version is not supported.',
      },
    })

    expect(
      (
        await submitRequest({
          ...createValidBackendRequest(),
          responseSchemaVersion: 'old-schema',
        })
      ).body,
    ).toMatchObject({
      ok: false,
      error: {
        code: 'bad_request',
        message: 'AI coverage plan response schema version is not supported.',
      },
    })
  })

  it('returns provider_unavailable when no provider is configured', async () => {
    const response = await submitRequest({
      ...createValidBackendRequest(),
      requestVersion: AI_COVERAGE_PLAN_BACKEND_REQUEST_VERSION,
      responseSchemaVersion: AI_COVERAGE_PLAN_SCHEMA_VERSION,
    })

    expect(response).toEqual({
      status: 503,
      body: {
        ok: false,
        error: {
          code: 'provider_unavailable',
          message:
            'AI coverage planning requires a configured server-side provider and is not enabled yet.',
          retryable: true,
        },
      },
    })
  })

  it('uses actual content length for server cap decisions', async () => {
    const provider = {
      generateCoveragePlan: vi.fn().mockResolvedValue({
        ok: true,
        coveragePlan: {
          schemaVersion: AI_COVERAGE_PLAN_SCHEMA_VERSION,
          sourceScope: {
            qaSourceId: 'source-1',
            visibleSourceOnly: true,
            sourceTruncated: false,
            coverageCompleteness: 'visible_source_only',
            sectionContext: null,
          },
          coverageAreas: [],
          actors: [],
          states: [],
          inputs: [],
          failureModes: [],
          integrationRisks: [],
          permissionsSecurity: [],
          dataPersistenceRules: [],
          ambiguities: [],
          nextGenerationAreas: [],
          warnings: [],
        },
        warnings: [],
      }),
    }

    const response = await handleAiCoveragePlanBackendRequest(
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: {
          ...createValidBackendRequest(),
          maxCharacterCount: AI_COVERAGE_PLAN_BACKEND_SOURCE_MAX_CHARACTERS,
        },
      },
      {
        provider,
        sourceMaxCharacters: 200,
      },
    )

    expect(response.status).toBe(200)
    expect(provider.generateCoveragePlan).toHaveBeenCalledTimes(1)

    const oversizedForServer = 'A'.repeat(201)
    const oversizedResponse = await handleAiCoveragePlanBackendRequest(
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: {
          ...createValidBackendRequest(),
          content: oversizedForServer,
          originalCharacterCount: oversizedForServer.length,
          packedCharacterCount: oversizedForServer.length,
          maxCharacterCount: AI_COVERAGE_PLAN_BACKEND_SOURCE_MAX_CHARACTERS,
        },
      },
      { sourceMaxCharacters: 200 },
    )

    expect(oversizedResponse).toMatchObject({
      status: 413,
      body: {
        ok: false,
        error: { code: 'too_large' },
      },
    })
  })

  it('does not echo source content or stack traces in errors', async () => {
    const response = await submitRequest({
      ...createValidBackendRequest(),
      content: 'secret token pasted into source text',
      packedCharacterCount: 'wrong-count',
    })
    const serializedResponse = JSON.stringify(response.body)

    expect(serializedResponse).not.toContain('secret token')
    expect(serializedResponse.toLowerCase()).not.toContain('stack')
  })

  it('accepts compact section catalogs and rejects full section content payloads', async () => {
    const compactSectionCatalog = {
      available: true,
      sectionSchemaVersion: 'qa-source-sections-json-v1',
      sectionerVersion: 'qa-source-sectioner-v1',
      sectionSetFingerprint: 'section-set-1',
      totalSectionCount: 1,
      visibleSectionCount: 1,
      omittedSectionCount: 0,
      sections: [
        {
          sectionId: 'source-section-1-payment',
          stableKey: 'payment::abc::1',
          ordinal: 1,
          title: 'Payment authorization',
          path: ['Payment authorization'],
          startLine: 1,
          endLine: 4,
          characterCount: 120,
          visibility: 'full',
          preview: 'Payment authorization handles approved responses.',
        },
      ],
    }
    const provider = {
      generateCoveragePlan: vi.fn().mockResolvedValue({
        ok: true,
        coveragePlan: {
          schemaVersion: AI_COVERAGE_PLAN_SCHEMA_VERSION,
          sourceScope: {
            qaSourceId: 'source-1',
            visibleSourceOnly: true,
            sourceTruncated: false,
            coverageCompleteness: 'visible_source_only',
            sectionContext: null,
          },
          coverageAreas: [],
          actors: [],
          states: [],
          inputs: [],
          failureModes: [],
          integrationRisks: [],
          permissionsSecurity: [],
          dataPersistenceRules: [],
          ambiguities: [],
          nextGenerationAreas: [],
          warnings: [],
        },
        warnings: [],
      }),
    }

    const response = await handleAiCoveragePlanBackendRequest(
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: {
          ...createValidBackendRequest(),
          sourceSections: compactSectionCatalog,
        },
      },
      { provider },
    )

    expect(response.status).toBe(200)
    expect(provider.generateCoveragePlan).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceSections: compactSectionCatalog,
      }),
    )

    const rejectedResponse = await submitRequest({
      ...createValidBackendRequest(),
      sourceSections: {
        ...compactSectionCatalog,
        sections: [
          {
            ...compactSectionCatalog.sections[0],
            content: 'Full section content must not be sent in metadata.',
          },
        ],
      },
    })

    expect(rejectedResponse).toMatchObject({
      status: 400,
      body: {
        ok: false,
        error: { code: 'bad_request' },
      },
    })
  })

  it('accepts a valid multibyte request below the combined UTF-8 byte budget', async () => {
    const content = 'כלל חיוב. '.repeat(3_000)
    const source = createQaSource({
      id: 'source-hebrew',
      title: 'Hebrew billing LLD',
      sourceType: 'LLD',
      status: 'Ready for test design',
      content,
    })
    const body = createAiCoveragePlanBackendRequest(
      packQaSourceForAiSuggestions(source, {
        maxCharacterCount: AI_COVERAGE_PLAN_BACKEND_SOURCE_MAX_CHARACTERS,
      }),
    )
    const serializedBody = JSON.stringify(body)
    const byteLength = new TextEncoder().encode(serializedBody).byteLength
    const provider = {
      generateCoveragePlan: vi.fn().mockResolvedValue({
        ok: true,
        coveragePlan: {},
        warnings: [],
      }),
    }

    expect(byteLength).toBeGreaterThan(32_000)
    expect(byteLength).toBeLessThan(EXPECTED_MAX_REQUEST_UTF8_BYTES)

    const response = await handleAiCoveragePlanBackendRequest(
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': String(byteLength),
        },
        body,
      },
      { provider },
    )

    expect(response.status).toBe(200)
    expect(provider.generateCoveragePlan).toHaveBeenCalledTimes(1)
  })

  it('rejects an oversized parsed request even without content-length', async () => {
    const validRequest = createValidBackendRequest()
    const oversizedStableKey = 'stable-key-'.repeat(14_000)
    const response = await submitRequest({
      ...validRequest,
      sourceSections: {
        available: true,
        sectionSchemaVersion: 'qa-source-sections-json-v1',
        sectionerVersion: 'qa-source-sectioner-v1',
        sectionSetFingerprint: 'section-set-1',
        totalSectionCount: 1,
        visibleSectionCount: 1,
        omittedSectionCount: 0,
        sections: [
          {
            sectionId: 'source-section-1',
            stableKey: oversizedStableKey,
            ordinal: 1,
            title: 'Payment',
            path: ['Payment'],
            startLine: 1,
            endLine: 2,
            characterCount: 20,
            visibility: 'full',
            preview: 'Payment behavior.',
          },
        ],
      },
    })

    expect(response).toMatchObject({
      status: 413,
      body: { ok: false, error: { code: 'too_large' } },
    })
  })

  it('rejects catalogs above the entry and serialized UTF-8 limits', async () => {
    const sections = Array.from({ length: 41 }, (_, index) => ({
      sectionId: `source-section-${index + 1}`,
      stableKey: `section-${index + 1}::stable`,
      ordinal: index + 1,
      title: `Section ${index + 1}`,
      path: [`Section ${index + 1}`],
      startLine: index + 1,
      endLine: index + 1,
      characterCount: 10,
      visibility: 'full',
      preview: '🚀'.repeat(120),
    }))
    const response = await submitRequest({
      ...createValidBackendRequest(),
      sourceSections: {
        available: true,
        sectionSchemaVersion: 'qa-source-sections-json-v1',
        sectionerVersion: 'qa-source-sectioner-v1',
        sectionSetFingerprint: 'section-set-1',
        totalSectionCount: sections.length,
        visibleSectionCount: sections.length,
        omittedSectionCount: 0,
        sections,
      },
    })

    expect(response).toMatchObject({
      status: 413,
      body: { ok: false, error: { code: 'too_large' } },
    })
  })
})
