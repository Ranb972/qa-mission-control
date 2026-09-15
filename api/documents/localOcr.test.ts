import { describe, expect, it, vi } from 'vitest'
import { handleOcrRequest, OCR_UNSUPPORTED, validateOcrPng } from './localOcr'
function png(width = 900) { const bytes = Buffer.alloc(33); Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes); bytes.write('IHDR', 12); bytes.writeUInt32BE(width, 16); bytes.writeUInt32BE(900, 20); return bytes.toString('base64') }
const request = { method: 'POST', headers: { host: '127.0.0.1:5197', origin: 'http://127.0.0.1:5197', 'content-type': 'application/json' }, body: { png: png(), language: 'en-US' } }
describe('bounded local page recognition', () => {
  it('accepts one explicit same-origin PNG and only returns normalized text without invented confidence', async () => {
    const runner = vi.fn().mockResolvedValue({ text: 'Sessions expire after 30 minutes.', language: 'en-US', raw: 'native internals', id: 'untrusted' })
    const result = await handleOcrRequest(request, runner)
    expect(runner).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({ status: 200, body: { ok: true, confidence: null, text: 'Sessions expire after 30 minutes.' } })
    expect(JSON.stringify(result)).not.toContain('native internals')
    expect(JSON.stringify(result)).not.toContain('untrusted')
  })
  it('rejects cross-origin, malformed, oversized and command-like input before starting OCR', async () => {
    const runner = vi.fn()
    for (const invalid of [{ ...request, headers: { ...request.headers, origin: 'https://attacker.example' } }, { ...request, headers: { ...request.headers, 'content-type': 'text/plain' } }, { ...request, body: { png: png(2049), language: 'en-US' } }, { ...request, body: { png: png(), language: 'en-US; run-command' } }, { ...request, body: { png: png(), language: 'en-US', path: 'C:/private' } }, { ...request, body: { png: 'x'.repeat(4194305), language: 'en-US' } }]) expect((await handleOcrRequest(invalid, runner)).status).toBeGreaterThanOrEqual(400)
    expect(runner).not.toHaveBeenCalled()
    expect(validateOcrPng(Buffer.from('not an image').toString('base64'))).toBe(false)
  })
  it('bounds errors and output, never retries, and reports unsupported capability honestly', async () => {
    const runner = vi.fn().mockRejectedValue(new Error('PRIVATE SOURCE OR TOKEN'))
    expect(await handleOcrRequest(request, runner)).toEqual({ status: 503, body: { ok: false, error: OCR_UNSUPPORTED } })
    expect(runner).toHaveBeenCalledTimes(1)
    expect((await handleOcrRequest(request, vi.fn().mockResolvedValue({ text: 'x'.repeat(30001), language: 'en-US' }))).status).toBe(503)
    expect(await handleOcrRequest({ method: 'GET' }, vi.fn().mockResolvedValue({ supported: false, languages: [] }))).toMatchObject({ status: 200, body: { supported: false, languages: [] } })
  })
})
