import { AI_COVERAGE_PLAN_SOURCE_CONTEXT_MAX_CHARACTERS } from '../ai-suggestions/aiCoveragePlanPrompt'
import { AI_SECTION_COVERAGE_PLAN_MAX_VISIBLE_CHARACTERS } from '../ai-suggestions/aiSectionCoveragePlanContext'

export const QA_SOURCE_REVIEW_FILTERS = [
  'all',
  'needs_analysis',
  'current',
  'not_analyzed',
  'stale',
  'failed',
  'oversized',
] as const

export type QaSourceReviewFilter = (typeof QA_SOURCE_REVIEW_FILTERS)[number]

export type QaSourceReviewSectionStatus =
  | 'Current'
  | 'Stale'
  | 'Not analyzed'
  | 'Failed'
  | 'Analyzing'
  | 'Excluded'

export type QaSourceReviewSectionItem = {
  sectionId: string
  ordinal: number
  title: string
  characterCount: number
  status: QaSourceReviewSectionStatus
}
export type QaSourceReviewStatusCounts = {
  current: number
  notAnalyzed: number
  stale: number
  failed: number
  analyzing: number
  excluded: number
}

export type QaSourceReviewProgress = {
  sourceCharacterCount: number
  sourceWideVisibleCharacterCount: number
  sourceWideOmittedCharacterCount: number
  isSourceWidePartial: boolean
  totalSectionCount: number
  oversizedSectionCount: number
  oversizedSectionIds: string[]
  statusCounts: QaSourceReviewStatusCounts
  isGuidedReviewRecommended: boolean
}

const EMPTY_STATUS_COUNTS: QaSourceReviewStatusCounts = {
  current: 0,
  notAnalyzed: 0,
  stale: 0,
  failed: 0,
  analyzing: 0,
  excluded: 0,
}

function getSafeCount(value: number) {
  return Number.isSafeInteger(value) && value > 0 ? value : 0
}

function countStatuses(
  items: readonly QaSourceReviewSectionItem[],
): QaSourceReviewStatusCounts {
  const counts = { ...EMPTY_STATUS_COUNTS }

  items.forEach((item) => {
    switch (item.status) {
      case 'Current':
        counts.current += 1
        break
      case 'Not analyzed':
        counts.notAnalyzed += 1
        break
      case 'Stale':
        counts.stale += 1
        break
      case 'Failed':
        counts.failed += 1
        break
      case 'Analyzing':
        counts.analyzing += 1
        break
      case 'Excluded':
        counts.excluded += 1
        break
    }
  })

  return counts
}

export function deriveQaSourceReviewProgress({
  sourceCharacterCount,
  items,
}: {
  sourceCharacterCount: number
  items: readonly QaSourceReviewSectionItem[]
}): QaSourceReviewProgress {
  const safeSourceCharacterCount = getSafeCount(sourceCharacterCount)
  const sourceWideVisibleCharacterCount = Math.min(
    safeSourceCharacterCount,
    AI_COVERAGE_PLAN_SOURCE_CONTEXT_MAX_CHARACTERS,
  )
  const sourceWideOmittedCharacterCount = Math.max(
    0,
    safeSourceCharacterCount - sourceWideVisibleCharacterCount,
  )
  const oversizedSectionIds = items
    .filter(
      (item) =>
        getSafeCount(item.characterCount) >
        AI_SECTION_COVERAGE_PLAN_MAX_VISIBLE_CHARACTERS,
    )
    .map((item) => item.sectionId)

  return {
    sourceCharacterCount: safeSourceCharacterCount,
    sourceWideVisibleCharacterCount,
    sourceWideOmittedCharacterCount,
    isSourceWidePartial: sourceWideOmittedCharacterCount > 0,
    totalSectionCount: items.length,
    oversizedSectionCount: oversizedSectionIds.length,
    oversizedSectionIds,
    statusCounts: countStatuses(items),
    isGuidedReviewRecommended:
      sourceWideOmittedCharacterCount > 0 || oversizedSectionIds.length > 0,
  }
}

export function filterQaSourceReviewSections(
  items: readonly QaSourceReviewSectionItem[],
  filter: QaSourceReviewFilter,
) {
  const orderedItems = [...items].sort(
    (left, right) => left.ordinal - right.ordinal,
  )

  switch (filter) {
    case 'all':
      return orderedItems
    case 'needs_analysis':
      return orderedItems.filter(
        (item) =>
          item.status === 'Not analyzed' ||
          item.status === 'Stale' ||
          item.status === 'Failed',
      )
    case 'current':
      return orderedItems.filter((item) => item.status === 'Current')
    case 'not_analyzed':
      return orderedItems.filter((item) => item.status === 'Not analyzed')
    case 'stale':
      return orderedItems.filter((item) => item.status === 'Stale')
    case 'failed':
      return orderedItems.filter((item) => item.status === 'Failed')
    case 'oversized':
      return orderedItems.filter(
        (item) =>
          getSafeCount(item.characterCount) >
          AI_SECTION_COVERAGE_PLAN_MAX_VISIBLE_CHARACTERS,
      )
  }
}

function isSelectableForReview(item: QaSourceReviewSectionItem) {
  return item.status !== 'Analyzing' && item.status !== 'Excluded'
}

export function findNextQaSourceReviewSection({
  items,
  filter,
  selectedSectionId,
}: {
  items: readonly QaSourceReviewSectionItem[]
  filter: QaSourceReviewFilter
  selectedSectionId?: string | null
}) {
  let candidates = filterQaSourceReviewSections(items, filter).filter(
    isSelectableForReview,
  )

  if (filter === 'all') {
    candidates = candidates.filter((item) => item.status !== 'Current')
  }

  if (candidates.length === 0) {
    return null
  }

  if (!selectedSectionId) {
    return candidates[0]
  }

  const selectedIndex = candidates.findIndex(
    (item) => item.sectionId === selectedSectionId,
  )

  return selectedIndex < 0 ? candidates[0] : candidates[selectedIndex + 1] ?? null
}
