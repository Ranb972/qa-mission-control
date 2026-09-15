import {
  createPersistedSectionCoveragePlanRecord,
  getSectionCoveragePlanFreshness,
} from '../../lib/storage/sectionCoveragePlanStorage'
import type { QaSource } from '../qa-sources/qaSourceTypes'
import {
  createQaSourceSectionIndex,
  type QaSourceSection,
  type QaSourceSectionIndex,
} from '../qa-sources/qaSourceSections'
import {
  AI_SECTION_COVERAGE_PLAN_MAX_VISIBLE_CHARACTERS,
  resolveAiSectionCoveragePlanContext,
} from './aiSectionCoveragePlanContext'
import type {
  AiCoveragePlanMergeSectionScope,
  AiCoveragePlanMergeSectionScopeEntry,
  AiCoveragePlanMergeSelectedAnalysisRef,
  AiCoveragePlanMergeSourceRevision,
} from './aiCoveragePlanMergeTypes'
import type {
  AiSectionCoveragePlan,
  AiSectionCoveragePlanContext,
  PersistedSectionCoveragePlanRecord,
} from './aiSectionCoveragePlanTypes'

export const AI_COVERAGE_PLAN_MERGE_MIN_SELECTED_RECORDS = 2
export const AI_COVERAGE_PLAN_MERGE_MAX_SELECTED_RECORDS = 8

const SECTION_PLAN_RECORD_ID_MAX_LENGTH = 200

export type AiCoveragePlanMergeEligibleAnalysis = {
  record: PersistedSectionCoveragePlanRecord
  analysisRef: AiCoveragePlanMergeSelectedAnalysisRef
  context: AiSectionCoveragePlanContext
  section: AiCoveragePlanMergeSectionScopeEntry
}

export type ResolveAiCoveragePlanMergeEligibilityResult =
  | {
      ok: true
      error: null
      sourceRevision: AiCoveragePlanMergeSourceRevision
      selectedSetDigest: string
      selectedAnalyses: AiCoveragePlanMergeEligibleAnalysis[]
      sectionScope: AiCoveragePlanMergeSectionScope
    }
  | {
      ok: false
      error: string
      sourceRevision: null
      selectedSetDigest: null
      selectedAnalyses: []
      sectionScope: null
    }

type CurrentRecordResolution = {
  record: PersistedSectionCoveragePlanRecord
  analysisRef: AiCoveragePlanMergeSelectedAnalysisRef
  context: AiSectionCoveragePlanContext
  section: AiCoveragePlanMergeSectionScopeEntry
}

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

function isExactBoundedString(value: unknown, maxLength: number): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maxLength &&
    value === value.trim()
  )
}

function compareCodeUnits(left: string, right: string) {
  if (left === right) {
    return 0
  }

  return left < right ? -1 : 1
}

function hashString(value: string) {
  let hash = 2166136261

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return (hash >>> 0).toString(16).padStart(8, '0')
}

function createStableHash(value: string) {
  return `${hashString(value)}${hashString(`merge\u001f${value}`)}`
}

function canonicalizePlan(plan: AiSectionCoveragePlan) {
  return {
    schemaVersion: plan.schemaVersion,
    coverageAreas: plan.coverageAreas.map((area) => ({
      id: area.id,
      name: area.name,
      summary: area.summary,
      behaviors: [...area.behaviors],
      evidence: [...area.evidence],
      evidenceSupport: area.evidenceSupport,
      ...(area.behaviorEvidence === undefined ? {} : { behaviorEvidence: area.behaviorEvidence.map((item) => ({ behavior: item.behavior, evidence: [...item.evidence] })) }),
    })),
    actors: [...plan.actors],
    states: [...plan.states],
    inputs: [...plan.inputs],
    failureModes: [...plan.failureModes],
    integrationRisks: [...plan.integrationRisks],
    permissionsSecurity: [...plan.permissionsSecurity],
    dataPersistenceConcerns: [...plan.dataPersistenceConcerns],
    ambiguities: plan.ambiguities.map((ambiguity) => ({
      id: ambiguity.id,
      question: ambiguity.question,
      whyItMatters: ambiguity.whyItMatters,
      severity: ambiguity.severity,
    })),
    nextCoverage: plan.nextCoverage.map((item) => ({
      id: item.id,
      title: item.title,
      rationale: item.rationale,
      priority: item.priority,
    })),
    warnings: [...plan.warnings],
  }
}

export function createAiCoveragePlanMergePlanFingerprint(
  plan: AiSectionCoveragePlan,
) {
  return `section-plan-${createStableHash(JSON.stringify(canonicalizePlan(plan)))}`
}

function createAnalysisIdentityParts(
  record: PersistedSectionCoveragePlanRecord,
  planFingerprint: string,
) {
  return [
    record.id,
    record.analyzedAt,
    planFingerprint,
    record.sectionIdentity.sectionId,
    record.sectionIdentity.stableKey,
    record.sectionIdentity.contentFingerprint,
  ]
}

export function createAiCoveragePlanMergeSelectedAnalysisRef(
  record: PersistedSectionCoveragePlanRecord,
): AiCoveragePlanMergeSelectedAnalysisRef {
  const planFingerprint = createAiCoveragePlanMergePlanFingerprint(record.plan)
  const identity = createAnalysisIdentityParts(record, planFingerprint).join(
    '\u001f',
  )

  return {
    analysisRefId: `merge-analysis-ref-${createStableHash(identity)}`,
    sectionPlanRecordId: record.id,
    analyzedAt: record.analyzedAt,
    planFingerprint,
    sectionId: record.sectionIdentity.sectionId,
    stableKey: record.sectionIdentity.stableKey,
    contentFingerprint: record.sectionIdentity.contentFingerprint,
  }
}

function createSelectedAnalysisSortKey(
  analysisRef: AiCoveragePlanMergeSelectedAnalysisRef,
) {
  return [
    analysisRef.sectionId,
    analysisRef.stableKey,
    analysisRef.contentFingerprint,
    analysisRef.sectionPlanRecordId,
    analysisRef.analyzedAt,
    analysisRef.planFingerprint,
    analysisRef.analysisRefId,
  ].join('\u001f')
}

export function createAiCoveragePlanMergeSelectedSetDigest(
  selectedAnalyses: readonly AiCoveragePlanMergeSelectedAnalysisRef[],
) {
  const canonicalSelection = [...selectedAnalyses]
    .sort((left, right) =>
      compareCodeUnits(
        createSelectedAnalysisSortKey(left),
        createSelectedAnalysisSortKey(right),
      ),
    )
    .map((analysisRef) => ({
      analysisRefId: analysisRef.analysisRefId,
      sectionPlanRecordId: analysisRef.sectionPlanRecordId,
      analyzedAt: analysisRef.analyzedAt,
      planFingerprint: analysisRef.planFingerprint,
      sectionId: analysisRef.sectionId,
      stableKey: analysisRef.stableKey,
      contentFingerprint: analysisRef.contentFingerprint,
    }))

  return `merge-selected-set-${createStableHash(
    JSON.stringify(canonicalSelection),
  )}`
}

function parseSelectedRecord(
  value: unknown,
): PersistedSectionCoveragePlanRecord | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'id',
      'sourceIdentity',
      'sectionIdentity',
      'sectionSnapshot',
      'analyzedAt',
      'plan',
    ]) ||
    !isExactBoundedString(value.id, SECTION_PLAN_RECORD_ID_MAX_LENGTH) ||
    !isRecord(value.sourceIdentity) ||
    !isRecord(value.sectionIdentity) ||
    !isRecord(value.sectionSnapshot)
  ) {
    return null
  }

  try {
    const sectionSnapshot = value.sectionSnapshot
    const parsedRecord = createPersistedSectionCoveragePlanRecord({
      context: {
        sourceIdentity: value.sourceIdentity as AiSectionCoveragePlanContext['sourceIdentity'],
        sectionIdentity:
          value.sectionIdentity as AiSectionCoveragePlanContext['sectionIdentity'],
        sectionSnapshot:
          sectionSnapshot as AiSectionCoveragePlanContext['sectionSnapshot'],
        visibleSection: {
          content: '',
          packedCharacterCount:
            sectionSnapshot.visibleCharacterCount as number,
          truncated: sectionSnapshot.truncated as boolean,
        },
      },
      plan: value.plan as AiSectionCoveragePlan,
      analyzedAt: value.analyzedAt as string,
    })

    return { ...parsedRecord, id: value.id }
  } catch {
    return null
  }
}

function areStringListsEqual(left: readonly string[], right: readonly string[]) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  )
}

function areSectionsEqual(left: QaSourceSection, right: QaSourceSection) {
  return (
    left.id === right.id &&
    left.stableKey === right.stableKey &&
    left.ordinal === right.ordinal &&
    left.title === right.title &&
    left.level === right.level &&
    areStringListsEqual(left.path, right.path) &&
    left.startOffset === right.startOffset &&
    left.endOffset === right.endOffset &&
    left.startLine === right.startLine &&
    left.endLine === right.endLine &&
    left.characterCount === right.characterCount &&
    left.contentFingerprint === right.contentFingerprint &&
    left.preview === right.preview &&
    left.includedInCoverage === right.includedInCoverage
  )
}

function isCanonicalSectionIndex(
  candidate: QaSourceSectionIndex,
  canonical: QaSourceSectionIndex,
) {
  return (
    candidate.qaSourceId === canonical.qaSourceId &&
    candidate.qaSourceCreatedAt === canonical.qaSourceCreatedAt &&
    candidate.qaSourceUpdatedAt === canonical.qaSourceUpdatedAt &&
    candidate.sourceFingerprint === canonical.sourceFingerprint &&
    candidate.schemaVersion === canonical.schemaVersion &&
    candidate.sectionerVersion === canonical.sectionerVersion &&
    candidate.sourceLength === canonical.sourceLength &&
    candidate.sectionSetFingerprint === canonical.sectionSetFingerprint &&
    areStringListsEqual(candidate.warnings, canonical.warnings) &&
    candidate.sections.length === canonical.sections.length &&
    candidate.sections.every((section, index) =>
      areSectionsEqual(section, canonical.sections[index]),
    )
  )
}

function truncateAtUnicodeBoundary(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value
  }

  let result = value.slice(0, maxLength)
  const finalCodeUnit = result.charCodeAt(result.length - 1)

  if (finalCodeUnit >= 0xd800 && finalCodeUnit <= 0xdbff) {
    result = result.slice(0, -1)
  }

  return result
}

function getVisibleEndLine(startLine: number, visibleContent: string) {
  if (visibleContent.length === 0) {
    return startLine
  }

  const finalVisibleIndex = visibleContent.length - 1
  let line = startLine

  for (let index = 0; index < finalVisibleIndex; index += 1) {
    const character = visibleContent[index]

    if (character === '\r' && visibleContent[index + 1] === '\n') {
      if (index + 2 <= finalVisibleIndex) {
        line += 1
      }

      index += 1
      continue
    }

    if (
      (character === '\r' || character === '\n') &&
      index + 1 <= finalVisibleIndex
    ) {
      line += 1
    }
  }

  return line
}

function createSectionScopeEntry(
  qaSource: QaSource,
  section: QaSourceSection,
): AiCoveragePlanMergeSectionScopeEntry {
  const canonicalContent = qaSource.content.slice(
    section.startOffset,
    section.endOffset,
  )
  const visibleContent = truncateAtUnicodeBoundary(
    canonicalContent,
    AI_SECTION_COVERAGE_PLAN_MAX_VISIBLE_CHARACTERS,
  )

  return {
    sectionId: section.id,
    stableKey: section.stableKey,
    contentFingerprint: section.contentFingerprint,
    ordinal: section.ordinal,
    title: section.title,
    path: [...section.path],
    startLine: section.startLine,
    endLine: section.endLine,
    characterCount: section.characterCount,
    visibleCharacterCount: visibleContent.length,
    visibleEndLine: getVisibleEndLine(section.startLine, visibleContent),
    truncated: visibleContent.length < section.characterCount,
  }
}

function hasExactSourceBackedEvidence(
  plan: AiSectionCoveragePlan,
  visibleSectionContent: string,
) {
  return plan.coverageAreas.every((area) =>
    area.evidence.every((excerpt) => visibleSectionContent.includes(excerpt)),
  )
}

function resolveCurrentRecord(
  record: PersistedSectionCoveragePlanRecord,
  qaSource: QaSource,
  sectionIndex: QaSourceSectionIndex,
): CurrentRecordResolution | null {
  if (!getSectionCoveragePlanFreshness(record, qaSource, sectionIndex).isFresh) {
    return null
  }

  const contextResult = resolveAiSectionCoveragePlanContext({
    qaSource,
    sectionIndex,
    selectedSection: {
      sectionId: record.sectionIdentity.sectionId,
      stableKey: record.sectionIdentity.stableKey,
    },
  })

  if (!contextResult.ok) {
    return null
  }

  const { context } = contextResult

  if (
    record.sectionSnapshot.visibleCharacterCount !==
      context.visibleSection.packedCharacterCount ||
    record.sectionSnapshot.truncated !== context.visibleSection.truncated ||
    new Date(record.analyzedAt).getTime() <
      new Date(qaSource.updatedAt).getTime() ||
    !hasExactSourceBackedEvidence(record.plan, context.visibleSection.content)
  ) {
    return null
  }

  const canonicalSection = sectionIndex.sections.find(
    (section) =>
      section.id === record.sectionIdentity.sectionId &&
      section.stableKey === record.sectionIdentity.stableKey,
  )

  if (!canonicalSection || !canonicalSection.includedInCoverage) {
    return null
  }

  return {
    record,
    analysisRef: createAiCoveragePlanMergeSelectedAnalysisRef(record),
    context,
    section: createSectionScopeEntry(qaSource, canonicalSection),
  }
}

function createFailure(error: string): ResolveAiCoveragePlanMergeEligibilityResult {
  return {
    ok: false,
    error,
    sourceRevision: null,
    selectedSetDigest: null,
    selectedAnalyses: [],
    sectionScope: null,
  }
}

function createSourceRevision(
  qaSource: QaSource,
  sectionIndex: QaSourceSectionIndex,
): AiCoveragePlanMergeSourceRevision {
  return {
    qaSourceId: qaSource.id,
    qaSourceCreatedAt: qaSource.createdAt,
    qaSourceUpdatedAt: qaSource.updatedAt,
    sourceFingerprint: sectionIndex.sourceFingerprint,
    sectionSchemaVersion: sectionIndex.schemaVersion,
    sectionerVersion: sectionIndex.sectionerVersion,
    sectionSetFingerprint: sectionIndex.sectionSetFingerprint,
  }
}

function createSectionScope({
  qaSource,
  sectionIndex,
  selectedAnalyses,
  allRecords,
}: {
  qaSource: QaSource
  sectionIndex: QaSourceSectionIndex
  selectedAnalyses: AiCoveragePlanMergeEligibleAnalysis[]
  allRecords: readonly unknown[]
}): AiCoveragePlanMergeSectionScope {
  const selectedBySection = new Map(
    selectedAnalyses.map((analysis) => [
      `${analysis.analysisRef.sectionId}\u001f${analysis.analysisRef.stableKey}`,
      analysis,
    ]),
  )
  const parsedRecords = allRecords
    .map(parseSelectedRecord)
    .filter(
      (record): record is PersistedSectionCoveragePlanRecord => record !== null,
    )
  const scope: AiCoveragePlanMergeSectionScope = {
    selected: [],
    unselected: [],
    stale: [],
    unanalyzed: [],
    excluded: [],
  }

  sectionIndex.sections.forEach((section) => {
    const entry = createSectionScopeEntry(qaSource, section)

    if (!section.includedInCoverage) {
      scope.excluded.push(entry)
      return
    }

    const identityKey = `${section.id}\u001f${section.stableKey}`
    const selected = selectedBySection.get(identityKey)

    if (selected) {
      scope.selected.push({
        ...entry,
        analysisRefId: selected.analysisRef.analysisRefId,
      })
      return
    }

    const matchingRecords = parsedRecords.filter(
      (record) =>
        record.sourceIdentity.qaSourceId === qaSource.id &&
        record.sectionIdentity.sectionId === section.id &&
        record.sectionIdentity.stableKey === section.stableKey,
    )

    if (
      matchingRecords.some((record) =>
        Boolean(resolveCurrentRecord(record, qaSource, sectionIndex)),
      )
    ) {
      scope.unselected.push(entry)
    } else if (matchingRecords.length > 0) {
      scope.stale.push(entry)
    } else {
      scope.unanalyzed.push(entry)
    }
  })

  return scope
}

export function resolveAiCoveragePlanMergeEligibility({
  qaSource,
  sectionIndex,
  selectedRecords,
  allRecords = selectedRecords,
}: {
  qaSource: QaSource
  sectionIndex: QaSourceSectionIndex
  selectedRecords: readonly unknown[]
  allRecords?: readonly unknown[]
}): ResolveAiCoveragePlanMergeEligibilityResult {
  if (
    selectedRecords.length < AI_COVERAGE_PLAN_MERGE_MIN_SELECTED_RECORDS ||
    selectedRecords.length > AI_COVERAGE_PLAN_MERGE_MAX_SELECTED_RECORDS
  ) {
    return createFailure('Select between 2 and 8 current section analyses.')
  }

  if (
    !isExactBoundedString(qaSource.id, 200) ||
    !isExactBoundedString(sectionIndex.qaSourceId, 200)
  ) {
    return createFailure('The current QA Source identity is not valid.')
  }

  const canonicalIndex = createQaSourceSectionIndex(
    qaSource,
    sectionIndex.indexedAt,
  )

  if (!isCanonicalSectionIndex(sectionIndex, canonicalIndex)) {
    return createFailure(
      'The section index does not match the current canonical QA Source.',
    )
  }

  const parsedRecords = selectedRecords.map(parseSelectedRecord)

  if (
    parsedRecords.some(
      (record): record is null => record === null,
    )
  ) {
    return createFailure('A selected section analysis record is malformed.')
  }

  const records = parsedRecords as PersistedSectionCoveragePlanRecord[]
  const recordIds = new Set<string>()
  const sectionIdentities = new Set<string>()
  const currentRecords: CurrentRecordResolution[] = []

  for (const record of records) {
    if (recordIds.has(record.id)) {
      return createFailure('Selected section analysis record IDs must be unique.')
    }

    recordIds.add(record.id)

    const sectionIdentity = [
      record.sectionIdentity.sectionId,
      record.sectionIdentity.stableKey,
    ].join('\u001f')

    if (sectionIdentities.has(sectionIdentity)) {
      return createFailure('Each current section may be selected only once.')
    }

    sectionIdentities.add(sectionIdentity)

    if (
      record.sourceIdentity.qaSourceId !== qaSource.id ||
      record.sourceIdentity.qaSourceCreatedAt !== qaSource.createdAt ||
      record.sourceIdentity.qaSourceUpdatedAt !== qaSource.updatedAt ||
      record.sourceIdentity.sourceFingerprint !== canonicalIndex.sourceFingerprint ||
      record.sectionIdentity.sectionSchemaVersion !== canonicalIndex.schemaVersion ||
      record.sectionIdentity.sectionerVersion !== canonicalIndex.sectionerVersion
    ) {
      return createFailure(
        'All selected section analyses must match the exact current QA Source revision.',
      )
    }

    const currentRecord = resolveCurrentRecord(record, qaSource, canonicalIndex)

    if (!currentRecord) {
      return createFailure(
        'Every selected section analysis must be current and source-backed.',
      )
    }

    currentRecords.push(currentRecord)
  }

  const analysisIdentities = new Set<string>()

  for (const currentRecord of currentRecords) {
    const analysisIdentity = [
      currentRecord.analysisRef.sectionPlanRecordId,
      currentRecord.analysisRef.analyzedAt,
      currentRecord.analysisRef.planFingerprint,
    ].join('\u001f')

    if (analysisIdentities.has(analysisIdentity)) {
      return createFailure('Selected analysis identities must be unique.')
    }

    analysisIdentities.add(analysisIdentity)
  }

  const selectedAnalyses = currentRecords.sort((left, right) => {
    if (left.section.ordinal !== right.section.ordinal) {
      return left.section.ordinal - right.section.ordinal
    }

    return compareCodeUnits(left.section.stableKey, right.section.stableKey)
  })
  const selectedSetDigest = createAiCoveragePlanMergeSelectedSetDigest(
    selectedAnalyses.map(({ analysisRef }) => analysisRef),
  )
  const sectionScope = createSectionScope({
    qaSource,
    sectionIndex: canonicalIndex,
    selectedAnalyses,
    allRecords,
  })

  return {
    ok: true,
    error: null,
    sourceRevision: createSourceRevision(qaSource, canonicalIndex),
    selectedSetDigest,
    selectedAnalyses,
    sectionScope,
  }
}
