import { describe, expect, it, vi } from 'vitest'
import { createGroqDocumentUnitProvider } from './groqDocumentUnit'
const request = { version: 1 as const, text: 'Customers must receive receipts.', heading: ['Payments'] }
const analysis = { version: 1, findings: [{ kind: 'requirement', summary: 'Send receipts', quote: request.text, occurrence: 0, coverage: 'Receipts' }], limitations: [] }
const payload = (value: unknown, finish_reason = 'stop') => Response.json({ choices: [{ finish_reason, message: { content: JSON.stringify(value) } }] })
describe('Groq bounded document analysis', () => {
  it('uses server-only configuration, bounded source only, and one provider request', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(payload(analysis))
    const result = await createGroqDocumentUnitProvider({ apiKey: 'server-test-key', fetchImpl })(request)
    expect(result).toEqual({ ok: true, analysis })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body)
    expect(body.messages[1].content).toContain(request.text)
    expect(JSON.stringify(result)).not.toContain('server-test-key')
    expect(body.messages[0].content).toContain('untrusted')
  })
  it.each([[429, 'rate_limited', true], [503, 'temporary', true], [401, 'configuration', false], [400, 'configuration', false]])('safely maps %s without server retry', async (status, code, retryable) => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('raw provider secret', { status: Number(status) }))
    const result = await createGroqDocumentUnitProvider({ apiKey: 'test', fetchImpl })(request)
    expect(result).toMatchObject({ ok: false, error: { code, retryable } })
    expect(JSON.stringify(result)).not.toContain('raw provider')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
  it('rejects truncated, invented evidence and oversized streamed responses', async () => {
    for (const response of [payload(analysis, 'length'), payload({ ...analysis, findings: [{ ...analysis.findings[0], quote: 'invented' }] }), new Response('x'.repeat(140_000))]) {
      const result = await createGroqDocumentUnitProvider({ apiKey: 'test', fetchImpl: vi.fn().mockResolvedValue(response) })(request)
      expect(result).toMatchObject({ ok: false, error: { code: 'invalid_response', retryable: false } })
    }
  })
  it('does not call an unconfigured provider and bounds timeout', async () => {
    const fetchImpl = vi.fn()
    expect(await createGroqDocumentUnitProvider({ fetchImpl })(request)).toMatchObject({ ok: false, error: { code: 'configuration' } })
    expect(fetchImpl).not.toHaveBeenCalled()
    const hanging: typeof fetch = (_url, options) => new Promise((_resolve, reject) => options?.signal?.addEventListener('abort', () => reject(new Error('raw failure'))))
    expect(await createGroqDocumentUnitProvider({ apiKey: 'test', timeoutMs: 1, fetchImpl: hanging })(request)).toMatchObject({ ok: false, error: { code: 'timeout' } })
  })
})
