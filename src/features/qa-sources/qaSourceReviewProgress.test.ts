import { describe, expect, it } from 'vitest'
import {
  deriveQaSourceReviewProgress,
  filterQaSourceReviewSections,
  findNextQaSourceReviewSection,
  type QaSourceReviewSectionItem,
} from './qaSourceReviewProgress'

function createItem(
  ordinal: number,
  status: QaSourceReviewSectionItem['status'],
  characterCount = 4_000,
): QaSourceReviewSectionItem {
  return {
    sectionId: `section-${ordinal}`,
    ordinal,
    title: `Section ${ordinal}`,
    characterCount,
    status,
  }
}

describe('qaSourceReviewProgress', () => {
  const items = [
    createItem(6, 'Excluded'),
    createItem(2, 'Not analyzed'),
    createItem(1, 'Current'),
    createItem(4, 'Failed', 24_001),
    createItem(3, 'Stale'),
    createItem(5, 'Analyzing'),
  ]

  it('derives bounded source visibility, exact status counts, and oversized sections', () => {
    expect(
      deriveQaSourceReviewProgress({
        sourceCharacterCount: 80_000,
        items,
      }),
    ).toEqual({
      sourceCharacterCount: 80_000,
      sourceWideVisibleCharacterCount: 24_000,
      sourceWideOmittedCharacterCount: 56_000,
      isSourceWidePartial: true,
      totalSectionCount: 6,
      oversizedSectionCount: 1,
      oversizedSectionIds: ['section-4'],
      statusCounts: {
        current: 1,
        notAnalyzed: 1,
        stale: 1,
        failed: 1,
        analyzing: 1,
        excluded: 1,
      },
      isGuidedReviewRecommended: true,
    })
  })

  it('does not recommend guided review when the source and every section fit', () => {
    const progress = deriveQaSourceReviewProgress({
      sourceCharacterCount: 24_000,
      items: [createItem(1, 'Current', 24_000)],
    })

    expect(progress.isSourceWidePartial).toBe(false)
    expect(progress.oversizedSectionCount).toBe(0)
    expect(progress.isGuidedReviewRecommended).toBe(false)
  })

  it('filters deterministically without changing the passed item order', () => {
    expect(
      filterQaSourceReviewSections(items, 'needs_analysis').map(
        (item) => item.sectionId,
      ),
    ).toEqual(['section-2', 'section-3', 'section-4'])
    expect(
      filterQaSourceReviewSections(items, 'oversized').map(
        (item) => item.sectionId,
      ),
    ).toEqual(['section-4'])
    expect(items.map((item) => item.sectionId)).toEqual([
      'section-6',
      'section-2',
      'section-1',
      'section-4',
      'section-3',
      'section-5',
    ])
  })

  it('finds the next actionable section without wrapping or selecting excluded work', () => {
    expect(
      findNextQaSourceReviewSection({ items, filter: 'all' })?.sectionId,
    ).toBe('section-2')
    expect(
      findNextQaSourceReviewSection({
        items,
        filter: 'needs_analysis',
        selectedSectionId: 'section-2',
      })?.sectionId,
    ).toBe('section-3')
    expect(
      findNextQaSourceReviewSection({
        items,
        filter: 'failed',
        selectedSectionId: 'section-4',
      }),
    ).toBeNull()
    expect(
      findNextQaSourceReviewSection({ items, filter: 'all', selectedSectionId: 'section-4' }),
    ).toBeNull()
  })
})
