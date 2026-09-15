import {
  createQaSourceSectionIndex,
  type QaSourceSection,
  type QaSourceSectionIndex,
} from '../qa-sources/qaSourceSections'
import type { QaSource } from '../qa-sources/qaSourceTypes'
import {
  AI_COVERAGE_PLAN_SECTION_ID_MAX_LENGTH,
  AI_COVERAGE_PLAN_SECTION_STABLE_KEY_MAX_LENGTH,
} from './aiCoveragePlanSectionContext'
import type { AiSectionCoveragePlanContext } from './aiSectionCoveragePlanTypes'

export const AI_SECTION_COVERAGE_PLAN_MAX_VISIBLE_CHARACTERS = 24_000

export type AiSectionCoveragePlanSelectedSection = {
  sectionId: string
  stableKey: string
}

export type ResolveAiSectionCoveragePlanContextResult =
  | {
      ok: true
      context: AiSectionCoveragePlanContext
      error: null
    }
  | {
      ok: false
      context: null
      error: string
    }

function areStringListsEqual(left: string[], right: string[]) {
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

function isCanonicalIndex(
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

function isExactBoundedIdentity(value: string, maxLength: number) {
  return (
    value.length > 0 &&
    value.length <= maxLength &&
    value === value.trim()
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

function createFailure(error: string): ResolveAiSectionCoveragePlanContextResult {
  return { ok: false, context: null, error }
}

export function resolveAiSectionCoveragePlanContext({
  qaSource,
  sectionIndex,
  selectedSection,
  maxVisibleCharacters = AI_SECTION_COVERAGE_PLAN_MAX_VISIBLE_CHARACTERS,
}: {
  qaSource: QaSource
  sectionIndex: QaSourceSectionIndex
  selectedSection: AiSectionCoveragePlanSelectedSection
  maxVisibleCharacters?: number
}): ResolveAiSectionCoveragePlanContextResult {
  if (
    !Number.isSafeInteger(maxVisibleCharacters) ||
    maxVisibleCharacters <= 0 ||
    maxVisibleCharacters > AI_SECTION_COVERAGE_PLAN_MAX_VISIBLE_CHARACTERS
  ) {
    return createFailure('The selected section character limit is not valid.')
  }

  if (
    !isExactBoundedIdentity(
      selectedSection.sectionId,
      AI_COVERAGE_PLAN_SECTION_ID_MAX_LENGTH,
    ) ||
    !isExactBoundedIdentity(
      selectedSection.stableKey,
      AI_COVERAGE_PLAN_SECTION_STABLE_KEY_MAX_LENGTH,
    )
  ) {
    return createFailure('The selected section identity is not valid.')
  }

  const canonicalIndex = createQaSourceSectionIndex(qaSource)

  if (!isCanonicalIndex(sectionIndex, canonicalIndex)) {
    return createFailure(
      'The selected section index does not match the current canonical QA Source.',
    )
  }

  const section = canonicalIndex.sections.find(
    (candidate) =>
      candidate.id === selectedSection.sectionId &&
      candidate.stableKey === selectedSection.stableKey,
  )

  if (!section || !section.includedInCoverage) {
    return createFailure(
      'The selected section is not an included section in the current QA Source.',
    )
  }

  if (
    !Number.isSafeInteger(section.startOffset) ||
    !Number.isSafeInteger(section.endOffset) ||
    !Number.isSafeInteger(section.startLine) ||
    !Number.isSafeInteger(section.endLine) ||
    !Number.isSafeInteger(section.characterCount) ||
    section.startOffset < 0 ||
    section.endOffset < section.startOffset ||
    section.endOffset > qaSource.content.length ||
    section.startLine < 1 ||
    section.endLine < section.startLine ||
    section.characterCount !== section.endOffset - section.startOffset
  ) {
    return createFailure('The canonical selected section bounds are not valid.')
  }

  const canonicalContent = qaSource.content.slice(
    section.startOffset,
    section.endOffset,
  )
  const visibleContent = truncateAtUnicodeBoundary(
    canonicalContent,
    maxVisibleCharacters,
  )

  return {
    ok: true,
    error: null,
    context: {
      sourceIdentity: {
        qaSourceId: qaSource.id,
        qaSourceCreatedAt: qaSource.createdAt,
        qaSourceUpdatedAt: qaSource.updatedAt,
        sourceFingerprint: canonicalIndex.sourceFingerprint,
      },
      sectionIdentity: {
        sectionId: section.id,
        stableKey: section.stableKey,
        contentFingerprint: section.contentFingerprint,
        sectionSchemaVersion: canonicalIndex.schemaVersion,
        sectionerVersion: canonicalIndex.sectionerVersion,
      },
      sectionSnapshot: {
        ordinal: section.ordinal,
        title: section.title,
        path: [...section.path],
        startLine: section.startLine,
        endLine: section.endLine,
        characterCount: section.characterCount,
      },
      visibleSection: {
        content: visibleContent,
        packedCharacterCount: visibleContent.length,
        truncated: visibleContent.length < section.characterCount,
      },
    },
  }
}
