import type { AiCoveragePlan } from './aiCoveragePlanTypes'
import type { AiSectionCoveragePlanPriority } from './aiSectionCoveragePlanTypes'

export const AI_COVERAGE_PLAN_MERGE_CANDIDATE_SCHEMA_VERSION =
  'global-coverage-merge-candidate-v1'
export const AI_COVERAGE_PLAN_MERGE_ORIGIN_SCHEMA_VERSION =
  'coverage-plan-section-merge-origin-v1'

export const AI_COVERAGE_PLAN_MERGE_FINDING_KINDS = [
  'coverage_area',
  'behavior',
  'actor',
  'state',
  'input',
  'failure_mode',
  'integration_risk',
  'permissions_security',
  'data_persistence',
  'ambiguity',
  'next_coverage',
  'warning',
] as const

export const AI_COVERAGE_PLAN_MERGE_DISPOSITIONS = [
  'single',
  'exact_duplicate',
  'likely_overlap',
  'conflict',
] as const

export const AI_COVERAGE_PLAN_MERGE_RELATION_KINDS = [
  'likely_overlap',
  'conflict',
  'needs_qa_review',
] as const

export type AiCoveragePlanMergeFindingKind =
  (typeof AI_COVERAGE_PLAN_MERGE_FINDING_KINDS)[number]
export type AiCoveragePlanMergeDisposition =
  (typeof AI_COVERAGE_PLAN_MERGE_DISPOSITIONS)[number]
export type AiCoveragePlanMergeRelationKind =
  (typeof AI_COVERAGE_PLAN_MERGE_RELATION_KINDS)[number]

/**
 * A saved section-plan record ID is not an analysis identity by itself because
 * a successful re-analysis reuses that record ID.
 */
export type AiCoveragePlanMergeSelectedAnalysisRef = {
  analysisRefId: string
  sectionPlanRecordId: string
  analyzedAt: string
  planFingerprint: string
  sectionId: string
  stableKey: string
  contentFingerprint: string
}

export type AiCoveragePlanMergeSourceRevision = {
  qaSourceId: string
  qaSourceCreatedAt: string
  qaSourceUpdatedAt: string
  sourceFingerprint: string
  sectionSchemaVersion: string
  sectionerVersion: string
  sectionSetFingerprint: string
}

export type AiCoveragePlanMergeSectionScopeEntry = {
  sectionId: string
  stableKey: string
  contentFingerprint: string
  ordinal: number
  title: string
  path: string[]
  startLine: number
  endLine: number
  characterCount: number
  visibleCharacterCount: number
  visibleEndLine: number
  truncated: boolean
}

export type AiCoveragePlanMergeSelectedSectionScopeEntry =
  AiCoveragePlanMergeSectionScopeEntry & {
    analysisRefId: string
  }

export type AiCoveragePlanMergeSectionScope = {
  selected: AiCoveragePlanMergeSelectedSectionScopeEntry[]
  unselected: AiCoveragePlanMergeSectionScopeEntry[]
  stale: AiCoveragePlanMergeSectionScopeEntry[]
  unanalyzed: AiCoveragePlanMergeSectionScopeEntry[]
  excluded: AiCoveragePlanMergeSectionScopeEntry[]
}

export type AiCoveragePlanMergeContributorRef = {
  analysisRefId: string
  sourceFindingKind: AiCoveragePlanMergeFindingKind
  sourceFindingId: string
}

export type AiCoveragePlanMergeEvidenceOrigin = {
  outputEvidenceIndex: number
  contributors: AiCoveragePlanMergeContributorRef[]
}

export type AiCoveragePlanMergeValidatedEvidence = {
  excerpt: string
  contributors: AiCoveragePlanMergeContributorRef[]
}

export type AiCoveragePlanMergeFindingSourceOrder = {
  sectionOrdinal: number
  sourceItemIndex: number
  nestedItemIndex: number
}

type AiCoveragePlanMergeFindingBase<
  Kind extends AiCoveragePlanMergeFindingKind,
  SemanticData,
> = {
  findingId: string
  kind: Kind
  semanticData: SemanticData
  sourceOrder: AiCoveragePlanMergeFindingSourceOrder
  contributors: AiCoveragePlanMergeContributorRef[]
  validatedEvidence: AiCoveragePlanMergeValidatedEvidence[]
}

export type AiCoveragePlanMergeCoverageAreaFinding =
  AiCoveragePlanMergeFindingBase<
    'coverage_area',
    {
      name: string
      summary: string
      behaviors: string[]
    }
  > & {
    /** App-owned transient evidence guard; never provider input or durable authority. */
    allBehaviorEvidenceLinked?: boolean
  }

export type AiCoveragePlanMergeBehaviorFinding =
  AiCoveragePlanMergeFindingBase<
    'behavior',
    {
      text: string
      parentCoverageAreaFindingId: string
    }
  >

export type AiCoveragePlanMergeTextFindingKind = Exclude<
  AiCoveragePlanMergeFindingKind,
  'coverage_area' | 'behavior' | 'ambiguity' | 'next_coverage'
>

export type AiCoveragePlanMergeTextFinding = {
  [Kind in AiCoveragePlanMergeTextFindingKind]: AiCoveragePlanMergeFindingBase<
    Kind,
    { text: string }
  >
}[AiCoveragePlanMergeTextFindingKind]

export type AiCoveragePlanMergeAmbiguityFinding =
  AiCoveragePlanMergeFindingBase<
    'ambiguity',
    {
      question: string
      whyItMatters: string
      severity: AiSectionCoveragePlanPriority
    }
  >

export type AiCoveragePlanMergeNextCoverageFinding =
  AiCoveragePlanMergeFindingBase<
    'next_coverage',
    {
      title: string
      rationale: string
      priority: AiSectionCoveragePlanPriority
    }
  >

export type AiCoveragePlanMergeNormalizedFinding =
  | AiCoveragePlanMergeCoverageAreaFinding
  | AiCoveragePlanMergeBehaviorFinding
  | AiCoveragePlanMergeTextFinding
  | AiCoveragePlanMergeAmbiguityFinding
  | AiCoveragePlanMergeNextCoverageFinding

export type AiCoveragePlanMergeOutputProvenance = {
  outputFindingId: string
  outputFindingKind: AiCoveragePlanMergeFindingKind
  contributors: AiCoveragePlanMergeContributorRef[]
  disposition: AiCoveragePlanMergeDisposition
  evidenceOrigins: AiCoveragePlanMergeEvidenceOrigin[]
}

export type AiCoveragePlanMergeDurableRelation = {
  relationId: string
  kind: AiCoveragePlanMergeRelationKind
  outputFindingIds: [string, string]
}

export type AiCoveragePlanMergeExactDuplicateGroupSummary = {
  outputFindingId: string
  outputFindingKind: AiCoveragePlanMergeFindingKind
  contributorCount: number
}

export type AiCoveragePlanMergeExactDuplicateSummary = {
  groupCount: number
  collapsedFindingCount: number
  groups: AiCoveragePlanMergeExactDuplicateGroupSummary[]
}

export type GlobalCoverageMergeCandidate = {
  schemaVersion: typeof AI_COVERAGE_PLAN_MERGE_CANDIDATE_SCHEMA_VERSION
  candidateId: string
  builtAt: string
  sourceRevision: AiCoveragePlanMergeSourceRevision
  selectedAnalyses: AiCoveragePlanMergeSelectedAnalysisRef[]
  planDraft: AiCoveragePlan
  outputProvenance: AiCoveragePlanMergeOutputProvenance[]
  reviewRelations: AiCoveragePlanMergeDurableRelation[]
  sectionScope: AiCoveragePlanMergeSectionScope
  exactDuplicateSummary: AiCoveragePlanMergeExactDuplicateSummary
  warnings: string[]
}

export type AiCoveragePlanDirectSourceAnalysisOrigin = {
  kind: 'direct_source_analysis'
}

export type AiCoveragePlanSectionMergeOrigin = {
  kind: 'section_merge'
  originSchemaVersion: typeof AI_COVERAGE_PLAN_MERGE_ORIGIN_SCHEMA_VERSION
  selectedAnalyses: AiCoveragePlanMergeSelectedAnalysisRef[]
  outputProvenance: AiCoveragePlanMergeOutputProvenance[]
  reviewRelations: AiCoveragePlanMergeDurableRelation[]
}

export type AiCoveragePlanOrigin =
  | AiCoveragePlanDirectSourceAnalysisOrigin
  | AiCoveragePlanSectionMergeOrigin
