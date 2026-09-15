import { describe, expect, it, vi } from 'vitest'
import { handleUnitAnalysisRequest, parseUnitAnalysis, parseUnitRequest, unitFailure } from './unitAnalysisContract'

const request = { version: 1, text: 'The customer must receive a receipt. Refunds require clarification.', heading: ['Payments'] }
const analysis = { version: 1, findings: [{ kind: 'requirement', summary: 'Send a receipt', quote: 'The customer must receive a receipt.', occurrence: 0, coverage: 'Payment receipts' }], limitations: [] }

describe('bounded whole-specification leaf contract', () => {
  it('rejects oversized input and forbidden authority instead of clipping', () => {
    expect(parseUnitRequest({ ...request, text: 'a'.repeat(6001) })).toBeNull()
    expect(parseUnitRequest({ ...request, text: 'א'.repeat(6000) })).not.toBeNull()
    expect(parseUnitRequest({ ...request, sourceId: 'provider-authority' })).toBeNull()
    expect(parseUnitAnalysis({ ...analysis, approval: 'approved' }, request.text)).toBeNull()
    expect(parseUnitAnalysis({ ...analysis, findings: [{ ...analysis.findings[0], id: 'foreign' }] }, request.text)).toBeNull()
  })
  it('requires literal evidence and an existing occurrence in the bounded unit', () => {
    expect(parseUnitAnalysis(analysis, request.text)).toEqual(analysis)
    expect(parseUnitAnalysis({ ...analysis, findings: [{ ...analysis.findings[0], quote: 'Invented requirement' }] }, request.text)).toBeNull()
    expect(parseUnitAnalysis({ ...analysis, findings: [{ ...analysis.findings[0], occurrence: 1 }] }, request.text)).toBeNull()
    expect(parseUnitAnalysis({ ...analysis, findings: Array(49).fill(analysis.findings[0]) }, request.text)).toBeNull()
  })
  it('calls the provider once, validates again, and sanitizes unexpected failures', async () => {
    const provider = vi.fn().mockResolvedValue({ ok: true, analysis })
    expect((await handleUnitAnalysisRequest({ method: 'POST', body: request }, provider)).status).toBe(200)
    expect(provider).toHaveBeenCalledTimes(1)
    provider.mockRejectedValue(new Error('secret raw source payload'))
    expect(await handleUnitAnalysisRequest({ method: 'POST', body: request }, provider)).toEqual({ status: 503, body: unitFailure('temporary') })
    expect((await handleUnitAnalysisRequest({ method: 'GET', body: request }, provider)).status).toBe(405)
    expect(provider).toHaveBeenCalledTimes(2)
  })
  it('marks schema/auth errors permanent and transient errors retryable', () => {
    for (const code of ['invalid_response', 'configuration', 'bad_request'] as const) expect(unitFailure(code).error.retryable).toBe(false)
    for (const code of ['rate_limited', 'timeout', 'temporary'] as const) expect(unitFailure(code).error.retryable).toBe(true)
  })
})
