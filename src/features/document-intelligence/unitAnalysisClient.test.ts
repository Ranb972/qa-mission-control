import { afterEach, expect, it, vi } from 'vitest'
import { analyzeDocumentUnit } from './unitAnalysisClient'
import { UNIT_ANALYSIS_ENDPOINT } from './unitAnalysisContract'

afterEach(() => vi.unstubAllGlobals())

it('sends only the bounded unit without ambient browser credentials or redirects', async () => {
  const request = { version: 1 as const, heading: ['Session security'], text: 'Sessions expire after 30 minutes.' }
  const fetch = vi.fn().mockResolvedValue(Response.json({ ok: true, analysis: { version: 1, findings: [], limitations: [] } }))
  vi.stubGlobal('fetch', fetch)
  expect((await analyzeDocumentUnit(request, new AbortController().signal)).ok).toBe(true)
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(fetch).toHaveBeenCalledWith(UNIT_ANALYSIS_ENDPOINT, expect.objectContaining({
    method: 'POST', credentials: 'omit', redirect: 'error',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request),
  }))
})
