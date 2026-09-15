import {
  EMPTY_AI_COVERAGE_PLAN_SECTION_CATALOG,
} from './aiCoveragePlanSectionContext'
import type {
  AiCoveragePlanRequest,
  AiCoveragePlanSectionCatalog,
} from './aiCoveragePlanTypes'
import type { PackedQaSourceContext } from './aiSuggestionTypes'

export const AI_COVERAGE_PLAN_SOURCE_CONTEXT_MAX_CHARACTERS = 24_000

// Live prompt construction is server-owned. The browser request intentionally
// carries only the reviewed source prefix and its bounded section catalog.
export function buildAiCoveragePlanRequest(
  source: PackedQaSourceContext,
  sourceSectionCatalog: AiCoveragePlanSectionCatalog =
    EMPTY_AI_COVERAGE_PLAN_SECTION_CATALOG,
): AiCoveragePlanRequest {
  return {
    source,
    sourceSectionCatalog,
  }
}
