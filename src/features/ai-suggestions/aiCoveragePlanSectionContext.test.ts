import { describe, expect, it } from 'vitest'
import { createQaSource } from '../../test/qaSourceFactory'
import { createQaSourceSectionIndex } from '../qa-sources/qaSourceSections'
import { buildAiCoveragePlanRequest } from './aiCoveragePlanPrompt'
import { packQaSourceForAiSuggestions } from './aiSuggestionContext'
import {
  createAiCoveragePlanSectionCatalog,
  getAiCoveragePlanSectionCatalogRuntimeContext,
} from './aiCoveragePlanSectionContext'

const EXPECTED_MAX_CATALOG_ENTRIES = 40
const EXPECTED_MAX_SECTION_ID_LENGTH = 160
const EXPECTED_MAX_STABLE_KEY_LENGTH = 512
const EXPECTED_MAX_TITLE_LENGTH = 140
const EXPECTED_MAX_PATH_DEPTH = 12
const EXPECTED_MAX_PATH_SEGMENT_LENGTH = 120
const EXPECTED_MAX_PREVIEW_LENGTH = 120
const EXPECTED_MAX_CATALOG_UTF8_BYTES = 12 * 1024

function getUtf8ByteLength(value: unknown) {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength
}

function createCatalog(content: string, maxCharacterCount = 24_000) {
  const source = createQaSource({
    id: 'source-1',
    title: 'Section catalog test source',
    sourceType: 'LLD',
    status: 'Ready for test design',
    content,
  })
  const sectionIndex = createQaSourceSectionIndex(source)
  const packedSource = packQaSourceForAiSuggestions(source, {
    maxCharacterCount,
  })

  return {
    catalog: createAiCoveragePlanSectionCatalog(sectionIndex, packedSource),
    packedSource,
    sectionIndex,
  }
}

describe('AI coverage plan section catalog safety', () => {
  it('trims many small headings deterministically by entry and UTF-8 byte limits', () => {
    const content = Array.from({ length: 100 }, (_, index) =>
      [`# Section ${index + 1}`, `Rule ${index + 1} must be tested.`].join('\n'),
    ).join('\n')

    const firstResult = createCatalog(content)
    const secondResult = createCatalog(content)
    const first = firstResult.catalog
    const second = secondResult.catalog
    const runtimeContext = getAiCoveragePlanSectionCatalogRuntimeContext(first)

    expect(first).toEqual(second)
    expect(first.sections).toHaveLength(EXPECTED_MAX_CATALOG_ENTRIES)
    expect(first).toMatchObject({
      totalSectionCount: EXPECTED_MAX_CATALOG_ENTRIES,
      visibleSectionCount: EXPECTED_MAX_CATALOG_ENTRIES,
      omittedSectionCount: 0,
    })
    expect(runtimeContext?.sectionContext).toMatchObject({
      totalSectionCount: 100,
      visibleSectionCount: EXPECTED_MAX_CATALOG_ENTRIES,
      omittedSectionCount: 60,
      sectionSetFingerprint: firstResult.sectionIndex.sectionSetFingerprint,
    })
    expect(getUtf8ByteLength(first)).toBeLessThanOrEqual(
      EXPECTED_MAX_CATALOG_UTF8_BYTES,
    )
  })

  it('does not expose section identity when truncation cuts a heading', () => {
    const unseenHeadingSuffix = 'UNSEEN-PRIVATE-HEADING-SUFFIX'
    const { catalog, packedSource, sectionIndex } = createCatalog(
      `# Visible heading prefix ${unseenHeadingSuffix}\nBody rule.`,
      12,
    )

    expect(packedSource.content).not.toContain(unseenHeadingSuffix)
    expect(catalog).toMatchObject({
      totalSectionCount: 0,
      visibleSectionCount: 0,
      omittedSectionCount: 0,
      sections: [],
    })
    expect(JSON.stringify(catalog)).not.toContain(unseenHeadingSuffix)
    expect(
      getAiCoveragePlanSectionCatalogRuntimeContext(catalog)?.sectionContext,
    ).toMatchObject({
      totalSectionCount: 1,
      visibleSectionCount: 0,
      omittedSectionCount: 1,
      sectionSetFingerprint: sectionIndex.sectionSetFingerprint,
    })
  })

  it('keeps a section partial only when its complete heading is visible', () => {
    const { catalog, packedSource, sectionIndex } = createCatalog(
      ['# Payment authorization', 'Approved responses complete checkout.', 'A'.repeat(200)].join('\n'),
      55,
    )

    const runtimeContext = getAiCoveragePlanSectionCatalogRuntimeContext(catalog)

    expect(catalog.sections).toHaveLength(1)
    expect(catalog.sections[0]).toMatchObject({
      visibility: 'partial',
      startLine: 1,
      endLine: 2,
    })
    expect(catalog.sections[0].sectionId).not.toBe(sectionIndex.sections[0].id)
    expect(
      Array.from(runtimeContext?.visibleCanonicalRefByPairKey.values() ?? []),
    ).toEqual([
      expect.objectContaining({
        sectionId: sectionIndex.sections[0].id,
        stableKey: sectionIndex.sections[0].stableKey,
        visibility: 'partial',
      }),
    ])
    expect(catalog.sections[0].characterCount).toBe(packedSource.content.length)
    expect(catalog.sections[0].preview).toBe(
      packedSource.content.replace(/\s+/g, ' ').trim(),
    )
    expect(catalog.sections[0].endLine).toBeLessThan(
      sectionIndex.sections[0].endLine,
    )
  })

  it('excludes sections not marked for coverage', () => {
    const { catalog, sectionIndex, packedSource } = createCatalog(
      '# Payment\nPayment must be authorized.',
    )
    const excludedIndex = {
      ...sectionIndex,
      sections: sectionIndex.sections.map((section) => ({
        ...section,
        includedInCoverage: false,
      })),
    }

    const excludedCatalog = createAiCoveragePlanSectionCatalog(
      excludedIndex,
      packedSource,
    )

    expect(catalog.sections).toHaveLength(1)
    expect(excludedCatalog).toMatchObject({
      totalSectionCount: 0,
      visibleSectionCount: 0,
      omittedSectionCount: 0,
      sections: [],
    })
    expect(
      getAiCoveragePlanSectionCatalogRuntimeContext(excludedCatalog)
        ?.sectionContext,
    ).toMatchObject({
      totalSectionCount: 1,
      visibleSectionCount: 0,
      omittedSectionCount: 1,
    })
  })

  it('bounds long headings, paths, identity fields, and previews', () => {
    const longSegment = 'Long heading '.repeat(80)
    const { catalog } = createCatalog(
      [`# ${longSegment}`, 'Visible behavior.', '## Child heading', 'Child behavior.'].join('\n'),
    )

    for (const section of catalog.sections) {
      expect(section.sectionId.length).toBeLessThanOrEqual(
        EXPECTED_MAX_SECTION_ID_LENGTH,
      )
      expect(section.stableKey.length).toBeLessThanOrEqual(
        EXPECTED_MAX_STABLE_KEY_LENGTH,
      )
      expect(section.title.length).toBeLessThanOrEqual(EXPECTED_MAX_TITLE_LENGTH)
      expect(section.path.length).toBeLessThanOrEqual(EXPECTED_MAX_PATH_DEPTH)
      expect(
        section.path.every(
          (segment) => segment.length <= EXPECTED_MAX_PATH_SEGMENT_LENGTH,
        ),
      ).toBe(true)
      expect(section.preview.length).toBeLessThanOrEqual(
        EXPECTED_MAX_PREVIEW_LENGTH + 3,
      )
    }
    expect(getUtf8ByteLength(catalog)).toBeLessThanOrEqual(
      EXPECTED_MAX_CATALOG_UTF8_BYTES,
    )
  })

  it.each([
    ['ASCII', 'Rule'],
    ['Hebrew', 'כלל תשלום'],
    ['emoji', '🚀🔐'],
  ])('keeps %s catalogs within the UTF-8 budget', (_, marker) => {
    const content = Array.from({ length: 100 }, (_, index) =>
      [`# ${marker} ${index + 1}`, `${marker} behavior ${index + 1}`].join('\n'),
    ).join('\n')
    const { catalog } = createCatalog(content)

    expect(catalog.sections.length).toBeLessThanOrEqual(
      EXPECTED_MAX_CATALOG_ENTRIES,
    )
    expect(getUtf8ByteLength(catalog)).toBeLessThanOrEqual(
      EXPECTED_MAX_CATALOG_UTF8_BYTES,
    )
  })

  it('keeps the complete planner request stable for equal-length unseen source changes', () => {
    const visiblePrefix = [
      '# Visible payment rules',
      'Visible payment behavior must stay the same.',
      'V'.repeat(80),
    ].join('\n')
    const firstUnseenSuffix = `FIRST-PRIVATE-${'A'.repeat(120)}`
    const secondUnseenSuffix = `OTHER-PRIVATE-${'B'.repeat(120)}`
    const maxCharacterCount = visiblePrefix.length
    const first = createCatalog(
      `${visiblePrefix}${firstUnseenSuffix}`,
      maxCharacterCount,
    )
    const second = createCatalog(
      `${visiblePrefix}${secondUnseenSuffix}`,
      maxCharacterCount,
    )

    expect(firstUnseenSuffix).toHaveLength(secondUnseenSuffix.length)
    expect(first.packedSource.content).toBe(second.packedSource.content)
    expect(first.sectionIndex.sectionSetFingerprint).not.toBe(
      second.sectionIndex.sectionSetFingerprint,
    )
    expect(
      buildAiCoveragePlanRequest(first.packedSource, first.catalog),
    ).toEqual(buildAiCoveragePlanRequest(second.packedSource, second.catalog))
  })

  it('keeps provider identity stable when only the section beyond the 40-entry cap changes', () => {
    const visibleSections = Array.from({ length: EXPECTED_MAX_CATALOG_ENTRIES }, (_, index) =>
      [`# Visible section ${index + 1}`, `Visible rule ${index + 1}.`].join('\n'),
    )
    const visiblePrefix = visibleSections.join('\n')
    const first = createCatalog(
      `${visiblePrefix}\n# OMITTED-FIRST\nFirst omitted rule.`,
    )
    const second = createCatalog(
      `${visiblePrefix}\n# OMITTED-SECOND\nSecond omitted rule.`,
    )

    expect(first.packedSource.truncated).toBe(false)
    expect(second.packedSource.truncated).toBe(false)
    expect(first.catalog.sections).toHaveLength(EXPECTED_MAX_CATALOG_ENTRIES)
    expect(first.sectionIndex.sectionSetFingerprint).not.toBe(
      second.sectionIndex.sectionSetFingerprint,
    )
    expect(JSON.stringify(first.catalog)).toBe(JSON.stringify(second.catalog))
  })

  it('keeps provider identity stable when only the section beyond the 12 KiB cap changes', () => {
    const largeSections = Array.from({ length: 36 }, (_, index) =>
      [
        `# ${String(index + 1).padStart(2, '0')} ${'Long heading '.repeat(14)}`,
        `${'Visible behavior '.repeat(12)}${index + 1}.`,
      ].join('\n'),
    )
    const baseline = createCatalog(largeSections.join('\n'))
    const acceptedCount = baseline.catalog.sections.length
    const acceptedPrefix = largeSections.slice(0, acceptedCount).join('\n')
    const firstMarker = 'OMITTED-BYTE-FIRST'
    const secondMarker = 'OMITTED-BYTE-OTHER'
    const first = createCatalog(
      `${acceptedPrefix}\n# ${firstMarker} ${'X'.repeat(150)}\n${'First omitted rule. '.repeat(10)}`,
    )
    const second = createCatalog(
      `${acceptedPrefix}\n# ${secondMarker} ${'Y'.repeat(150)}\n${'Other omitted rule. '.repeat(10)}`,
    )

    expect(acceptedCount).toBeGreaterThan(0)
    expect(acceptedCount).toBeLessThan(largeSections.length)
    expect(first.packedSource.truncated).toBe(false)
    expect(second.packedSource.truncated).toBe(false)
    expect(first.packedSource.content).toContain(firstMarker)
    expect(second.packedSource.content).toContain(secondMarker)
    expect(first.catalog.sections).toHaveLength(acceptedCount)
    expect(second.catalog.sections).toHaveLength(acceptedCount)
    expect(getUtf8ByteLength(first.catalog)).toBeLessThanOrEqual(
      EXPECTED_MAX_CATALOG_UTF8_BYTES,
    )
    expect(first.sectionIndex.sectionSetFingerprint).not.toBe(
      second.sectionIndex.sectionSetFingerprint,
    )
    expect(JSON.stringify(first.catalog)).toBe(JSON.stringify(second.catalog))
  })

  it('derives provider aliases and the transmitted fingerprint only from visible catalog data', () => {
    const visiblePrefix = [
      '# Visible payment rules',
      'Visible payment behavior must stay the same.',
      'V'.repeat(80),
    ].join('\n')
    const maxCharacterCount = visiblePrefix.length
    const first = createCatalog(
      [
        `${visiblePrefix}FIRST-UNSEEN-${'A'.repeat(100)}`,
        '# Private first section',
        'Private first behavior.',
      ].join('\n'),
      maxCharacterCount,
    )
    const second = createCatalog(
      [
        `${visiblePrefix}SECOND-UNSEEN-${'B'.repeat(100)}`,
        '# Private second section',
        'Private second behavior.',
        '# Another private section',
        'Another private behavior.',
      ].join('\n'),
      maxCharacterCount,
    )

    expect(first.packedSource.content).toBe(second.packedSource.content)
    expect(first.sectionIndex.sectionSetFingerprint).not.toBe(
      second.sectionIndex.sectionSetFingerprint,
    )
    expect(first.sectionIndex.sections[0]).not.toMatchObject({
      id: second.sectionIndex.sections[0].id,
      stableKey: second.sectionIndex.sections[0].stableKey,
    })
    expect(first.sectionIndex.sections.length).not.toBe(
      second.sectionIndex.sections.length,
    )
    expect(first.catalog).toEqual(second.catalog)
    const serializedCatalog = JSON.stringify(first.catalog)
    expect(serializedCatalog).not.toContain(first.sectionIndex.sections[0].id)
    expect(serializedCatalog).not.toContain(
      first.sectionIndex.sections[0].stableKey,
    )
    expect(first.catalog.sections[0]).not.toMatchObject({
      sectionId: first.sectionIndex.sections[0].id,
      stableKey: first.sectionIndex.sections[0].stableKey,
    })
    expect(
      getAiCoveragePlanSectionCatalogRuntimeContext(first.catalog)
        ?.sectionContext,
    ).toMatchObject({
      totalSectionCount: first.sectionIndex.sections.length,
      sectionSetFingerprint: first.sectionIndex.sectionSetFingerprint,
    })
    expect(
      getAiCoveragePlanSectionCatalogRuntimeContext(second.catalog)
        ?.sectionContext,
    ).toMatchObject({
      totalSectionCount: second.sectionIndex.sections.length,
      sectionSetFingerprint: second.sectionIndex.sectionSetFingerprint,
    })
  })

  it('keeps duplicate heading identities distinct without leaking omitted names', () => {
    const { catalog } = createCatalog(
      ['# Retry', 'First rule.', '# Retry', 'Second rule.'].join('\n'),
    )

    expect(catalog.sections).toHaveLength(2)
    expect(new Set(catalog.sections.map((section) => section.stableKey)).size).toBe(2)
    expect(catalog.sections.map((section) => section.ordinal)).toEqual([1, 2])
  })
})
