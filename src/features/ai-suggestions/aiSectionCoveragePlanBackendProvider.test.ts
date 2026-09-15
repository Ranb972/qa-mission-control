import { afterEach, describe, expect, it, vi } from 'vitest'
import { createQaSource } from '../../test/qaSourceFactory'
import { createQaSourceSectionIndex } from '../qa-sources/qaSourceSections'
import { resolveAiSectionCoveragePlanContext } from './aiSectionCoveragePlanContext'
import { AI_SECTION_COVERAGE_PLAN_BACKEND_ENDPOINT } from './aiSectionCoveragePlanBackendContract'
import { backendAiSectionCoveragePlanProvider } from './aiSectionCoveragePlanBackendProvider'
import { AI_SECTION_COVERAGE_PLAN_SCHEMA_VERSION } from './aiSectionCoveragePlanTypes'

function createContext() {
  const qaSource = createQaSource({
    content: '# Locked accounts\nLocked accounts require support review.',
  })
  const sectionIndex = createQaSourceSectionIndex(qaSource)
  const section = sectionIndex.sections[0]
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

function createAnalysis() {
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
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('backend AI section coverage plan provider', () => {
  it('uses the relative endpoint, Content-Type only, and forwards AbortSignal', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ ok: true, analysis: createAnalysis(), warnings: [] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    const abortController = new AbortController()

    const result = await backendAiSectionCoveragePlanProvider.generateSectionCoveragePlan(
      createContext(),
      { signal: abortController.signal },
    )

    expect(result).toEqual({ analysis: createAnalysis(), warnings: [] })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      AI_SECTION_COVERAGE_PLAN_BACKEND_ENDPOINT,
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
    expect(JSON.parse(String(options.body))).not.toHaveProperty('prompt')
    expect(JSON.parse(String(options.body))).not.toHaveProperty('responseSchema')
  })

  it('rejects malformed success and error envelopes without retaining raw data', async () => {
    const unsafeBodies = [
      { ok: true, analysis: { rawResponse: 'unsafe' }, warnings: [] },
      { ok: false, error: { code: 'unknown', message: 'unsafe', retryable: true } },
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
        backendAiSectionCoveragePlanProvider.generateSectionCoveragePlan(
          createContext(),
        ),
      ).rejects.toThrow(/unsafe response/i)
    }
  })

  it('maps safe server errors and never retries automatically', async () => {
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
      backendAiSectionCoveragePlanProvider.generateSectionCoveragePlan(
        createContext(),
      ),
    ).rejects.toThrow('AI provider is rate limited. Try again later.')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('forwards AbortError and performs no retry', async () => {
    const abortError = new DOMException('Aborted', 'AbortError')
    const fetchMock = vi.fn().mockRejectedValue(abortError)
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      backendAiSectionCoveragePlanProvider.generateSectionCoveragePlan(
        createContext(),
      ),
    ).rejects.toBe(abortError)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
