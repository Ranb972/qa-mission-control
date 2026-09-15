import {
  QA_SOURCE_STATUSES,
  QA_SOURCE_TYPES,
  type QaSourceStatus,
  type QaSourceType,
} from '../qa-sources/qaSourceTypes'
import {
  AI_COVERAGE_AREA_SUGGESTION_SCHEMA_VERSION,
  type AiCoverageAreaSuggestionResult,
  type AiCoverageAreaSuggestionSelectedArea,
  type AiCoverageAreaSuggestionWireSelectedArea,
} from './aiCoverageAreaSuggestionTypes'
import {
  AI_COVERAGE_PLAN_READINESSES,
  type AiCoveragePlanReadiness,
} from './aiCoveragePlanTypes'
import type { PackedQaSourceContext } from './aiSuggestionTypes'

export const AI_COVERAGE_AREA_SUGGESTION_BACKEND_ENDPOINT =
  '/api/ai/coverage-area-suggestions'
export const AI_COVERAGE_AREA_SUGGESTION_BACKEND_REQUEST_VERSION = 'v1'
export const AI_COVERAGE_AREA_SUGGESTION_BACKEND_SOURCE_MAX_CHARACTERS = 24_000
export const AI_COVERAGE_AREA_SUGGESTION_BACKEND_RAW_BODY_OVERHEAD_CHARACTERS =
  5_000

const AI_COVERAGE_AREA_SUGGESTION_ALLOWED_REQUEST_KEYS = [
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
  'selectedArea',
] as const

const AI_COVERAGE_AREA_SUGGESTION_ALLOWED_AREA_KEYS = [
  'id',
  'name',
  'summary',
  'behaviors',
  'risks',
  'evidence',
  'ambiguities',
  'generationReadiness',
] as const

const AI_COVERAGE_AREA_SUGGESTION_ERROR_CODES = [
  'bad_request',
  'too_large',
  'provider_unavailable',
  'rate_limited',
  'timeout',
  'invalid_provider_response',
  'internal_error',
] as const

export type AiCoverageAreaSuggestionBackendErrorCode =
  (typeof AI_COVERAGE_AREA_SUGGESTION_ERROR_CODES)[number]

export type AiCoverageAreaSuggestionBackendRequest = {
  requestVersion: typeof AI_COVERAGE_AREA_SUGGESTION_BACKEND_REQUEST_VERSION
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
  responseSchemaVersion: typeof AI_COVERAGE_AREA_SUGGESTION_SCHEMA_VERSION
  selectedArea: AiCoverageAreaSuggestionWireSelectedArea
}

export type AiCoverageAreaSuggestionBackendSuccess = {
  ok: true
  areaSuggestionResult: unknown
  warnings: string[]
}

export type AiCoverageAreaSuggestionBackendError = {
  ok: false
  error: {
    code: AiCoverageAreaSuggestionBackendErrorCode
    message: string
    retryable: boolean
  }
}

export type AiCoverageAreaSuggestionBackendResponse =
  | AiCoverageAreaSuggestionBackendSuccess
  | AiCoverageAreaSuggestionBackendError

export type AiCoverageAreaSuggestionBackendHttpResponse = {
  status: number
  body: AiCoverageAreaSuggestionBackendResponse
}

export type AiCoverageAreaSuggestionServerProvider = {
  generateCoverageAreaSuggestions: (
    request: AiCoverageAreaSuggestionBackendRequest,
    options?: { signal?: AbortSignal },
  ) => Promise<AiCoverageAreaSuggestionBackendResponse>
}

type AiCoverageAreaSuggestionBackendHandlerRequest = {
  method?: string
  headers?: Record<string, string | string[] | undefined>
  body?: unknown
}

type AiCoverageAreaSuggestionBackendHandlerOptions = {
  provider?: AiCoverageAreaSuggestionServerProvider
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
  return (
    sourceMaxCharacters +
    AI_COVERAGE_AREA_SUGGESTION_BACKEND_RAW_BODY_OVERHEAD_CHARACTERS
  )
}

function createErrorResponse(
  status: number,
  code: AiCoverageAreaSuggestionBackendErrorCode,
  message: string,
  retryable = false,
): AiCoverageAreaSuggestionBackendHttpResponse {
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

export function createAiCoverageAreaSuggestionBackendError(
  code: AiCoverageAreaSuggestionBackendErrorCode,
  message: string,
  retryable = false,
): AiCoverageAreaSuggestionBackendError {
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

function hasOnlyAllowedKeys<T extends readonly string[]>(
  value: Record<string, unknown>,
  allowedKeys: T,
) {
  const allowedKeySet = new Set<string>(allowedKeys)

  return Object.keys(value).every((key) => allowedKeySet.has(key))
}

function readStringList(value: unknown, maxCount: number, maxLength: number) {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    return null
  }

  return value
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, maxCount)
    .map((item) => item.slice(0, maxLength).trimEnd())
}

function evidenceMatchesSource(evidence: string[], sourceContent: string) {
  return evidence.length > 0 && evidence.every((item) => sourceContent.includes(item))
}

function normalizeSelectedArea(
  value: unknown,
  sourceContent: string,
): AiCoverageAreaSuggestionWireSelectedArea | AiCoverageAreaSuggestionBackendHttpResponse {
  if (!isRecord(value)) {
    return createErrorResponse(
      400,
      'bad_request',
      'AI coverage area suggestion request requires a selected coverage area.',
    )
  }

  if (
    !hasOnlyAllowedKeys(
      value,
      AI_COVERAGE_AREA_SUGGESTION_ALLOWED_AREA_KEYS,
    )
  ) {
    return createErrorResponse(
      400,
      'bad_request',
      'Selected coverage area includes unsupported fields.',
    )
  }

  const id = value.id
  const name = value.name
  const summary = value.summary
  const behaviors = readStringList(value.behaviors, 20, 500)
  const risks = readStringList(value.risks, 20, 500)
  const evidence = readStringList(value.evidence, 5, 240)
  const ambiguities = readStringList(value.ambiguities, 8, 500)
  const generationReadiness = value.generationReadiness

  if (
    !isNonEmptyString(id) ||
    !isNonEmptyString(name) ||
    !isNonEmptyString(summary) ||
    !behaviors ||
    !risks ||
    !evidence ||
    !ambiguities ||
    typeof generationReadiness !== 'string' ||
    !isAllowedValue(AI_COVERAGE_PLAN_READINESSES, generationReadiness)
  ) {
    return createErrorResponse(
      400,
      'bad_request',
      'Selected coverage area is not valid.',
    )
  }

  if (id.length > 180 || name.length > 160 || summary.length > 500) {
    return createErrorResponse(
      400,
      'bad_request',
      'Selected coverage area metadata is too large.',
    )
  }

  if (!evidenceMatchesSource(evidence, sourceContent)) {
    return createErrorResponse(
      400,
      'bad_request',
      'Selected coverage area evidence does not match the visible source.',
    )
  }

  return {
    id: id.trim(),
    name: name.trim(),
    summary: summary.trim(),
    behaviors,
    risks,
    evidence,
    ambiguities,
    generationReadiness: generationReadiness as AiCoveragePlanReadiness,
  }
}

function validateBackendRequest(
  value: unknown,
  sourceMaxCharacters =
    AI_COVERAGE_AREA_SUGGESTION_BACKEND_SOURCE_MAX_CHARACTERS,
): AiCoverageAreaSuggestionBackendRequest | AiCoverageAreaSuggestionBackendHttpResponse {
  if (!isRecord(value)) {
    return createErrorResponse(
      400,
      'bad_request',
      'AI coverage area suggestion request must be a JSON object.',
    )
  }

  if (
    !hasOnlyAllowedKeys(
      value,
      AI_COVERAGE_AREA_SUGGESTION_ALLOWED_REQUEST_KEYS,
    )
  ) {
    return createErrorResponse(
      400,
      'bad_request',
      'AI coverage area suggestion request includes unsupported fields.',
    )
  }

  if (value.requestVersion !== AI_COVERAGE_AREA_SUGGESTION_BACKEND_REQUEST_VERSION) {
    return createErrorResponse(
      400,
      'bad_request',
      'AI coverage area suggestion request version is not supported.',
    )
  }

  if (value.responseSchemaVersion !== AI_COVERAGE_AREA_SUGGESTION_SCHEMA_VERSION) {
    return createErrorResponse(
      400,
      'bad_request',
      'AI coverage area suggestion response schema version is not supported.',
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
      'AI coverage area suggestion request is missing required source fields.',
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
      'AI coverage area suggestion source metadata is not valid.',
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
      'AI coverage area suggestion source type or status is not supported.',
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
      'AI coverage area suggestion source size metadata is not valid.',
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
      'AI coverage area suggestion source size metadata does not match the request content.',
    )
  }

  if (
    content.length > sourceMaxCharacters ||
    content.length > maxCharacterCount
  ) {
    return createErrorResponse(
      413,
      'too_large',
      'Selected QA Source content is too large for AI coverage area suggestions.',
    )
  }

  if (
    (!truncated && originalCharacterCount !== packedCharacterCount) ||
    (truncated && originalCharacterCount <= packedCharacterCount)
  ) {
    return createErrorResponse(
      400,
      'bad_request',
      'AI coverage area suggestion truncation metadata is not valid.',
    )
  }

  const selectedArea = normalizeSelectedArea(value.selectedArea, content)

  if ('status' in selectedArea) {
    return selectedArea
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
    selectedArea,
  }
}

function getStatusForBackendResponse(
  response: AiCoverageAreaSuggestionBackendResponse,
) {
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

function isBackendErrorCode(
  value: unknown,
): value is AiCoverageAreaSuggestionBackendErrorCode {
  return (
    typeof value === 'string' &&
    isAllowedValue(AI_COVERAGE_AREA_SUGGESTION_ERROR_CODES, value)
  )
}

function readResponseStringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

export function createAiCoverageAreaSuggestionBackendRequest(
  source: PackedQaSourceContext,
  selectedArea: AiCoverageAreaSuggestionSelectedArea,
): AiCoverageAreaSuggestionBackendRequest {
  const backendSelectedArea = {
    id: selectedArea.id,
    name: selectedArea.name,
    summary: selectedArea.summary,
    behaviors: selectedArea.behaviors,
    risks: selectedArea.risks,
    evidence: selectedArea.evidence,
    ambiguities: selectedArea.ambiguities,
    generationReadiness: selectedArea.generationReadiness,
  } satisfies AiCoverageAreaSuggestionWireSelectedArea

  return {
    requestVersion: AI_COVERAGE_AREA_SUGGESTION_BACKEND_REQUEST_VERSION,
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
    responseSchemaVersion: AI_COVERAGE_AREA_SUGGESTION_SCHEMA_VERSION,
    selectedArea: backendSelectedArea,
  }
}

export function parseAiCoverageAreaSuggestionBackendResponse(
  value: unknown,
): AiCoverageAreaSuggestionBackendResponse | null {
  if (!isRecord(value)) {
    return null
  }

  if (value.ok === true) {
    if (!isRecord(value.areaSuggestionResult) || !Array.isArray(value.warnings)) {
      return null
    }

    return {
      ok: true,
      areaSuggestionResult:
        value.areaSuggestionResult as AiCoverageAreaSuggestionResult,
      warnings: readResponseStringList(value.warnings),
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

function createBlockedAreaResponse(
  request: AiCoverageAreaSuggestionBackendRequest,
): AiCoverageAreaSuggestionBackendSuccess {
  const blockedItems =
    request.selectedArea.ambiguities.length > 0
      ? request.selectedArea.ambiguities
      : ['Selected area is blocked by ambiguity.']

  return {
    ok: true,
    areaSuggestionResult: {
      schemaVersion: AI_COVERAGE_AREA_SUGGESTION_SCHEMA_VERSION,
      sourceScope: {
        qaSourceId: request.qaSourceId,
        visibleSourceOnly: true,
        sourceTruncated: request.truncated,
        analysisScope: request.truncated
          ? 'partial_due_to_truncation'
          : 'visible_source_only',
      },
      areaScope: {
        name: request.selectedArea.name,
        summary: request.selectedArea.summary,
        evidence: request.selectedArea.evidence,
        generationReadiness: request.selectedArea.generationReadiness,
      },
      testCaseSuggestions: [],
      coverageAssessment: {
        coverageLevel: 'Low',
        coveredBehaviors: [],
        missingBehaviors: request.selectedArea.behaviors,
        blockedAmbiguousItems: blockedItems,
        suggestedFollowUpCoverage: [
          'Clarify the blocked ambiguity before generating executable tests.',
        ],
        stopReason:
          'Generated 0 suggestions. Stopped because the selected area is blocked by ambiguity.',
      },
      warnings: [
        'Selected area is blocked by ambiguity; no import-ready suggestions were returned.',
      ],
    },
    warnings: [
      'Selected area is blocked by ambiguity; no import-ready suggestions were returned.',
    ],
  }
}

export async function handleAiCoverageAreaSuggestionBackendRequest(
  request: AiCoverageAreaSuggestionBackendHandlerRequest,
  options: AiCoverageAreaSuggestionBackendHandlerOptions = {},
): Promise<AiCoverageAreaSuggestionBackendHttpResponse> {
  const sourceMaxCharacters =
    options.sourceMaxCharacters ??
    AI_COVERAGE_AREA_SUGGESTION_BACKEND_SOURCE_MAX_CHARACTERS

  if (request.method !== 'POST') {
    return createErrorResponse(
      405,
      'bad_request',
      'AI coverage area suggestion generation only accepts POST requests.',
    )
  }

  const contentType = getHeader(request.headers, 'content-type')

  if (!isJsonContentType(contentType)) {
    return createErrorResponse(
      400,
      'bad_request',
      'AI coverage area suggestion generation requires an application/json request.',
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
      'AI coverage area suggestion request body is too large.',
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

  if (validationResult.selectedArea.generationReadiness === 'blocked_by_ambiguity') {
    return {
      status: 200,
      body: createBlockedAreaResponse(validationResult),
    }
  }

  if (!options.provider) {
    return createErrorResponse(
      503,
      'provider_unavailable',
      'AI coverage area suggestion generation requires a configured server-side provider and is not enabled yet.',
      true,
    )
  }

  try {
    const providerResponse =
      await options.provider.generateCoverageAreaSuggestions(validationResult)

    return {
      status: getStatusForBackendResponse(providerResponse),
      body: providerResponse,
    }
  } catch {
    return createErrorResponse(
      500,
      'internal_error',
      'AI coverage area suggestion generation failed safely.',
      true,
    )
  }
}
