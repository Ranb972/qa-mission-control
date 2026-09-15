import {
  AI_COVERAGE_PLAN_BACKEND_ENDPOINT,
  createAiCoveragePlanBackendRequest,
  parseAiCoveragePlanBackendResponse,
} from './aiCoveragePlanBackendContract'
import { createUnreadableBackendResponseError } from './aiBackendResponseErrors'
import type { AiCoveragePlanProvider } from './aiCoveragePlanTypes'

const BACKEND_UNSAFE_RESPONSE_MESSAGE =
  'AI coverage planner backend returned an unsafe response.'
const BACKEND_REQUEST_FAILED_MESSAGE =
  'AI coverage planner request could not be completed.'

export const backendAiCoveragePlanProvider: AiCoveragePlanProvider = {
  isAvailable: true,
  generateCoveragePlan: async (request, options) => {
    let response: Response

    try {
      response = await fetch(AI_COVERAGE_PLAN_BACKEND_ENDPOINT, {
        method: 'POST',
        credentials: 'omit',
        redirect: 'error',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(
          createAiCoveragePlanBackendRequest(
            request.source,
            request.sourceSectionCatalog,
          ),
        ),
        signal: options?.signal,
      })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw error
      }

      throw new Error(BACKEND_REQUEST_FAILED_MESSAGE, { cause: error })
    }

    let responseBody: unknown

    try {
      responseBody = await response.json()
    } catch {
      throw createUnreadableBackendResponseError('AI coverage planner', response)
    }

    const backendResponse = parseAiCoveragePlanBackendResponse(responseBody)

    if (!backendResponse) {
      throw new Error(BACKEND_UNSAFE_RESPONSE_MESSAGE)
    }

    if (!backendResponse.ok) {
      throw new Error(backendResponse.error.message)
    }

    if (!response.ok) {
      throw new Error(BACKEND_UNSAFE_RESPONSE_MESSAGE)
    }

    return {
      coveragePlan: backendResponse.coveragePlan,
      warnings: backendResponse.warnings,
    }
  },
}
