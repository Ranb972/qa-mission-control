import type {
  AiCoveragePlanMergeCandidatePair,
  AiCoveragePlanMergePreprocessingSuccess,
} from './aiCoveragePlanMergePreprocessing'
import {
  AI_COVERAGE_PLAN_MERGE_CANDIDATE_SCHEMA_VERSION,
  type AiCoveragePlanMergeDurableRelation,
  type AiCoveragePlanMergeOutputProvenance,
  type GlobalCoverageMergeCandidate,
} from './aiCoveragePlanMergeTypes'

export const AI_COVERAGE_PLAN_MERGE_DECISION_SCHEMA_VERSION =
  'coverage-plan-merge-decisions-json-v1'

export const AI_COVERAGE_PLAN_MERGE_CANDIDATE_MAX_UTF8_BYTES = 512 * 1024

export const AI_COVERAGE_PLAN_MERGE_DECISION_RELATIONS = [
  'likely_overlap',
  'conflict',
  'distinct',
  'needs_qa_review',
] as const

export const AI_COVERAGE_PLAN_MERGE_DECISION_REASON_CODES = [
  'same_intent',
  'overlapping_scope',
  'contradictory_claim',
  'different_scope',
  'insufficient_context',
] as const

export type AiCoveragePlanMergeDecisionRelation =
  (typeof AI_COVERAGE_PLAN_MERGE_DECISION_RELATIONS)[number]
export type AiCoveragePlanMergeDecisionReasonCode =
  (typeof AI_COVERAGE_PLAN_MERGE_DECISION_REASON_CODES)[number]

export type AiCoveragePlanMergeDecision = {
  pairAlias: string
  relation: AiCoveragePlanMergeDecisionRelation
  reasonCode: AiCoveragePlanMergeDecisionReasonCode
}

export type ValidateAiCoveragePlanMergeDecisionsResult =
  | {
      ok: true
      decisions: AiCoveragePlanMergeDecision[]
      error: null
    }
  | {
      ok: false
      decisions: null
      error: string
    }

const FORBIDDEN_PROVIDER_KEYS = new Set([
  'approval',
  'approvals',
  'authorization',
  'candidate',
  'candidatepair',
  'candidatepairs',
  'canonicalid',
  'content',
  'coveragepercentage',
  'evidence',
  'evidencesupport',
  'finding',
  'findings',
  'fingerprint',
  'id',
  'import',
  'imports',
  'messages',
  'metadata',
  'model',
  'plan',
  'prompt',
  'provenance',
  'provider',
  'rawproviderresponse',
  'rawresponse',
  'readiness',
  'responseschema',
  'save',
  'schema',
  'secret',
  'sectionid',
  'sectionrefs',
  'stablekey',
  'summary',
  'testcase',
  'text',
  'token',
  'usage',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasExactKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
) {
  const keys = Object.keys(value)
  const expected = new Set(expectedKeys)
  return keys.length === expected.size && keys.every((key) => expected.has(key))
}

function normalizedKey(value: string) {
  return value.replace(/[-_\s]/g, '').toLowerCase()
}

function hasForbiddenProviderKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasForbiddenProviderKey)
  if (!isRecord(value)) return false

  return Object.entries(value).some(
    ([key, nested]) =>
      FORBIDDEN_PROVIDER_KEYS.has(normalizedKey(key)) ||
      hasForbiddenProviderKey(nested),
  )
}

function isAllowed<T extends readonly string[]>(
  values: T,
  value: unknown,
): value is T[number] {
  return typeof value === 'string' && values.includes(value)
}

function failure(error: string): ValidateAiCoveragePlanMergeDecisionsResult {
  return { ok: false, decisions: null, error }
}

export function validateAiCoveragePlanMergeDecisions(
  rawResponse: unknown,
  requestedPairs: readonly AiCoveragePlanMergeCandidatePair[],
): ValidateAiCoveragePlanMergeDecisionsResult {
  if (requestedPairs.length === 0) {
    return rawResponse === undefined || rawResponse === null
      ? { ok: true, decisions: [], error: null }
      : failure(
          'No semantic classification response was expected for this deterministic merge.',
        )
  }

  let parsedResponse = rawResponse
  if (typeof rawResponse === 'string') {
    try {
      parsedResponse = JSON.parse(rawResponse) as unknown
    } catch {
      return failure('The merge classification response was not valid JSON.')
    }
  }

  if (hasForbiddenProviderKey(parsedResponse)) {
    return failure(
      'The merge classification response contained forbidden control data.',
    )
  }

  if (
    !isRecord(parsedResponse) ||
    !hasExactKeys(parsedResponse, ['schemaVersion', 'decisions']) ||
    parsedResponse.schemaVersion !== AI_COVERAGE_PLAN_MERGE_DECISION_SCHEMA_VERSION ||
    !Array.isArray(parsedResponse.decisions)
  ) {
    return failure(
      'The merge classification response did not match the expected schema.',
    )
  }

  const requestedAliases = requestedPairs.map((pair) => pair.pairAlias)
  if (new Set(requestedAliases).size !== requestedAliases.length) {
    return failure('The requested merge pairs were not uniquely identified.')
  }

  if (parsedResponse.decisions.length !== requestedAliases.length) {
    return failure(
      'The merge classification response did not classify every requested pair exactly once.',
    )
  }

  const decisionByAlias = new Map<string, AiCoveragePlanMergeDecision>()

  for (const value of parsedResponse.decisions) {
    if (
      !isRecord(value) ||
      !hasExactKeys(value, ['pairAlias', 'relation', 'reasonCode']) ||
      typeof value.pairAlias !== 'string' ||
      !requestedAliases.includes(value.pairAlias) ||
      !isAllowed(AI_COVERAGE_PLAN_MERGE_DECISION_RELATIONS, value.relation) ||
      !isAllowed(AI_COVERAGE_PLAN_MERGE_DECISION_REASON_CODES, value.reasonCode) ||
      decisionByAlias.has(value.pairAlias)
    ) {
      return failure(
        'The merge classification response contained an unknown, duplicate, or malformed decision.',
      )
    }

    decisionByAlias.set(value.pairAlias, {
      pairAlias: value.pairAlias,
      relation: value.relation,
      reasonCode: value.reasonCode,
    })
  }

  const decisions = requestedAliases.map((alias) => decisionByAlias.get(alias))
  if (decisions.some((decision) => !decision)) {
    return failure(
      'The merge classification response omitted a requested decision.',
    )
  }

  return {
    ok: true,
    decisions: decisions as AiCoveragePlanMergeDecision[],
    error: null,
  }
}

function hashString(value: string) {
  let hash = 2166136261

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return (hash >>> 0).toString(16).padStart(8, '0')
}

function dispositionRank(
  disposition: AiCoveragePlanMergeOutputProvenance['disposition'],
) {
  switch (disposition) {
    case 'conflict':
      return 3
    case 'likely_overlap':
      return 2
    case 'exact_duplicate':
      return 1
    case 'single':
      return 0
  }
}

export function applyAiCoveragePlanMergeDecisions(
  preprocessing: AiCoveragePlanMergePreprocessingSuccess,
  decisions: readonly AiCoveragePlanMergeDecision[],
) {
  const decisionByAlias = new Map(
    decisions.map((decision) => [decision.pairAlias, decision]),
  )
  const provenanceById = new Map(
    preprocessing.outputProvenance.map((item) => [
      item.outputFindingId,
      structuredClone(item),
    ]),
  )
  const reviewRelations: AiCoveragePlanMergeDurableRelation[] = []

  for (const [index, pair] of preprocessing.candidatePairs.entries()) {
    const decision = decisionByAlias.get(pair.pairAlias)
    if (!decision) {
      throw new TypeError('A requested merge-pair decision is missing.')
    }

    if (decision.relation === 'distinct') continue

    const kind = decision.relation
    const outputFindingIds: [string, string] = [
      pair.leftFindingId,
      pair.rightFindingId,
    ]
    reviewRelations.push({
      relationId: `merge-relation-${index + 1}-${hashString(
        `${kind}\u001f${outputFindingIds.join('\u001f')}`,
      )}`,
      kind,
      outputFindingIds,
    })

    if (kind === 'needs_qa_review') continue

    for (const outputFindingId of outputFindingIds) {
      const provenance = provenanceById.get(outputFindingId)
      if (!provenance) {
        throw new TypeError('A merge relation references an unknown finding.')
      }

      const nextDisposition = kind
      if (
        dispositionRank(nextDisposition) >
        dispositionRank(provenance.disposition)
      ) {
        provenance.disposition = nextDisposition
      }
    }
  }

  return {
    findings: structuredClone(preprocessing.findings),
    outputProvenance: preprocessing.outputProvenance.map((item) => {
      const updated = provenanceById.get(item.outputFindingId)
      if (!updated) throw new TypeError('Merge provenance became inconsistent.')
      return updated
    }),
    reviewRelations,
    exactDuplicateSummary: structuredClone(
      preprocessing.exactDuplicateSummary,
    ),
  }
}

export function createGlobalCoverageMergeCandidate(
  input: Omit<GlobalCoverageMergeCandidate, 'schemaVersion'>,
): GlobalCoverageMergeCandidate {
  if (
    !input.candidateId ||
    input.candidateId !== input.candidateId.trim() ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(input.builtAt) ||
    new Date(input.builtAt).toISOString() !== input.builtAt
  ) {
    throw new TypeError('The merge candidate identity is not valid.')
  }

  const sectionOrdinalByAnalysis = new Map(
    input.sectionScope.selected.map((section) => [
      section.analysisRefId,
      section.ordinal,
    ]),
  )
  const selectedAnalyses = [...input.selectedAnalyses].sort(
    (left, right) =>
      (sectionOrdinalByAnalysis.get(left.analysisRefId) ?? Number.MAX_SAFE_INTEGER) -
        (sectionOrdinalByAnalysis.get(right.analysisRefId) ??
          Number.MAX_SAFE_INTEGER) ||
      (left.analysisRefId < right.analysisRefId
        ? -1
        : left.analysisRefId > right.analysisRefId
          ? 1
          : 0),
  )

  const candidate: GlobalCoverageMergeCandidate = structuredClone({
    schemaVersion: AI_COVERAGE_PLAN_MERGE_CANDIDATE_SCHEMA_VERSION,
    candidateId: input.candidateId,
    builtAt: input.builtAt,
    sourceRevision: input.sourceRevision,
    selectedAnalyses,
    planDraft: input.planDraft,
    outputProvenance: input.outputProvenance,
    reviewRelations: input.reviewRelations,
    sectionScope: input.sectionScope,
    exactDuplicateSummary: input.exactDuplicateSummary,
    warnings: input.warnings,
  })

  if (
    new TextEncoder().encode(JSON.stringify(candidate)).byteLength >
    AI_COVERAGE_PLAN_MERGE_CANDIDATE_MAX_UTF8_BYTES
  ) {
    throw new TypeError('The merge candidate exceeds the 512 KiB size limit.')
  }

  return candidate
}
