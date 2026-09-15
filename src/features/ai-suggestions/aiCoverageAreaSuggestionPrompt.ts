import type {
  AiCoverageAreaSuggestionRequest,
  AiCoverageAreaSuggestionSelectedArea,
} from './aiCoverageAreaSuggestionTypes'
import type { PackedQaSourceContext } from './aiSuggestionTypes'

export const AI_COVERAGE_AREA_SUGGESTION_SOURCE_CONTEXT_MAX_CHARACTERS = 24_000

export function buildAiCoverageAreaSuggestionRequest(
  source: PackedQaSourceContext,
  selectedArea: AiCoverageAreaSuggestionSelectedArea,
): AiCoverageAreaSuggestionRequest {
  return {
    source,
    selectedArea,
  }
}
