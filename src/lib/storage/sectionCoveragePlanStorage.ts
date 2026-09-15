import {
  AI_COVERAGE_PLAN_AMBIGUITY_MAX_COUNT,
  AI_COVERAGE_PLAN_AREA_MAX_COUNT,
  AI_COVERAGE_PLAN_NEXT_AREA_MAX_COUNT,
  AI_COVERAGE_PLAN_NOTE_MAX_COUNT,
  AI_COVERAGE_PLAN_TEXT_MAX_LENGTH,
} from '../../features/ai-suggestions/aiCoveragePlanValidation'
import {
  AI_COVERAGE_PLAN_SECTION_ID_MAX_LENGTH,
  AI_COVERAGE_PLAN_SECTION_PATH_MAX_DEPTH,
  AI_COVERAGE_PLAN_SECTION_PATH_SEGMENT_MAX_LENGTH,
  AI_COVERAGE_PLAN_SECTION_STABLE_KEY_MAX_LENGTH,
  AI_COVERAGE_PLAN_SECTION_TITLE_MAX_LENGTH,
} from '../../features/ai-suggestions/aiCoveragePlanSectionContext'
import {
  AI_SECTION_COVERAGE_PLAN_EVIDENCE_MAX_COUNT,
  AI_SECTION_COVERAGE_PLAN_EVIDENCE_MAX_LENGTH,
} from '../../features/ai-suggestions/aiSectionCoveragePlanValidation'
import {
  AI_SECTION_COVERAGE_PLAN_EVIDENCE_SUPPORT_VALUES,
  AI_SECTION_COVERAGE_PLAN_PRIORITIES,
  AI_SECTION_COVERAGE_PLAN_SCHEMA_VERSION,
  getSectionBehaviorGrounding,
  type AiSectionBehaviorEvidence,
  type AiSectionCoveragePlan,
  type AiSectionCoveragePlanContext,
  type PersistedSectionCoveragePlanRecord,
} from '../../features/ai-suggestions/aiSectionCoveragePlanTypes'
import { resolveAiSectionCoveragePlanContext } from '../../features/ai-suggestions/aiSectionCoveragePlanContext'
import {
  QA_SOURCE_SECTION_SCHEMA_VERSION,
  QA_SOURCE_SECTIONER_VERSION,
  createQaSourceSectionSourceFingerprint,
  type QaSourceSectionIndex,
} from '../../features/qa-sources/qaSourceSections'
import type { QaSource } from '../../features/qa-sources/qaSourceTypes'

export const SECTION_COVERAGE_PLAN_STORAGE_KEY =
  'qa-mission-control:ai-section-coverage-plans:v0.21'
export const SECTION_COVERAGE_PLAN_STORAGE_SCHEMA_VERSION = 1

const SECTION_COVERAGE_PLAN_RECORD_MAX_COUNT = 500
const RECORD_ID_MAX_LENGTH = 200
const SOURCE_FINGERPRINT_MAX_LENGTH = 160
const SECTION_FINGERPRINT_MAX_LENGTH = 160
const VERSION_MAX_LENGTH = 100

type SectionCoveragePlanStore = {
  storageSchemaVersion: typeof SECTION_COVERAGE_PLAN_STORAGE_SCHEMA_VERSION
  records: PersistedSectionCoveragePlanRecord[]
}

export type LoadSectionCoveragePlansResult = {
  records: PersistedSectionCoveragePlanRecord[]
  error: string | null
}

export type SaveSectionCoveragePlansResult = {
  ok: boolean
  error: string | null
}

export type SectionCoveragePlanFreshness = {
  isFresh: boolean
  reasons: string[]
}

const FORBIDDEN_PERSISTED_KEYS = new Set([
  'content',
  'preview',
  'startoffset',
  'endoffset',
  'prompt',
  'messages',
  'responseschema',
  'rawresponse',
  'rawproviderresponse',
  'providerpayload',
  'apikey',
  'secret',
  'token',
  'usage',
  'providerusage',
  'model',
  'suggestion',
  'suggestions',
  'testcasesuggestion',
  'testcasesuggestions',
  'approval',
  'approvals',
  'import',
  'imports',
  'readiness',
  'generationreadiness',
  'requesterror',
  'inflight',
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

function normalizeKey(value: string) {
  return value.replace(/[-_\s]/g, '').toLowerCase()
}

function hasForbiddenPersistedKey(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(hasForbiddenPersistedKey)
  }

  if (!isRecord(value)) {
    return false
  }

  return Object.entries(value).some(
    ([key, nestedValue]) =>
      FORBIDDEN_PERSISTED_KEYS.has(normalizeKey(key)) ||
      hasForbiddenPersistedKey(nestedValue),
  )
}

function isExactBoundedString(value: unknown, maxLength: number): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maxLength &&
    value === value.trim()
  )
}

function isIsoTimestamp(value: unknown): value is string {
  if (!isExactBoundedString(value, 64)) {
    return false
  }

  const date = new Date(value)

  return !Number.isNaN(date.getTime()) && date.toISOString() === value
}

function isSafeNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0
}

function isSafePositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0
}

function parseExactStringList(
  value: unknown,
  maxCount = AI_COVERAGE_PLAN_NOTE_MAX_COUNT,
  maxLength = AI_COVERAGE_PLAN_TEXT_MAX_LENGTH,
) {
  if (
    !Array.isArray(value) ||
    value.length > maxCount ||
    !value.every((item) => isExactBoundedString(item, maxLength))
  ) {
    return null
  }

  return [...value] as string[]
}

function parsePersistedPlan(value: unknown): AiSectionCoveragePlan | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'schemaVersion',
      'coverageAreas',
      'actors',
      'states',
      'inputs',
      'failureModes',
      'integrationRisks',
      'permissionsSecurity',
      'dataPersistenceConcerns',
      'ambiguities',
      'nextCoverage',
      'warnings',
    ]) ||
    value.schemaVersion !== AI_SECTION_COVERAGE_PLAN_SCHEMA_VERSION ||
    !Array.isArray(value.coverageAreas) ||
    value.coverageAreas.length > AI_COVERAGE_PLAN_AREA_MAX_COUNT ||
    !Array.isArray(value.ambiguities) ||
    value.ambiguities.length > AI_COVERAGE_PLAN_AMBIGUITY_MAX_COUNT ||
    !Array.isArray(value.nextCoverage) ||
    value.nextCoverage.length > AI_COVERAGE_PLAN_NEXT_AREA_MAX_COUNT
  ) {
    return null
  }

  const seenIds = new Set<string>()
  const coverageAreas = value.coverageAreas.map((area) => {
    if (
      !isRecord(area) ||
      !hasExactKeys(area, [
        'id',
        'name',
        'summary',
        'behaviors',
        'evidence',
        'evidenceSupport',
        ...(Object.hasOwn(area, 'behaviorEvidence') ? ['behaviorEvidence'] : []),
      ]) ||
      !isExactBoundedString(area.id, RECORD_ID_MAX_LENGTH) ||
      seenIds.has(area.id) ||
      !isExactBoundedString(area.name, 120) ||
      !isExactBoundedString(area.summary, AI_COVERAGE_PLAN_TEXT_MAX_LENGTH) ||
      !AI_SECTION_COVERAGE_PLAN_EVIDENCE_SUPPORT_VALUES.includes(
        area.evidenceSupport as 'source_backed' | 'needs_review',
      )
    ) {
      return null
    }

    const behaviors = parseExactStringList(area.behaviors)
    const evidence = parseExactStringList(
      area.evidence,
      AI_SECTION_COVERAGE_PLAN_EVIDENCE_MAX_COUNT,
      AI_SECTION_COVERAGE_PLAN_EVIDENCE_MAX_LENGTH,
    )

    if (
      !behaviors ||
      !evidence ||
      new Set(evidence).size !== evidence.length
    ) {
      return null
    }

    let behaviorEvidence: AiSectionBehaviorEvidence[] | undefined
    if (area.behaviorEvidence !== undefined) {
      if (!Array.isArray(area.behaviorEvidence) || area.behaviorEvidence.length > AI_COVERAGE_PLAN_NOTE_MAX_COUNT) return null
      behaviorEvidence = []
      for (const item of area.behaviorEvidence) {
        if (!isRecord(item) || !hasExactKeys(item, ['behavior', 'evidence']) || typeof item.behavior !== 'string' ||
          !behaviors.includes(item.behavior) || behaviorEvidence.some((entry) => entry.behavior === item.behavior)) return null
        const quotes = parseExactStringList(item.evidence, AI_SECTION_COVERAGE_PLAN_EVIDENCE_MAX_COUNT, AI_SECTION_COVERAGE_PLAN_EVIDENCE_MAX_LENGTH)
        if (!quotes || new Set(quotes).size !== quotes.length) return null
        behaviorEvidence.push({ behavior: item.behavior, evidence: quotes })
      }
    }
    // Existing v1 records retain their evidence and interpretation unchanged.
    // The UI independently labels their absent behavior associations as unverified.
    const sourceBacked = behaviorEvidence === undefined ? evidence.length > 0
      : getSectionBehaviorGrounding({ name: area.name, summary: area.summary, behaviors, evidence, behaviorEvidence }).status === 'linked'
    if ((area.evidenceSupport === 'source_backed') !== sourceBacked) return null

    seenIds.add(area.id)

    return {
      id: area.id,
      name: area.name,
      summary: area.summary,
      behaviors,
      evidence,
      ...(behaviorEvidence === undefined ? {} : { behaviorEvidence }),
      evidenceSupport: area.evidenceSupport as 'source_backed' | 'needs_review',
    }
  })

  if (coverageAreas.some((area) => area === null)) {
    return null
  }

  const ambiguities = value.ambiguities.map((ambiguity) => {
    if (
      !isRecord(ambiguity) ||
      !hasExactKeys(ambiguity, [
        'id',
        'question',
        'whyItMatters',
        'severity',
      ]) ||
      !isExactBoundedString(ambiguity.id, RECORD_ID_MAX_LENGTH) ||
      seenIds.has(ambiguity.id) ||
      !isExactBoundedString(
        ambiguity.question,
        AI_COVERAGE_PLAN_TEXT_MAX_LENGTH,
      ) ||
      !isExactBoundedString(
        ambiguity.whyItMatters,
        AI_COVERAGE_PLAN_TEXT_MAX_LENGTH,
      ) ||
      !AI_SECTION_COVERAGE_PLAN_PRIORITIES.includes(
        ambiguity.severity as 'high' | 'medium' | 'low',
      )
    ) {
      return null
    }

    seenIds.add(ambiguity.id)

    return {
      id: ambiguity.id,
      question: ambiguity.question,
      whyItMatters: ambiguity.whyItMatters,
      severity: ambiguity.severity as 'high' | 'medium' | 'low',
    }
  })

  if (ambiguities.some((ambiguity) => ambiguity === null)) {
    return null
  }

  const nextCoverage = value.nextCoverage.map((item) => {
    if (
      !isRecord(item) ||
      !hasExactKeys(item, ['id', 'title', 'rationale', 'priority']) ||
      !isExactBoundedString(item.id, RECORD_ID_MAX_LENGTH) ||
      seenIds.has(item.id) ||
      !isExactBoundedString(item.title, 160) ||
      !isExactBoundedString(item.rationale, AI_COVERAGE_PLAN_TEXT_MAX_LENGTH) ||
      !AI_SECTION_COVERAGE_PLAN_PRIORITIES.includes(
        item.priority as 'high' | 'medium' | 'low',
      )
    ) {
      return null
    }

    seenIds.add(item.id)

    return {
      id: item.id,
      title: item.title,
      rationale: item.rationale,
      priority: item.priority as 'high' | 'medium' | 'low',
    }
  })

  if (nextCoverage.some((item) => item === null)) {
    return null
  }

  const actors = parseExactStringList(value.actors)
  const states = parseExactStringList(value.states)
  const inputs = parseExactStringList(value.inputs)
  const failureModes = parseExactStringList(value.failureModes)
  const integrationRisks = parseExactStringList(value.integrationRisks)
  const permissionsSecurity = parseExactStringList(value.permissionsSecurity)
  const dataPersistenceConcerns = parseExactStringList(
    value.dataPersistenceConcerns,
  )
  const warnings = parseExactStringList(value.warnings)

  if (
    !actors ||
    !states ||
    !inputs ||
    !failureModes ||
    !integrationRisks ||
    !permissionsSecurity ||
    !dataPersistenceConcerns ||
    !warnings
  ) {
    return null
  }

  return {
    schemaVersion: AI_SECTION_COVERAGE_PLAN_SCHEMA_VERSION,
    coverageAreas: coverageAreas as AiSectionCoveragePlan['coverageAreas'],
    actors,
    states,
    inputs,
    failureModes,
    integrationRisks,
    permissionsSecurity,
    dataPersistenceConcerns,
    ambiguities: ambiguities as AiSectionCoveragePlan['ambiguities'],
    nextCoverage: nextCoverage as AiSectionCoveragePlan['nextCoverage'],
    warnings,
  }
}

export function parsePersistedRecord(
  value: unknown,
): PersistedSectionCoveragePlanRecord | null {
  if (
    !isRecord(value) ||
    hasForbiddenPersistedKey(value) ||
    !hasExactKeys(value, [
      'id',
      'sourceIdentity',
      'sectionIdentity',
      'sectionSnapshot',
      'analyzedAt',
      'plan',
    ]) ||
    !isExactBoundedString(value.id, RECORD_ID_MAX_LENGTH) ||
    !isRecord(value.sourceIdentity) ||
    !hasExactKeys(value.sourceIdentity, [
      'qaSourceId',
      'qaSourceCreatedAt',
      'qaSourceUpdatedAt',
      'sourceFingerprint',
    ]) ||
    !isExactBoundedString(
      value.sourceIdentity.qaSourceId,
      AI_COVERAGE_PLAN_SECTION_ID_MAX_LENGTH,
    ) ||
    !isIsoTimestamp(value.sourceIdentity.qaSourceCreatedAt) ||
    !isIsoTimestamp(value.sourceIdentity.qaSourceUpdatedAt) ||
    !isExactBoundedString(
      value.sourceIdentity.sourceFingerprint,
      SOURCE_FINGERPRINT_MAX_LENGTH,
    ) ||
    !isRecord(value.sectionIdentity) ||
    !hasExactKeys(value.sectionIdentity, [
      'sectionId',
      'stableKey',
      'contentFingerprint',
      'sectionSchemaVersion',
      'sectionerVersion',
    ]) ||
    !isExactBoundedString(
      value.sectionIdentity.sectionId,
      AI_COVERAGE_PLAN_SECTION_ID_MAX_LENGTH,
    ) ||
    !isExactBoundedString(
      value.sectionIdentity.stableKey,
      AI_COVERAGE_PLAN_SECTION_STABLE_KEY_MAX_LENGTH,
    ) ||
    !isExactBoundedString(
      value.sectionIdentity.contentFingerprint,
      SECTION_FINGERPRINT_MAX_LENGTH,
    ) ||
    !isExactBoundedString(
      value.sectionIdentity.sectionSchemaVersion,
      VERSION_MAX_LENGTH,
    ) ||
    value.sectionIdentity.sectionSchemaVersion !==
      QA_SOURCE_SECTION_SCHEMA_VERSION ||
    !isExactBoundedString(
      value.sectionIdentity.sectionerVersion,
      VERSION_MAX_LENGTH,
    ) ||
    value.sectionIdentity.sectionerVersion !== QA_SOURCE_SECTIONER_VERSION ||
    !isRecord(value.sectionSnapshot) ||
    !hasExactKeys(value.sectionSnapshot, [
      'ordinal',
      'title',
      'path',
      'startLine',
      'endLine',
      'characterCount',
      'visibleCharacterCount',
      'truncated',
    ]) ||
    !isSafePositiveInteger(value.sectionSnapshot.ordinal) ||
    !isExactBoundedString(
      value.sectionSnapshot.title,
      AI_COVERAGE_PLAN_SECTION_TITLE_MAX_LENGTH,
    ) ||
    !Array.isArray(value.sectionSnapshot.path) ||
    value.sectionSnapshot.path.length === 0 ||
    value.sectionSnapshot.path.length > AI_COVERAGE_PLAN_SECTION_PATH_MAX_DEPTH ||
    !value.sectionSnapshot.path.every((segment) =>
      isExactBoundedString(
        segment,
        AI_COVERAGE_PLAN_SECTION_PATH_SEGMENT_MAX_LENGTH,
      ),
    ) ||
    !isSafePositiveInteger(value.sectionSnapshot.startLine) ||
    !isSafePositiveInteger(value.sectionSnapshot.endLine) ||
    value.sectionSnapshot.endLine < value.sectionSnapshot.startLine ||
    !isSafeNonNegativeInteger(value.sectionSnapshot.characterCount) ||
    !isSafeNonNegativeInteger(value.sectionSnapshot.visibleCharacterCount) ||
    value.sectionSnapshot.visibleCharacterCount >
      value.sectionSnapshot.characterCount ||
    typeof value.sectionSnapshot.truncated !== 'boolean' ||
    value.sectionSnapshot.truncated !==
      (value.sectionSnapshot.visibleCharacterCount <
        value.sectionSnapshot.characterCount) ||
    !isIsoTimestamp(value.analyzedAt)
  ) {
    return null
  }

  const plan = parsePersistedPlan(value.plan)

  if (!plan) {
    return null
  }

  return {
    id: value.id,
    sourceIdentity: {
      qaSourceId: value.sourceIdentity.qaSourceId,
      qaSourceCreatedAt: value.sourceIdentity.qaSourceCreatedAt,
      qaSourceUpdatedAt: value.sourceIdentity.qaSourceUpdatedAt,
      sourceFingerprint: value.sourceIdentity.sourceFingerprint,
    },
    sectionIdentity: {
      sectionId: value.sectionIdentity.sectionId,
      stableKey: value.sectionIdentity.stableKey,
      contentFingerprint: value.sectionIdentity.contentFingerprint,
      sectionSchemaVersion: value.sectionIdentity.sectionSchemaVersion,
      sectionerVersion: value.sectionIdentity.sectionerVersion,
    },
    sectionSnapshot: {
      ordinal: value.sectionSnapshot.ordinal,
      title: value.sectionSnapshot.title,
      path: [...value.sectionSnapshot.path] as string[],
      startLine: value.sectionSnapshot.startLine,
      endLine: value.sectionSnapshot.endLine,
      characterCount: value.sectionSnapshot.characterCount,
      visibleCharacterCount: value.sectionSnapshot.visibleCharacterCount,
      truncated: value.sectionSnapshot.truncated,
    },
    analyzedAt: value.analyzedAt,
    plan,
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

function getIdentityKey(record: PersistedSectionCoveragePlanRecord) {
  return [
    record.sourceIdentity.qaSourceId,
    record.sectionIdentity.sectionId,
    record.sectionIdentity.stableKey,
  ].join('\u001f')
}

function sortRecords(records: PersistedSectionCoveragePlanRecord[]) {
  return [...records].sort((left, right) => {
    const sourceComparison = left.sourceIdentity.qaSourceId.localeCompare(
      right.sourceIdentity.qaSourceId,
    )

    if (sourceComparison !== 0) {
      return sourceComparison
    }

    if (left.sectionSnapshot.ordinal !== right.sectionSnapshot.ordinal) {
      return left.sectionSnapshot.ordinal - right.sectionSnapshot.ordinal
    }

    const stableKeyComparison = left.sectionIdentity.stableKey.localeCompare(
      right.sectionIdentity.stableKey,
    )

    if (stableKeyComparison !== 0) {
      return stableKeyComparison
    }

    const analyzedAtComparison = right.analyzedAt.localeCompare(left.analyzedAt)

    return analyzedAtComparison !== 0
      ? analyzedAtComparison
      : left.id.localeCompare(right.id)
  })
}

export function createPersistedSectionCoveragePlanRecord({
  context,
  plan,
  analyzedAt,
}: {
  context: AiSectionCoveragePlanContext
  plan: AiSectionCoveragePlan
  analyzedAt: string
}): PersistedSectionCoveragePlanRecord {
  const record: PersistedSectionCoveragePlanRecord = {
    id: `section-coverage-plan-${hashString(
      [
        context.sourceIdentity.qaSourceId,
        context.sectionIdentity.sectionId,
        context.sectionIdentity.stableKey,
      ].join('\u001f'),
    )}`,
    sourceIdentity: { ...context.sourceIdentity },
    sectionIdentity: { ...context.sectionIdentity },
    sectionSnapshot: {
      ...context.sectionSnapshot,
      path: [...context.sectionSnapshot.path],
      visibleCharacterCount: context.visibleSection.packedCharacterCount,
      truncated: context.visibleSection.truncated,
    },
    analyzedAt,
    plan: structuredClone(plan),
  }

  const parsedRecord = parsePersistedRecord(record)

  if (!parsedRecord) {
    throw new TypeError('Section coverage plan record is not safe to persist.')
  }

  return parsedRecord
}

export function findSectionCoveragePlanForSection(
  records: PersistedSectionCoveragePlanRecord[],
  qaSourceId: string,
  sectionId: string,
  stableKey: string,
) {
  if (
    qaSourceId !== qaSourceId.trim() ||
    sectionId !== sectionId.trim() ||
    stableKey !== stableKey.trim()
  ) {
    return null
  }

  return (
    records.find(
      (record) =>
        record.sourceIdentity.qaSourceId === qaSourceId &&
        record.sectionIdentity.sectionId === sectionId &&
        record.sectionIdentity.stableKey === stableKey,
    ) ?? null
  )
}

export function upsertSectionCoveragePlanRecord(
  records: PersistedSectionCoveragePlanRecord[],
  nextRecord: PersistedSectionCoveragePlanRecord,
  replacedRecordId?: string,
) {
  if (
    replacedRecordId !== undefined &&
    !isExactBoundedString(replacedRecordId, RECORD_ID_MAX_LENGTH)
  ) {
    throw new TypeError('Replacement record ID must be exact and bounded.')
  }

  const identityKey = getIdentityKey(nextRecord)

  return sortRecords([
    nextRecord,
    ...records.filter(
      (record) =>
        getIdentityKey(record) !== identityKey &&
        record.id !== replacedRecordId,
    ),
  ])
}

export function removeSectionCoveragePlanForSection(
  records: PersistedSectionCoveragePlanRecord[],
  qaSourceId: string,
  sectionId: string,
  stableKey: string,
) {
  return records.filter(
    (record) =>
      record.sourceIdentity.qaSourceId !== qaSourceId ||
      record.sectionIdentity.sectionId !== sectionId ||
      record.sectionIdentity.stableKey !== stableKey,
  )
}

export function getSectionCoveragePlanFreshness(
  record: PersistedSectionCoveragePlanRecord,
  qaSource: QaSource | null,
  sectionIndex: QaSourceSectionIndex | null,
): SectionCoveragePlanFreshness {
  if (!qaSource || !sectionIndex) {
    return {
      isFresh: false,
      reasons: ['The saved section analysis source or current section index is unavailable.'],
    }
  }

  const reasons: string[] = []

  if (record.sourceIdentity.qaSourceId !== qaSource.id) {
    reasons.push('The saved section analysis belongs to a different QA Source.')
  }

  if (record.sourceIdentity.qaSourceCreatedAt !== qaSource.createdAt) {
    reasons.push('The QA Source identity changed after this analysis was saved.')
  }

  if (record.sourceIdentity.qaSourceUpdatedAt !== qaSource.updatedAt) {
    reasons.push('The QA Source revision changed after this analysis was saved.')
  }

  if (
    record.sourceIdentity.sourceFingerprint !==
    createQaSourceSectionSourceFingerprint(qaSource)
  ) {
    reasons.push('The QA Source fingerprint no longer matches the saved analysis.')
  }

  if (new Date(record.analyzedAt).getTime() < new Date(qaSource.updatedAt).getTime()) {
    reasons.push('The saved analysis predates the current QA Source revision.')
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
    reasons.push(
      'The saved section identity is not valid in the current canonical section index.',
    )
  } else {
    const { context } = contextResult

    if (
      record.sectionIdentity.sectionSchemaVersion !==
      context.sectionIdentity.sectionSchemaVersion
    ) {
      reasons.push('The section schema version changed.')
    }

    if (
      record.sectionIdentity.sectionerVersion !==
      context.sectionIdentity.sectionerVersion
    ) {
      reasons.push('The sectioner version changed.')
    }

    if (
      record.sectionIdentity.contentFingerprint !==
      context.sectionIdentity.contentFingerprint
    ) {
      reasons.push('The selected section content changed.')
    }

    if (record.sectionSnapshot.ordinal !== context.sectionSnapshot.ordinal) {
      reasons.push('The selected section ordinal changed.')
    }

    if (record.sectionSnapshot.title !== context.sectionSnapshot.title) {
      reasons.push('The selected section title changed.')
    }

    if (
      record.sectionSnapshot.path.length !== context.sectionSnapshot.path.length ||
      !record.sectionSnapshot.path.every(
        (segment, index) => segment === context.sectionSnapshot.path[index],
      )
    ) {
      reasons.push('The selected section path changed.')
    }

    if (
      record.sectionSnapshot.startLine !== context.sectionSnapshot.startLine ||
      record.sectionSnapshot.endLine !== context.sectionSnapshot.endLine
    ) {
      reasons.push('The selected section line range changed.')
    }

    if (
      record.sectionSnapshot.characterCount !==
      context.sectionSnapshot.characterCount
    ) {
      reasons.push('The selected section character count changed.')
    }
  }

  return { isFresh: reasons.length === 0, reasons }
}

export function loadSectionCoveragePlans(): LoadSectionCoveragePlansResult {
  if (typeof window === 'undefined') {
    return { records: [], error: null }
  }

  let rawValue: string | null

  try {
    rawValue = window.localStorage.getItem(SECTION_COVERAGE_PLAN_STORAGE_KEY)
  } catch {
    return {
      records: [],
      error: 'Saved section coverage plans could not be read safely.',
    }
  }

  if (!rawValue) {
    return { records: [], error: null }
  }

  let parsedValue: unknown

  try {
    parsedValue = JSON.parse(rawValue) as unknown
  } catch {
    return {
      records: [],
      error:
        'Saved section coverage plan data is not valid JSON. Existing browser data was not overwritten.',
    }
  }

  if (
    !isRecord(parsedValue) ||
    hasForbiddenPersistedKey(parsedValue) ||
    !hasExactKeys(parsedValue, ['storageSchemaVersion', 'records']) ||
    parsedValue.storageSchemaVersion !==
      SECTION_COVERAGE_PLAN_STORAGE_SCHEMA_VERSION ||
    !Array.isArray(parsedValue.records) ||
    parsedValue.records.length > SECTION_COVERAGE_PLAN_RECORD_MAX_COUNT
  ) {
    return {
      records: [],
      error:
        'Saved section coverage plan data is not in the expected format. Existing browser data was not overwritten.',
    }
  }

  const parsedRecords = parsedValue.records
    .map(parsePersistedRecord)
    .filter(
      (record): record is PersistedSectionCoveragePlanRecord => record !== null,
    )
  const sortedRecords = sortRecords(parsedRecords)
  const seenIds = new Set<string>()
  const seenIdentities = new Set<string>()
  let duplicateCount = 0
  const records = sortedRecords.filter((record) => {
    const identityKey = getIdentityKey(record)

    if (seenIds.has(record.id) || seenIdentities.has(identityKey)) {
      duplicateCount += 1
      return false
    }

    seenIds.add(record.id)
    seenIdentities.add(identityKey)
    return true
  })
  const malformedCount = parsedValue.records.length - parsedRecords.length
  const errorParts: string[] = []

  if (malformedCount > 0) {
    errorParts.push('Some malformed saved section coverage plans were ignored.')
  }

  if (duplicateCount > 0) {
    errorParts.push('Some duplicate saved section coverage plans were ignored.')
  }

  return {
    records,
    error: errorParts.length > 0 ? errorParts.join(' ') : null,
  }
}

export function saveSectionCoveragePlans(
  records: PersistedSectionCoveragePlanRecord[],
): SaveSectionCoveragePlansResult {
  if (typeof window === 'undefined') {
    return { ok: true, error: null }
  }

  if (
    !Array.isArray(records) ||
    records.length > SECTION_COVERAGE_PLAN_RECORD_MAX_COUNT
  ) {
    return {
      ok: false,
      error: 'Section coverage plans exceed the safe storage limit.',
    }
  }

  const parsedRecords = records.map(parsePersistedRecord)

  if (parsedRecords.some((record) => record === null)) {
    return {
      ok: false,
      error: 'Section coverage plans contain unsafe data and were not saved.',
    }
  }

  const safeRecords = parsedRecords as PersistedSectionCoveragePlanRecord[]
  const identityKeys = safeRecords.map(getIdentityKey)
  const ids = safeRecords.map((record) => record.id)

  if (
    new Set(identityKeys).size !== identityKeys.length ||
    new Set(ids).size !== ids.length
  ) {
    return {
      ok: false,
      error: 'Section coverage plans contain duplicate identities and were not saved.',
    }
  }

  const store: SectionCoveragePlanStore = {
    storageSchemaVersion: SECTION_COVERAGE_PLAN_STORAGE_SCHEMA_VERSION,
    records: sortRecords(safeRecords),
  }

  try {
    window.localStorage.setItem(
      SECTION_COVERAGE_PLAN_STORAGE_KEY,
      JSON.stringify(store),
    )
    return { ok: true, error: null }
  } catch {
    return {
      ok: false,
      error:
        'Section coverage plans could not be saved. Existing browser data was not changed.',
    }
  }
}
