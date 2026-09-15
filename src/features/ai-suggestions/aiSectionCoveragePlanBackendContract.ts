import {
  QA_SOURCE_SECTION_SCHEMA_VERSION,
  QA_SOURCE_SECTIONER_VERSION,
} from '../qa-sources/qaSourceSections'
import {
  AI_COVERAGE_PLAN_BACKEND_MAX_REQUEST_UTF8_BYTES,
  AI_COVERAGE_PLAN_SECTION_ID_MAX_LENGTH,
  AI_COVERAGE_PLAN_SECTION_PATH_MAX_DEPTH,
  AI_COVERAGE_PLAN_SECTION_PATH_SEGMENT_MAX_LENGTH,
  AI_COVERAGE_PLAN_SECTION_STABLE_KEY_MAX_LENGTH,
  AI_COVERAGE_PLAN_SECTION_TITLE_MAX_LENGTH,
  getAiCoveragePlanUtf8ByteLength,
} from './aiCoveragePlanSectionContext'
import { AI_SECTION_COVERAGE_PLAN_MAX_VISIBLE_CHARACTERS } from './aiSectionCoveragePlanContext'
import type {
  AiSectionCoveragePlanContext,
  AiSectionCoveragePlanProviderResponse,
} from './aiSectionCoveragePlanTypes'
import { parseAiSectionCoveragePlanProviderResponse } from './aiSectionCoveragePlanValidation'
import type { SectionEvidenceSourceContext } from './sourceEvidenceStructure'

export const AI_SECTION_COVERAGE_PLAN_BACKEND_ENDPOINT =
  '/api/ai/section-coverage-plan'
export const AI_SECTION_COVERAGE_PLAN_BACKEND_REQUEST_VERSION = 'v1'
export const AI_SECTION_COVERAGE_PLAN_BACKEND_MAX_REQUEST_UTF8_BYTES =
  AI_COVERAGE_PLAN_BACKEND_MAX_REQUEST_UTF8_BYTES
export const AI_SECTION_COVERAGE_PLAN_BACKEND_SOURCE_MAX_CHARACTERS =
  AI_SECTION_COVERAGE_PLAN_MAX_VISIBLE_CHARACTERS

const BACKEND_ERROR_CODES = [
  'bad_request',
  'too_large',
  'provider_unavailable',
  'rate_limited',
  'timeout',
  'invalid_provider_response',
  'internal_error',
] as const

export type AiSectionCoveragePlanBackendErrorCode =
  (typeof BACKEND_ERROR_CODES)[number]

export type AiSectionCoveragePlanBackendRequest = AiSectionCoveragePlanContext & {
  requestVersion: typeof AI_SECTION_COVERAGE_PLAN_BACKEND_REQUEST_VERSION
}

export type AiSectionCoveragePlanBackendSuccess = {
  ok: true
  analysis: AiSectionCoveragePlanProviderResponse
  warnings: string[]
}

export type AiSectionCoveragePlanBackendError = {
  ok: false
  error: {
    code: AiSectionCoveragePlanBackendErrorCode
    message: string
    retryable: boolean
  }
}

export type AiSectionCoveragePlanBackendResponse =
  | AiSectionCoveragePlanBackendSuccess
  | AiSectionCoveragePlanBackendError

export type AiSectionCoveragePlanBackendHttpResponse = {
  status: number
  body: AiSectionCoveragePlanBackendResponse
}

export type AiSectionCoveragePlanServerProvider = {
  generateSectionCoveragePlan: (
    request: AiSectionCoveragePlanBackendRequest,
  ) => Promise<AiSectionCoveragePlanBackendResponse>
}

type HandlerRequest = {
  method?: string
  headers?: Record<string, string | string[] | undefined>
  body?: unknown
}

type HandlerOptions = {
  provider?: AiSectionCoveragePlanServerProvider
  sourceMaxCharacters?: number
}

type RequestParseResult =
  | { ok: true; request: AiSectionCoveragePlanBackendRequest }
  | { ok: false; response: AiSectionCoveragePlanBackendHttpResponse }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasExactKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
) {
  const keys = Object.keys(value)
  const expected = new Set(expectedKeys)

  return keys.length === expected.size && keys.every((key) => expected.has(key))
}

function isExactBoundedString(value: unknown, maxLength: number): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maxLength &&
    value === value.trim()
  )
}

function isIsoTimestamp(value: unknown): value is string {
  if (!isExactBoundedString(value, 64)) {
    return false
  }

  const date = new Date(value)

  return !Number.isNaN(date.getTime()) && date.toISOString() === value
}

function isSafeNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0
}

function isSafePositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0
}

function getHeader(
  headers: Record<string, string | string[] | undefined> | undefined,
  name: string,
) {
  if (!headers) {
    return ''
  }

  const matchingKey = Object.keys(headers).find(
    (key) => key.toLowerCase() === name.toLowerCase(),
  )
  const value = matchingKey ? headers[matchingKey] : undefined

  return Array.isArray(value) ? value.join(',') : value ?? ''
}

function isJsonContentType(value: string) {
  return value
    .split(',')
    .map((item) => item.split(';')[0].trim().toLowerCase())
    .some(
      (mediaType) =>
        mediaType === 'application/json' || mediaType.endsWith('+json'),
    )
}

function getSerializedUtf8ByteLength(value: unknown) {
  try {
    const serialized = JSON.stringify(value)

    return typeof serialized === 'string'
      ? getAiCoveragePlanUtf8ByteLength(serialized)
      : null
  } catch {
    return null
  }
}

function createErrorResponse(
  status: number,
  code: AiSectionCoveragePlanBackendErrorCode,
  message: string,
  retryable = false,
): AiSectionCoveragePlanBackendHttpResponse {
  return {
    status,
    body: createAiSectionCoveragePlanBackendError(code, message, retryable),
  }
}

export function createAiSectionCoveragePlanBackendError(
  code: AiSectionCoveragePlanBackendErrorCode,
  message: string,
  retryable = false,
): AiSectionCoveragePlanBackendError {
  return { ok: false, error: { code, message, retryable } }
}

function parseBody(body: unknown) {
  if (typeof body !== 'string') {
    return body
  }

  try {
    return JSON.parse(body) as unknown
  } catch {
    return null
  }
}

function parseBackendRequest(
  value: unknown,
  sourceMaxCharacters: number,
): RequestParseResult {
  if (!isRecord(value)) {
    return {
      ok: false,
      response: createErrorResponse(
        400,
        'bad_request',
        'Section coverage analysis request body is not valid JSON.',
      ),
    }
  }

  if (
    !hasExactKeys(value, [
      'requestVersion',
      'sourceIdentity',
      'sectionIdentity',
      'sectionSnapshot',
      'visibleSection',
    ])
  ) {
    return {
      ok: false,
      response: createErrorResponse(
        400,
        'bad_request',
        'Section coverage analysis request includes unsupported fields.',
      ),
    }
  }

  if (value.requestVersion !== AI_SECTION_COVERAGE_PLAN_BACKEND_REQUEST_VERSION) {
    return {
      ok: false,
      response: createErrorResponse(
        400,
        'bad_request',
        'Section coverage analysis request version is not supported.',
      ),
    }
  }

  if (
    !isRecord(value.sourceIdentity) ||
    !hasExactKeys(value.sourceIdentity, [
      'qaSourceId',
      'qaSourceCreatedAt',
      'qaSourceUpdatedAt',
      'sourceFingerprint',
    ]) ||
    !isExactBoundedString(
      value.sourceIdentity.qaSourceId,
      AI_COVERAGE_PLAN_SECTION_ID_MAX_LENGTH,
    ) ||
    !isIsoTimestamp(value.sourceIdentity.qaSourceCreatedAt) ||
    !isIsoTimestamp(value.sourceIdentity.qaSourceUpdatedAt) ||
    !isExactBoundedString(value.sourceIdentity.sourceFingerprint, 160)
  ) {
    return {
      ok: false,
      response: createErrorResponse(
        400,
        'bad_request',
        'Section coverage analysis source identity is not valid.',
      ),
    }
  }

  if (
    !isRecord(value.sectionIdentity) ||
    !hasExactKeys(value.sectionIdentity, [
      'sectionId',
      'stableKey',
      'contentFingerprint',
      'sectionSchemaVersion',
      'sectionerVersion',
    ]) ||
    !isExactBoundedString(
      value.sectionIdentity.sectionId,
      AI_COVERAGE_PLAN_SECTION_ID_MAX_LENGTH,
    ) ||
    !isExactBoundedString(
      value.sectionIdentity.stableKey,
      AI_COVERAGE_PLAN_SECTION_STABLE_KEY_MAX_LENGTH,
    ) ||
    !isExactBoundedString(value.sectionIdentity.contentFingerprint, 160) ||
    value.sectionIdentity.sectionSchemaVersion !==
      QA_SOURCE_SECTION_SCHEMA_VERSION ||
    value.sectionIdentity.sectionerVersion !== QA_SOURCE_SECTIONER_VERSION
  ) {
    return {
      ok: false,
      response: createErrorResponse(
        400,
        'bad_request',
        'Section coverage analysis section identity is not valid.',
      ),
    }
  }

  if (
    !isRecord(value.sectionSnapshot) ||
    !hasExactKeys(value.sectionSnapshot, [
      'ordinal',
      'title',
      'path',
      'startLine',
      'endLine',
      'characterCount',
    ]) ||
    !isSafePositiveInteger(value.sectionSnapshot.ordinal) ||
    !isExactBoundedString(
      value.sectionSnapshot.title,
      AI_COVERAGE_PLAN_SECTION_TITLE_MAX_LENGTH,
    ) ||
    !Array.isArray(value.sectionSnapshot.path) ||
    value.sectionSnapshot.path.length === 0 ||
    value.sectionSnapshot.path.length > AI_COVERAGE_PLAN_SECTION_PATH_MAX_DEPTH ||
    !value.sectionSnapshot.path.every((segment) =>
      isExactBoundedString(
        segment,
        AI_COVERAGE_PLAN_SECTION_PATH_SEGMENT_MAX_LENGTH,
      ),
    ) ||
    !isSafePositiveInteger(value.sectionSnapshot.startLine) ||
    !isSafePositiveInteger(value.sectionSnapshot.endLine) ||
    value.sectionSnapshot.endLine < value.sectionSnapshot.startLine ||
    !isSafeNonNegativeInteger(value.sectionSnapshot.characterCount)
  ) {
    return {
      ok: false,
      response: createErrorResponse(
        400,
        'bad_request',
        'Section coverage analysis section snapshot is not valid.',
      ),
    }
  }

  if (
    !isRecord(value.visibleSection) ||
    !hasExactKeys(value.visibleSection, [
      'content',
      'packedCharacterCount',
      'truncated',
    ]) ||
    typeof value.visibleSection.content !== 'string' ||
    value.visibleSection.content.length === 0 ||
    value.visibleSection.content.length > sourceMaxCharacters ||
    !isSafeNonNegativeInteger(value.visibleSection.packedCharacterCount) ||
    value.visibleSection.packedCharacterCount !==
      value.visibleSection.content.length ||
    value.visibleSection.packedCharacterCount >
      value.sectionSnapshot.characterCount ||
    typeof value.visibleSection.truncated !== 'boolean' ||
    value.visibleSection.truncated !==
      (value.visibleSection.packedCharacterCount <
        value.sectionSnapshot.characterCount)
  ) {
    const tooLarge =
      isRecord(value.visibleSection) &&
      typeof value.visibleSection.content === 'string' &&
      value.visibleSection.content.length > sourceMaxCharacters

    return {
      ok: false,
      response: createErrorResponse(
        tooLarge ? 413 : 400,
        tooLarge ? 'too_large' : 'bad_request',
        tooLarge
          ? 'Selected section content exceeds the server character limit.'
          : 'Section coverage analysis visible-section metadata is not valid.',
      ),
    }
  }

  return {
    ok: true,
    request: {
      requestVersion: AI_SECTION_COVERAGE_PLAN_BACKEND_REQUEST_VERSION,
      sourceIdentity: {
        qaSourceId: value.sourceIdentity.qaSourceId,
        qaSourceCreatedAt: value.sourceIdentity.qaSourceCreatedAt,
        qaSourceUpdatedAt: value.sourceIdentity.qaSourceUpdatedAt,
        sourceFingerprint: value.sourceIdentity.sourceFingerprint,
      },
      sectionIdentity: {
        sectionId: value.sectionIdentity.sectionId,
        stableKey: value.sectionIdentity.stableKey,
        contentFingerprint: value.sectionIdentity.contentFingerprint,
        sectionSchemaVersion: value.sectionIdentity.sectionSchemaVersion,
        sectionerVersion: value.sectionIdentity.sectionerVersion,
      },
      sectionSnapshot: {
        ordinal: value.sectionSnapshot.ordinal,
        title: value.sectionSnapshot.title,
        path: [...value.sectionSnapshot.path] as string[],
        startLine: value.sectionSnapshot.startLine,
        endLine: value.sectionSnapshot.endLine,
        characterCount: value.sectionSnapshot.characterCount,
      },
      visibleSection: {
        content: value.visibleSection.content,
        packedCharacterCount: value.visibleSection.packedCharacterCount,
        truncated: value.visibleSection.truncated,
      },
    },
  }
}

function getStatus(response: AiSectionCoveragePlanBackendResponse) {
  if (response.ok) {
    return 200
  }

  switch (response.error.code) {
    case 'bad_request':
      return 400
    case 'too_large':
      return 413
    case 'rate_limited':
      return 429
    case 'invalid_provider_response':
      return 502
    case 'provider_unavailable':
      return 503
    case 'timeout':
      return 504
    case 'internal_error':
      return 500
  }
}

function isBackendErrorCode(
  value: unknown,
): value is AiSectionCoveragePlanBackendErrorCode {
  return (
    typeof value === 'string' &&
    BACKEND_ERROR_CODES.includes(value as AiSectionCoveragePlanBackendErrorCode)
  )
}

function readWarnings(value: unknown) {
  if (
    !Array.isArray(value) ||
    value.length > 20 ||
    !value.every(
      (warning) =>
        typeof warning === 'string' &&
        warning.length > 0 &&
        warning.length <= 500 &&
        warning === warning.trim(),
    )
  ) {
    return null
  }

  return [...value] as string[]
}

export function createAiSectionCoveragePlanBackendRequest(
  context: AiSectionCoveragePlanContext,
): AiSectionCoveragePlanBackendRequest {
  const candidate = {
    requestVersion: AI_SECTION_COVERAGE_PLAN_BACKEND_REQUEST_VERSION,
    sourceIdentity: { ...context.sourceIdentity },
    sectionIdentity: { ...context.sectionIdentity },
    sectionSnapshot: {
      ...context.sectionSnapshot,
      path: [...context.sectionSnapshot.path],
    },
    visibleSection: { ...context.visibleSection },
  }
  const requestBytes = getSerializedUtf8ByteLength(candidate)

  if (
    requestBytes === null ||
    requestBytes > AI_SECTION_COVERAGE_PLAN_BACKEND_MAX_REQUEST_UTF8_BYTES
  ) {
    throw new RangeError(
      'Section coverage analysis request exceeds its safe UTF-8 byte budget.',
    )
  }

  const parsed = parseBackendRequest(
    candidate,
    AI_SECTION_COVERAGE_PLAN_BACKEND_SOURCE_MAX_CHARACTERS,
  )

  if (!parsed.ok) {
    throw new TypeError('Section coverage analysis request is not safe.')
  }

  return parsed.request
}

export function parseAiSectionCoveragePlanBackendResponse(
  value: unknown,
  sourceContext?: SectionEvidenceSourceContext,
): AiSectionCoveragePlanBackendResponse | null {
  if (!isRecord(value)) {
    return null
  }

  if (
    value.ok === true &&
    hasExactKeys(value, ['ok', 'analysis', 'warnings'])
  ) {
    const providerResult = parseAiSectionCoveragePlanProviderResponse(
      value.analysis,
      sourceContext,
    )
    const warnings = readWarnings(value.warnings)

    if (!providerResult.ok || !warnings) {
      return null
    }

    return {
      ok: true,
      analysis: providerResult.response,
      warnings: Array.from(
        new Set([...warnings, ...providerResult.validationWarnings]),
      ).slice(0, 20),
    }
  }

  if (
    value.ok === false &&
    hasExactKeys(value, ['ok', 'error']) &&
    isRecord(value.error) &&
    hasExactKeys(value.error, ['code', 'message', 'retryable']) &&
    isBackendErrorCode(value.error.code) &&
    typeof value.error.message === 'string' &&
    value.error.message.length > 0 &&
    value.error.message.length <= 500 &&
    typeof value.error.retryable === 'boolean'
  ) {
    return {
      ok: false,
      error: {
        code: value.error.code,
        message: value.error.message,
        retryable: value.error.retryable,
      },
    }
  }

  return null
}

export async function handleAiSectionCoveragePlanBackendRequest(
  request: HandlerRequest,
  options: HandlerOptions = {},
): Promise<AiSectionCoveragePlanBackendHttpResponse> {
  const configuredSourceMaxCharacters =
    options.sourceMaxCharacters ??
    AI_SECTION_COVERAGE_PLAN_BACKEND_SOURCE_MAX_CHARACTERS
  const sourceMaxCharacters =
    Number.isSafeInteger(configuredSourceMaxCharacters) &&
    configuredSourceMaxCharacters > 0
      ? Math.min(
          configuredSourceMaxCharacters,
          AI_SECTION_COVERAGE_PLAN_BACKEND_SOURCE_MAX_CHARACTERS,
        )
      : AI_SECTION_COVERAGE_PLAN_BACKEND_SOURCE_MAX_CHARACTERS

  if (request.method !== 'POST') {
    return createErrorResponse(
      405,
      'bad_request',
      'Section coverage analysis only accepts POST requests.',
    )
  }

  if (!isJsonContentType(getHeader(request.headers, 'content-type'))) {
    return createErrorResponse(
      400,
      'bad_request',
      'Section coverage analysis requires a JSON request body.',
    )
  }

  const contentLengthHeader = getHeader(request.headers, 'content-length')

  if (contentLengthHeader) {
    const contentLength = Number(contentLengthHeader)

    if (!Number.isSafeInteger(contentLength) || contentLength < 0) {
      return createErrorResponse(
        400,
        'bad_request',
        'Section coverage analysis Content-Length is not valid.',
      )
    }

    if (contentLength > AI_SECTION_COVERAGE_PLAN_BACKEND_MAX_REQUEST_UTF8_BYTES) {
      return createErrorResponse(
        413,
        'too_large',
        'Section coverage analysis request exceeds the safe UTF-8 byte limit.',
      )
    }
  }

  if (
    typeof request.body === 'string' &&
    getAiCoveragePlanUtf8ByteLength(request.body) >
      AI_SECTION_COVERAGE_PLAN_BACKEND_MAX_REQUEST_UTF8_BYTES
  ) {
    return createErrorResponse(
      413,
      'too_large',
      'Section coverage analysis request exceeds the safe UTF-8 byte limit.',
    )
  }

  const parsedBody = parseBody(request.body)
  const parsedBytes = getSerializedUtf8ByteLength(parsedBody)

  if (
    parsedBytes === null ||
    parsedBytes > AI_SECTION_COVERAGE_PLAN_BACKEND_MAX_REQUEST_UTF8_BYTES
  ) {
    return createErrorResponse(
      413,
      'too_large',
      'Section coverage analysis request exceeds the safe UTF-8 byte limit.',
    )
  }

  const parsedRequest = parseBackendRequest(parsedBody, sourceMaxCharacters)

  if (!parsedRequest.ok) {
    return parsedRequest.response
  }

  if (!options.provider) {
    return createErrorResponse(
      503,
      'provider_unavailable',
      'Section coverage analysis requires a configured server-side provider.',
      true,
    )
  }

  let providerResponse: unknown

  try {
    providerResponse = await options.provider.generateSectionCoveragePlan(
      parsedRequest.request,
    )
  } catch {
    return createErrorResponse(
      500,
      'internal_error',
      'Section coverage analysis provider request failed safely.',
      true,
    )
  }

  const safeProviderResponse = parseAiSectionCoveragePlanBackendResponse(
    providerResponse,
    { visibleSectionContent: parsedRequest.request.visibleSection.content, visibleSectionTruncated: parsedRequest.request.visibleSection.truncated },
  )

  if (!safeProviderResponse) {
    return createErrorResponse(
      502,
      'invalid_provider_response',
      'AI provider returned section analysis that could not be safely validated.',
      true,
    )
  }

  return {
    status: getStatus(safeProviderResponse),
    body: safeProviderResponse,
  }
}
