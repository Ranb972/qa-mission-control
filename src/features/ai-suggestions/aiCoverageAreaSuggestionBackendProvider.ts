import {
  AI_COVERAGE_AREA_SUGGESTION_BACKEND_ENDPOINT,
  createAiCoverageAreaSuggestionBackendRequest,
  parseAiCoverageAreaSuggestionBackendResponse,
} from './aiCoverageAreaSuggestionBackendContract'
import {
  createBackendErrorResponseError,
  createUnreadableBackendResponseError,
} from './aiBackendResponseErrors'
import type { AiCoverageAreaSuggestionProvider } from './aiCoverageAreaSuggestionTypes'

const BACKEND_UNSAFE_RESPONSE_MESSAGE =
  'AI coverage area suggestion backend returned an unsafe response.'
const BACKEND_REQUEST_FAILED_MESSAGE =
  'AI coverage area suggestion request could not be completed.'

export const backendAiCoverageAreaSuggestionProvider:
  AiCoverageAreaSuggestionProvider = {
  isAvailable: true,
  generateCoverageAreaSuggestions: async (request, options) => {
    let response: Response

    try {
      response = await fetch(AI_COVERAGE_AREA_SUGGESTION_BACKEND_ENDPOINT, {
        method: 'POST',
        credentials: 'omit',
        redirect: 'error',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(
          createAiCoverageAreaSuggestionBackendRequest(
            request.source,
            request.selectedArea,
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
      throw createUnreadableBackendResponseError(
        'AI coverage area suggestion',
        response,
      )
    }

    const backendResponse =
      parseAiCoverageAreaSuggestionBackendResponse(responseBody)

    if (!backendResponse) {
      throw new Error(BACKEND_UNSAFE_RESPONSE_MESSAGE)
    }

    if (!backendResponse.ok) {
      throw createBackendErrorResponseError(response, backendResponse.error)
    }

    if (!response.ok) {
      throw new Error(BACKEND_UNSAFE_RESPONSE_MESSAGE)
    }

    return {
      areaSuggestionResult: backendResponse.areaSuggestionResult,
      warnings: backendResponse.warnings,
    }
  },
}
