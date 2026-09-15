import {
  QA_SOURCE_STATUSES,
  QA_SOURCE_TYPES,
  type QaSourceStatus,
  type QaSourceType,
} from '../qa-sources/qaSourceTypes'
import {
  AI_COVERAGE_SECTION_VISIBILITIES,
  AI_COVERAGE_PLAN_SCHEMA_VERSION,
  type AiCoveragePlanSectionCatalog,
} from './aiCoveragePlanTypes'
import {
  AI_COVERAGE_PLAN_BACKEND_MAX_REQUEST_UTF8_BYTES,
  AI_COVERAGE_PLAN_SECTION_CATALOG_MAX_ENTRIES,
  AI_COVERAGE_PLAN_SECTION_CATALOG_MAX_UTF8_BYTES,
  AI_COVERAGE_PLAN_SECTION_ID_MAX_LENGTH,
  AI_COVERAGE_PLAN_SECTION_PATH_MAX_DEPTH,
  AI_COVERAGE_PLAN_SECTION_PATH_SEGMENT_MAX_LENGTH,
  AI_COVERAGE_PLAN_SECTION_PREVIEW_MAX_LENGTH,
  AI_COVERAGE_PLAN_SECTION_STABLE_KEY_MAX_LENGTH,
  AI_COVERAGE_PLAN_SECTION_TITLE_MAX_LENGTH,
  EMPTY_AI_COVERAGE_PLAN_SECTION_CATALOG,
  getAiCoveragePlanUtf8ByteLength,
} from './aiCoveragePlanSectionContext'
import type { PackedQaSourceContext } from './aiSuggestionTypes'

export const AI_COVERAGE_PLAN_BACKEND_ENDPOINT = '/api/ai/coverage-plan'
export const AI_COVERAGE_PLAN_BACKEND_REQUEST_VERSION = 'v2'
export const AI_COVERAGE_PLAN_BACKEND_SOURCE_MAX_CHARACTERS = 24_000

const AI_COVERAGE_PLAN_ALLOWED_REQUEST_KEYS = [
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
  'sourceSections',
] as const

const AI_COVERAGE_PLAN_ERROR_CODES = [
  'bad_request',
  'too_large',
  'provider_unavailable',
  'rate_limited',
  'timeout',
  'invalid_provider_response',
  'internal_error',
] as const

export type AiCoveragePlanBackendErrorCode =
  (typeof AI_COVERAGE_PLAN_ERROR_CODES)[number]

export type AiCoveragePlanBackendRequest = {
  requestVersion: typeof AI_COVERAGE_PLAN_BACKEND_REQUEST_VERSION
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
  responseSchemaVersion: typeof AI_COVERAGE_PLAN_SCHEMA_VERSION
  sourceSections: AiCoveragePlanSectionCatalog
}

export type AiCoveragePlanBackendSuccess = {
  ok: true
  coveragePlan: unknown
  warnings: string[]
}

export type AiCoveragePlanBackendError = {
  ok: false
  error: {
    code: AiCoveragePlanBackendErrorCode
    message: string
    retryable: boolean
  }
}

export type AiCoveragePlanBackendResponse =
  | AiCoveragePlanBackendSuccess
  | AiCoveragePlanBackendError

export type AiCoveragePlanBackendHttpResponse = {
  status: number
  body: AiCoveragePlanBackendResponse
}

export type AiCoveragePlanServerProvider = {
  generateCoveragePlan: (
    request: AiCoveragePlanBackendRequest,
    options?: { signal?: AbortSignal },
  ) => Promise<AiCoveragePlanBackendResponse>
}

type AiCoveragePlanBackendHandlerRequest = {
  method?: string
  headers?: Record<string, string | string[] | undefined>
  body?: unknown
}

type AiCoveragePlanBackendHandlerOptions = {
  provider?: AiCoveragePlanServerProvider
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

function getSerializedUtf8ByteLength(value: unknown) {
  try {
    const serializedValue = JSON.stringify(value)

    return typeof serializedValue === 'string'
      ? getAiCoveragePlanUtf8ByteLength(serializedValue)
      : null
  } catch {
    return null
  }
}

function createErrorResponse(
  status: number,
  code: AiCoveragePlanBackendErrorCode,
  message: string,
  retryable = false,
): AiCoveragePlanBackendHttpResponse {
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

export function createAiCoveragePlanBackendError(
  code: AiCoveragePlanBackendErrorCode,
  message: string,
  retryable = false,
): AiCoveragePlanBackendError {
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
  const allowedKeys = new Set<string>(AI_COVERAGE_PLAN_ALLOWED_REQUEST_KEYS)

  return Object.keys(value).every((key) => allowedKeys.has(key))
}

function hasExactKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
) {
  const valueKeys = Object.keys(value)
  const expectedKeySet = new Set(expectedKeys)

  return (
    valueKeys.length === expectedKeys.length &&
    valueKeys.every((key) => expectedKeySet.has(key))
  )
}

function readBoundedStringArray(
  value: unknown,
  maxCount: number,
  maxLength: number,
) {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > maxCount ||
    !value.every(
      (item) =>
        isNonEmptyString(item) && item.trim().length <= maxLength,
    )
  ) {
    return null
  }

  return value.map((item) => item.trim())
}

function validateSourceSections(value: unknown): AiCoveragePlanSectionCatalog | null {
  const catalogKeys = [
    'available',
    'sectionSchemaVersion',
    'sectionerVersion',
    'sectionSetFingerprint',
    'totalSectionCount',
    'visibleSectionCount',
    'omittedSectionCount',
    'sections',
  ] as const

  if (
    !isRecord(value) ||
    !hasExactKeys(value, catalogKeys) ||
    typeof value.available !== 'boolean' ||
    !isInteger(value.totalSectionCount) ||
    !isInteger(value.visibleSectionCount) ||
    !isInteger(value.omittedSectionCount) ||
    !Array.isArray(value.sections) ||
    value.sections.length > AI_COVERAGE_PLAN_SECTION_CATALOG_MAX_ENTRIES
  ) {
    return null
  }

  if (
    value.totalSectionCount < 0 ||
    value.visibleSectionCount < 0 ||
    value.omittedSectionCount < 0 ||
    value.visibleSectionCount !== value.sections.length ||
    value.visibleSectionCount + value.omittedSectionCount !==
      value.totalSectionCount ||
    value.available !== (value.sections.length > 0)
  ) {
    return null
  }

  const indexMetadata = [
    value.sectionSchemaVersion,
    value.sectionerVersion,
    value.sectionSetFingerprint,
  ]
  const hasIndexMetadata = indexMetadata.every(
    (item) => isNonEmptyString(item) && item.trim().length <= 160,
  )
  const hasNoIndexMetadata = indexMetadata.every((item) => item === '')

  if (
    (!hasIndexMetadata && !hasNoIndexMetadata) ||
    (hasNoIndexMetadata &&
      (value.totalSectionCount !== 0 || value.sections.length !== 0))
  ) {
    return null
  }

  const sectionKeys = [
    'sectionId',
    'stableKey',
    'ordinal',
    'title',
    'path',
    'startLine',
    'endLine',
    'characterCount',
    'visibility',
    'preview',
  ] as const
  const sections: AiCoveragePlanSectionCatalog['sections'] = []
  const sectionIds = new Set<string>()
  const stableKeys = new Set<string>()
  let previousOrdinal = 0

  for (const section of value.sections) {
    if (!isRecord(section) || !hasExactKeys(section, sectionKeys)) {
      return null
    }

    const path = readBoundedStringArray(
      section.path,
      AI_COVERAGE_PLAN_SECTION_PATH_MAX_DEPTH,
      AI_COVERAGE_PLAN_SECTION_PATH_SEGMENT_MAX_LENGTH,
    )

    if (
      !isNonEmptyString(section.sectionId) ||
      section.sectionId.trim().length > AI_COVERAGE_PLAN_SECTION_ID_MAX_LENGTH ||
      !isNonEmptyString(section.stableKey) ||
      section.stableKey.trim().length >
        AI_COVERAGE_PLAN_SECTION_STABLE_KEY_MAX_LENGTH ||
      !isInteger(section.ordinal) ||
      section.ordinal <= previousOrdinal ||
      !isNonEmptyString(section.title) ||
      section.title.trim().length > AI_COVERAGE_PLAN_SECTION_TITLE_MAX_LENGTH ||
      !path ||
      !isInteger(section.startLine) ||
      !isInteger(section.endLine) ||
      !isInteger(section.characterCount) ||
      section.startLine <= 0 ||
      section.endLine < section.startLine ||
      section.characterCount < 0 ||
      typeof section.visibility !== 'string' ||
      !isAllowedValue(AI_COVERAGE_SECTION_VISIBILITIES, section.visibility) ||
      typeof section.preview !== 'string' ||
      section.preview.length > AI_COVERAGE_PLAN_SECTION_PREVIEW_MAX_LENGTH
    ) {
      return null
    }

    const sectionId = section.sectionId.trim()
    const stableKey = section.stableKey.trim()

    if (sectionIds.has(sectionId) || stableKeys.has(stableKey)) {
      return null
    }

    sectionIds.add(sectionId)
    stableKeys.add(stableKey)
    previousOrdinal = section.ordinal
    sections.push({
      sectionId,
      stableKey,
      ordinal: section.ordinal,
      title: section.title.trim(),
      path,
      startLine: section.startLine,
      endLine: section.endLine,
      characterCount: section.characterCount,
      visibility: section.visibility,
      preview: section.preview.trim(),
    })
  }

  return {
    available: value.available,
    sectionSchemaVersion: hasIndexMetadata
      ? String(value.sectionSchemaVersion).trim()
      : '',
    sectionerVersion: hasIndexMetadata
      ? String(value.sectionerVersion).trim()
      : '',
    sectionSetFingerprint: hasIndexMetadata
      ? String(value.sectionSetFingerprint).trim()
      : '',
    totalSectionCount: value.totalSectionCount,
    visibleSectionCount: value.visibleSectionCount,
    omittedSectionCount: value.omittedSectionCount,
    sections,
  }
}

function validateBackendRequest(
  value: unknown,
  sourceMaxCharacters = AI_COVERAGE_PLAN_BACKEND_SOURCE_MAX_CHARACTERS,
): AiCoveragePlanBackendRequest | AiCoveragePlanBackendHttpResponse {
  if (!isRecord(value)) {
    return createErrorResponse(
      400,
      'bad_request',
      'AI coverage plan request must be a JSON object.',
    )
  }

  const serializedRequestBytes = getSerializedUtf8ByteLength(value)
  const serializedCatalogBytes = getSerializedUtf8ByteLength(
    value.sourceSections,
  )
  const catalogEntryCount = isRecord(value.sourceSections) &&
    Array.isArray(value.sourceSections.sections)
    ? value.sourceSections.sections.length
    : 0

  if (
    serializedRequestBytes !== null &&
    serializedRequestBytes > AI_COVERAGE_PLAN_BACKEND_MAX_REQUEST_UTF8_BYTES
  ) {
    return createErrorResponse(
      413,
      'too_large',
      'AI coverage plan request body is too large.',
    )
  }

  if (
    catalogEntryCount > AI_COVERAGE_PLAN_SECTION_CATALOG_MAX_ENTRIES ||
    (serializedCatalogBytes !== null &&
      serializedCatalogBytes >
        AI_COVERAGE_PLAN_SECTION_CATALOG_MAX_UTF8_BYTES)
  ) {
    return createErrorResponse(
      413,
      'too_large',
      'AI coverage plan source section catalog is too large.',
    )
  }

  if (!hasOnlyAllowedRequestKeys(value)) {
    return createErrorResponse(
      400,
      'bad_request',
      'AI coverage plan request includes unsupported fields.',
    )
  }

  if (value.requestVersion !== AI_COVERAGE_PLAN_BACKEND_REQUEST_VERSION) {
    return createErrorResponse(
      400,
      'bad_request',
      'AI coverage plan request version is not supported.',
    )
  }

  if (value.responseSchemaVersion !== AI_COVERAGE_PLAN_SCHEMA_VERSION) {
    return createErrorResponse(
      400,
      'bad_request',
      'AI coverage plan response schema version is not supported.',
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
  const sourceSections = validateSourceSections(value.sourceSections)

  if (
    !isNonEmptyString(qaSourceId) ||
    !isNonEmptyString(sourceTitle) ||
    !isNonEmptyString(sourceUpdatedAt) ||
    !isNonEmptyString(content)
  ) {
    return createErrorResponse(
      400,
      'bad_request',
      'AI coverage plan request is missing required source fields.',
    )
  }

  if (!sourceSections) {
    return createErrorResponse(
      400,
      'bad_request',
      'AI coverage plan source section catalog is not valid.',
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
      'AI coverage plan source metadata is not valid.',
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
      'AI coverage plan source type or status is not supported.',
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
      'AI coverage plan source size metadata is not valid.',
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
      'AI coverage plan source size metadata does not match the request content.',
    )
  }

  if (
    content.length > sourceMaxCharacters ||
    content.length > maxCharacterCount
  ) {
    return createErrorResponse(
      413,
      'too_large',
      'Selected QA Source content is too large for AI coverage planning.',
    )
  }

  if (
    (!truncated && originalCharacterCount !== packedCharacterCount) ||
    (truncated && originalCharacterCount <= packedCharacterCount)
  ) {
    return createErrorResponse(
      400,
      'bad_request',
      'AI coverage plan truncation metadata is not valid.',
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
    sourceSections,
  }
}

function getStatusForBackendResponse(response: AiCoveragePlanBackendResponse) {
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
): value is AiCoveragePlanBackendErrorCode {
  return (
    typeof value === 'string' &&
    isAllowedValue(AI_COVERAGE_PLAN_ERROR_CODES, value)
  )
}

function readStringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

export function createAiCoveragePlanBackendRequest(
  source: PackedQaSourceContext,
  sourceSections: AiCoveragePlanSectionCatalog =
    EMPTY_AI_COVERAGE_PLAN_SECTION_CATALOG,
): AiCoveragePlanBackendRequest {
  const catalogBytes = getSerializedUtf8ByteLength(sourceSections)

  if (
    sourceSections.sections.length >
      AI_COVERAGE_PLAN_SECTION_CATALOG_MAX_ENTRIES ||
    catalogBytes === null ||
    catalogBytes > AI_COVERAGE_PLAN_SECTION_CATALOG_MAX_UTF8_BYTES
  ) {
    throw new RangeError(
      'AI coverage plan source section catalog exceeds its safe request budget.',
    )
  }

  const request: AiCoveragePlanBackendRequest = {
    requestVersion: AI_COVERAGE_PLAN_BACKEND_REQUEST_VERSION,
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
    responseSchemaVersion: AI_COVERAGE_PLAN_SCHEMA_VERSION,
    sourceSections,
  }

  const requestBytes = getSerializedUtf8ByteLength(request)

  if (
    requestBytes === null ||
    requestBytes > AI_COVERAGE_PLAN_BACKEND_MAX_REQUEST_UTF8_BYTES
  ) {
    throw new RangeError(
      'AI coverage plan request exceeds its safe UTF-8 byte budget.',
    )
  }

  return request
}

export function parseAiCoveragePlanBackendResponse(
  value: unknown,
): AiCoveragePlanBackendResponse | null {
  if (!isRecord(value)) {
    return null
  }

  if (value.ok === true) {
    if (
      !isRecord(value.coveragePlan) ||
      !Array.isArray(value.warnings)
    ) {
      return null
    }

    return {
      ok: true,
      coveragePlan: value.coveragePlan,
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

export async function handleAiCoveragePlanBackendRequest(
  request: AiCoveragePlanBackendHandlerRequest,
  options: AiCoveragePlanBackendHandlerOptions = {},
): Promise<AiCoveragePlanBackendHttpResponse> {
  const sourceMaxCharacters =
    options.sourceMaxCharacters ?? AI_COVERAGE_PLAN_BACKEND_SOURCE_MAX_CHARACTERS

  if (request.method !== 'POST') {
    return createErrorResponse(
      405,
      'bad_request',
      'AI coverage planning only accepts POST requests.',
    )
  }

  const contentType = getHeader(request.headers, 'content-type')

  if (!isJsonContentType(contentType)) {
    return createErrorResponse(
      400,
      'bad_request',
      'AI coverage planning requires an application/json request.',
    )
  }

  const contentLength = readContentLength(
    getHeader(request.headers, 'content-length'),
  )
  const rawBodyBytes =
    typeof request.body === 'string'
      ? getAiCoveragePlanUtf8ByteLength(request.body)
      : null

  if (
    (contentLength !== null &&
      contentLength > AI_COVERAGE_PLAN_BACKEND_MAX_REQUEST_UTF8_BYTES) ||
    (rawBodyBytes !== null &&
      rawBodyBytes > AI_COVERAGE_PLAN_BACKEND_MAX_REQUEST_UTF8_BYTES)
  ) {
    return createErrorResponse(
      413,
      'too_large',
      'AI coverage plan request body is too large.',
    )
  }

  const parsedBody = parseJsonBody(request.body)
  const parsedBodyBytes = getSerializedUtf8ByteLength(parsedBody)

  if (
    parsedBodyBytes !== null &&
    parsedBodyBytes > AI_COVERAGE_PLAN_BACKEND_MAX_REQUEST_UTF8_BYTES
  ) {
    return createErrorResponse(
      413,
      'too_large',
      'AI coverage plan request body is too large.',
    )
  }

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
      'AI coverage planning requires a configured server-side provider and is not enabled yet.',
      true,
    )
  }

  try {
    const providerResponse = await options.provider.generateCoveragePlan(
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
      'AI coverage planning failed safely.',
      true,
    )
  }
}
