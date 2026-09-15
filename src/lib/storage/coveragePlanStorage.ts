import {
  type AiCoveragePlan,
  type AiCoveragePlanSectionCatalog,
  type AiCoveragePlanSectionContext,
  type AiCoverageSourceSectionRef,
  AI_COVERAGE_COMPLETENESS_VALUES,
  AI_COVERAGE_PLAN_LEGACY_SCHEMA_VERSION,
  AI_COVERAGE_PLAN_PRIORITIES,
  AI_COVERAGE_PLAN_READINESSES,
  AI_COVERAGE_PLAN_SCHEMA_VERSION,
  AI_COVERAGE_SECTION_VISIBILITIES,
} from '../../features/ai-suggestions/aiCoveragePlanTypes'
import {
  AI_COVERAGE_PLAN_MERGE_DISPOSITIONS,
  AI_COVERAGE_PLAN_MERGE_FINDING_KINDS,
  AI_COVERAGE_PLAN_MERGE_ORIGIN_SCHEMA_VERSION,
  AI_COVERAGE_PLAN_MERGE_RELATION_KINDS,
  type AiCoveragePlanDirectSourceAnalysisOrigin,
  type AiCoveragePlanMergeContributorRef,
  type AiCoveragePlanMergeDurableRelation,
  type AiCoveragePlanMergeEvidenceOrigin,
  type AiCoveragePlanMergeOutputProvenance,
  type AiCoveragePlanMergeSelectedAnalysisRef,
  type AiCoveragePlanOrigin,
  type AiCoveragePlanSectionMergeOrigin,
} from '../../features/ai-suggestions/aiCoveragePlanMergeTypes'
import { enumerateAiCoveragePlanMergeOutputIdentities } from '../../features/ai-suggestions/aiCoveragePlanMergeOutputIdentity'
import {
  AI_COVERAGE_PLAN_SECTION_ID_MAX_LENGTH,
  AI_COVERAGE_PLAN_SECTION_PATH_MAX_DEPTH,
  AI_COVERAGE_PLAN_SECTION_PATH_SEGMENT_MAX_LENGTH,
  AI_COVERAGE_PLAN_SECTION_STABLE_KEY_MAX_LENGTH,
  AI_COVERAGE_PLAN_SECTION_TITLE_MAX_LENGTH,
} from '../../features/ai-suggestions/aiCoveragePlanSectionContext'
import { resolveAiCoveragePlanSectionRefs } from '../../features/ai-suggestions/aiCoveragePlanSectionRefResolution'
import type { PackedQaSourceContext } from '../../features/ai-suggestions/aiSuggestionTypes'
import type { QaSourceSectionIndex } from '../../features/qa-sources/qaSourceSections'
import {
  QA_SOURCE_STATUSES,
  QA_SOURCE_TYPES,
  type QaSource,
  type QaSourceStatus,
  type QaSourceType,
} from '../../features/qa-sources/qaSourceTypes'

export const COVERAGE_PLAN_STORAGE_KEY =
  'qa-mission-control:ai-coverage-plans:v0.18'

export const COVERAGE_PLAN_STORAGE_SCHEMA_VERSION = 1
export const COVERAGE_PLAN_STORAGE_VALIDATOR_VERSION = 1

export const COVERAGE_PLAN_MERGED_RECORD_MAX_BYTES = 512 * 1024

type CoveragePlanStorageSchemaVersion =
  typeof COVERAGE_PLAN_STORAGE_SCHEMA_VERSION

type CoveragePlanStorageValidatorVersion =
  typeof COVERAGE_PLAN_STORAGE_VALIDATOR_VERSION

export type PersistedCoveragePlanRecord = {
  id: string
  sourceIdentity: {
    qaSourceId: string
    qaSourceCreatedAt: string
    qaSourceUpdatedAt: string
    sourceFingerprint: string
  }
  sourceSnapshot: {
    title: string
    sourceType: QaSourceType
    status: QaSourceStatus
    contentLength: number
    packedCharacterCount: number
    maxCharacterCount: number
    truncated: boolean
  }
  analysis: {
    analyzedAt: string
    coveragePlanSchemaVersion: typeof AI_COVERAGE_PLAN_SCHEMA_VERSION
    storageValidatorVersion: CoveragePlanStorageValidatorVersion
  }
  origin: AiCoveragePlanOrigin
  plan: AiCoveragePlan
}

type LegacyAiCoveragePlanWire = Omit<
  AiCoveragePlan,
  'schemaVersion' | 'sourceScope' | 'coverageAreas' | 'ambiguities' | 'nextGenerationAreas'
> & {
  schemaVersion: typeof AI_COVERAGE_PLAN_LEGACY_SCHEMA_VERSION
  sourceScope: Omit<AiCoveragePlan['sourceScope'], 'sectionContext'>
  coverageAreas: Array<
    Omit<AiCoveragePlan['coverageAreas'][number], 'sourceSectionRefs'>
  >
  ambiguities: Array<
    Omit<AiCoveragePlan['ambiguities'][number], 'sourceSectionRefs'>
  >
  nextGenerationAreas: Array<
    Omit<AiCoveragePlan['nextGenerationAreas'][number], 'sourceSectionRefs'>
  >
}

export type PersistedCoveragePlanV1WireRecord = Omit<
  PersistedCoveragePlanRecord,
  'analysis' | 'origin' | 'plan'
> & {
  analysis: {
    analyzedAt: string
    coveragePlanSchemaVersion: typeof AI_COVERAGE_PLAN_LEGACY_SCHEMA_VERSION
    storageValidatorVersion: CoveragePlanStorageValidatorVersion
  }
  plan: LegacyAiCoveragePlanWire
}

export type PersistedCoveragePlanV2WireRecord = Omit<
  PersistedCoveragePlanRecord,
  'origin'
>

export type PersistedDirectCoveragePlanV2WireRecord =
  PersistedCoveragePlanRecord & {
    origin: AiCoveragePlanDirectSourceAnalysisOrigin
  }

export type PersistedMergedCoveragePlanV2WireRecord =
  PersistedCoveragePlanRecord & {
    origin: AiCoveragePlanSectionMergeOrigin
  }

export type PersistedCoveragePlanWireRecord =
  | PersistedCoveragePlanV1WireRecord
  | PersistedCoveragePlanV2WireRecord
  | PersistedDirectCoveragePlanV2WireRecord
  | PersistedMergedCoveragePlanV2WireRecord

type PersistedCoveragePlanStore = {
  storageSchemaVersion: CoveragePlanStorageSchemaVersion
  records: PersistedCoveragePlanRecord[]
}

type LoadCoveragePlansResult = {
  coveragePlans: PersistedCoveragePlanRecord[]
  error: string | null
}

type SaveCoveragePlansResult = {
  ok: boolean
  error: string | null
}

export type CoveragePlanFreshness = {
  isFresh: boolean
  reasons: string[]
}

const FORBIDDEN_PERSISTED_KEYS = new Set([
  'alias',
  'apikey',
  'areasuggestionresult',
  'candidate',
  'candidatepair',
  'candidatepairs',
  'choices',
  'confirmationstate',
  'content',
  'decisions',
  'finishreason',
  'fullsourcecontent',
  'groupingstate',
  'importsummary',
  'importedareasuggestionids',
  'importedids',
  'importedsuggestionids',
  'leftalias',
  'messages',
  'model',
  'pairalias',
  'prompt',
  'provideralias',
  'provideraliases',
  'providerdecisions',
  'providerpayload',
  'providerreasoncode',
  'providerresponse',
  'rawproviderdecisions',
  'rawproviderresponse',
  'rawresponse',
  'reasoncode',
  'responseschema',
  'rightalias',
  'sectionalias',
  'sectioncontent',
  'selectedareasuggestionids',
  'selectedcheckboxes',
  'selectedids',
  'selectedsuggestionids',
  'selectionstate',
  'similarity',
  'similarities',
  'similarityscore',
  'similarityscores',
  'temporarygrouping',
  'testcasesuggestions',
  'token',
  'uiconfirmationstate',
  'uiselectionstate',
  'usage',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isNonEmptyString(value: unknown): value is string {
  return isString(value) && value.trim().length > 0
}

function isExactBoundedString(
  value: unknown,
  maxLength: number,
): value is string {
  return (
    isString(value) &&
    value.length > 0 &&
    value.length <= maxLength &&
    value === value.trim()
  )
}

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value)
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean'
}

function isValidDateString(value: unknown): value is string {
  if (!isNonEmptyString(value)) {
    return false
  }

  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    return false
  }

  const parsedDate = new Date(value)

  return !Number.isNaN(parsedDate.getTime()) && parsedDate.toISOString() === value
}

function isAllowedValue<T extends readonly string[]>(
  allowedValues: T,
  value: unknown,
): value is T[number] {
  return isString(value) && allowedValues.includes(value)
}

type PersistedCoveragePlanSchemaVersion =
  | typeof AI_COVERAGE_PLAN_LEGACY_SCHEMA_VERSION
  | typeof AI_COVERAGE_PLAN_SCHEMA_VERSION

function isSupportedCoveragePlanSchemaVersion(
  value: unknown,
): value is PersistedCoveragePlanSchemaVersion {
  return (
    value === AI_COVERAGE_PLAN_LEGACY_SCHEMA_VERSION ||
    value === AI_COVERAGE_PLAN_SCHEMA_VERSION
  )
}

function hasExactKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
) {
  const valueKeys = Object.keys(value)
  const expectedKeySet = new Set(expectedKeys)

  return (
    valueKeys.length === expectedKeys.length &&
    valueKeys.every((key) => expectedKeySet.has(key))
  )
}

function normalizePersistedKey(value: string) {
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
      FORBIDDEN_PERSISTED_KEYS.has(normalizePersistedKey(key)) ||
      hasForbiddenPersistedKey(nestedValue),
  )
}

function parseStringList(value: unknown) {
  return Array.isArray(value) && value.every(isString) ? [...value] : null
}

function parseSectionContext(value: unknown): AiCoveragePlanSectionContext | null {
  if (value === null) {
    return null
  }

  const expectedKeys = [
    'available',
    'sectionSchemaVersion',
    'sectionerVersion',
    'sectionSetFingerprint',
    'totalSectionCount',
    'visibleSectionCount',
    'omittedSectionCount',
  ] as const

  if (
    !isRecord(value) ||
    !hasExactKeys(value, expectedKeys) ||
    !isBoolean(value.available) ||
    !isString(value.sectionSchemaVersion) ||
    !isString(value.sectionerVersion) ||
    !isString(value.sectionSetFingerprint) ||
    !isInteger(value.totalSectionCount) ||
    !isInteger(value.visibleSectionCount) ||
    !isInteger(value.omittedSectionCount) ||
    value.totalSectionCount < 0 ||
    value.visibleSectionCount < 0 ||
    value.omittedSectionCount < 0 ||
    value.visibleSectionCount + value.omittedSectionCount !==
      value.totalSectionCount ||
    value.available !== (value.visibleSectionCount > 0)
  ) {
    return null
  }

  const indexMetadata = [
    value.sectionSchemaVersion,
    value.sectionerVersion,
    value.sectionSetFingerprint,
  ]
  const hasIndexMetadata = indexMetadata.every(
    (item) => item.trim().length > 0 && item.trim().length <= 160,
  )
  const hasNoIndexMetadata = indexMetadata.every((item) => item === '')

  if (
    (!hasIndexMetadata && !hasNoIndexMetadata) ||
    (hasNoIndexMetadata && value.totalSectionCount !== 0)
  ) {
    return null
  }

  return {
    available: value.available,
    sectionSchemaVersion: value.sectionSchemaVersion.trim(),
    sectionerVersion: value.sectionerVersion.trim(),
    sectionSetFingerprint: value.sectionSetFingerprint.trim(),
    totalSectionCount: value.totalSectionCount,
    visibleSectionCount: value.visibleSectionCount,
    omittedSectionCount: value.omittedSectionCount,
  }
}

function parseSectionRef(value: unknown): AiCoverageSourceSectionRef | null {
  const expectedKeys = [
    'sectionId',
    'stableKey',
    'ordinal',
    'title',
    'path',
    'startLine',
    'endLine',
    'visibility',
  ] as const

  if (!isRecord(value) || !hasExactKeys(value, expectedKeys)) {
    return null
  }

  const path = Array.isArray(value.path) &&
    value.path.length > 0 &&
    value.path.length <= AI_COVERAGE_PLAN_SECTION_PATH_MAX_DEPTH &&
    value.path.every(
      (item) =>
        isNonEmptyString(item) &&
        item.trim().length <= AI_COVERAGE_PLAN_SECTION_PATH_SEGMENT_MAX_LENGTH,
    )
    ? value.path.map((item) => item.trim())
    : null

  if (
    !isNonEmptyString(value.sectionId) ||
    value.sectionId.trim().length > AI_COVERAGE_PLAN_SECTION_ID_MAX_LENGTH ||
    !isNonEmptyString(value.stableKey) ||
    value.stableKey.trim().length > AI_COVERAGE_PLAN_SECTION_STABLE_KEY_MAX_LENGTH ||
    !isInteger(value.ordinal) ||
    value.ordinal <= 0 ||
    !isNonEmptyString(value.title) ||
    value.title.trim().length > AI_COVERAGE_PLAN_SECTION_TITLE_MAX_LENGTH ||
    !path ||
    !isInteger(value.startLine) ||
    !isInteger(value.endLine) ||
    value.startLine <= 0 ||
    value.endLine < value.startLine ||
    !isAllowedValue(AI_COVERAGE_SECTION_VISIBILITIES, value.visibility)
  ) {
    return null
  }

  return {
    sectionId: value.sectionId.trim(),
    stableKey: value.stableKey.trim(),
    ordinal: value.ordinal,
    title: value.title.trim(),
    path,
    startLine: value.startLine,
    endLine: value.endLine,
    visibility: value.visibility,
  }
}

function parseSectionRefs(value: unknown) {
  if (!Array.isArray(value)) {
    return null
  }

  const parsedRefs = value.map(parseSectionRef)

  if (parsedRefs.some((sectionRef) => sectionRef === null)) {
    return null
  }

  const sortedRefs = (parsedRefs as AiCoverageSourceSectionRef[]).sort(
    (left, right) =>
      left.ordinal - right.ordinal ||
      left.sectionId.localeCompare(right.sectionId) ||
      left.stableKey.localeCompare(right.stableKey),
  )
  const refsBySectionId = new Map<string, AiCoverageSourceSectionRef>()

  for (const sectionRef of sortedRefs) {
    const existingRef = refsBySectionId.get(sectionRef.sectionId)

    if (!existingRef) {
      refsBySectionId.set(sectionRef.sectionId, sectionRef)
      continue
    }

    if (JSON.stringify(existingRef) !== JSON.stringify(sectionRef)) {
      return null
    }
  }

  return [...refsBySectionId.values()]
}

function parseCoverageArea(
  value: unknown,
  schemaVersion: PersistedCoveragePlanSchemaVersion,
) {
  const expectedKeys =
    schemaVersion === AI_COVERAGE_PLAN_LEGACY_SCHEMA_VERSION
      ? [
          'id',
          'name',
          'summary',
          'behaviors',
          'risks',
          'evidence',
          'ambiguities',
          'generationReadiness',
        ]
      : [
          'id',
          'name',
          'summary',
          'behaviors',
          'risks',
          'evidence',
          'ambiguities',
          'generationReadiness',
          'sourceSectionRefs',
        ]

  if (!isRecord(value) || !hasExactKeys(value, expectedKeys)) {
    return null
  }

  const behaviors = parseStringList(value.behaviors)
  const risks = parseStringList(value.risks)
  const evidence = parseStringList(value.evidence)
  const ambiguities = parseStringList(value.ambiguities)
  const sourceSectionRefs =
    schemaVersion === AI_COVERAGE_PLAN_LEGACY_SCHEMA_VERSION
      ? []
      : parseSectionRefs(value.sourceSectionRefs)

  if (
    !isNonEmptyString(value.id) ||
    !isNonEmptyString(value.name) ||
    !isNonEmptyString(value.summary) ||
    !behaviors ||
    !risks ||
    !evidence ||
    !ambiguities ||
    !sourceSectionRefs ||
    !isAllowedValue(AI_COVERAGE_PLAN_READINESSES, value.generationReadiness)
  ) {
    return null
  }

  return {
    id: value.id,
    name: value.name,
    summary: value.summary,
    behaviors,
    risks,
    evidence,
    ambiguities,
    generationReadiness: value.generationReadiness,
    sourceSectionRefs,
  } satisfies AiCoveragePlan['coverageAreas'][number]
}

function parseCoverageAmbiguity(
  value: unknown,
  schemaVersion: PersistedCoveragePlanSchemaVersion,
) {
  const expectedKeys =
    schemaVersion === AI_COVERAGE_PLAN_LEGACY_SCHEMA_VERSION
      ? ['id', 'question', 'whyItMatters', 'severity']
      : ['id', 'question', 'whyItMatters', 'severity', 'sourceSectionRefs']

  if (!isRecord(value) || !hasExactKeys(value, expectedKeys)) {
    return null
  }

  const sourceSectionRefs =
    schemaVersion === AI_COVERAGE_PLAN_LEGACY_SCHEMA_VERSION
      ? []
      : parseSectionRefs(value.sourceSectionRefs)

  if (
    !isNonEmptyString(value.id) ||
    !isNonEmptyString(value.question) ||
    !isNonEmptyString(value.whyItMatters) ||
    !sourceSectionRefs ||
    !isAllowedValue(AI_COVERAGE_PLAN_PRIORITIES, value.severity)
  ) {
    return null
  }

  return {
    id: value.id,
    question: value.question,
    whyItMatters: value.whyItMatters,
    severity: value.severity,
    sourceSectionRefs,
  } satisfies AiCoveragePlan['ambiguities'][number]
}

function parseNextGenerationArea(
  value: unknown,
  schemaVersion: PersistedCoveragePlanSchemaVersion,
) {
  const expectedKeys =
    schemaVersion === AI_COVERAGE_PLAN_LEGACY_SCHEMA_VERSION
      ? [
          'id',
          'title',
          'rationale',
          'priority',
          'relatedAreaIds',
          'suggestedTestCount',
        ]
      : [
          'id',
          'title',
          'rationale',
          'priority',
          'relatedAreaIds',
          'suggestedTestCount',
          'sourceSectionRefs',
        ]

  if (!isRecord(value) || !hasExactKeys(value, expectedKeys)) {
    return null
  }

  const relatedAreaIds = parseStringList(value.relatedAreaIds)
  const sourceSectionRefs =
    schemaVersion === AI_COVERAGE_PLAN_LEGACY_SCHEMA_VERSION
      ? []
      : parseSectionRefs(value.sourceSectionRefs)

  if (
    !isNonEmptyString(value.id) ||
    !isNonEmptyString(value.title) ||
    !isNonEmptyString(value.rationale) ||
    !isAllowedValue(AI_COVERAGE_PLAN_PRIORITIES, value.priority) ||
    !relatedAreaIds ||
    !sourceSectionRefs ||
    !isInteger(value.suggestedTestCount) ||
    value.suggestedTestCount < 0
  ) {
    return null
  }

  return {
    id: value.id,
    title: value.title,
    rationale: value.rationale,
    priority: value.priority,
    relatedAreaIds,
    suggestedTestCount: value.suggestedTestCount,
    sourceSectionRefs,
  } satisfies AiCoveragePlan['nextGenerationAreas'][number]
}

function parseCoveragePlan(value: unknown): AiCoveragePlan | null {
  const rootKeys = [
    'schemaVersion',
    'sourceScope',
    'coverageAreas',
    'actors',
    'states',
    'inputs',
    'failureModes',
    'integrationRisks',
    'permissionsSecurity',
    'dataPersistenceRules',
    'ambiguities',
    'nextGenerationAreas',
    'warnings',
  ] as const

  if (
    !isRecord(value) ||
    !hasExactKeys(value, rootKeys) ||
    !isSupportedCoveragePlanSchemaVersion(value.schemaVersion) ||
    !isRecord(value.sourceScope)
  ) {
    return null
  }

  const schemaVersion = value.schemaVersion
  const sourceScopeKeys =
    schemaVersion === AI_COVERAGE_PLAN_LEGACY_SCHEMA_VERSION
      ? [
          'qaSourceId',
          'visibleSourceOnly',
          'sourceTruncated',
          'coverageCompleteness',
        ]
      : [
          'qaSourceId',
          'visibleSourceOnly',
          'sourceTruncated',
          'coverageCompleteness',
          'sectionContext',
        ]

  if (
    !hasExactKeys(value.sourceScope, sourceScopeKeys) ||
    !isNonEmptyString(value.sourceScope.qaSourceId) ||
    value.sourceScope.qaSourceId !== value.sourceScope.qaSourceId.trim() ||
    value.sourceScope.visibleSourceOnly !== true ||
    !isBoolean(value.sourceScope.sourceTruncated) ||
    !isAllowedValue(
      AI_COVERAGE_COMPLETENESS_VALUES,
      value.sourceScope.coverageCompleteness,
    )
  ) {
    return null
  }

  const sectionContext =
    schemaVersion === AI_COVERAGE_PLAN_LEGACY_SCHEMA_VERSION
      ? null
      : parseSectionContext(value.sourceScope.sectionContext)

  if (
    schemaVersion !== AI_COVERAGE_PLAN_LEGACY_SCHEMA_VERSION &&
    sectionContext === null &&
    value.sourceScope.sectionContext !== null
  ) {
    return null
  }

  const coverageAreas = Array.isArray(value.coverageAreas)
    ? value.coverageAreas.map((area) => parseCoverageArea(area, schemaVersion))
    : null
  const ambiguities = Array.isArray(value.ambiguities)
    ? value.ambiguities.map((ambiguity) =>
        parseCoverageAmbiguity(ambiguity, schemaVersion),
      )
    : null
  const nextGenerationAreas = Array.isArray(value.nextGenerationAreas)
    ? value.nextGenerationAreas.map((area) =>
        parseNextGenerationArea(area, schemaVersion),
      )
    : null
  const actors = parseStringList(value.actors)
  const states = parseStringList(value.states)
  const inputs = parseStringList(value.inputs)
  const failureModes = parseStringList(value.failureModes)
  const integrationRisks = parseStringList(value.integrationRisks)
  const permissionsSecurity = parseStringList(value.permissionsSecurity)
  const dataPersistenceRules = parseStringList(value.dataPersistenceRules)
  const warnings = parseStringList(value.warnings)

  if (
    !coverageAreas ||
    coverageAreas.some((area) => area === null) ||
    !ambiguities ||
    ambiguities.some((ambiguity) => ambiguity === null) ||
    !nextGenerationAreas ||
    nextGenerationAreas.some((area) => area === null) ||
    !actors ||
    !states ||
    !inputs ||
    !failureModes ||
    !integrationRisks ||
    !permissionsSecurity ||
    !dataPersistenceRules ||
    !warnings
  ) {
    return null
  }

  const normalizedCoverageAreas = coverageAreas as AiCoveragePlan['coverageAreas']
  const normalizedAmbiguities = ambiguities as AiCoveragePlan['ambiguities']
  const normalizedNextGenerationAreas =
    nextGenerationAreas as AiCoveragePlan['nextGenerationAreas']
  const allSectionRefs = [
    ...normalizedCoverageAreas.flatMap((area) => area.sourceSectionRefs),
    ...normalizedAmbiguities.flatMap((ambiguity) => ambiguity.sourceSectionRefs),
    ...normalizedNextGenerationAreas.flatMap((area) => area.sourceSectionRefs),
  ]

  if (
    (!sectionContext?.available && allSectionRefs.length > 0) ||
    (sectionContext &&
      allSectionRefs.some((sectionRef) =>
        sectionRef.ordinal > sectionContext.totalSectionCount,
      ))
  ) {
    return null
  }

  return {
    schemaVersion: AI_COVERAGE_PLAN_SCHEMA_VERSION,
    sourceScope: {
      qaSourceId: value.sourceScope.qaSourceId,
      visibleSourceOnly: true,
      sourceTruncated: value.sourceScope.sourceTruncated,
      coverageCompleteness: value.sourceScope.coverageCompleteness,
      sectionContext,
    },
    coverageAreas: normalizedCoverageAreas,
    actors,
    states,
    inputs,
    failureModes,
    integrationRisks,
    permissionsSecurity,
    dataPersistenceRules,
    ambiguities: normalizedAmbiguities,
    nextGenerationAreas: normalizedNextGenerationAreas,
    warnings,
  }
}

const MERGED_ORIGIN_MIN_SELECTED_ANALYSES = 2
const MERGED_ORIGIN_MAX_SELECTED_ANALYSES = 8
const MERGED_ORIGIN_ID_MAX_LENGTH = 512
const MERGED_ORIGIN_RECORD_ID_MAX_LENGTH = 200
const MERGED_ORIGIN_FINGERPRINT_MAX_LENGTH = 160

function compareExactStrings(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0
}

function getUtf8ByteLength(value: string) {
  return new TextEncoder().encode(value).byteLength
}

function parseMergeSelectedAnalysisRef(
  value: unknown,
): AiCoveragePlanMergeSelectedAnalysisRef | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'analysisRefId',
      'sectionPlanRecordId',
      'analyzedAt',
      'planFingerprint',
      'sectionId',
      'stableKey',
      'contentFingerprint',
    ]) ||
    !isExactBoundedString(value.analysisRefId, MERGED_ORIGIN_ID_MAX_LENGTH) ||
    !isExactBoundedString(
      value.sectionPlanRecordId,
      MERGED_ORIGIN_RECORD_ID_MAX_LENGTH,
    ) ||
    !isValidDateString(value.analyzedAt) ||
    !isExactBoundedString(
      value.planFingerprint,
      MERGED_ORIGIN_FINGERPRINT_MAX_LENGTH,
    ) ||
    !isExactBoundedString(
      value.sectionId,
      AI_COVERAGE_PLAN_SECTION_ID_MAX_LENGTH,
    ) ||
    !isExactBoundedString(
      value.stableKey,
      AI_COVERAGE_PLAN_SECTION_STABLE_KEY_MAX_LENGTH,
    ) ||
    !isExactBoundedString(
      value.contentFingerprint,
      MERGED_ORIGIN_FINGERPRINT_MAX_LENGTH,
    )
  ) {
    return null
  }

  return {
    analysisRefId: value.analysisRefId,
    sectionPlanRecordId: value.sectionPlanRecordId,
    analyzedAt: value.analyzedAt,
    planFingerprint: value.planFingerprint,
    sectionId: value.sectionId,
    stableKey: value.stableKey,
    contentFingerprint: value.contentFingerprint,
  }
}

function parseMergeSelectedAnalyses(value: unknown) {
  if (
    !Array.isArray(value) ||
    value.length < MERGED_ORIGIN_MIN_SELECTED_ANALYSES ||
    value.length > MERGED_ORIGIN_MAX_SELECTED_ANALYSES
  ) {
    return null
  }

  const parsed = value.map(parseMergeSelectedAnalysisRef)

  if (parsed.some((item) => item === null)) {
    return null
  }

  const selectedAnalyses = parsed as AiCoveragePlanMergeSelectedAnalysisRef[]
  const analysisRefIds = selectedAnalyses.map((item) => item.analysisRefId)
  const recordIds = selectedAnalyses.map((item) => item.sectionPlanRecordId)
  const sectionIdentities = selectedAnalyses.map((item) =>
    [item.sectionId, item.stableKey].join('\u001f'),
  )

  if (
    new Set(analysisRefIds).size !== analysisRefIds.length ||
    new Set(recordIds).size !== recordIds.length ||
    new Set(sectionIdentities).size !== sectionIdentities.length
  ) {
    return null
  }

  return [...selectedAnalyses].sort(
    (left, right) =>
      compareExactStrings(left.sectionId, right.sectionId) ||
      compareExactStrings(left.stableKey, right.stableKey) ||
      compareExactStrings(left.analyzedAt, right.analyzedAt) ||
      compareExactStrings(left.sectionPlanRecordId, right.sectionPlanRecordId) ||
      compareExactStrings(left.analysisRefId, right.analysisRefId),
  )
}

function getMergeContributorKey(
  contributor: AiCoveragePlanMergeContributorRef,
) {
  return [
    contributor.analysisRefId,
    contributor.sourceFindingKind,
    contributor.sourceFindingId,
  ].join('\u001f')
}

function parseMergeContributor(
  value: unknown,
  selectedAnalysisRefIds: ReadonlySet<string>,
): AiCoveragePlanMergeContributorRef | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'analysisRefId',
      'sourceFindingKind',
      'sourceFindingId',
    ]) ||
    !isExactBoundedString(value.analysisRefId, MERGED_ORIGIN_ID_MAX_LENGTH) ||
    !selectedAnalysisRefIds.has(value.analysisRefId) ||
    !isAllowedValue(
      AI_COVERAGE_PLAN_MERGE_FINDING_KINDS,
      value.sourceFindingKind,
    ) ||
    !isExactBoundedString(value.sourceFindingId, MERGED_ORIGIN_ID_MAX_LENGTH)
  ) {
    return null
  }

  return {
    analysisRefId: value.analysisRefId,
    sourceFindingKind: value.sourceFindingKind,
    sourceFindingId: value.sourceFindingId,
  }
}

function parseMergeContributors(
  value: unknown,
  selectedAnalysisRefIds: ReadonlySet<string>,
) {
  if (!Array.isArray(value) || value.length === 0) {
    return null
  }

  const parsed = value.map((item) =>
    parseMergeContributor(item, selectedAnalysisRefIds),
  )

  if (parsed.some((item) => item === null)) {
    return null
  }

  const contributors = parsed as AiCoveragePlanMergeContributorRef[]
  const contributorKeys = contributors.map(getMergeContributorKey)

  if (new Set(contributorKeys).size !== contributorKeys.length) {
    return null
  }

  return [...contributors].sort(
    (left, right) =>
      compareExactStrings(left.analysisRefId, right.analysisRefId) ||
      compareExactStrings(left.sourceFindingKind, right.sourceFindingKind) ||
      compareExactStrings(left.sourceFindingId, right.sourceFindingId),
  )
}

function parseMergeEvidenceOrigin(
  value: unknown,
  selectedAnalysisRefIds: ReadonlySet<string>,
): AiCoveragePlanMergeEvidenceOrigin | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['outputEvidenceIndex', 'contributors']) ||
    !Number.isSafeInteger(value.outputEvidenceIndex) ||
    Number(value.outputEvidenceIndex) < 0
  ) {
    return null
  }

  const contributors = parseMergeContributors(
    value.contributors,
    selectedAnalysisRefIds,
  )

  if (!contributors) {
    return null
  }

  return {
    outputEvidenceIndex: Number(value.outputEvidenceIndex),
    contributors,
  }
}

const MERGED_SCOPE_WARNING_PATTERN =
  /^Merged section-analysis scope counts; selected: ([0-9]+); current but unselected: ([0-9]+); stale: ([0-9]+); unanalyzed: ([0-9]+); excluded: ([0-9]+)$/u

function getMergeScopeWarningOutputFindingId(
  plan: AiCoveragePlan,
  selectedAnalysisRefIds: ReadonlySet<string>,
  outputIdentities: ReturnType<
    typeof enumerateAiCoveragePlanMergeOutputIdentities
  >,
) {
  const warningIndex = plan.warnings.length - 1
  const sectionContext = plan.sourceScope.sectionContext

  if (warningIndex < 0 || !sectionContext?.available) {
    return null
  }

  const match = MERGED_SCOPE_WARNING_PATTERN.exec(plan.warnings[warningIndex])

  if (!match) {
    return null
  }

  const counts = match.slice(1).map(Number)

  if (!counts.every(Number.isSafeInteger)) {
    return null
  }

  const [selected, unselected, stale, unanalyzed, excluded] = counts
  const omitted = unselected + stale + unanalyzed + excluded

  if (
    selected !== selectedAnalysisRefIds.size ||
    selected !== sectionContext.visibleSectionCount ||
    selected + omitted !== sectionContext.totalSectionCount ||
    omitted !== sectionContext.omittedSectionCount
  ) {
    return null
  }

  return (
    outputIdentities.filter(
      (identity) => identity.outputFindingKind === 'warning',
    )[warningIndex]?.outputFindingId ?? null
  )
}

function parseMergeOutputProvenance(
  value: unknown,
  selectedAnalysisRefIds: ReadonlySet<string>,
  plan: AiCoveragePlan,
) {
  if (!Array.isArray(value)) {
    return null
  }

  const outputIdentities = enumerateAiCoveragePlanMergeOutputIdentities(plan)
  const identityById = new Map(
    outputIdentities.map((identity) => [identity.outputFindingId, identity]),
  )

  if (identityById.size !== outputIdentities.length) {
    return null
  }

  const parsed: AiCoveragePlanMergeOutputProvenance[] = []
  const claimedContributorKeys = new Set<string>()

  for (const item of value) {
    if (
      !isRecord(item) ||
      !hasExactKeys(item, [
        'outputFindingId',
        'outputFindingKind',
        'contributors',
        'disposition',
        'evidenceOrigins',
      ]) ||
      !isExactBoundedString(
        item.outputFindingId,
        MERGED_ORIGIN_ID_MAX_LENGTH,
      ) ||
      !isAllowedValue(
        AI_COVERAGE_PLAN_MERGE_FINDING_KINDS,
        item.outputFindingKind,
      ) ||
      !isAllowedValue(
        AI_COVERAGE_PLAN_MERGE_DISPOSITIONS,
        item.disposition,
      ) ||
      !Array.isArray(item.evidenceOrigins)
    ) {
      return null
    }

    const outputIdentity = identityById.get(item.outputFindingId)

    if (
      !outputIdentity ||
      outputIdentity.outputFindingKind !== item.outputFindingKind
    ) {
      return null
    }

    const contributors = parseMergeContributors(
      item.contributors,
      selectedAnalysisRefIds,
    )
    const evidenceOrigins = item.evidenceOrigins.map((evidenceOrigin) =>
      parseMergeEvidenceOrigin(evidenceOrigin, selectedAnalysisRefIds),
    )

    if (
      !contributors ||
      contributors.some(
        (contributor) =>
          contributor.sourceFindingKind !== item.outputFindingKind,
      ) ||
      evidenceOrigins.some((evidenceOrigin) => evidenceOrigin === null)
    ) {
      return null
    }

    const normalizedEvidenceOrigins =
      evidenceOrigins as AiCoveragePlanMergeEvidenceOrigin[]
    const evidenceIndexes = normalizedEvidenceOrigins.map(
      (evidenceOrigin) => evidenceOrigin.outputEvidenceIndex,
    )
    const contributorKeys = new Set(contributors.map(getMergeContributorKey))

    if (
      new Set(evidenceIndexes).size !== evidenceIndexes.length ||
      evidenceIndexes.length !== outputIdentity.evidenceCount ||
      evidenceIndexes.some((index) => index >= outputIdentity.evidenceCount) ||
      normalizedEvidenceOrigins.some((evidenceOrigin) =>
        evidenceOrigin.contributors.some(
          (contributor) =>
            !contributorKeys.has(getMergeContributorKey(contributor)),
        ),
      ) ||
      contributors.some((contributor) =>
        claimedContributorKeys.has(getMergeContributorKey(contributor)),
      )
    ) {
      return null
    }

    contributors.forEach((contributor) =>
      claimedContributorKeys.add(getMergeContributorKey(contributor)),
    )

    parsed.push({
      outputFindingId: item.outputFindingId,
      outputFindingKind: item.outputFindingKind,
      contributors,
      disposition: item.disposition,
      evidenceOrigins: [...normalizedEvidenceOrigins].sort(
        (left, right) => left.outputEvidenceIndex - right.outputEvidenceIndex,
      ),
    })
  }

  const outputFindingIds = parsed.map((item) => item.outputFindingId)
  const outputFindingIdSet = new Set(outputFindingIds)
  const scopeWarningOutputFindingId = getMergeScopeWarningOutputFindingId(
    plan,
    selectedAnalysisRefIds,
    outputIdentities,
  )
  const expectedOutputIdentities = outputIdentities.filter(
    (identity) =>
      identity.outputFindingId !== scopeWarningOutputFindingId ||
      outputFindingIdSet.has(identity.outputFindingId),
  )

  if (
    outputFindingIdSet.size !== outputFindingIds.length ||
    outputFindingIds.length !== expectedOutputIdentities.length ||
    expectedOutputIdentities.some(
      (identity) => !outputFindingIdSet.has(identity.outputFindingId),
    )
  ) {
    return null
  }

  const kindOrder = new Map(
    AI_COVERAGE_PLAN_MERGE_FINDING_KINDS.map((kind, index) => [kind, index]),
  )

  return [...parsed].sort(
    (left, right) =>
      (kindOrder.get(left.outputFindingKind) ?? Number.MAX_SAFE_INTEGER) -
        (kindOrder.get(right.outputFindingKind) ?? Number.MAX_SAFE_INTEGER) ||
      compareExactStrings(left.outputFindingId, right.outputFindingId),
  )
}

function parseMergeDurableRelations(
  value: unknown,
  outputProvenance: AiCoveragePlanMergeOutputProvenance[],
) {
  if (!Array.isArray(value)) {
    return null
  }

  const outputById = new Map(
    outputProvenance.map((item) => [item.outputFindingId, item]),
  )
  const parsed: AiCoveragePlanMergeDurableRelation[] = []

  for (const item of value) {
    if (
      !isRecord(item) ||
      !hasExactKeys(item, ['relationId', 'kind', 'outputFindingIds']) ||
      !isExactBoundedString(item.relationId, MERGED_ORIGIN_ID_MAX_LENGTH) ||
      !isAllowedValue(AI_COVERAGE_PLAN_MERGE_RELATION_KINDS, item.kind) ||
      !Array.isArray(item.outputFindingIds) ||
      item.outputFindingIds.length !== 2 ||
      !item.outputFindingIds.every((outputId) =>
        isExactBoundedString(outputId, MERGED_ORIGIN_ID_MAX_LENGTH),
      )
    ) {
      return null
    }

    const outputFindingIds = [...item.outputFindingIds].sort(compareExactStrings) as [
      string,
      string,
    ]
    const leftOutput = outputById.get(outputFindingIds[0])
    const rightOutput = outputById.get(outputFindingIds[1])

    if (
      outputFindingIds[0] === outputFindingIds[1] ||
      !leftOutput ||
      !rightOutput ||
      leftOutput.outputFindingKind !== rightOutput.outputFindingKind
    ) {
      return null
    }

    parsed.push({
      relationId: item.relationId,
      kind: item.kind,
      outputFindingIds,
    })
  }

  const relationIds = parsed.map((item) => item.relationId)
  const relationOutputPairKeys = parsed.map((item) =>
    item.outputFindingIds.join('\u001f'),
  )

  if (
    new Set(relationIds).size !== relationIds.length ||
    new Set(relationOutputPairKeys).size !== relationOutputPairKeys.length
  ) {
    return null
  }

  const relationKindOrder = new Map(
    AI_COVERAGE_PLAN_MERGE_RELATION_KINDS.map((kind, index) => [kind, index]),
  )

  return [...parsed].sort(
    (left, right) =>
      (relationKindOrder.get(left.kind) ?? Number.MAX_SAFE_INTEGER) -
        (relationKindOrder.get(right.kind) ?? Number.MAX_SAFE_INTEGER) ||
      compareExactStrings(left.outputFindingIds[0], right.outputFindingIds[0]) ||
      compareExactStrings(left.outputFindingIds[1], right.outputFindingIds[1]) ||
      compareExactStrings(left.relationId, right.relationId),
  )
}

export function parsePersistedCoveragePlanOrigin(
  value: unknown,
  plan: AiCoveragePlan,
): AiCoveragePlanOrigin | null {
  if (!isRecord(value) || !isString(value.kind)) {
    return null
  }

  if (value.kind === 'direct_source_analysis') {
    return hasExactKeys(value, ['kind'])
      ? { kind: 'direct_source_analysis' }
      : null
  }

  if (
    value.kind !== 'section_merge' ||
    !hasExactKeys(value, [
      'kind',
      'originSchemaVersion',
      'selectedAnalyses',
      'outputProvenance',
      'reviewRelations',
    ]) ||
    value.originSchemaVersion !== AI_COVERAGE_PLAN_MERGE_ORIGIN_SCHEMA_VERSION
  ) {
    return null
  }

  const selectedAnalyses = parseMergeSelectedAnalyses(value.selectedAnalyses)

  if (!selectedAnalyses) {
    return null
  }

  const selectedAnalysisRefIds = new Set(
    selectedAnalyses.map((item) => item.analysisRefId),
  )
  const outputProvenance = parseMergeOutputProvenance(
    value.outputProvenance,
    selectedAnalysisRefIds,
    plan,
  )

  if (!outputProvenance) {
    return null
  }

  const reviewRelations = parseMergeDurableRelations(
    value.reviewRelations,
    outputProvenance,
  )

  if (!reviewRelations) {
    return null
  }

  return {
    kind: 'section_merge',
    originSchemaVersion: AI_COVERAGE_PLAN_MERGE_ORIGIN_SCHEMA_VERSION,
    selectedAnalyses,
    outputProvenance,
    reviewRelations,
  }
}

export function parsePersistedCoveragePlanRecord(
  value: unknown,
): PersistedCoveragePlanRecord | null {
  if (!isRecord(value) || hasForbiddenPersistedKey(value)) {
    return null
  }

  const hasExplicitOrigin = Object.prototype.hasOwnProperty.call(value, 'origin')
  const expectedRootKeys = hasExplicitOrigin
    ? ['id', 'sourceIdentity', 'sourceSnapshot', 'analysis', 'origin', 'plan']
    : ['id', 'sourceIdentity', 'sourceSnapshot', 'analysis', 'plan']

  if (
    !hasExactKeys(value, expectedRootKeys) ||
    !isNonEmptyString(value.id) ||
    !isRecord(value.sourceIdentity) ||
    !isRecord(value.sourceSnapshot) ||
    !isRecord(value.analysis)
  ) {
    return null
  }

  const { sourceIdentity, sourceSnapshot, analysis } = value

  if (
    !hasExactKeys(sourceIdentity, [
      'qaSourceId',
      'qaSourceCreatedAt',
      'qaSourceUpdatedAt',
      'sourceFingerprint',
    ]) ||
    !isNonEmptyString(sourceIdentity.qaSourceId) ||
    sourceIdentity.qaSourceId !== sourceIdentity.qaSourceId.trim() ||
    !isValidDateString(sourceIdentity.qaSourceCreatedAt) ||
    !isValidDateString(sourceIdentity.qaSourceUpdatedAt) ||
    !isNonEmptyString(sourceIdentity.sourceFingerprint) ||
    !hasExactKeys(sourceSnapshot, [
      'title',
      'sourceType',
      'status',
      'contentLength',
      'packedCharacterCount',
      'maxCharacterCount',
      'truncated',
    ]) ||
    !isNonEmptyString(sourceSnapshot.title) ||
    !isAllowedValue(QA_SOURCE_TYPES, sourceSnapshot.sourceType) ||
    !isAllowedValue(QA_SOURCE_STATUSES, sourceSnapshot.status) ||
    !isInteger(sourceSnapshot.contentLength) ||
    !isInteger(sourceSnapshot.packedCharacterCount) ||
    !isInteger(sourceSnapshot.maxCharacterCount) ||
    !isBoolean(sourceSnapshot.truncated) ||
    sourceSnapshot.contentLength < 0 ||
    sourceSnapshot.packedCharacterCount < 0 ||
    sourceSnapshot.maxCharacterCount <= 0 ||
    sourceSnapshot.contentLength < sourceSnapshot.packedCharacterCount ||
    sourceSnapshot.packedCharacterCount > sourceSnapshot.maxCharacterCount ||
    (!sourceSnapshot.truncated &&
      sourceSnapshot.contentLength !== sourceSnapshot.packedCharacterCount) ||
    (sourceSnapshot.truncated &&
      sourceSnapshot.contentLength <= sourceSnapshot.packedCharacterCount) ||
    !hasExactKeys(analysis, [
      'analyzedAt',
      'coveragePlanSchemaVersion',
      'storageValidatorVersion',
    ]) ||
    !isValidDateString(analysis.analyzedAt) ||
    !isSupportedCoveragePlanSchemaVersion(analysis.coveragePlanSchemaVersion) ||
    analysis.storageValidatorVersion !== COVERAGE_PLAN_STORAGE_VALIDATOR_VERSION ||
    !isRecord(value.plan) ||
    value.plan.schemaVersion !== analysis.coveragePlanSchemaVersion
  ) {
    return null
  }

  const plan = parseCoveragePlan(value.plan)

  if (!plan || plan.sourceScope.qaSourceId !== sourceIdentity.qaSourceId) {
    return null
  }

  const origin = hasExplicitOrigin
    ? parsePersistedCoveragePlanOrigin(value.origin, plan)
    : ({ kind: 'direct_source_analysis' } as const)

  if (
    !origin ||
    (origin.kind === 'section_merge' &&
      analysis.coveragePlanSchemaVersion !== AI_COVERAGE_PLAN_SCHEMA_VERSION)
  ) {
    return null
  }

  if (
    origin.kind === 'section_merge' &&
    getUtf8ByteLength(JSON.stringify(value)) >
      COVERAGE_PLAN_MERGED_RECORD_MAX_BYTES
  ) {
    return null
  }

  return {
    id: value.id.trim(),
    sourceIdentity: {
      qaSourceId: sourceIdentity.qaSourceId.trim(),
      qaSourceCreatedAt: sourceIdentity.qaSourceCreatedAt,
      qaSourceUpdatedAt: sourceIdentity.qaSourceUpdatedAt,
      sourceFingerprint: sourceIdentity.sourceFingerprint.trim(),
    },
    sourceSnapshot: {
      title: sourceSnapshot.title.trim(),
      sourceType: sourceSnapshot.sourceType,
      status: sourceSnapshot.status,
      contentLength: sourceSnapshot.contentLength,
      packedCharacterCount: sourceSnapshot.packedCharacterCount,
      maxCharacterCount: sourceSnapshot.maxCharacterCount,
      truncated: sourceSnapshot.truncated,
    },
    analysis: {
      analyzedAt: analysis.analyzedAt,
      coveragePlanSchemaVersion: AI_COVERAGE_PLAN_SCHEMA_VERSION,
      storageValidatorVersion: COVERAGE_PLAN_STORAGE_VALIDATOR_VERSION,
    },
    origin,
    plan,
  }
}

function createLoadError(message: string): LoadCoveragePlansResult {
  return {
    coveragePlans: [],
    error: message,
  }
}

function createCoveragePlanRecordId() {
  const randomId = globalThis.crypto?.randomUUID?.()

  if (randomId) {
    return `coverage-plan-${randomId}`
  }

  return `coverage-plan-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function hashString(value: string) {
  let hash = 2166136261

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function createQaSourceFingerprint(qaSource: QaSource) {
  return hashString(
    [
      qaSource.id,
      qaSource.createdAt,
      qaSource.updatedAt,
      qaSource.title,
      qaSource.sourceType,
      qaSource.status,
      qaSource.content,
    ].join('\u001f'),
  )
}

export function createPersistedCoveragePlanRecord({
  qaSource,
  packedSource,
  plan,
  analyzedAt = new Date().toISOString(),
  origin = { kind: 'direct_source_analysis' },
}: {
  qaSource: QaSource
  packedSource: PackedQaSourceContext
  plan: AiCoveragePlan
  analyzedAt?: string
  origin?: AiCoveragePlanOrigin
}): PersistedCoveragePlanRecord {
  return {
    id: createCoveragePlanRecordId(),
    sourceIdentity: {
      qaSourceId: qaSource.id,
      qaSourceCreatedAt: qaSource.createdAt,
      qaSourceUpdatedAt: qaSource.updatedAt,
      sourceFingerprint: createQaSourceFingerprint(qaSource),
    },
    sourceSnapshot: {
      title: qaSource.title,
      sourceType: qaSource.sourceType,
      status: qaSource.status,
      contentLength: qaSource.content.length,
      packedCharacterCount: packedSource.packedCharacterCount,
      maxCharacterCount: packedSource.maxCharacterCount,
      truncated: packedSource.truncated,
    },
    analysis: {
      analyzedAt,
      coveragePlanSchemaVersion: AI_COVERAGE_PLAN_SCHEMA_VERSION,
      storageValidatorVersion: COVERAGE_PLAN_STORAGE_VALIDATOR_VERSION,
    },
    origin,
    plan,
  }
}

export function getCoveragePlanFreshness(
  record: PersistedCoveragePlanRecord,
  qaSource: QaSource | null,
): CoveragePlanFreshness {
  const reasons: string[] = []

  if (!qaSource) {
    return {
      isFresh: false,
      reasons: ['The saved plan source no longer exists.'],
    }
  }

  if (record.sourceIdentity.qaSourceId !== qaSource.id) {
    reasons.push('The saved plan belongs to a different QA Source.')
  }

  if (record.sourceIdentity.qaSourceCreatedAt !== qaSource.createdAt) {
    reasons.push('The QA Source identity changed after this plan was saved.')
  }

  if (record.sourceIdentity.qaSourceUpdatedAt !== qaSource.updatedAt) {
    reasons.push('The QA Source was edited after this plan was saved.')
  }

  if (record.sourceIdentity.sourceFingerprint !== createQaSourceFingerprint(qaSource)) {
    reasons.push('The QA Source content or metadata no longer matches this plan.')
  }

  if (!isSupportedCoveragePlanSchemaVersion(record.analysis.coveragePlanSchemaVersion)) {
    reasons.push('The saved plan uses an unsupported coverage plan schema.')
  }

  if (new Date(record.analysis.analyzedAt) < new Date(record.sourceIdentity.qaSourceUpdatedAt)) {
    reasons.push('The saved plan was analyzed before the saved source revision.')
  }

  if (!isSupportedCoveragePlanSchemaVersion(record.plan.schemaVersion)) {
    reasons.push('The saved plan payload uses an unsupported schema.')
  }

  return {
    isFresh: reasons.length === 0,
    reasons,
  }
}

export function getCoveragePlanSectionReferenceFreshness(
  record: PersistedCoveragePlanRecord,
  sectionIndex: QaSourceSectionIndex | null,
  sectionCatalog: AiCoveragePlanSectionCatalog,
): CoveragePlanFreshness {
  const resolution = resolveAiCoveragePlanSectionRefs(
    record.plan,
    sectionIndex,
    sectionCatalog,
  )

  return {
    isFresh: resolution.isFresh,
    reasons: resolution.reasons,
  }
}

export function findCoveragePlanForSource(
  records: PersistedCoveragePlanRecord[],
  qaSourceId: string,
) {
  return (
    records.find((record) => record.sourceIdentity.qaSourceId === qaSourceId) ??
    null
  )
}

export function upsertCoveragePlanRecord(
  records: PersistedCoveragePlanRecord[],
  nextRecord: PersistedCoveragePlanRecord,
) {
  return [
    nextRecord,
    ...records.filter(
      (record) =>
        record.sourceIdentity.qaSourceId !== nextRecord.sourceIdentity.qaSourceId,
    ),
  ]
}

export function removeCoveragePlanForSource(
  records: PersistedCoveragePlanRecord[],
  qaSourceId: string,
) {
  return records.filter((record) => record.sourceIdentity.qaSourceId !== qaSourceId)
}

export function loadCoveragePlans(): LoadCoveragePlansResult {
  if (typeof window === 'undefined') {
    return {
      coveragePlans: [],
      error: null,
    }
  }

  try {
    const rawValue = window.localStorage.getItem(COVERAGE_PLAN_STORAGE_KEY)

    if (!rawValue) {
      return {
        coveragePlans: [],
        error: null,
      }
    }

    const parsedValue: unknown = JSON.parse(rawValue)

    if (
      !isRecord(parsedValue) ||
      !hasExactKeys(parsedValue, ['storageSchemaVersion', 'records']) ||
      parsedValue.storageSchemaVersion !== COVERAGE_PLAN_STORAGE_SCHEMA_VERSION ||
      !Array.isArray(parsedValue.records)
    ) {
      return createLoadError(
        'Saved AI coverage plan data is not in the expected format. Existing browser data was not overwritten.',
      )
    }

    const coveragePlans = parsedValue.records
      .map(parsePersistedCoveragePlanRecord)
      .filter((record): record is PersistedCoveragePlanRecord => record !== null)

    if (coveragePlans.length !== parsedValue.records.length) {
      if (
        coveragePlans.length === 0 &&
        parsedValue.records.some(hasForbiddenPersistedKey)
      ) {
        return createLoadError(
          'Saved AI coverage plan data is not in the expected format. Existing browser data was not overwritten.',
        )
      }

      return {
        coveragePlans,
        error:
          'Some saved AI coverage plans could not be loaded. Existing browser data was not overwritten on startup.',
      }
    }

    return {
      coveragePlans,
      error: null,
    }
  } catch {
    return createLoadError(
      'Saved AI coverage plan data could not be read. Existing browser data was not overwritten.',
    )
  }
}

export function saveCoveragePlans(
  coveragePlans: PersistedCoveragePlanRecord[],
): SaveCoveragePlansResult {
  if (typeof window === 'undefined') {
    return {
      ok: true,
      error: null,
    }
  }

  try {
    const records = coveragePlans.map(parsePersistedCoveragePlanRecord)

    if (records.some((record) => record === null)) {
      return {
        ok: false,
        error:
          'AI coverage plan changes were not saved because the data was not in the expected safe format.',
      }
    }

    const store: PersistedCoveragePlanStore = {
      storageSchemaVersion: COVERAGE_PLAN_STORAGE_SCHEMA_VERSION,
      records: records as PersistedCoveragePlanRecord[],
    }

    window.localStorage.setItem(COVERAGE_PLAN_STORAGE_KEY, JSON.stringify(store))

    return {
      ok: true,
      error: null,
    }
  } catch {
    return {
      ok: false,
      error:
        'AI coverage plan changes are visible in this session, but they could not be saved to browser storage.',
    }
  }
}
