export const AI_SECTION_COVERAGE_PLAN_SCHEMA_VERSION =
  'section-coverage-plan-json-v1'

export const AI_SECTION_COVERAGE_PLAN_EVIDENCE_SUPPORT_VALUES = [
  'source_backed',
  'needs_review',
] as const

export const AI_SECTION_COVERAGE_PLAN_PRIORITIES = [
  'high',
  'medium',
  'low',
] as const

export type AiSectionCoveragePlanEvidenceSupport =
  (typeof AI_SECTION_COVERAGE_PLAN_EVIDENCE_SUPPORT_VALUES)[number]

export type AiSectionCoveragePlanPriority =
  (typeof AI_SECTION_COVERAGE_PLAN_PRIORITIES)[number]

export type AiSectionCoveragePlanProviderArea = {
  name: string
  summary: string
  behaviors: string[]
  evidence: string[]
  /** Optional only for backward-compatible v1 reads. New provider prompts
   * require one explicit association for every behavior. Not QA approval. */
  behaviorEvidence?: AiSectionBehaviorEvidence[]
}

export type AiSectionBehaviorEvidence = { behavior: string; evidence: string[] }

export function getSectionBehaviorGrounding(area: AiSectionCoveragePlanProviderArea) {
  const linked = area.behaviors.filter((behavior) => area.behaviorEvidence?.some((item) => item.behavior === behavior && item.evidence.length > 0)).length
  return { linked, total: area.behaviors.length,
    status: linked > 0 && linked === area.behaviors.length ? 'linked' as const
      : linked > 0 || area.evidence.length > 0 ? 'partial' as const : 'unsupported' as const }
}

export type AiSectionCoveragePlanProviderAmbiguity = {
  question: string
  whyItMatters: string
  severity: AiSectionCoveragePlanPriority
}

export type AiSectionCoveragePlanProviderNextCoverage = {
  title: string
  rationale: string
  priority: AiSectionCoveragePlanPriority
}

export type AiSectionCoveragePlanProviderResponse = {
  schemaVersion: typeof AI_SECTION_COVERAGE_PLAN_SCHEMA_VERSION
  coverageAreas: AiSectionCoveragePlanProviderArea[]
  actors: string[]
  states: string[]
  inputs: string[]
  failureModes: string[]
  integrationRisks: string[]
  permissionsSecurity: string[]
  dataPersistenceConcerns: string[]
  ambiguities: AiSectionCoveragePlanProviderAmbiguity[]
  nextCoverage: AiSectionCoveragePlanProviderNextCoverage[]
  warnings: string[]
}

export type AiSectionCoverageArea = AiSectionCoveragePlanProviderArea & {
  id: string
  evidenceSupport: AiSectionCoveragePlanEvidenceSupport
}

export type AiSectionCoverageAmbiguity =
  AiSectionCoveragePlanProviderAmbiguity & {
    id: string
  }

export type AiSectionNextCoverage =
  AiSectionCoveragePlanProviderNextCoverage & {
    id: string
  }

export type AiSectionCoveragePlan = {
  schemaVersion: typeof AI_SECTION_COVERAGE_PLAN_SCHEMA_VERSION
  coverageAreas: AiSectionCoverageArea[]
  actors: string[]
  states: string[]
  inputs: string[]
  failureModes: string[]
  integrationRisks: string[]
  permissionsSecurity: string[]
  dataPersistenceConcerns: string[]
  ambiguities: AiSectionCoverageAmbiguity[]
  nextCoverage: AiSectionNextCoverage[]
  warnings: string[]
}

export type AiSectionCoveragePlanSourceIdentity = {
  qaSourceId: string
  qaSourceCreatedAt: string
  qaSourceUpdatedAt: string
  sourceFingerprint: string
}

export type AiSectionCoveragePlanSectionIdentity = {
  sectionId: string
  stableKey: string
  contentFingerprint: string
  sectionSchemaVersion: string
  sectionerVersion: string
}

export type AiSectionCoveragePlanSectionSnapshot = {
  ordinal: number
  title: string
  path: string[]
  startLine: number
  endLine: number
  characterCount: number
}

export type AiSectionCoveragePlanVisibleSection = {
  content: string
  packedCharacterCount: number
  truncated: boolean
}

export type AiSectionCoveragePlanContext = {
  sourceIdentity: AiSectionCoveragePlanSourceIdentity
  sectionIdentity: AiSectionCoveragePlanSectionIdentity
  sectionSnapshot: AiSectionCoveragePlanSectionSnapshot
  visibleSection: AiSectionCoveragePlanVisibleSection
}

export type PersistedSectionCoveragePlanRecord = {
  id: string
  sourceIdentity: AiSectionCoveragePlanSourceIdentity
  sectionIdentity: AiSectionCoveragePlanSectionIdentity
  sectionSnapshot: AiSectionCoveragePlanSectionSnapshot & {
    visibleCharacterCount: number
    truncated: boolean
  }
  analyzedAt: string
  plan: AiSectionCoveragePlan
}

export type ParseAiSectionCoveragePlanResult = {
  ok: boolean
  plan: AiSectionCoveragePlan | null
  error: string | null
  validationWarnings: string[]
}

export type AiSectionCoveragePlanProviderResult = {
  analysis: AiSectionCoveragePlanProviderResponse
  warnings: string[]
}

export type AiSectionCoveragePlanProvider = {
  isAvailable: boolean
  unavailableReason?: string
  generateSectionCoveragePlan: (
    context: AiSectionCoveragePlanContext,
    options?: { signal?: AbortSignal },
  ) => Promise<AiSectionCoveragePlanProviderResult>
}
