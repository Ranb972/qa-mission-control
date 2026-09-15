import { getSectionBehaviorGrounding, type AiSectionCoveragePlan } from './aiSectionCoveragePlanTypes'
import type {
  AiCoveragePlanMergeContributorRef,
  AiCoveragePlanMergeExactDuplicateSummary,
  AiCoveragePlanMergeFindingKind,
  AiCoveragePlanMergeFindingSourceOrder,
  AiCoveragePlanMergeNormalizedFinding,
  AiCoveragePlanMergeOutputProvenance,
  AiCoveragePlanMergeSelectedAnalysisRef,
  AiCoveragePlanMergeValidatedEvidence,
} from './aiCoveragePlanMergeTypes'

export const AI_COVERAGE_PLAN_MERGE_MAX_PROVIDER_FINDINGS_PER_SECTION = 40
export const AI_COVERAGE_PLAN_MERGE_MAX_PROVIDER_FINDINGS_TOTAL = 80
export const AI_COVERAGE_PLAN_MERGE_MAX_CANDIDATE_PAIRS = 120
export const AI_COVERAGE_PLAN_MERGE_PROVIDER_TEXT_MAX_LENGTH = 500

export const AI_COVERAGE_PLAN_MERGE_MIN_SELECTED_PLANS = 2
export const AI_COVERAGE_PLAN_MERGE_MAX_SELECTED_PLANS = 8

const FINDING_KIND_RANK: Record<AiCoveragePlanMergeFindingKind, number> = {
  coverage_area: 0,
  behavior: 1,
  actor: 2,
  state: 3,
  input: 4,
  failure_mode: 5,
  integration_risk: 6,
  permissions_security: 7,
  data_persistence: 8,
  ambiguity: 9,
  next_coverage: 10,
  warning: 11,
}

const QUOTE_VARIANTS = /[‘’‚‛]/g
const DOUBLE_QUOTE_VARIANTS = /[“”„‟]/g
const DASH_VARIANTS = /[‐‑‒–—―−]/g

export type AiCoveragePlanMergePreprocessingAnalysis = {
  analysisRef: AiCoveragePlanMergeSelectedAnalysisRef
  sectionOrdinal: number
  plan: AiSectionCoveragePlan
}

export type AiCoveragePlanMergeProviderFinding = {
  alias: string
  sectionAlias: string
  kind: AiCoveragePlanMergeFindingKind
  text: string
  context: string
}

export type AiCoveragePlanMergeCandidatePair = {
  pairAlias: string
  leftAlias: string
  rightAlias: string
  leftFindingId: string
  rightFindingId: string
}

export type AiCoveragePlanMergePreprocessingSuccess = {
  ok: true
  error: null
  findings: AiCoveragePlanMergeNormalizedFinding[]
  outputProvenance: AiCoveragePlanMergeOutputProvenance[]
  exactDuplicateSummary: AiCoveragePlanMergeExactDuplicateSummary
  providerFindings: AiCoveragePlanMergeProviderFinding[]
  candidatePairs: AiCoveragePlanMergeCandidatePair[]
}

export type AiCoveragePlanMergePreprocessingFailure = {
  ok: false
  error: string
  findings: []
  outputProvenance: []
  exactDuplicateSummary: AiCoveragePlanMergeExactDuplicateSummary
  providerFindings: []
  candidatePairs: []
}

export type AiCoveragePlanMergePreprocessingResult =
  | AiCoveragePlanMergePreprocessingSuccess
  | AiCoveragePlanMergePreprocessingFailure

type RawFinding = {
  rawId: string
  kind: AiCoveragePlanMergeFindingKind
  semanticData: Record<string, unknown>
  strictKey: string
  sourceOrder: AiCoveragePlanMergeFindingSourceOrder
  contributor: AiCoveragePlanMergeContributorRef
  evidence: string[]
  allBehaviorEvidenceLinked?: boolean
}

type GroupedFinding = {
  finding: AiCoveragePlanMergeNormalizedFinding
  strictKey: string
}

function compareCodeUnits(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0
}

function compareSourceOrder(
  left: AiCoveragePlanMergeFindingSourceOrder,
  right: AiCoveragePlanMergeFindingSourceOrder,
) {
  return (
    left.sectionOrdinal - right.sectionOrdinal ||
    left.sourceItemIndex - right.sourceItemIndex ||
    left.nestedItemIndex - right.nestedItemIndex
  )
}

function hashPart(value: string, seed: number) {
  let hash = seed >>> 0

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return (hash >>> 0).toString(16).padStart(8, '0')
}

function digest32(value: string) {
  return [2166136261, 2246822519, 3266489917, 668265263]
    .map((seed, index) => hashPart(`${index}\u001f${value}`, seed))
    .join('')
}

function opaqueAlias(prefix: 'f' | 'p' | 's', value: string) {
  return `${prefix}${digest32(value).slice(0, 31)}`
}

function truncateUnicode(value: string, maxLength: number) {
  if (value.length <= maxLength) return value

  let result = value.slice(0, maxLength)
  const lastCodeUnit = result.charCodeAt(result.length - 1)

  if (lastCodeUnit >= 0xd800 && lastCodeUnit <= 0xdbff) {
    result = result.slice(0, -1)
  }

  return result
}

export function strictCoveragePlanMergeKey(value: string) {
  return value
    .normalize('NFKC')
    .replace(QUOTE_VARIANTS, "'")
    .replace(DOUBLE_QUOTE_VARIANTS, '"')
    .replace(DASH_VARIANTS, '-')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

function lexicalTokens(value: string) {
  return strictCoveragePlanMergeKey(value)
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
}


function sortUniqueStrings(values: string[]) {
  return [...new Set(values)].sort(compareCodeUnits)
}

function contributorKey(contributor: AiCoveragePlanMergeContributorRef) {
  return [
    contributor.analysisRefId,
    contributor.sourceFindingKind,
    contributor.sourceFindingId,
  ].join('\u001f')
}

function sortContributors(
  contributors: AiCoveragePlanMergeContributorRef[],
  analysisOrder: ReadonlyMap<string, number>,
) {
  return Array.from(
    new Map(contributors.map((item) => [contributorKey(item), item])).values(),
  ).sort(
    (left, right) =>
      (analysisOrder.get(left.analysisRefId) ?? Number.MAX_SAFE_INTEGER) -
        (analysisOrder.get(right.analysisRefId) ?? Number.MAX_SAFE_INTEGER) ||
      FINDING_KIND_RANK[left.sourceFindingKind] -
        FINDING_KIND_RANK[right.sourceFindingKind] ||
      compareCodeUnits(left.sourceFindingId, right.sourceFindingId),
  )
}

function groupEvidence(
  entries: RawFinding[],
  analysisOrder: ReadonlyMap<string, number>,
) {
  const byExcerpt = new Map<string, AiCoveragePlanMergeContributorRef[]>()

  for (const entry of entries) {
    for (const excerpt of entry.evidence) {
      const contributors = byExcerpt.get(excerpt) ?? []
      contributors.push(entry.contributor)
      byExcerpt.set(excerpt, contributors)
    }
  }

  return Array.from(byExcerpt.entries()).map(
    ([excerpt, contributors]): AiCoveragePlanMergeValidatedEvidence => ({
      excerpt,
      contributors: sortContributors(contributors, analysisOrder),
    }),
  )
}

function findingId(kind: AiCoveragePlanMergeFindingKind, strictKey: string) {
  return `merge-${kind}-${digest32(`${kind}\u001f${strictKey}`)}`
}

function createRawFinding({
  analysis,
  kind,
  sourceFindingId,
  semanticData,
  strictKey,
  sourceItemIndex,
  nestedItemIndex = 0,
  evidence = [],
  allBehaviorEvidenceLinked,
}: {
  analysis: AiCoveragePlanMergePreprocessingAnalysis
  kind: AiCoveragePlanMergeFindingKind
  sourceFindingId: string
  semanticData: Record<string, unknown>
  strictKey: string
  sourceItemIndex: number
  nestedItemIndex?: number
  evidence?: string[]
  allBehaviorEvidenceLinked?: boolean
}): RawFinding {
  return {
    rawId: [analysis.analysisRef.analysisRefId, kind, sourceFindingId].join(
      '\u001f',
    ),
    kind,
    semanticData,
    strictKey,
    sourceOrder: {
      sectionOrdinal: analysis.sectionOrdinal,
      sourceItemIndex,
      nestedItemIndex,
    },
    contributor: {
      analysisRefId: analysis.analysisRef.analysisRefId,
      sourceFindingKind: kind,
      sourceFindingId,
    },
    evidence: [...evidence],
    ...(kind === 'coverage_area' ? { allBehaviorEvidenceLinked: allBehaviorEvidenceLinked === true } : {}),
  }
}

function coverageAreaStrictKey({
  name,
  summary,
  behaviors,
}: {
  name: string
  summary: string
  behaviors: string[]
}) {
  return [
    strictCoveragePlanMergeKey(name),
    strictCoveragePlanMergeKey(summary),
    sortUniqueStrings(behaviors.map(strictCoveragePlanMergeKey)).join('\u001e'),
  ].join('\u001f')
}

function buildRawFindings(analyses: AiCoveragePlanMergePreprocessingAnalysis[]) {
  const areaEntries: RawFinding[] = []

  for (const analysis of analyses) {
    analysis.plan.coverageAreas.forEach((area, index) => {
      areaEntries.push(
        createRawFinding({
          analysis,
          kind: 'coverage_area',
          sourceFindingId: area.id,
          semanticData: {
            name: area.name,
            summary: area.summary,
            behaviors: [...area.behaviors],
          },
          strictKey: coverageAreaStrictKey(area),
          sourceItemIndex: index,
          evidence: area.evidence,
          allBehaviorEvidenceLinked: getSectionBehaviorGrounding(area).status === 'linked',
        }),
      )
    })
  }

  const rawAreaToOutputArea = new Map<string, string>()
  const areaGroups = new Map<string, RawFinding[]>()

  for (const entry of areaEntries) {
    const entries = areaGroups.get(entry.strictKey) ?? []
    entries.push(entry)
    areaGroups.set(entry.strictKey, entries)
  }

  for (const [strictKey, entries] of areaGroups) {
    const outputId = findingId('coverage_area', strictKey)
    for (const entry of entries) rawAreaToOutputArea.set(entry.rawId, outputId)
  }

  const rawFindings = [...areaEntries]

  for (const analysis of analyses) {
    analysis.plan.coverageAreas.forEach((area, areaIndex) => {
      const rawAreaId = [
        analysis.analysisRef.analysisRefId,
        'coverage_area',
        area.id,
      ].join('\u001f')
      const parentCoverageAreaFindingId = rawAreaToOutputArea.get(rawAreaId)

      if (!parentCoverageAreaFindingId) return

      area.behaviors.forEach((behavior, behaviorIndex) => {
        const normalizedBehavior = strictCoveragePlanMergeKey(behavior)
        rawFindings.push(
          createRawFinding({
            analysis,
            kind: 'behavior',
            sourceFindingId: `${area.id}:behavior:${behaviorIndex}`,
            semanticData: { text: behavior, parentCoverageAreaFindingId },
            strictKey: `${parentCoverageAreaFindingId}\u001f${normalizedBehavior}`,
            sourceItemIndex: areaIndex,
            nestedItemIndex: behaviorIndex + 1,
          }),
        )
      })
    })

    const addTextList = (
      kind: Exclude<
        AiCoveragePlanMergeFindingKind,
        'coverage_area' | 'behavior' | 'ambiguity' | 'next_coverage'
      >,
      values: string[],
    ) => {
      values.forEach((text, index) => {
        rawFindings.push(
          createRawFinding({
            analysis,
            kind,
            sourceFindingId: `${kind}:${index}`,
            semanticData: { text },
            strictKey: strictCoveragePlanMergeKey(text),
            sourceItemIndex: index,
          }),
        )
      })
    }

    addTextList('actor', analysis.plan.actors)
    addTextList('state', analysis.plan.states)
    addTextList('input', analysis.plan.inputs)
    addTextList('failure_mode', analysis.plan.failureModes)
    addTextList('integration_risk', analysis.plan.integrationRisks)
    addTextList('permissions_security', analysis.plan.permissionsSecurity)
    addTextList('data_persistence', analysis.plan.dataPersistenceConcerns)
    addTextList('warning', analysis.plan.warnings)

    analysis.plan.ambiguities.forEach((ambiguity, index) => {
      const strictKey = [
        ambiguity.question,
        ambiguity.whyItMatters,
        ambiguity.severity,
      ]
        .map(strictCoveragePlanMergeKey)
        .join('\u001f')
      rawFindings.push(
        createRawFinding({
          analysis,
          kind: 'ambiguity',
          sourceFindingId: ambiguity.id,
          semanticData: {
            question: ambiguity.question,
            whyItMatters: ambiguity.whyItMatters,
            severity: ambiguity.severity,
          },
          strictKey,
          sourceItemIndex: index,
        }),
      )
    })

    analysis.plan.nextCoverage.forEach((item, index) => {
      const strictKey = [item.title, item.rationale, item.priority]
        .map(strictCoveragePlanMergeKey)
        .join('\u001f')
      rawFindings.push(
        createRawFinding({
          analysis,
          kind: 'next_coverage',
          sourceFindingId: item.id,
          semanticData: {
            title: item.title,
            rationale: item.rationale,
            priority: item.priority,
          },
          strictKey,
          sourceItemIndex: index,
        }),
      )
    })
  }

  return rawFindings
}

function toNormalizedFinding(
  entries: RawFinding[],
  analysisOrder: ReadonlyMap<string, number>,
): GroupedFinding {
  const orderedEntries = [...entries].sort(
    (left, right) =>
      compareSourceOrder(left.sourceOrder, right.sourceOrder) ||
      compareCodeUnits(left.rawId, right.rawId),
  )
  const first = orderedEntries[0]
  const contributors = sortContributors(
    orderedEntries.map((entry) => entry.contributor),
    analysisOrder,
  )
  const validatedEvidence = groupEvidence(orderedEntries, analysisOrder)
  const id = findingId(first.kind, first.strictKey)
  const base = {
    findingId: id,
    sourceOrder: { ...first.sourceOrder },
    contributors,
    validatedEvidence,
  }
  let finding: AiCoveragePlanMergeNormalizedFinding

  switch (first.kind) {
    case 'coverage_area':
      finding = {
        ...base,
        kind: 'coverage_area',
        allBehaviorEvidenceLinked: orderedEntries.every(entry => entry.allBehaviorEvidenceLinked === true),
        semanticData: {
          name: String(first.semanticData.name),
          summary: String(first.semanticData.summary),
          behaviors: [...(first.semanticData.behaviors as string[])],
        },
      }
      break
    case 'behavior':
      finding = {
        ...base,
        kind: 'behavior',
        semanticData: {
          text: String(first.semanticData.text),
          parentCoverageAreaFindingId: String(
            first.semanticData.parentCoverageAreaFindingId,
          ),
        },
      }
      break
    case 'ambiguity':
      finding = {
        ...base,
        kind: 'ambiguity',
        semanticData: {
          question: String(first.semanticData.question),
          whyItMatters: String(first.semanticData.whyItMatters),
          severity: first.semanticData.severity as 'high' | 'medium' | 'low',
        },
      }
      break
    case 'next_coverage':
      finding = {
        ...base,
        kind: 'next_coverage',
        semanticData: {
          title: String(first.semanticData.title),
          rationale: String(first.semanticData.rationale),
          priority: first.semanticData.priority as 'high' | 'medium' | 'low',
        },
      }
      break
    default:
      finding = {
        ...base,
        kind: first.kind,
        semanticData: { text: String(first.semanticData.text) },
      }
  }

  return { finding, strictKey: first.strictKey }
}

function findingComparison(left: GroupedFinding, right: GroupedFinding) {
  return (
    compareSourceOrder(left.finding.sourceOrder, right.finding.sourceOrder) ||
    FINDING_KIND_RANK[left.finding.kind] - FINDING_KIND_RANK[right.finding.kind] ||
    compareCodeUnits(left.strictKey, right.strictKey)
  )
}

function findingProviderText(finding: AiCoveragePlanMergeNormalizedFinding) {
  switch (finding.kind) {
    case 'coverage_area':
      return finding.semanticData.name
    case 'ambiguity':
      return finding.semanticData.question
    case 'next_coverage':
      return finding.semanticData.title
    default:
      return finding.semanticData.text
  }
}

function findingProviderContext(finding: AiCoveragePlanMergeNormalizedFinding) {
  switch (finding.kind) {
    case 'coverage_area':
      return [finding.semanticData.summary, ...finding.semanticData.behaviors].join(
        '\n',
      )
    case 'behavior':
      return ''
    case 'ambiguity':
      return `${finding.semanticData.whyItMatters}\nseverity:${finding.semanticData.severity}`
    case 'next_coverage':
      return `${finding.semanticData.rationale}\npriority:${finding.semanticData.priority}`
    default:
      return ''
  }
}

function couldBeUncertainPair(
  left: AiCoveragePlanMergeNormalizedFinding,
  right: AiCoveragePlanMergeNormalizedFinding,
) {
  if (left.kind !== right.kind || left.kind === 'warning') return false

  const leftAnalysisIds = new Set(
    left.contributors.map((item) => item.analysisRefId),
  )
  if (
    right.contributors.some((item) =>
      leftAnalysisIds.has(item.analysisRefId),
    )
  ) {
    return false
  }

  const leftTokens = new Set(
    lexicalTokens(
      `${findingProviderText(left)} ${findingProviderContext(left)}`,
    ),
  )
  const rightTokens = new Set(
    lexicalTokens(
      `${findingProviderText(right)} ${findingProviderContext(right)}`,
    ),
  )
  if (leftTokens.size === 0 || rightTokens.size === 0) return false

  let intersection = 0
  for (const token of leftTokens) {
    if (rightTokens.has(token)) intersection += 1
  }

  const unionSize = new Set([...leftTokens, ...rightTokens]).size
  return intersection >= 2 || (intersection > 0 && intersection / unionSize >= 0.4)
}

function createEmptySummary(): AiCoveragePlanMergeExactDuplicateSummary {
  return { groupCount: 0, collapsedFindingCount: 0, groups: [] }
}

function createFailure(error: string): AiCoveragePlanMergePreprocessingFailure {
  return {
    ok: false,
    error,
    findings: [],
    outputProvenance: [],
    exactDuplicateSummary: createEmptySummary(),
    providerFindings: [],
    candidatePairs: [],
  }
}

export function preprocessAiCoveragePlanMerge({
  analyses,
}: {
  analyses: AiCoveragePlanMergePreprocessingAnalysis[]
}): AiCoveragePlanMergePreprocessingResult {
  if (
    analyses.length < AI_COVERAGE_PLAN_MERGE_MIN_SELECTED_PLANS ||
    analyses.length > AI_COVERAGE_PLAN_MERGE_MAX_SELECTED_PLANS
  ) {
    return createFailure(
      'Select between 2 and 8 section analyses for deterministic preprocessing.',
    )
  }

  const analysisRefIds = analyses.map(
    (analysis) => analysis.analysisRef.analysisRefId,
  )
  const sectionIdentities = analyses.map((analysis) =>
    [analysis.analysisRef.sectionId, analysis.analysisRef.stableKey].join(
      '',
    ),
  )

  if (
    new Set(analysisRefIds).size !== analysisRefIds.length ||
    new Set(sectionIdentities).size !== sectionIdentities.length
  ) {
    return createFailure(
      'Merge preprocessing requires unique selected analyses and sections.',
    )
  }

  const orderedAnalyses = [...analyses].sort(
    (left, right) =>
      left.sectionOrdinal - right.sectionOrdinal ||
      compareCodeUnits(
        left.analysisRef.analysisRefId,
        right.analysisRef.analysisRefId,
      ),
  )
  const analysisOrder = new Map(
    orderedAnalyses.map((analysis, index) => [
      analysis.analysisRef.analysisRefId,
      index,
    ]),
  )
  const analysisById = new Map(
    orderedAnalyses.map((analysis) => [
      analysis.analysisRef.analysisRefId,
      analysis,
    ]),
  )
  const rawFindings = buildRawFindings(orderedAnalyses)
  const groupedByKindAndKey = new Map<string, RawFinding[]>()

  for (const rawFinding of rawFindings) {
    const key = `${rawFinding.kind}\u001f${rawFinding.strictKey}`
    const entries = groupedByKindAndKey.get(key) ?? []
    entries.push(rawFinding)
    groupedByKindAndKey.set(key, entries)
  }

  const groupedFindings = Array.from(groupedByKindAndKey.values())
    .map((entries) => toNormalizedFinding(entries, analysisOrder))
    .sort(findingComparison)
  const findings = groupedFindings.map((item) => item.finding)
  const duplicateGroups = findings
    .filter((finding) => finding.contributors.length > 1)
    .map((finding) => ({
      outputFindingId: finding.findingId,
      outputFindingKind: finding.kind,
      contributorCount: finding.contributors.length,
    }))
  const exactDuplicateSummary: AiCoveragePlanMergeExactDuplicateSummary = {
    groupCount: duplicateGroups.length,
    collapsedFindingCount: duplicateGroups.reduce(
      (count, group) => count + group.contributorCount - 1,
      0,
    ),
    groups: duplicateGroups,
  }
  const outputProvenance: AiCoveragePlanMergeOutputProvenance[] = findings.map(
    (finding) => ({
      outputFindingId: finding.findingId,
      outputFindingKind: finding.kind,
      contributors: structuredClone(finding.contributors),
      disposition:
        finding.contributors.length > 1 ? 'exact_duplicate' : 'single',
      evidenceOrigins: finding.validatedEvidence.map((evidence, index) => ({
        outputEvidenceIndex: index,
        contributors: structuredClone(evidence.contributors),
      })),
    }),
  )

  const provisionalPairs: Array<{
    left: AiCoveragePlanMergeNormalizedFinding
    right: AiCoveragePlanMergeNormalizedFinding
  }> = []

  for (let leftIndex = 0; leftIndex < findings.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < findings.length;
      rightIndex += 1
    ) {
      const left = findings[leftIndex]
      const right = findings[rightIndex]

      if (!couldBeUncertainPair(left, right)) continue
      provisionalPairs.push({ left, right })

      if (provisionalPairs.length > AI_COVERAGE_PLAN_MERGE_MAX_CANDIDATE_PAIRS) {
        return createFailure(
          'The uncertain merge-pair limit was exceeded. Select fewer section analyses.',
        )
      }
    }
  }

  if (provisionalPairs.length === 0) {
    return {
      ok: true,
      error: null,
      findings,
      outputProvenance,
      exactDuplicateSummary,
      providerFindings: [],
      candidatePairs: [],
    }
  }

  const providerFindingIds = new Set(
    provisionalPairs.flatMap(({ left, right }) => [
      left.findingId,
      right.findingId,
    ]),
  )
  const providerVisibleFindings = findings.filter((finding) =>
    providerFindingIds.has(finding.findingId),
  )
  const perAnalysisFindingIds = new Map<string, Set<string>>()
  for (const finding of providerVisibleFindings) {
    for (const analysisRefId of new Set(
      finding.contributors.map((item) => item.analysisRefId),
    )) {
      const ids = perAnalysisFindingIds.get(analysisRefId) ?? new Set<string>()
      ids.add(finding.findingId)
      perAnalysisFindingIds.set(analysisRefId, ids)
    }
  }

  if (
    Array.from(perAnalysisFindingIds.values()).some(
      (ids) =>
        ids.size > AI_COVERAGE_PLAN_MERGE_MAX_PROVIDER_FINDINGS_PER_SECTION,
    )
  ) {
    return createFailure(
      'The provider-visible per-section finding limit was exceeded. Select fewer section analyses.',
    )
  }

  if (providerVisibleFindings.length > AI_COVERAGE_PLAN_MERGE_MAX_PROVIDER_FINDINGS_TOTAL) {
    return createFailure(
      'The provider-visible total finding limit was exceeded. Select fewer section analyses.',
    )
  }

  const aliasByFindingId = new Map<string, string>()
  const providerFindings = providerVisibleFindings.map(
    (finding): AiCoveragePlanMergeProviderFinding => {
      const primaryContributor = finding.contributors[0]
      const analysis = analysisById.get(primaryContributor.analysisRefId)
      const alias = opaqueAlias('f', finding.findingId)
      aliasByFindingId.set(finding.findingId, alias)

      return {
        alias,
        sectionAlias: opaqueAlias(
          's',
          analysis?.analysisRef.analysisRefId ?? primaryContributor.analysisRefId,
        ),
        kind: finding.kind,
        text: truncateUnicode(
          findingProviderText(finding),
          AI_COVERAGE_PLAN_MERGE_PROVIDER_TEXT_MAX_LENGTH,
        ),
        context: truncateUnicode(
          findingProviderContext(finding),
          AI_COVERAGE_PLAN_MERGE_PROVIDER_TEXT_MAX_LENGTH,
        ),
      }
    },
  )
  const candidatePairs = provisionalPairs.map(
    ({ left, right }): AiCoveragePlanMergeCandidatePair => {
      const leftAlias = aliasByFindingId.get(left.findingId)
      const rightAlias = aliasByFindingId.get(right.findingId)

      if (!leftAlias || !rightAlias) {
        throw new TypeError('Merge finding aliases were not built deterministically.')
      }

      return {
        pairAlias: opaqueAlias(
          'p',
          `${left.findingId}\u001f${right.findingId}`,
        ),
        leftAlias,
        rightAlias,
        leftFindingId: left.findingId,
        rightFindingId: right.findingId,
      }
    },
  )

  if (
    candidatePairs.some(
      (pair, index) =>
        candidatePairs.findIndex(
          (candidate) => candidate.pairAlias === pair.pairAlias,
        ) !== index,
    ) ||
    new Set(providerFindings.map((item) => item.alias)).size !==
      providerFindings.length
  ) {
    return createFailure('A deterministic ephemeral alias collision occurred.')
  }

  return {
    ok: true,
    error: null,
    findings,
    outputProvenance,
    exactDuplicateSummary,
    providerFindings,
    candidatePairs,
  }
}
