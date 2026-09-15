import type {
  AiCoverageAreaSuggestionResult,
  AiCoverageAreaSuggestionSelectedArea,
} from './aiCoverageAreaSuggestionTypes'
import type { AiCoveragePlan } from './aiCoveragePlanTypes'
import type { AiTestCaseSuggestion } from './aiSuggestionTypes'

export type AiSuggestionsMode = 'suggestions' | 'coverage_planner'

export type AiSuggestionsSourceRevision = {
  qaSourceId: string
  qaSourceCreatedAt: string
  qaSourceUpdatedAt: string
  sourceFingerprint: string
}

export type AiSuggestionsWorkflowState = {
  activeMode: AiSuggestionsMode
  transientSourceRevision: AiSuggestionsSourceRevision | null
  suggestions: AiTestCaseSuggestion[]
  selectedSuggestionIds: string[]
  importedSuggestionIds: string[]
  coveragePlan: AiCoveragePlan | null
  selectedCoverageArea: AiCoverageAreaSuggestionSelectedArea | null
  coverageAreaSuggestionResult: AiCoverageAreaSuggestionResult | null
  providerError: string | null
  providerWarnings: string[]
  coveragePlanError: string | null
  coveragePlanWarnings: string[]
  coverageAreaSuggestionError: string | null
  coverageAreaSuggestionWarnings: string[]
  selectedAreaSuggestionIds: string[]
  importedAreaSuggestionIds: string[]
  importSummary: string | null
  areaImportSummary: string | null
}

export function createInitialAiSuggestionsWorkflowState(): AiSuggestionsWorkflowState {
  return {
    activeMode: 'coverage_planner',
    transientSourceRevision: null,
    suggestions: [],
    selectedSuggestionIds: [],
    importedSuggestionIds: [],
    coveragePlan: null,
    selectedCoverageArea: null,
    coverageAreaSuggestionResult: null,
    providerError: null,
    providerWarnings: [],
    coveragePlanError: null,
    coveragePlanWarnings: [],
    coverageAreaSuggestionError: null,
    coverageAreaSuggestionWarnings: [],
    selectedAreaSuggestionIds: [],
    importedAreaSuggestionIds: [],
    importSummary: null,
    areaImportSummary: null,
  }
}
