import { describe, expect, it, vi } from 'vitest'
import { createQaSource } from '../../test/qaSourceFactory'
import { packQaSourceForAiSuggestions } from './aiSuggestionContext'
import {
  AI_BACKEND_RAW_BODY_OVERHEAD_CHARACTERS,
  AI_BACKEND_RESPONSE_SCHEMA_VERSION,
  AI_BACKEND_REQUEST_VERSION,
  AI_BACKEND_SOURCE_MAX_CHARACTERS,
  createAiSuggestionBackendRequest,
  handleAiSuggestionBackendRequest,
} from './aiSuggestionBackendContract'

function createValidBackendRequest() {
  return createAiSuggestionBackendRequest(
    packQaSourceForAiSuggestions(
      createQaSource({
        id: 'source-1',
        title: 'Checkout LLD',
        sourceType: 'LLD',
        status: 'Ready for test design',
        content:
          'Checkout must handle approved, declined, and timeout responses.',
      }),
    ),
  )
}

function submitRequest(body: unknown, method = 'POST') {
  return handleAiSuggestionBackendRequest({
    method,
    headers: {
      'content-type': 'application/json',
    },
    body,
  })
}

describe('AI suggestion backend contract', () => {
  it('rejects non-POST requests with a safe error', async () => {
    const response = await submitRequest(createValidBackendRequest(), 'GET')

    expect(response).toEqual({
      status: 405,
      body: {
        ok: false,
        error: {
          code: 'bad_request',
          message: 'AI suggestion generation only accepts POST requests.',
          retryable: false,
        },
      },
    })
  })

  it('rejects requests without JSON content type', async () => {
    const response = await handleAiSuggestionBackendRequest({
      method: 'POST',
      headers: {
        'content-type': 'text/plain',
      },
      body: createValidBackendRequest(),
    })

    expect(response.body).toMatchObject({
      ok: false,
      error: {
        code: 'bad_request',
      },
    })
  })

  it('rejects loose content types that only contain the JSON media type as text', async () => {
    const response = await handleAiSuggestionBackendRequest({
      method: 'POST',
      headers: {
        'content-type': 'text/plain; note=application/json',
      },
      body: createValidBackendRequest(),
    })

    expect(response.body).toMatchObject({
      ok: false,
      error: {
        code: 'bad_request',
      },
    })
  })

  it('rejects invalid JSON bodies', async () => {
    const response = await submitRequest('{not json')

    expect(response).toMatchObject({
      status: 400,
      body: {
        ok: false,
        error: {
          code: 'bad_request',
        },
      },
    })
  })

  it('rejects oversized raw JSON bodies before parsing', async () => {
    const oversizedRawBody = `{${' '.repeat(
      AI_BACKEND_SOURCE_MAX_CHARACTERS +
        AI_BACKEND_RAW_BODY_OVERHEAD_CHARACTERS +
        1,
    )}`
    const response = await submitRequest(oversizedRawBody)

    expect(response).toMatchObject({
      status: 413,
      body: {
        ok: false,
        error: {
          code: 'too_large',
        },
      },
    })
  })

  it('rejects oversized content-length before parsing', async () => {
    const response = await handleAiSuggestionBackendRequest({
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': String(
          AI_BACKEND_SOURCE_MAX_CHARACTERS +
            AI_BACKEND_RAW_BODY_OVERHEAD_CHARACTERS +
            1,
        ),
      },
      body: JSON.stringify(createValidBackendRequest()),
    })

    expect(response).toMatchObject({
      status: 413,
      body: {
        ok: false,
        error: {
          code: 'too_large',
        },
      },
    })
  })

  it('parses a normal raw JSON request body', async () => {
    const response = await submitRequest(JSON.stringify(createValidBackendRequest()))

    expect(response).toMatchObject({
      status: 503,
      body: {
        ok: false,
        error: {
          code: 'provider_unavailable',
        },
      },
    })
  })

  it('rejects missing fields and unsupported app data', async () => {
    expect(
      (await submitRequest({
        ...createValidBackendRequest(),
        sourceTitle: '',
      })).body,
    ).toMatchObject({
      ok: false,
      error: {
        code: 'bad_request',
      },
    })

    expect(
      (await submitRequest({
        ...createValidBackendRequest(),
        testCases: [],
      })).body,
    ).toMatchObject({
      ok: false,
      error: {
        code: 'bad_request',
        message: 'AI suggestion request includes unsupported fields.',
      },
    })
  })

  it('rejects oversized source content', async () => {
    const oversizedContent = 'A'.repeat(AI_BACKEND_SOURCE_MAX_CHARACTERS + 1)
    const response = await submitRequest({
      ...createValidBackendRequest(),
      content: oversizedContent,
      originalCharacterCount: oversizedContent.length,
      packedCharacterCount: oversizedContent.length,
      maxCharacterCount: oversizedContent.length,
    })

    expect(response).toMatchObject({
      status: 413,
      body: {
        ok: false,
        error: {
          code: 'too_large',
        },
      },
    })
  })

  it('accepts content below the server cap when the client advertised max is higher', async () => {
    const provider = {
      generateSuggestions: vi.fn().mockResolvedValue({
        ok: true,
        suggestions: [],
        warnings: [],
      }),
    }
    const response = await handleAiSuggestionBackendRequest(
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: createValidBackendRequest(),
      },
      {
        provider,
        sourceMaxCharacters: 100,
      },
    )

    expect(response).toEqual({
      status: 200,
      body: {
        ok: true,
        suggestions: [],
        warnings: [],
      },
    })
    expect(provider.generateSuggestions).toHaveBeenCalledTimes(1)
  })

  it('rejects content above the server cap even when client metadata allows it', async () => {
    const oversizedForServer = 'A'.repeat(101)
    const response = await handleAiSuggestionBackendRequest(
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: {
          ...createValidBackendRequest(),
          content: oversizedForServer,
          originalCharacterCount: oversizedForServer.length,
          packedCharacterCount: oversizedForServer.length,
          maxCharacterCount: AI_BACKEND_SOURCE_MAX_CHARACTERS,
        },
      },
      {
        sourceMaxCharacters: 100,
      },
    )

    expect(response).toMatchObject({
      status: 413,
      body: {
        ok: false,
        error: {
          code: 'too_large',
        },
      },
    })
  })

  it('accepts safe truncated metadata under the server cap', async () => {
    const provider = {
      generateSuggestions: vi.fn().mockResolvedValue({
        ok: true,
        suggestions: [],
        warnings: [],
      }),
    }
    const truncatedContent = 'A'.repeat(50)
    const response = await handleAiSuggestionBackendRequest(
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: {
          ...createValidBackendRequest(),
          content: truncatedContent,
          originalCharacterCount: 500,
          packedCharacterCount: truncatedContent.length,
          maxCharacterCount: AI_BACKEND_SOURCE_MAX_CHARACTERS,
          truncated: true,
        },
      },
      {
        provider,
        sourceMaxCharacters: 100,
      },
    )

    expect(response.status).toBe(200)
    expect(provider.generateSuggestions).toHaveBeenCalledTimes(1)
  })

  it('rejects unsupported request and response schema versions', async () => {
    expect(
      (await submitRequest({
        ...createValidBackendRequest(),
        requestVersion: 'v0',
      })).body,
    ).toMatchObject({
      ok: false,
      error: {
        code: 'bad_request',
        message: 'AI suggestion request version is not supported.',
      },
    })

    expect(
      (await submitRequest({
        ...createValidBackendRequest(),
        responseSchemaVersion: 'old-schema',
      })).body,
    ).toMatchObject({
      ok: false,
      error: {
        code: 'bad_request',
        message: 'AI suggestion response schema version is not supported.',
      },
    })
  })

  it('returns provider_unavailable when no provider is configured', async () => {
    const response = await submitRequest({
      ...createValidBackendRequest(),
      requestVersion: AI_BACKEND_REQUEST_VERSION,
      responseSchemaVersion: AI_BACKEND_RESPONSE_SCHEMA_VERSION,
    })

    expect(response).toEqual({
      status: 503,
      body: {
        ok: false,
        error: {
          code: 'provider_unavailable',
          message:
            'AI generation requires a configured server-side provider and is not enabled yet.',
          retryable: true,
        },
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
})
