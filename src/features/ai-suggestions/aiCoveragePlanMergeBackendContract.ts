export const AI_COVERAGE_PLAN_MERGE_BACKEND_ENDPOINT =
  '/api/ai/coverage-plan-merge'
export const AI_COVERAGE_PLAN_MERGE_BACKEND_REQUEST_VERSION = 'v1'
export const AI_COVERAGE_PLAN_MERGE_DECISION_SCHEMA_VERSION =
  'coverage-plan-merge-decisions-json-v1'

export const AI_COVERAGE_PLAN_MERGE_BACKEND_MIN_SECTION_COUNT = 2
export const AI_COVERAGE_PLAN_MERGE_BACKEND_MAX_SECTION_COUNT = 8
export const AI_COVERAGE_PLAN_MERGE_BACKEND_MAX_FINDINGS_PER_SECTION = 40
export const AI_COVERAGE_PLAN_MERGE_BACKEND_MAX_FINDINGS = 80
export const AI_COVERAGE_PLAN_MERGE_BACKEND_MAX_CANDIDATE_PAIRS = 120
export const AI_COVERAGE_PLAN_MERGE_BACKEND_MAX_ALIAS_LENGTH = 32
export const AI_COVERAGE_PLAN_MERGE_BACKEND_MAX_TEXT_LENGTH = 500
export const AI_COVERAGE_PLAN_MERGE_BACKEND_MAX_CONTEXT_LENGTH = 500
export const AI_COVERAGE_PLAN_MERGE_BACKEND_MAX_REQUEST_UTF8_BYTES =
  96 * 1024
export const AI_COVERAGE_PLAN_MERGE_BACKEND_MAX_RESPONSE_UTF8_BYTES =
  32 * 1024

export const AI_COVERAGE_PLAN_MERGE_BACKEND_FINDING_KINDS = [
  'coverage_area',
  'behavior',
  'actor',
  'state',
  'input',
  'failure_mode',
  'integration_risk',
  'permissions_security',
  'data_persistence',
  'ambiguity',
  'next_coverage',
  'warning',
] as const

export const AI_COVERAGE_PLAN_MERGE_RELATIONS = [
  'likely_overlap',
  'conflict',
  'distinct',
  'needs_qa_review',
] as const

export const AI_COVERAGE_PLAN_MERGE_REASON_CODES = [
  'same_intent',
  'overlapping_scope',
  'contradictory_claim',
  'different_scope',
  'insufficient_context',
] as const

const BACKEND_ERROR_CODES = [
  'bad_request',
  'too_large',
  'provider_unavailable',
  'rate_limited',
  'timeout',
  'invalid_provider_response',
  'internal_error',
] as const

export type AiCoveragePlanMergeBackendFindingKind =
  (typeof AI_COVERAGE_PLAN_MERGE_BACKEND_FINDING_KINDS)[number]
export type AiCoveragePlanMergeRelation =
  (typeof AI_COVERAGE_PLAN_MERGE_RELATIONS)[number]
export type AiCoveragePlanMergeReasonCode =
  (typeof AI_COVERAGE_PLAN_MERGE_REASON_CODES)[number]
export type AiCoveragePlanMergeBackendErrorCode =
  (typeof BACKEND_ERROR_CODES)[number]

export type AiCoveragePlanMergeBackendFinding = {
  alias: string
  sectionAlias: string
  kind: AiCoveragePlanMergeBackendFindingKind
  text: string
  context: string
}

export type AiCoveragePlanMergeBackendCandidatePair = {
  pairAlias: string
  leftAlias: string
  rightAlias: string
}

export type AiCoveragePlanMergeBackendRequest = {
  requestVersion: typeof AI_COVERAGE_PLAN_MERGE_BACKEND_REQUEST_VERSION
  findings: AiCoveragePlanMergeBackendFinding[]
  candidatePairs: AiCoveragePlanMergeBackendCandidatePair[]
}

export type AiCoveragePlanMergeDecision = {
  pairAlias: string
  relation: AiCoveragePlanMergeRelation
  reasonCode: AiCoveragePlanMergeReasonCode
}

export type AiCoveragePlanMergeDecisionResponse = {
  schemaVersion: typeof AI_COVERAGE_PLAN_MERGE_DECISION_SCHEMA_VERSION
  decisions: AiCoveragePlanMergeDecision[]
}

export type AiCoveragePlanMergeDecisionParseResult =
  | {
      ok: true
      decisions: AiCoveragePlanMergeDecision[]
      error: null
    }
  | {
      ok: false
      decisions: null
      error: 'invalid_provider_response'
    }

export type AiCoveragePlanMergeBackendSuccess = {
  ok: true
  classification: AiCoveragePlanMergeDecisionResponse
}

export type AiCoveragePlanMergeBackendError = {
  ok: false
  error: {
    code: AiCoveragePlanMergeBackendErrorCode
    message: string
    retryable: boolean
  }
}

export type AiCoveragePlanMergeBackendResponse =
  | AiCoveragePlanMergeBackendSuccess
  | AiCoveragePlanMergeBackendError

export type AiCoveragePlanMergeBackendHttpResponse = {
  status: number
  body: AiCoveragePlanMergeBackendResponse
}

export type AiCoveragePlanMergeServerProvider = {
  classifyCoveragePlanMergePairs: (
    request: AiCoveragePlanMergeBackendRequest,
  ) => Promise<AiCoveragePlanMergeBackendResponse>
}

type HandlerRequest = {
  method?: string
  headers?: Record<string, string | string[] | undefined>
  body?: unknown
}

type HandlerOptions = {
  provider?: AiCoveragePlanMergeServerProvider
}

type RequestParseResult =
  | { ok: true; request: AiCoveragePlanMergeBackendRequest }
  | { ok: false; status: 400 | 413 }

const INVALID_JSON = Symbol('invalid-json')
const ALIAS_PATTERN = /^[A-Za-z0-9_-]{32}$/

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

function isAllowedValue<T extends readonly string[]>(
  allowedValues: T,
  value: unknown,
): value is T[number] {
  return (
    typeof value === 'string' &&
    allowedValues.includes(value as T[number])
  )
}

function isSafeAlias(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length === AI_COVERAGE_PLAN_MERGE_BACKEND_MAX_ALIAS_LENGTH &&
    ALIAS_PATTERN.test(value)
  )
}

function isBoundedText(
  value: unknown,
  maxLength: number,
  allowEmpty: boolean,
): value is string {
  return (
    typeof value === 'string' &&
    value.length <= maxLength &&
    (allowEmpty || value.length > 0) &&
    (allowEmpty && value.length === 0 ? true : value === value.trim())
  )
}

export function getAiCoveragePlanMergeUtf8ByteLength(value: string) {
  return new TextEncoder().encode(value).length
}

function getSerializedUtf8ByteLength(value: unknown) {
  try {
    const serialized = JSON.stringify(value)

    return typeof serialized === 'string'
      ? getAiCoveragePlanMergeUtf8ByteLength(serialized)
      : null
  } catch {
    return null
  }
}

function parseJsonBody(body: unknown) {
  if (typeof body !== 'string') {
    return body
  }

  try {
    return JSON.parse(body) as unknown
  } catch {
    return INVALID_JSON
  }
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

function parseBackendRequest(value: unknown): RequestParseResult {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['requestVersion', 'findings', 'candidatePairs']) ||
    value.requestVersion !== AI_COVERAGE_PLAN_MERGE_BACKEND_REQUEST_VERSION ||
    !Array.isArray(value.findings) ||
    !Array.isArray(value.candidatePairs)
  ) {
    return { ok: false, status: 400 }
  }

  if (
    value.findings.length > AI_COVERAGE_PLAN_MERGE_BACKEND_MAX_FINDINGS ||
    value.candidatePairs.length >
      AI_COVERAGE_PLAN_MERGE_BACKEND_MAX_CANDIDATE_PAIRS
  ) {
    return { ok: false, status: 413 }
  }

  if (value.findings.length < 2 || value.candidatePairs.length < 1) {
    return { ok: false, status: 400 }
  }

  const findings: AiCoveragePlanMergeBackendFinding[] = []
  const findingsByAlias = new Map<
    string,
    AiCoveragePlanMergeBackendFinding
  >()
  const sectionCounts = new Map<string, number>()

  for (const finding of value.findings) {
    if (
      !isRecord(finding) ||
      !hasExactKeys(finding, [
        'alias',
        'sectionAlias',
        'kind',
        'text',
        'context',
      ]) ||
      !isSafeAlias(finding.alias) ||
      !isSafeAlias(finding.sectionAlias) ||
      !isAllowedValue(
        AI_COVERAGE_PLAN_MERGE_BACKEND_FINDING_KINDS,
        finding.kind,
      ) ||
      !isBoundedText(
        finding.text,
        AI_COVERAGE_PLAN_MERGE_BACKEND_MAX_TEXT_LENGTH,
        false,
      ) ||
      !isBoundedText(
        finding.context,
        AI_COVERAGE_PLAN_MERGE_BACKEND_MAX_CONTEXT_LENGTH,
        true,
      ) ||
      findingsByAlias.has(finding.alias)
    ) {
      return { ok: false, status: 400 }
    }

    const safeFinding: AiCoveragePlanMergeBackendFinding = {
      alias: finding.alias,
      sectionAlias: finding.sectionAlias,
      kind: finding.kind,
      text: finding.text,
      context: finding.context,
    }
    const nextSectionCount =
      (sectionCounts.get(safeFinding.sectionAlias) ?? 0) + 1

    if (
      nextSectionCount >
      AI_COVERAGE_PLAN_MERGE_BACKEND_MAX_FINDINGS_PER_SECTION
    ) {
      return { ok: false, status: 413 }
    }

    findings.push(safeFinding)
    findingsByAlias.set(safeFinding.alias, safeFinding)
    sectionCounts.set(safeFinding.sectionAlias, nextSectionCount)
  }

  if (
    sectionCounts.size < AI_COVERAGE_PLAN_MERGE_BACKEND_MIN_SECTION_COUNT ||
    sectionCounts.size > AI_COVERAGE_PLAN_MERGE_BACKEND_MAX_SECTION_COUNT
  ) {
    return { ok: false, status: 400 }
  }

  const candidatePairs: AiCoveragePlanMergeBackendCandidatePair[] = []
  const pairAliases = new Set<string>()
  const findingPairs = new Set<string>()
  const referencedFindingAliases = new Set<string>()

  for (const pair of value.candidatePairs) {
    if (
      !isRecord(pair) ||
      !hasExactKeys(pair, ['pairAlias', 'leftAlias', 'rightAlias']) ||
      !isSafeAlias(pair.pairAlias) ||
      !isSafeAlias(pair.leftAlias) ||
      !isSafeAlias(pair.rightAlias) ||
      pair.leftAlias === pair.rightAlias ||
      pairAliases.has(pair.pairAlias)
    ) {
      return { ok: false, status: 400 }
    }

    const leftFinding = findingsByAlias.get(pair.leftAlias)
    const rightFinding = findingsByAlias.get(pair.rightAlias)

    if (
      !leftFinding ||
      !rightFinding ||
      leftFinding.kind !== rightFinding.kind ||
      leftFinding.sectionAlias === rightFinding.sectionAlias
    ) {
      return { ok: false, status: 400 }
    }

    const unorderedPairKey = [pair.leftAlias, pair.rightAlias].sort().join('\u0000')

    if (findingPairs.has(unorderedPairKey)) {
      return { ok: false, status: 400 }
    }

    pairAliases.add(pair.pairAlias)
    findingPairs.add(unorderedPairKey)
    referencedFindingAliases.add(pair.leftAlias)
    referencedFindingAliases.add(pair.rightAlias)
    candidatePairs.push({
      pairAlias: pair.pairAlias,
      leftAlias: pair.leftAlias,
      rightAlias: pair.rightAlias,
    })
  }

  if (
    referencedFindingAliases.size !== findings.length ||
    findings.some((finding) => !referencedFindingAliases.has(finding.alias))
  ) {
    return { ok: false, status: 400 }
  }

  return {
    ok: true,
    request: {
      requestVersion: AI_COVERAGE_PLAN_MERGE_BACKEND_REQUEST_VERSION,
      findings,
      candidatePairs,
    },
  }
}

export function parseAiCoveragePlanMergeDecisionResponse(
  value: unknown,
  expectedPairAliases: readonly string[],
): AiCoveragePlanMergeDecisionParseResult {
  if (
    expectedPairAliases.length < 1 ||
    expectedPairAliases.length >
      AI_COVERAGE_PLAN_MERGE_BACKEND_MAX_CANDIDATE_PAIRS ||
    new Set(expectedPairAliases).size !== expectedPairAliases.length ||
    !expectedPairAliases.every(isSafeAlias) ||
    !isRecord(value) ||
    !hasExactKeys(value, ['schemaVersion', 'decisions']) ||
    value.schemaVersion !== AI_COVERAGE_PLAN_MERGE_DECISION_SCHEMA_VERSION ||
    !Array.isArray(value.decisions) ||
    value.decisions.length !== expectedPairAliases.length
  ) {
    return {
      ok: false,
      decisions: null,
      error: 'invalid_provider_response',
    }
  }

  const expectedAliases = new Set(expectedPairAliases)
  const decisionsByAlias = new Map<string, AiCoveragePlanMergeDecision>()

  for (const decision of value.decisions) {
    if (
      !isRecord(decision) ||
      !hasExactKeys(decision, ['pairAlias', 'relation', 'reasonCode']) ||
      !isSafeAlias(decision.pairAlias) ||
      !expectedAliases.has(decision.pairAlias) ||
      decisionsByAlias.has(decision.pairAlias) ||
      !isAllowedValue(AI_COVERAGE_PLAN_MERGE_RELATIONS, decision.relation) ||
      !isAllowedValue(
        AI_COVERAGE_PLAN_MERGE_REASON_CODES,
        decision.reasonCode,
      )
    ) {
      return {
        ok: false,
        decisions: null,
        error: 'invalid_provider_response',
      }
    }

    decisionsByAlias.set(decision.pairAlias, {
      pairAlias: decision.pairAlias,
      relation: decision.relation,
      reasonCode: decision.reasonCode,
    })
  }

  const decisions = expectedPairAliases.map((pairAlias) =>
    decisionsByAlias.get(pairAlias),
  )

  if (decisions.some((decision) => !decision)) {
    return {
      ok: false,
      decisions: null,
      error: 'invalid_provider_response',
    }
  }

  return {
    ok: true,
    decisions: decisions as AiCoveragePlanMergeDecision[],
    error: null,
  }
}

function isBackendErrorCode(
  value: unknown,
): value is AiCoveragePlanMergeBackendErrorCode {
  return isAllowedValue(BACKEND_ERROR_CODES, value)
}

export function parseAiCoveragePlanMergeBackendResponse(
  value: unknown,
  expectedPairAliases: readonly string[],
): AiCoveragePlanMergeBackendResponse | null {
  const responseBytes = getSerializedUtf8ByteLength(value)

  if (
    responseBytes === null ||
    responseBytes > AI_COVERAGE_PLAN_MERGE_BACKEND_MAX_RESPONSE_UTF8_BYTES ||
    !isRecord(value)
  ) {
    return null
  }

  if (
    value.ok === true &&
    hasExactKeys(value, ['ok', 'classification'])
  ) {
    const classification = value.classification
    const result = parseAiCoveragePlanMergeDecisionResponse(
      classification,
      expectedPairAliases,
    )

    if (!result.ok) {
      return null
    }

    return {
      ok: true,
      classification: {
        schemaVersion: AI_COVERAGE_PLAN_MERGE_DECISION_SCHEMA_VERSION,
        decisions: result.decisions,
      },
    }
  }

  if (
    value.ok === false &&
    hasExactKeys(value, ['ok', 'error']) &&
    isRecord(value.error) &&
    hasExactKeys(value.error, ['code', 'message', 'retryable']) &&
    isBackendErrorCode(value.error.code) &&
    isBoundedText(value.error.message, 500, false) &&
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

export function createAiCoveragePlanMergeBackendError(
  code: AiCoveragePlanMergeBackendErrorCode,
  message: string,
  retryable = false,
): AiCoveragePlanMergeBackendError {
  return { ok: false, error: { code, message, retryable } }
}

function createErrorResponse(
  status: number,
  code: AiCoveragePlanMergeBackendErrorCode,
  message: string,
  retryable = false,
): AiCoveragePlanMergeBackendHttpResponse {
  return {
    status,
    body: createAiCoveragePlanMergeBackendError(
      code,
      message,
      retryable,
    ),
  }
}

function getStatus(response: AiCoveragePlanMergeBackendResponse) {
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
    case 'internal_error':
      return 500
    case 'invalid_provider_response':
      return 502
    case 'provider_unavailable':
      return 503
    case 'timeout':
      return 504
  }
}

export function createAiCoveragePlanMergeBackendRequest(
  value: AiCoveragePlanMergeBackendRequest,
): AiCoveragePlanMergeBackendRequest {
  const requestBytes = getSerializedUtf8ByteLength(value)

  if (
    requestBytes === null ||
    requestBytes > AI_COVERAGE_PLAN_MERGE_BACKEND_MAX_REQUEST_UTF8_BYTES
  ) {
    throw new RangeError(
      'Coverage-plan merge request exceeds its safe UTF-8 byte budget.',
    )
  }

  const result = parseBackendRequest(value)

  if (!result.ok) {
    if (result.status === 413) {
      throw new RangeError('Coverage-plan merge request exceeds safe limits.')
    }

    throw new TypeError('Coverage-plan merge request is not safe.')
  }

  return result.request
}

export async function handleAiCoveragePlanMergeBackendRequest(
  request: HandlerRequest,
  options: HandlerOptions = {},
): Promise<AiCoveragePlanMergeBackendHttpResponse> {
  if (request.method !== 'POST') {
    return createErrorResponse(
      405,
      'bad_request',
      'Coverage-plan merge classification only accepts POST requests.',
    )
  }

  if (!isJsonContentType(getHeader(request.headers, 'content-type'))) {
    return createErrorResponse(
      400,
      'bad_request',
      'Coverage-plan merge classification requires a JSON request body.',
    )
  }

  const contentLengthHeader = getHeader(request.headers, 'content-length')

  if (contentLengthHeader) {
    if (!/^\d+$/.test(contentLengthHeader)) {
      return createErrorResponse(
        400,
        'bad_request',
        'Coverage-plan merge Content-Length is not valid.',
      )
    }

    const contentLength = Number(contentLengthHeader)

    if (!Number.isSafeInteger(contentLength)) {
      return createErrorResponse(
        400,
        'bad_request',
        'Coverage-plan merge Content-Length is not valid.',
      )
    }

    if (
      contentLength >
      AI_COVERAGE_PLAN_MERGE_BACKEND_MAX_REQUEST_UTF8_BYTES
    ) {
      return createErrorResponse(
        413,
        'too_large',
        'Coverage-plan merge request exceeds the safe UTF-8 byte limit.',
      )
    }
  }

  if (
    typeof request.body === 'string' &&
    getAiCoveragePlanMergeUtf8ByteLength(request.body) >
      AI_COVERAGE_PLAN_MERGE_BACKEND_MAX_REQUEST_UTF8_BYTES
  ) {
    return createErrorResponse(
      413,
      'too_large',
      'Coverage-plan merge request exceeds the safe UTF-8 byte limit.',
    )
  }

  const parsedBody = parseJsonBody(request.body)

  if (parsedBody === INVALID_JSON) {
    return createErrorResponse(
      400,
      'bad_request',
      'Coverage-plan merge request body is not valid JSON.',
    )
  }

  const parsedBytes = getSerializedUtf8ByteLength(parsedBody)

  if (parsedBytes === null) {
    return createErrorResponse(
      400,
      'bad_request',
      'Coverage-plan merge request body could not be safely serialized.',
    )
  }

  if (
    parsedBytes > AI_COVERAGE_PLAN_MERGE_BACKEND_MAX_REQUEST_UTF8_BYTES
  ) {
    return createErrorResponse(
      413,
      'too_large',
      'Coverage-plan merge request exceeds the safe UTF-8 byte limit.',
    )
  }

  const parsedRequest = parseBackendRequest(parsedBody)

  if (!parsedRequest.ok) {
    return createErrorResponse(
      parsedRequest.status,
      parsedRequest.status === 413 ? 'too_large' : 'bad_request',
      parsedRequest.status === 413
        ? 'Coverage-plan merge request exceeds approved collection limits.'
        : 'Coverage-plan merge request is not valid.',
    )
  }

  if (!options.provider) {
    return createErrorResponse(
      503,
      'provider_unavailable',
      'Coverage-plan merge classification requires a configured server-side provider.',
      true,
    )
  }

  let providerResponse: unknown

  try {
    providerResponse = await options.provider.classifyCoveragePlanMergePairs(
      parsedRequest.request,
    )
  } catch {
    return createErrorResponse(
      500,
      'internal_error',
      'Coverage-plan merge provider request failed safely.',
      true,
    )
  }

  const expectedPairAliases = parsedRequest.request.candidatePairs.map(
    (pair) => pair.pairAlias,
  )
  const safeProviderResponse = parseAiCoveragePlanMergeBackendResponse(
    providerResponse,
    expectedPairAliases,
  )

  if (!safeProviderResponse) {
    return createErrorResponse(
      502,
      'invalid_provider_response',
      'AI provider returned merge decisions that could not be safely validated.',
      true,
    )
  }

  return {
    status: getStatus(safeProviderResponse),
    body: safeProviderResponse,
  }
}
