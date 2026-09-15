import { utf8Length } from './documentFingerprint'
import { createRequirementMetadataContext } from './requirementMetadata'

export const UNIT_ANALYSIS_ENDPOINT = '/api/ai/document-unit'
export const UNIT_ANALYSIS_VERSION = 'requirements-unit-v1'
export const UNIT_REQUEST_BYTES = 64 * 1024
export const UNIT_RESPONSE_BYTES = 128 * 1024
export const FINDING_KINDS = ['requirement', 'business_rule', 'constraint', 'example', 'context', 'ambiguity', 'visual_review'] as const
export type FindingKind = typeof FINDING_KINDS[number]
export type UnitRequest = { version: 1; text: string; heading: string[] }
/** Transient wire data: never saved wholesale or accepted as canonical identity. */
export type UnitFinding = { kind: FindingKind; summary: string; quote: string; occurrence: number; coverage: string }
export type UnitAnalysis = { version: 1; findings: UnitFinding[]; limitations: string[] }
export type UnitErrorCode = 'bad_request' | 'configuration' | 'rate_limited' | 'timeout' | 'temporary' | 'invalid_response'
export type UnitFailure = { ok: false; error: { code: UnitErrorCode; message: string; retryable: boolean } }
export type UnitResponse = { ok: true; analysis: UnitAnalysis } | UnitFailure
export type UnitProvider = (request: UnitRequest) => Promise<UnitResponse>

const ERROR_MESSAGES: Record<UnitErrorCode, string> = {
  bad_request: 'This analysis request is not valid or exceeds the bounded input limit.',
  configuration: 'AI is unavailable. Check the server provider configuration before resuming.',
  rate_limited: 'The provider is rate limited. This task can be retried after a delay.',
  timeout: 'This analysis task timed out. Saved progress was preserved.',
  temporary: 'This analysis task could not connect. Saved progress was preserved.',
  invalid_response: 'The analysis could not be validated against its source evidence. Review or explicitly retry this task.',
}
export function unitFailure(code: UnitErrorCode): UnitFailure {
  return { ok: false, error: { code, message: ERROR_MESSAGES[code], retryable: ['rate_limited', 'timeout', 'temporary'].includes(code) } }
}
export function isObject(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value) }
function exact(value: Record<string, unknown>, keys: string[]) { return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)) }
function text(value: unknown, max: number, empty = false): value is string { return typeof value === 'string' && value.length <= max && (empty || value.trim().length > 0) && !/[\uD800-\uDFFF]/u.test(value) }

export function parseUnitRequest(value: unknown): UnitRequest | null {
  if (!isObject(value) || !exact(value, ['version', 'text', 'heading']) || value.version !== 1 || !text(value.text, 6000) || utf8Length(value.text) > 18000 ||
    !Array.isArray(value.heading) || value.heading.length > 12 || !value.heading.every((item) => text(item, 300))) return null
  return { version: 1, text: value.text, heading: [...value.heading] }
}

/** Exact occurrence lookup only; no fuzzy/semantic evidence attachment. */
export function locateQuote(content: string, quote: string, occurrence: number): number {
  let start = -1
  for (let index = 0; index <= occurrence; index += 1) {
    start = content.indexOf(quote, start + 1)
    if (start < 0) return -1
  }
  return start
}
export function parseUnitAnalysis(value: unknown, content: string): UnitAnalysis | null {
  if (!isObject(value) || !exact(value, ['version', 'findings', 'limitations']) || value.version !== 1 || !Array.isArray(value.findings) || value.findings.length > 48 ||
    !Array.isArray(value.limitations) || value.limitations.length > 8 || !value.limitations.every((item) => text(item, 300))) return null
  const findings: UnitFinding[] = []
  const metadata = createRequirementMetadataContext(content)
  for (const item of value.findings) {
    if (!isObject(item) || !exact(item, ['kind', 'summary', 'quote', 'occurrence', 'coverage']) || !FINDING_KINDS.includes(item.kind as FindingKind) ||
      !text(item.summary, 600) || !text(item.quote, 800) || !text(item.coverage, 120, true) || !Number.isSafeInteger(item.occurrence) ||
      Number(item.occurrence) < 0 || Number(item.occurrence) > 6000 || locateQuote(content, item.quote, Number(item.occurrence)) < 0) return null
    const start = locateQuote(content, item.quote, Number(item.occurrence))
    const metadataOnly = metadata.inMetadataSpan(start, start + item.quote.length)
    findings.push({ kind: metadataOnly ? 'context' : item.kind as FindingKind, summary: item.summary.trim(), quote: item.quote,
      occurrence: Number(item.occurrence), coverage: metadataOnly ? '' : item.coverage.trim() })
  }
  return { version: 1, findings, limitations: [...value.limitations] }
}
export function parseUnitResponse(value: unknown, content: string): UnitResponse {
  if (!isObject(value)) return unitFailure('invalid_response')
  if (value.ok === true && exact(value, ['ok', 'analysis'])) {
    const analysis = parseUnitAnalysis(value.analysis, content)
    if (analysis) return { ok: true, analysis }
  }
  if (value.ok === false && isObject(value.error) && typeof value.error.code === 'string' && Object.hasOwn(ERROR_MESSAGES, value.error.code)) return unitFailure(value.error.code as UnitErrorCode)
  return unitFailure('invalid_response')
}
export async function readBoundedJson(response: Response, limit: number): Promise<unknown> {
  const declared = Number(response.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > limit) { await response.body?.cancel(); throw new Error('Response exceeds safe bounds.') }
  const reader = response.body?.getReader()
  if (!reader) throw new Error('Missing response body.')
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let size = 0
  let result = ''
  try {
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done) break
      size += chunk.value.byteLength
      if (size > limit) throw new Error('Response exceeds safe bounds.')
      result += decoder.decode(chunk.value, { stream: true })
    }
    return JSON.parse(result + decoder.decode()) as unknown
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock() }
}
export async function handleUnitAnalysisRequest(request: { method?: string; body?: unknown }, provider: UnitProvider) {
  if (request.method !== 'POST') return { status: 405, body: unitFailure('bad_request') }
  let input: unknown
  try {
    const serialized = typeof request.body === 'string' ? request.body : JSON.stringify(request.body)
    if (!serialized || utf8Length(serialized) > UNIT_REQUEST_BYTES) return { status: 413, body: unitFailure('bad_request') }
    input = JSON.parse(serialized)
  } catch { return { status: 400, body: unitFailure('bad_request') } }
  const parsed = parseUnitRequest(input)
  if (!parsed) return { status: 400, body: unitFailure('bad_request') }
  let body: UnitResponse
  try { body = parseUnitResponse(await provider(parsed), parsed.text) }
  catch { body = unitFailure('temporary') }
  return { status: body.ok ? 200 : body.error.code === 'rate_limited' ? 429 : body.error.code === 'invalid_response' ? 502 : 503, body }
}
