import type {
  AiCoveragePlanReadiness,
  AiCoverageSourceSectionRef,
} from './aiCoveragePlanTypes'
import type { PackedQaSourceContext } from './aiSuggestionTypes'
import type {
  TestCasePriority,
  TestCaseStep,
  TestCaseType,
} from '../test-cases/testCaseTypes'

export const AI_COVERAGE_AREA_SUGGESTION_SCHEMA_VERSION =
  'ai-coverage-area-suggestions-json-v1'

export const AI_COVERAGE_AREA_ANALYSIS_SCOPES = [
  'visible_source_only',
  'partial_due_to_truncation',
  'insufficient_source',
] as const

export const AI_COVERAGE_AREA_SUGGESTION_STATUSES = [
  'Ready',
  'Needs review',
  'Rejected',
] as const

export const AI_COVERAGE_AREA_CONFIDENCES = [
  'High',
  'Medium',
  'Low',
] as const

export const AI_COVERAGE_LEVELS = ['High', 'Partial', 'Low'] as const

export type AiCoverageAreaAnalysisScope =
  (typeof AI_COVERAGE_AREA_ANALYSIS_SCOPES)[number]

export type AiCoverageAreaSuggestionStatus =
  (typeof AI_COVERAGE_AREA_SUGGESTION_STATUSES)[number]

export type AiCoverageAreaConfidence =
  (typeof AI_COVERAGE_AREA_CONFIDENCES)[number]

export type AiCoverageLevel = (typeof AI_COVERAGE_LEVELS)[number]

export type AiCoverageAreaSuggestionSelectedArea = {
  id: string
  name: string
  summary: string
  behaviors: string[]
  risks: string[]
  evidence: string[]
  ambiguities: string[]
  generationReadiness: AiCoveragePlanReadiness
  sourceSectionRefs?: AiCoverageSourceSectionRef[]
}

// The server wire area deliberately excludes navigation refs and all app-only
// diagnostics. Only source-grounded domain fields may reach area generation.
export type AiCoverageAreaSuggestionWireSelectedArea = Omit<
  AiCoverageAreaSuggestionSelectedArea,
  'sourceSectionRefs'
>

export type AiCoverageAreaSourceScope = {
  qaSourceId: string
  visibleSourceOnly: true
  sourceTruncated: boolean
  analysisScope: AiCoverageAreaAnalysisScope
}

export type AiCoverageAreaScope = {
  name: string
  summary: string
  evidence: string[]
  generationReadiness: AiCoveragePlanReadiness
}

export type AiCoverageAreaTestCaseSuggestion = {
  id: string
  qaSourceId: string
  status: AiCoverageAreaSuggestionStatus
  confidence: AiCoverageAreaConfidence
  title: string
  area: string
  priority: TestCasePriority
  type: TestCaseType
  preconditions: string
  structuredSteps: TestCaseStep[]
  evidence: string[]
  assumptions: string[]
  warnings: string[]
}

export type AiCoverageAssessment = {
  coverageLevel: AiCoverageLevel
  coveredBehaviors: string[]
  missingBehaviors: string[]
  blockedAmbiguousItems: string[]
  suggestedFollowUpCoverage: string[]
  stopReason: string
}

export type AiCoverageAreaSuggestionResult = {
  schemaVersion: typeof AI_COVERAGE_AREA_SUGGESTION_SCHEMA_VERSION
  sourceScope: AiCoverageAreaSourceScope
  areaScope: AiCoverageAreaScope
  testCaseSuggestions: AiCoverageAreaTestCaseSuggestion[]
  coverageAssessment: AiCoverageAssessment
  warnings: string[]
}

export type AiCoverageAreaSuggestionRequest = {
  source: PackedQaSourceContext
  selectedArea: AiCoverageAreaSuggestionSelectedArea
}

export type ParseAiCoverageAreaSuggestionResult = {
  ok: boolean
  areaSuggestionResult: AiCoverageAreaSuggestionResult | null
  error: string | null
  warnings: string[]
}

export type AiCoverageAreaSuggestionProvider = {
  isAvailable: boolean
  unavailableReason?: string
  generateCoverageAreaSuggestions: (
    request: AiCoverageAreaSuggestionRequest,
    options?: { signal?: AbortSignal },
  ) => Promise<unknown>
}
