import { createUnreadableBackendResponseError } from './aiBackendResponseErrors'
import {
  AI_COVERAGE_PLAN_MERGE_BACKEND_ENDPOINT,
  AI_COVERAGE_PLAN_MERGE_BACKEND_MAX_RESPONSE_UTF8_BYTES,
  createAiCoveragePlanMergeBackendRequest,
  getAiCoveragePlanMergeUtf8ByteLength,
  parseAiCoveragePlanMergeBackendResponse,
  type AiCoveragePlanMergeBackendRequest,
  type AiCoveragePlanMergeDecisionResponse,
} from './aiCoveragePlanMergeBackendContract'

const BACKEND_UNSAFE_RESPONSE_MESSAGE =
  'AI coverage-plan merge backend returned an unsafe response.'
const BACKEND_REQUEST_FAILED_MESSAGE =
  'AI coverage-plan merge request could not be completed.'

export type AiCoveragePlanMergeBrowserProvider = {
  isAvailable: boolean
  classifyCoveragePlanMergePairs: (
    request: AiCoveragePlanMergeBackendRequest,
    options?: { signal?: AbortSignal },
  ) => Promise<AiCoveragePlanMergeDecisionResponse>
}

function isAbortError(error: unknown) {
  return (
    error instanceof DOMException
      ? error.name === 'AbortError'
      : typeof error === 'object' &&
        error !== null &&
        'name' in error &&
        error.name === 'AbortError'
  )
}

export const backendAiCoveragePlanMergeProvider: AiCoveragePlanMergeBrowserProvider = {
  isAvailable: true,
  classifyCoveragePlanMergePairs: async (request, options) => {
    const safeRequest = createAiCoveragePlanMergeBackendRequest(request)
    let response: Response

    try {
      response = await fetch(AI_COVERAGE_PLAN_MERGE_BACKEND_ENDPOINT, {
        method: 'POST',
        credentials: 'omit',
        redirect: 'error',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(safeRequest),
        signal: options?.signal,
      })
    } catch (error) {
      if (isAbortError(error)) {
        throw error
      }

      throw new Error(BACKEND_REQUEST_FAILED_MESSAGE, { cause: error })
    }

    let rawResponse: string

    try {
      rawResponse = await response.text()
    } catch {
      throw createUnreadableBackendResponseError(
        'AI coverage-plan merge',
        response,
      )
    }

    if (
      getAiCoveragePlanMergeUtf8ByteLength(rawResponse) >
      AI_COVERAGE_PLAN_MERGE_BACKEND_MAX_RESPONSE_UTF8_BYTES
    ) {
      throw new Error(BACKEND_UNSAFE_RESPONSE_MESSAGE)
    }

    let responseBody: unknown

    try {
      responseBody = JSON.parse(rawResponse) as unknown
    } catch {
      throw createUnreadableBackendResponseError(
        'AI coverage-plan merge',
        response,
      )
    }

    const backendResponse = parseAiCoveragePlanMergeBackendResponse(
      responseBody,
      safeRequest.candidatePairs.map((pair) => pair.pairAlias),
    )

    if (!backendResponse) {
      throw new Error(BACKEND_UNSAFE_RESPONSE_MESSAGE)
    }

    if (!backendResponse.ok) {
      throw new Error(backendResponse.error.message)
    }

    if (!response.ok) {
      throw new Error(BACKEND_UNSAFE_RESPONSE_MESSAGE)
    }

    return backendResponse.classification
  },
}
