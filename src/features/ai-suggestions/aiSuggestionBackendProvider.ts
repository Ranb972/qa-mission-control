import type { AiSuggestionProvider } from './aiSuggestionTypes'
import {
  AI_BACKEND_ENDPOINT,
  createAiSuggestionBackendRequest,
  parseAiSuggestionBackendResponse,
} from './aiSuggestionBackendContract'
import { createUnreadableBackendResponseError } from './aiBackendResponseErrors'

const BACKEND_UNSAFE_RESPONSE_MESSAGE =
  'AI backend returned an unsafe response.'
const BACKEND_REQUEST_FAILED_MESSAGE =
  'AI backend request could not be completed.'

export const backendAiSuggestionProvider: AiSuggestionProvider = {
  isAvailable: true,
  generateTestCaseSuggestions: async (request, options) => {
    let response: Response

    try {
      response = await fetch(AI_BACKEND_ENDPOINT, {
        method: 'POST',
        credentials: 'omit',
        redirect: 'error',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(createAiSuggestionBackendRequest(request.source)),
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
      throw createUnreadableBackendResponseError('AI suggestion', response)
    }

    const backendResponse = parseAiSuggestionBackendResponse(responseBody)

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
      suggestions: backendResponse.suggestions,
      warnings: backendResponse.warnings,
    }
  },
}
