import type { AiSuggestionProvider } from './aiSuggestionTypes'
import type { AiCoveragePlanProvider } from './aiCoveragePlanTypes'
import type { AiCoverageAreaSuggestionProvider } from './aiCoverageAreaSuggestionTypes'

export const AI_PROVIDER_UNAVAILABLE_MESSAGE =
  'AI generation requires a secure backend provider and is not enabled in this local version.'
export const AI_COVERAGE_PLAN_PROVIDER_UNAVAILABLE_MESSAGE =
  'AI coverage planning requires a secure backend provider and is not enabled in this local version.'
export const AI_COVERAGE_AREA_SUGGESTION_PROVIDER_UNAVAILABLE_MESSAGE =
  'AI coverage area suggestion generation requires a secure backend provider and is not enabled in this local version.'

export const unavailableAiSuggestionProvider: AiSuggestionProvider = {
  isAvailable: false,
  unavailableReason: AI_PROVIDER_UNAVAILABLE_MESSAGE,
  generateTestCaseSuggestions: () =>
    Promise.reject(new Error(AI_PROVIDER_UNAVAILABLE_MESSAGE)),
}

export const unavailableAiCoveragePlanProvider: AiCoveragePlanProvider = {
  isAvailable: false,
  unavailableReason: AI_COVERAGE_PLAN_PROVIDER_UNAVAILABLE_MESSAGE,
  generateCoveragePlan: () =>
    Promise.reject(new Error(AI_COVERAGE_PLAN_PROVIDER_UNAVAILABLE_MESSAGE)),
}

export const unavailableAiCoverageAreaSuggestionProvider:
  AiCoverageAreaSuggestionProvider = {
  isAvailable: false,
  unavailableReason: AI_COVERAGE_AREA_SUGGESTION_PROVIDER_UNAVAILABLE_MESSAGE,
  generateCoverageAreaSuggestions: () =>
    Promise.reject(
      new Error(AI_COVERAGE_AREA_SUGGESTION_PROVIDER_UNAVAILABLE_MESSAGE),
    ),
}
