import {
  QA_SOURCE_STATUSES,
  QA_SOURCE_TYPES,
  type QaSourceStatus,
  type QaSourceType,
} from '../qa-sources/qaSourceTypes'
import type { PackedQaSourceContext } from './aiSuggestionTypes'

export const AI_BACKEND_ENDPOINT = '/api/ai/test-case-suggestions'
export const AI_BACKEND_REQUEST_VERSION = 'v1'
export const AI_BACKEND_RESPONSE_SCHEMA_VERSION =
  'ai-test-case-suggestions-json-v1'
export const AI_BACKEND_SOURCE_MAX_CHARACTERS = 12_000
export const AI_BACKEND_RAW_BODY_OVERHEAD_CHARACTERS = 4_000

const AI_BACKEND_ALLOWED_REQUEST_KEYS = [
  'requestVersion',
  'qaSourceId',
  'sourceTitle',
  'sourceType',
  'sourceStatus',
  'sourceUpdatedAt',
  'content',
  'originalCharacterCount',
  'packedCharacterCount',
  'maxCharacterCount',
  'truncated',
  'responseSchemaVersion',
] as const

const AI_BACKEND_ERROR_CODES = [
  'bad_request',
  'too_large',
  'provider_unavailable',
  'rate_limited',
  'timeout',
  'invalid_provider_response',
  'internal_error',
] as const

export type AiSuggestionBackendErrorCode =
  (typeof AI_BACKEND_ERROR_CODES)[number]

export type AiSuggestionBackendRequest = {
  requestVersion: typeof AI_BACKEND_REQUEST_VERSION
  qaSourceId: string
  sourceTitle: string
  sourceType: QaSourceType
  sourceStatus: QaSourceStatus
  sourceUpdatedAt: string
  content: string
  originalCharacterCount: number
  packedCharacterCount: number
  maxCharacterCount: number
  truncated: boolean
  responseSchemaVersion: typeof AI_BACKEND_RESPONSE_SCHEMA_VERSION
}

export type AiSuggestionBackendSuccess = {
  ok: true
  suggestions: unknown[]
  warnings: string[]
}

export type AiSuggestionBackendError = {
  ok: false
  error: {
    code: AiSuggestionBackendErrorCode
    message: string
    retryable: boolean
  }
}

export type AiSuggestionBackendResponse =
  | AiSuggestionBackendSuccess
  | AiSuggestionBackendError

export type AiSuggestionBackendHttpResponse = {
  status: number
  body: AiSuggestionBackendResponse
}

export type AiSuggestionServerProvider = {
  generateSuggestions: (
    request: AiSuggestionBackendRequest,
    options?: { signal?: AbortSignal },
  ) => Promise<AiSuggestionBackendResponse>
}

type AiSuggestionBackendHandlerRequest = {
  method?: string
  headers?: Record<string, string | string[] | undefined>
  body?: unknown
}

type AiSuggestionBackendHandlerOptions = {
  provider?: AiSuggestionServerProvider
  sourceMaxCharacters?: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value)
}

function isAllowedValue<T extends readonly string[]>(
  allowedValues: T,
  value: string,
): value is T[number] {
  return allowedValues.includes(value)
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

function readContentLength(value: string) {
  const parsedValue = Number.parseInt(value, 10)

  return Number.isFinite(parsedValue) && parsedValue >= 0 ? parsedValue : null
}

function getRawBodyMaxCharacters(sourceMaxCharacters: number) {
  return sourceMaxCharacters + AI_BACKEND_RAW_BODY_OVERHEAD_CHARACTERS
}

function createErrorResponse(
  status: number,
  code: AiSuggestionBackendErrorCode,
  message: string,
  retryable = false,
): AiSuggestionBackendHttpResponse {
  return {
    status,
    body: {
      ok: false,
      error: {
        code,
        message,
        retryable,
      },
    },
  }
}

export function createAiSuggestionBackendError(
  code: AiSuggestionBackendErrorCode,
  message: string,
  retryable = false,
): AiSuggestionBackendError {
  return {
    ok: false,
    error: {
      code,
      message,
      retryable,
    },
  }
}

function parseJsonBody(body: unknown) {
  if (typeof body === 'string') {
    try {
      return JSON.parse(body) as unknown
    } catch {
      return null
    }
  }

  return body
}

function hasOnlyAllowedRequestKeys(value: Record<string, unknown>) {
  const allowedKeys = new Set<string>(AI_BACKEND_ALLOWED_REQUEST_KEYS)

  return Object.keys(value).every((key) => allowedKeys.has(key))
}

function validateBackendRequest(
  value: unknown,
  sourceMaxCharacters = AI_BACKEND_SOURCE_MAX_CHARACTERS,
): AiSuggestionBackendRequest | AiSuggestionBackendHttpResponse {
  if (!isRecord(value)) {
    return createErrorResponse(
      400,
      'bad_request',
      'AI suggestion request must be a JSON object.',
    )
  }

  if (!hasOnlyAllowedRequestKeys(value)) {
    return createErrorResponse(
      400,
      'bad_request',
      'AI suggestion request includes unsupported fields.',
    )
  }

  if (value.requestVersion !== AI_BACKEND_REQUEST_VERSION) {
    return createErrorResponse(
      400,
      'bad_request',
      'AI suggestion request version is not supported.',
    )
  }

  if (value.responseSchemaVersion !== AI_BACKEND_RESPONSE_SCHEMA_VERSION) {
    return createErrorResponse(
      400,
      'bad_request',
      'AI suggestion response schema version is not supported.',
    )
  }

  const qaSourceId = value.qaSourceId
  const sourceTitle = value.sourceTitle
  const sourceType = value.sourceType
  const sourceStatus = value.sourceStatus
  const sourceUpdatedAt = value.sourceUpdatedAt
  const content = value.content
  const originalCharacterCount = value.originalCharacterCount
  const packedCharacterCount = value.packedCharacterCount
  const maxCharacterCount = value.maxCharacterCount
  const truncated = value.truncated

  if (
    !isNonEmptyString(qaSourceId) ||
    !isNonEmptyString(sourceTitle) ||
    !isNonEmptyString(sourceUpdatedAt) ||
    !isNonEmptyString(content)
  ) {
    return createErrorResponse(
      400,
      'bad_request',
      'AI suggestion request is missing required source fields.',
    )
  }

  if (
    qaSourceId.length > 160 ||
    sourceTitle.length > 180 ||
    Number.isNaN(Date.parse(sourceUpdatedAt))
  ) {
    return createErrorResponse(
      400,
      'bad_request',
      'AI suggestion source metadata is not valid.',
    )
  }

  if (
    typeof sourceType !== 'string' ||
    !isAllowedValue(QA_SOURCE_TYPES, sourceType) ||
    typeof sourceStatus !== 'string' ||
    !isAllowedValue(QA_SOURCE_STATUSES, sourceStatus)
  ) {
    return createErrorResponse(
      400,
      'bad_request',
      'AI suggestion source type or status is not supported.',
    )
  }

  if (
    !isInteger(originalCharacterCount) ||
    !isInteger(packedCharacterCount) ||
    !isInteger(maxCharacterCount) ||
    typeof truncated !== 'boolean'
  ) {
    return createErrorResponse(
      400,
      'bad_request',
      'AI suggestion source size metadata is not valid.',
    )
  }

  if (
    originalCharacterCount < 0 ||
    packedCharacterCount < 0 ||
    maxCharacterCount <= 0 ||
    originalCharacterCount < packedCharacterCount ||
    packedCharacterCount !== content.length
  ) {
    return createErrorResponse(
      400,
      'bad_request',
      'AI suggestion source size metadata does not match the request content.',
    )
  }

  if (
    content.length > sourceMaxCharacters ||
    content.length > maxCharacterCount
  ) {
    return createErrorResponse(
      413,
      'too_large',
      'Selected QA Source content is too large for AI suggestion generation.',
    )
  }

  if (
    (!truncated && originalCharacterCount !== packedCharacterCount) ||
    (truncated && originalCharacterCount <= packedCharacterCount)
  ) {
    return createErrorResponse(
      400,
      'bad_request',
      'AI suggestion truncation metadata is not valid.',
    )
  }

  return {
    requestVersion: value.requestVersion,
    qaSourceId: qaSourceId.trim(),
    sourceTitle: sourceTitle.trim(),
    sourceType,
    sourceStatus,
    sourceUpdatedAt,
    content,
    originalCharacterCount,
    packedCharacterCount,
    maxCharacterCount,
    truncated,
    responseSchemaVersion: value.responseSchemaVersion,
  }
}

function getStatusForBackendResponse(response: AiSuggestionBackendResponse) {
  if (response.ok) {
    return 200
  }

  switch (response.error.code) {
    case 'bad_request':
      return 400
    case 'too_large':
      return 413
    case 'provider_unavailable':
      return 503
    case 'rate_limited':
      return 429
    case 'timeout':
      return 504
    case 'invalid_provider_response':
      return 502
    case 'internal_error':
      return 500
  }
}

function isBackendErrorCode(value: unknown): value is AiSuggestionBackendErrorCode {
  return (
    typeof value === 'string' && isAllowedValue(AI_BACKEND_ERROR_CODES, value)
  )
}

function readStringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

export function createAiSuggestionBackendRequest(
  source: PackedQaSourceContext,
): AiSuggestionBackendRequest {
  return {
    requestVersion: AI_BACKEND_REQUEST_VERSION,
    qaSourceId: source.qaSourceId,
    sourceTitle: source.title,
    sourceType: source.sourceType,
    sourceStatus: source.status,
    sourceUpdatedAt: source.updatedAt,
    content: source.content,
    originalCharacterCount: source.originalCharacterCount,
    packedCharacterCount: source.packedCharacterCount,
    maxCharacterCount: source.maxCharacterCount,
    truncated: source.truncated,
    responseSchemaVersion: AI_BACKEND_RESPONSE_SCHEMA_VERSION,
  }
}

export function parseAiSuggestionBackendResponse(
  value: unknown,
): AiSuggestionBackendResponse | null {
  if (!isRecord(value)) {
    return null
  }

  if (value.ok === true) {
    if (!Array.isArray(value.suggestions) || !Array.isArray(value.warnings)) {
      return null
    }

    return {
      ok: true,
      suggestions: value.suggestions,
      warnings: readStringList(value.warnings),
    }
  }

  if (value.ok === false && isRecord(value.error)) {
    const { code, message, retryable } = value.error

    if (
      !isBackendErrorCode(code) ||
      typeof message !== 'string' ||
      typeof retryable !== 'boolean'
    ) {
      return null
    }

    return {
      ok: false,
      error: {
        code,
        message,
        retryable,
      },
    }
  }

  return null
}

export async function handleAiSuggestionBackendRequest(
  request: AiSuggestionBackendHandlerRequest,
  options: AiSuggestionBackendHandlerOptions = {},
): Promise<AiSuggestionBackendHttpResponse> {
  const sourceMaxCharacters =
    options.sourceMaxCharacters ?? AI_BACKEND_SOURCE_MAX_CHARACTERS

  if (request.method !== 'POST') {
    return createErrorResponse(
      405,
      'bad_request',
      'AI suggestion generation only accepts POST requests.',
    )
  }

  const contentType = getHeader(request.headers, 'content-type')

  if (!isJsonContentType(contentType)) {
    return createErrorResponse(
      400,
      'bad_request',
      'AI suggestion generation requires an application/json request.',
    )
  }

  const rawBodyMaxCharacters = getRawBodyMaxCharacters(sourceMaxCharacters)
  const contentLength = readContentLength(
    getHeader(request.headers, 'content-length'),
  )

  if (
    (contentLength !== null && contentLength > rawBodyMaxCharacters) ||
    (typeof request.body === 'string' &&
      request.body.length > rawBodyMaxCharacters)
  ) {
    return createErrorResponse(
      413,
      'too_large',
      'AI suggestion request body is too large.',
    )
  }

  const parsedBody = parseJsonBody(request.body)
  const validationResult = validateBackendRequest(
    parsedBody,
    sourceMaxCharacters,
  )

  if ('status' in validationResult) {
    return validationResult
  }

  if (!options.provider) {
    return createErrorResponse(
      503,
      'provider_unavailable',
      'AI generation requires a configured server-side provider and is not enabled yet.',
      true,
    )
  }

  try {
    const providerResponse = await options.provider.generateSuggestions(
      validationResult,
    )

    return {
      status: getStatusForBackendResponse(providerResponse),
      body: providerResponse,
    }
  } catch {
    return createErrorResponse(
      500,
      'internal_error',
      'AI suggestion generation failed safely.',
      true,
    )
  }
}
