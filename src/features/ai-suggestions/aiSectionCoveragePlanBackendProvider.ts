import { createUnreadableBackendResponseError } from './aiBackendResponseErrors'
import {
  AI_SECTION_COVERAGE_PLAN_BACKEND_ENDPOINT,
  createAiSectionCoveragePlanBackendRequest,
  parseAiSectionCoveragePlanBackendResponse,
} from './aiSectionCoveragePlanBackendContract'
import type { AiSectionCoveragePlanProvider } from './aiSectionCoveragePlanTypes'

const BACKEND_UNSAFE_RESPONSE_MESSAGE =
  'AI section coverage backend returned an unsafe response.'
const BACKEND_REQUEST_FAILED_MESSAGE =
  'AI section coverage request could not be completed.'

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

export const backendAiSectionCoveragePlanProvider: AiSectionCoveragePlanProvider = {
  isAvailable: true,
  generateSectionCoveragePlan: async (context, options) => {
    let response: Response

    try {
      response = await fetch(AI_SECTION_COVERAGE_PLAN_BACKEND_ENDPOINT, {
        method: 'POST',
        credentials: 'omit',
        redirect: 'error',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(
          createAiSectionCoveragePlanBackendRequest(context),
        ),
        signal: options?.signal,
      })
    } catch (error) {
      if (isAbortError(error)) {
        throw error
      }

      throw new Error(BACKEND_REQUEST_FAILED_MESSAGE, { cause: error })
    }

    let responseBody: unknown

    try {
      responseBody = await response.json()
    } catch {
      throw createUnreadableBackendResponseError(
        'AI section coverage',
        response,
      )
    }

    const backendResponse = parseAiSectionCoveragePlanBackendResponse(
      responseBody,
      { visibleSectionContent: context.visibleSection.content, visibleSectionTruncated: context.visibleSection.truncated },
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

    return {
      analysis: backendResponse.analysis,
      warnings: [...backendResponse.warnings],
    }
  },
}
