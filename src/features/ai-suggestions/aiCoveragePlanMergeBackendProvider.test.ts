import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AI_COVERAGE_PLAN_MERGE_BACKEND_ENDPOINT,
  AI_COVERAGE_PLAN_MERGE_BACKEND_MAX_RESPONSE_UTF8_BYTES,
  AI_COVERAGE_PLAN_MERGE_BACKEND_REQUEST_VERSION,
  AI_COVERAGE_PLAN_MERGE_DECISION_SCHEMA_VERSION,
  type AiCoveragePlanMergeBackendRequest,
} from './aiCoveragePlanMergeBackendContract'
import { backendAiCoveragePlanMergeProvider } from './aiCoveragePlanMergeBackendProvider'

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

function createSuccess() {
  return {
    ok: true,
    classification: {
      schemaVersion: AI_COVERAGE_PLAN_MERGE_DECISION_SCHEMA_VERSION,
      decisions: [
        {
          pairAlias: alias('p', 1),
          relation: 'likely_overlap',
          reasonCode: 'same_intent',
        },
      ],
    },
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('backend AI coverage-plan merge provider', () => {
  it('uses the relative endpoint, Content-Type only, and forwards AbortSignal', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(createSuccess()), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const abortController = new AbortController()
    const request = createRequest()

    await expect(
      backendAiCoveragePlanMergeProvider.classifyCoveragePlanMergePairs(
        request,
        { signal: abortController.signal },
      ),
    ).resolves.toEqual(createSuccess().classification)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      AI_COVERAGE_PLAN_MERGE_BACKEND_ENDPOINT,
      expect.objectContaining({
        method: 'POST',
        credentials: 'omit',
        redirect: 'error',
        headers: { 'Content-Type': 'application/json' },
        signal: abortController.signal,
      }),
    )
    const options = fetchMock.mock.calls[0][1] as RequestInit
    expect(options.headers).not.toHaveProperty('Authorization')
    expect(JSON.parse(String(options.body))).toEqual(request)
    expect(String(options.body)).not.toContain('responseSchema')
    expect(String(options.body)).not.toContain('apiKey')
  })

  it('rejects malformed success and error envelopes without retaining raw data', async () => {
    const unsafeBodies = [
      { ok: true, classification: { rawResponse: 'SECRET_PROVIDER_BODY' } },
      {
        ok: false,
        error: { code: 'unknown', message: 'unsafe', retryable: true },
      },
      { ...createSuccess(), prompt: 'unsafe' },
    ]

    for (const body of unsafeBodies) {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      vi.stubGlobal('fetch', fetchMock)

      await expect(
        backendAiCoveragePlanMergeProvider.classifyCoveragePlanMergePairs(
          createRequest(),
        ),
      ).rejects.toThrow(/unsafe response/i)
      expect(fetchMock).toHaveBeenCalledTimes(1)
    }
  })

  it('rejects malformed JSON and response bodies over 32 KiB', async () => {
    const responseBodies = [
      '{not-json',
      JSON.stringify({
        ok: false,
        error: {
          code: 'internal_error',
          message: 'x'.repeat(AI_COVERAGE_PLAN_MERGE_BACKEND_MAX_RESPONSE_UTF8_BYTES),
          retryable: true,
        },
      }),
    ]

    for (const body of responseBodies) {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(body, {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      vi.stubGlobal('fetch', fetchMock)
      await expect(
        backendAiCoveragePlanMergeProvider.classifyCoveragePlanMergePairs(
          createRequest(),
        ),
      ).rejects.toThrow()
      expect(fetchMock).toHaveBeenCalledTimes(1)
    }
  })

  it('maps a safe server error and never retries automatically', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: false,
          error: {
            code: 'rate_limited',
            message: 'AI provider is rate limited. Try again later.',
            retryable: true,
          },
        }),
        { status: 429, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      backendAiCoveragePlanMergeProvider.classifyCoveragePlanMergePairs(
        createRequest(),
      ),
    ).rejects.toThrow('AI provider is rate limited. Try again later.')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('forwards AbortError and performs no retry', async () => {
    const abortError = new DOMException('Aborted', 'AbortError')
    const fetchMock = vi.fn().mockRejectedValue(abortError)
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      backendAiCoveragePlanMergeProvider.classifyCoveragePlanMergePairs(
        createRequest(),
      ),
    ).rejects.toBe(abortError)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
