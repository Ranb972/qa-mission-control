import type { PackedQaSourceContext } from './aiSuggestionTypes'

export const AI_COVERAGE_PLAN_LEGACY_SCHEMA_VERSION =
  'ai-coverage-plan-json-v1'
export const AI_COVERAGE_PLAN_SCHEMA_VERSION = 'ai-coverage-plan-json-v2'
export const AI_COVERAGE_PLAN_READINESSES = [
  'source_backed',
  'needs_review',
  'blocked_by_ambiguity',
] as const

export const AI_COVERAGE_COMPLETENESS_VALUES = [
  'visible_source_only',
  'partial_due_to_truncation',
  'insufficient_source',
] as const

export const AI_COVERAGE_PLAN_PRIORITIES = [
  'Low',
  'Medium',
  'High',
  'Critical',
] as const

export const AI_COVERAGE_SECTION_VISIBILITIES = ['full', 'partial'] as const

export type AiCoveragePlanReadiness =
  (typeof AI_COVERAGE_PLAN_READINESSES)[number]

export type AiCoverageCompleteness =
  (typeof AI_COVERAGE_COMPLETENESS_VALUES)[number]

export type AiCoveragePlanPriority =
  (typeof AI_COVERAGE_PLAN_PRIORITIES)[number]

export type AiCoverageSectionVisibility =
  (typeof AI_COVERAGE_SECTION_VISIBILITIES)[number]

export type AiCoveragePlanSectionCatalogEntry = {
  sectionId: string
  stableKey: string
  ordinal: number
  title: string
  path: string[]
  startLine: number
  endLine: number
  characterCount: number
  visibility: AiCoverageSectionVisibility
  preview: string
}

export type AiCoveragePlanSectionCatalog = {
  available: boolean
  sectionSchemaVersion: string
  sectionerVersion: string
  sectionSetFingerprint: string
  totalSectionCount: number
  visibleSectionCount: number
  omittedSectionCount: number
  sections: AiCoveragePlanSectionCatalogEntry[]
}

export type AiCoveragePlanSectionContext = {
  available: boolean
  sectionSchemaVersion: string
  sectionerVersion: string
  sectionSetFingerprint: string
  totalSectionCount: number
  visibleSectionCount: number
  omittedSectionCount: number
}

export type AiCoveragePlanProviderSectionRef = {
  sectionId: string
  stableKey: string
}

export type AiCoverageSourceSectionRef = {
  sectionId: string
  stableKey: string
  ordinal: number
  title: string
  path: string[]
  startLine: number
  endLine: number
  visibility: AiCoverageSectionVisibility
}

export type AiCoverageSourceScope = {
  qaSourceId: string
  visibleSourceOnly: true
  sourceTruncated: boolean
  coverageCompleteness: AiCoverageCompleteness
  sectionContext: AiCoveragePlanSectionContext | null
}

export type AiCoverageArea = {
  id: string
  name: string
  summary: string
  behaviors: string[]
  risks: string[]
  evidence: string[]
  ambiguities: string[]
  generationReadiness: AiCoveragePlanReadiness
  sourceSectionRefs: AiCoverageSourceSectionRef[]
}

export type AiCoverageAmbiguity = {
  id: string
  question: string
  whyItMatters: string
  severity: AiCoveragePlanPriority
  sourceSectionRefs: AiCoverageSourceSectionRef[]
}

export type AiNextGenerationArea = {
  id: string
  title: string
  rationale: string
  priority: AiCoveragePlanPriority
  relatedAreaIds: string[]
  suggestedTestCount: number
  sourceSectionRefs: AiCoverageSourceSectionRef[]
}

export type AiCoveragePlanProviderArea = {
  name: string
  summary: string
  behaviors: string[]
  risks: string[]
  evidence: string[]
  ambiguities: string[]
  generationReadiness: AiCoveragePlanReadiness
  sourceSectionRefs: AiCoveragePlanProviderSectionRef[]
}

export type AiCoveragePlanProviderAmbiguity = {
  question: string
  whyItMatters: string
  severity: AiCoveragePlanPriority
  sourceSectionRefs: AiCoveragePlanProviderSectionRef[]
}

export type AiCoveragePlanProviderNextGenerationArea = {
  title: string
  rationale: string
  priority: AiCoveragePlanPriority
  relatedAreaNames: string[]
  suggestedTestCount: number
  sourceSectionRefs: AiCoveragePlanProviderSectionRef[]
}

export type AiCoveragePlanProviderResponse = {
  schemaVersion: typeof AI_COVERAGE_PLAN_SCHEMA_VERSION
  coverageAreas: AiCoveragePlanProviderArea[]
  actors: string[]
  states: string[]
  inputs: string[]
  failureModes: string[]
  integrationRisks: string[]
  permissionsSecurity: string[]
  dataPersistenceRules: string[]
  ambiguities: AiCoveragePlanProviderAmbiguity[]
  nextGenerationAreas: AiCoveragePlanProviderNextGenerationArea[]
  warnings: string[]
}

export type AiCoveragePlan = {
  schemaVersion: typeof AI_COVERAGE_PLAN_SCHEMA_VERSION
  sourceScope: AiCoverageSourceScope
  coverageAreas: AiCoverageArea[]
  actors: string[]
  states: string[]
  inputs: string[]
  failureModes: string[]
  integrationRisks: string[]
  permissionsSecurity: string[]
  dataPersistenceRules: string[]
  ambiguities: AiCoverageAmbiguity[]
  nextGenerationAreas: AiNextGenerationArea[]
  warnings: string[]
}

export type AiCoveragePlanRequest = {
  source: PackedQaSourceContext
  sourceSectionCatalog: AiCoveragePlanSectionCatalog
}

export type ParseAiCoveragePlanResult = {
  ok: boolean
  coveragePlan: AiCoveragePlan | null
  error: string | null
  validationWarnings: string[]
}

export type AiCoveragePlanProvider = {
  isAvailable: boolean
  unavailableReason?: string
  generateCoveragePlan: (
    request: AiCoveragePlanRequest,
    options?: { signal?: AbortSignal },
  ) => Promise<unknown>
}
