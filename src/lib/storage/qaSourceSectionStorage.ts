import type { QaSource } from '../../features/qa-sources/qaSourceTypes'
import {
  createQaSourceSectionIndex,
  QA_SOURCE_SECTION_SCHEMA_VERSION,
  QA_SOURCE_SECTIONER_VERSION,
  type QaSourceSection,
  type QaSourceSectionIndex,
} from '../../features/qa-sources/qaSourceSections'

export const QA_SOURCE_SECTION_INDEX_STORAGE_KEY =
  'qa-mission-control:qa-source-section-indexes:v0.19'

export const QA_SOURCE_SECTION_INDEX_STORAGE_SCHEMA_VERSION = 1

type QaSourceSectionIndexStorageSchemaVersion =
  typeof QA_SOURCE_SECTION_INDEX_STORAGE_SCHEMA_VERSION

type QaSourceSectionIndexStore = {
  storageSchemaVersion: QaSourceSectionIndexStorageSchemaVersion
  records: QaSourceSectionIndex[]
}

type LoadQaSourceSectionIndexesResult = {
  sectionIndexes: QaSourceSectionIndex[]
  error: string | null
}

type SaveQaSourceSectionIndexesResult = {
  ok: boolean
  error: string | null
}

const FORBIDDEN_SECTION_INDEX_KEYS = new Set([
  'apiKey',
  'areaSuggestionResult',
  'choices',
  'content',
  'finish_reason',
  'finishReason',
  'importSummary',
  'messages',
  'model',
  'prompt',
  'providerPayload',
  'rawProviderResponse',
  'rawResponse',
  'responseSchema',
  'selectedAreaSuggestionIds',
  'selectedSuggestionIds',
  'testCaseSuggestions',
  'token',
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

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0
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

function hasExactKeys(value: Record<string, unknown>, allowedKeys: string[]) {
  const allowedKeySet = new Set(allowedKeys)

  return Object.keys(value).every((key) => allowedKeySet.has(key))
}

function hasForbiddenSectionIndexKey(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(hasForbiddenSectionIndexKey)
  }

  if (!isRecord(value)) {
    return false
  }

  return Object.entries(value).some(
    ([key, nestedValue]) =>
      FORBIDDEN_SECTION_INDEX_KEYS.has(key) ||
      hasForbiddenSectionIndexKey(nestedValue),
  )
}

function parseStringList(value: unknown) {
  return Array.isArray(value) && value.every(isString) ? value : null
}

function parseQaSourceSection(value: unknown): QaSourceSection | null {
  if (
    !isRecord(value) ||
    hasForbiddenSectionIndexKey(value) ||
    !hasExactKeys(value, [
      'id',
      'stableKey',
      'ordinal',
      'title',
      'level',
      'path',
      'startOffset',
      'endOffset',
      'startLine',
      'endLine',
      'characterCount',
      'contentFingerprint',
      'preview',
      'includedInCoverage',
    ])
  ) {
    return null
  }

  const path = parseStringList(value.path)

  if (
    !isNonEmptyString(value.id) ||
    !isNonEmptyString(value.stableKey) ||
    !isPositiveInteger(value.ordinal) ||
    !isNonEmptyString(value.title) ||
    !isPositiveInteger(value.level) ||
    !path ||
    path.length === 0 ||
    !isNonNegativeInteger(value.startOffset) ||
    !isNonNegativeInteger(value.endOffset) ||
    !isPositiveInteger(value.startLine) ||
    !isPositiveInteger(value.endLine) ||
    !isNumber(value.characterCount) ||
    !isNonEmptyString(value.contentFingerprint) ||
    !isString(value.preview) ||
    !isBoolean(value.includedInCoverage)
  ) {
    return null
  }

  if (
    value.endOffset < value.startOffset ||
    value.endLine < value.startLine ||
    value.characterCount !== value.endOffset - value.startOffset
  ) {
    return null
  }

  return {
    id: value.id,
    stableKey: value.stableKey,
    ordinal: value.ordinal,
    title: value.title,
    level: value.level,
    path,
    startOffset: value.startOffset,
    endOffset: value.endOffset,
    startLine: value.startLine,
    endLine: value.endLine,
    characterCount: value.characterCount,
    contentFingerprint: value.contentFingerprint,
    preview: value.preview,
    includedInCoverage: value.includedInCoverage,
  }
}

export function parseQaSourceSectionIndex(value: unknown): QaSourceSectionIndex | null {
  if (
    !isRecord(value) ||
    hasForbiddenSectionIndexKey(value) ||
    !hasExactKeys(value, [
      'qaSourceId',
      'qaSourceCreatedAt',
      'qaSourceUpdatedAt',
      'sourceFingerprint',
      'schemaVersion',
      'sectionerVersion',
      'indexedAt',
      'sourceLength',
      'sectionSetFingerprint',
      'sections',
      'warnings',
    ]) ||
    !isNonEmptyString(value.qaSourceId) ||
    !isValidDateString(value.qaSourceCreatedAt) ||
    !isValidDateString(value.qaSourceUpdatedAt) ||
    !isNonEmptyString(value.sourceFingerprint) ||
    value.schemaVersion !== QA_SOURCE_SECTION_SCHEMA_VERSION ||
    value.sectionerVersion !== QA_SOURCE_SECTIONER_VERSION ||
    !isValidDateString(value.indexedAt) ||
    !isNonNegativeInteger(value.sourceLength) ||
    !isNonEmptyString(value.sectionSetFingerprint)
  ) {
    return null
  }

  const warnings = parseStringList(value.warnings)
  const sections = Array.isArray(value.sections)
    ? value.sections.map(parseQaSourceSection)
    : null

  if (
    !warnings ||
    !sections ||
    sections.length === 0 ||
    sections.some((section) => section === null)
  ) {
    return null
  }

  const parsedSections = sections as QaSourceSection[]
  const seenIds = new Set<string>()
  const seenStableKeys = new Set<string>()

  for (let index = 0; index < parsedSections.length; index += 1) {
    const section = parsedSections[index]
    const previousSection = parsedSections[index - 1]

    if (
      section.ordinal !== index + 1 ||
      section.endOffset > value.sourceLength ||
      (previousSection && section.startOffset < previousSection.endOffset) ||
      seenIds.has(section.id) ||
      seenStableKeys.has(section.stableKey)
    ) {
      return null
    }

    seenIds.add(section.id)
    seenStableKeys.add(section.stableKey)
  }

  return {
    qaSourceId: value.qaSourceId,
    qaSourceCreatedAt: value.qaSourceCreatedAt,
    qaSourceUpdatedAt: value.qaSourceUpdatedAt,
    sourceFingerprint: value.sourceFingerprint,
    schemaVersion: QA_SOURCE_SECTION_SCHEMA_VERSION,
    sectionerVersion: QA_SOURCE_SECTIONER_VERSION,
    indexedAt: value.indexedAt,
    sourceLength: value.sourceLength,
    sectionSetFingerprint: value.sectionSetFingerprint,
    sections: parsedSections,
    warnings,
  }
}

function createLoadError(message: string): LoadQaSourceSectionIndexesResult {
  return {
    sectionIndexes: [],
    error: message,
  }
}

export function findQaSourceSectionIndexForSource(
  sectionIndexes: QaSourceSectionIndex[],
  qaSourceId: string,
) {
  return (
    sectionIndexes.find((sectionIndex) => sectionIndex.qaSourceId === qaSourceId) ??
    null
  )
}

export function upsertQaSourceSectionIndex(
  sectionIndexes: QaSourceSectionIndex[],
  nextSectionIndex: QaSourceSectionIndex,
) {
  return [
    nextSectionIndex,
    ...sectionIndexes.filter(
      (sectionIndex) => sectionIndex.qaSourceId !== nextSectionIndex.qaSourceId,
    ),
  ]
}

export function removeQaSourceSectionIndexForSource(
  sectionIndexes: QaSourceSectionIndex[],
  qaSourceId: string,
) {
  return sectionIndexes.filter(
    (sectionIndex) => sectionIndex.qaSourceId !== qaSourceId,
  )
}

function areStringListsEqual(left: string[], right: string[]) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  )
}

function areQaSourceSectionsEqual(
  left: QaSourceSection,
  right: QaSourceSection,
) {
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

function areQaSourceSectionIndexesCanonicallyEqual(
  savedSectionIndex: QaSourceSectionIndex,
  canonicalSectionIndex: QaSourceSectionIndex,
) {
  return (
    savedSectionIndex.qaSourceId === canonicalSectionIndex.qaSourceId &&
    savedSectionIndex.qaSourceCreatedAt ===
      canonicalSectionIndex.qaSourceCreatedAt &&
    savedSectionIndex.qaSourceUpdatedAt ===
      canonicalSectionIndex.qaSourceUpdatedAt &&
    savedSectionIndex.sourceFingerprint ===
      canonicalSectionIndex.sourceFingerprint &&
    savedSectionIndex.schemaVersion === canonicalSectionIndex.schemaVersion &&
    savedSectionIndex.sectionerVersion ===
      canonicalSectionIndex.sectionerVersion &&
    savedSectionIndex.sourceLength === canonicalSectionIndex.sourceLength &&
    savedSectionIndex.sectionSetFingerprint ===
      canonicalSectionIndex.sectionSetFingerprint &&
    areStringListsEqual(
      savedSectionIndex.warnings,
      canonicalSectionIndex.warnings,
    ) &&
    savedSectionIndex.sections.length ===
      canonicalSectionIndex.sections.length &&
    savedSectionIndex.sections.every((section, index) =>
      areQaSourceSectionsEqual(
        section,
        canonicalSectionIndex.sections[index],
      ),
    )
  )
}

export function createResolvedQaSourceSectionIndexes(
  qaSources: QaSource[],
  savedSectionIndexes: QaSourceSectionIndex[],
) {
  return qaSources.map((qaSource) => {
    const savedSectionIndex = findQaSourceSectionIndexForSource(
      savedSectionIndexes,
      qaSource.id,
    )
    const canonicalSectionIndex = createQaSourceSectionIndex(qaSource)

    return savedSectionIndex &&
      areQaSourceSectionIndexesCanonicallyEqual(
        savedSectionIndex,
        canonicalSectionIndex,
      )
      ? savedSectionIndex
      : canonicalSectionIndex
  })
}

export function loadQaSourceSectionIndexes(): LoadQaSourceSectionIndexesResult {
  if (typeof window === 'undefined') {
    return {
      sectionIndexes: [],
      error: null,
    }
  }

  try {
    const rawValue = window.localStorage.getItem(QA_SOURCE_SECTION_INDEX_STORAGE_KEY)

    if (!rawValue) {
      return {
        sectionIndexes: [],
        error: null,
      }
    }

    const parsedValue: unknown = JSON.parse(rawValue)

    if (
      !isRecord(parsedValue) ||
      hasForbiddenSectionIndexKey(parsedValue) ||
      !hasExactKeys(parsedValue, ['storageSchemaVersion', 'records']) ||
      parsedValue.storageSchemaVersion !==
        QA_SOURCE_SECTION_INDEX_STORAGE_SCHEMA_VERSION ||
      !Array.isArray(parsedValue.records)
    ) {
      return createLoadError(
        'Saved QA source section index data is not in the expected format. Existing browser data was not overwritten.',
      )
    }

    const sectionIndexes = parsedValue.records
      .map(parseQaSourceSectionIndex)
      .filter(
        (sectionIndex): sectionIndex is QaSourceSectionIndex =>
          sectionIndex !== null,
      )

    if (sectionIndexes.length !== parsedValue.records.length) {
      return {
        sectionIndexes,
        error:
          'Some saved QA source section indexes could not be loaded. Existing browser data was not overwritten on startup.',
      }
    }

    return {
      sectionIndexes,
      error: null,
    }
  } catch {
    return createLoadError(
      'Saved QA source section index data could not be read. Existing browser data was not overwritten.',
    )
  }
}

export function saveQaSourceSectionIndexes(
  sectionIndexes: QaSourceSectionIndex[],
): SaveQaSourceSectionIndexesResult {
  if (typeof window === 'undefined') {
    return {
      ok: true,
      error: null,
    }
  }

  try {
    const store: QaSourceSectionIndexStore = {
      storageSchemaVersion: QA_SOURCE_SECTION_INDEX_STORAGE_SCHEMA_VERSION,
      records: sectionIndexes,
    }

    window.localStorage.setItem(
      QA_SOURCE_SECTION_INDEX_STORAGE_KEY,
      JSON.stringify(store),
    )

    return {
      ok: true,
      error: null,
    }
  } catch {
    return {
      ok: false,
      error:
        'QA source section index changes are visible in this session, but they could not be saved to browser storage.',
    }
  }
}
