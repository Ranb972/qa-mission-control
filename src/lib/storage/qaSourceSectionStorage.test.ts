import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createQaSource } from '../../test/qaSourceFactory'
import { packQaSourceForAiSuggestions } from '../../features/ai-suggestions/aiSuggestionContext'
import {
  createAiCoveragePlanSectionCatalog,
  getAiCoveragePlanSectionCatalogRuntimeContext,
} from '../../features/ai-suggestions/aiCoveragePlanSectionContext'
import {
  createQaSourceSectionIndex,
  getQaSourceSectionIndexFreshness,
  QA_SOURCE_SECTIONER_VERSION,
} from '../../features/qa-sources/qaSourceSections'
import {
  createResolvedQaSourceSectionIndexes,
  findQaSourceSectionIndexForSource,
  loadQaSourceSectionIndexes,
  QA_SOURCE_SECTION_INDEX_STORAGE_KEY,
  QA_SOURCE_SECTION_INDEX_STORAGE_SCHEMA_VERSION,
  removeQaSourceSectionIndexForSource,
  saveQaSourceSectionIndexes,
  upsertQaSourceSectionIndex,
} from './qaSourceSectionStorage'

const qaSource = createQaSource({
  id: 'source-1',
  title: 'Checkout LLD',
  content: '# Checkout\nPayment authorization behavior.',
  createdAt: '2026-05-27T08:00:00.000Z',
  updatedAt: '2026-05-27T08:00:00.000Z',
})

function createIndex() {
  return createQaSourceSectionIndex(qaSource, '2026-05-27T08:01:00.000Z')
}

describe('qaSourceSectionStorage', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.restoreAllMocks()
  })

  it('saves and loads valid source section indexes', () => {
    const sectionIndex = createIndex()

    expect(saveQaSourceSectionIndexes([sectionIndex])).toEqual({
      ok: true,
      error: null,
    })

    const result = loadQaSourceSectionIndexes()

    expect(result.error).toBeNull()
    expect(result.sectionIndexes).toHaveLength(1)
    expect(result.sectionIndexes[0]).toMatchObject({
      qaSourceId: 'source-1',
      qaSourceCreatedAt: qaSource.createdAt,
      qaSourceUpdatedAt: qaSource.updatedAt,
      sectionerVersion: QA_SOURCE_SECTIONER_VERSION,
      sections: [
        expect.objectContaining({
          title: 'Checkout',
          startOffset: 0,
          startLine: 1,
          includedInCoverage: true,
        }),
      ],
    })
  })

  it('does not overwrite corrupt JSON on load', () => {
    window.localStorage.setItem(
      QA_SOURCE_SECTION_INDEX_STORAGE_KEY,
      '{not valid section json',
    )

    const result = loadQaSourceSectionIndexes()

    expect(result.sectionIndexes).toEqual([])
    expect(result.error).toContain('could not be read')
    expect(window.localStorage.getItem(QA_SOURCE_SECTION_INDEX_STORAGE_KEY)).toBe(
      '{not valid section json',
    )
  })

  it('rejects a wrong root shape without rewriting storage', () => {
    window.localStorage.setItem(
      QA_SOURCE_SECTION_INDEX_STORAGE_KEY,
      JSON.stringify([{ records: [] }]),
    )

    const result = loadQaSourceSectionIndexes()

    expect(result.sectionIndexes).toEqual([])
    expect(result.error).toContain('not in the expected format')
    expect(window.localStorage.getItem(QA_SOURCE_SECTION_INDEX_STORAGE_KEY)).toBe(
      JSON.stringify([{ records: [] }]),
    )
  })

  it('rejects invalid section schema records', () => {
    const sectionIndex = {
      ...createIndex(),
      schemaVersion: 'unsupported-section-schema',
    }

    window.localStorage.setItem(
      QA_SOURCE_SECTION_INDEX_STORAGE_KEY,
      JSON.stringify({
        storageSchemaVersion: QA_SOURCE_SECTION_INDEX_STORAGE_SCHEMA_VERSION,
        records: [sectionIndex],
      }),
    )

    const result = loadQaSourceSectionIndexes()

    expect(result.sectionIndexes).toEqual([])
    expect(result.error).toContain(
      'Some saved QA source section indexes could not be loaded',
    )
  })

  it('rejects records containing raw-provider-shaped keys', () => {
    const sectionIndex = {
      ...createIndex(),
      rawResponse: { choices: [] },
    }

    window.localStorage.setItem(
      QA_SOURCE_SECTION_INDEX_STORAGE_KEY,
      JSON.stringify({
        storageSchemaVersion: QA_SOURCE_SECTION_INDEX_STORAGE_SCHEMA_VERSION,
        records: [sectionIndex],
      }),
    )

    const result = loadQaSourceSectionIndexes()

    expect(result.sectionIndexes).toEqual([])
    expect(result.error).toContain('not in the expected format')
  })

  it('detects stale source timestamps, stale fingerprints, version mismatches, and orphaned sources', () => {
    const sectionIndex = createIndex()

    expect(getQaSourceSectionIndexFreshness(sectionIndex, qaSource)).toEqual({
      isFresh: true,
      reasons: [],
    })
    expect(
      getQaSourceSectionIndexFreshness(sectionIndex, {
        ...qaSource,
        updatedAt: '2026-05-27T09:00:00.000Z',
      }).reasons,
    ).toContain('The QA Source was edited after this section index was built.')
    expect(
      getQaSourceSectionIndexFreshness(sectionIndex, {
        ...qaSource,
        content: '# Checkout\nChanged payment behavior.',
      }).reasons,
    ).toContain(
      'The QA Source content or metadata no longer matches this section index.',
    )
    expect(
      getQaSourceSectionIndexFreshness(
        {
          ...sectionIndex,
          sectionerVersion: 'unsupported-sectioner',
        },
        qaSource,
      ).reasons,
    ).toContain('The section index was built by an unsupported sectioner version.')
    expect(getQaSourceSectionIndexFreshness(sectionIndex, null)).toEqual({
      isFresh: false,
      reasons: ['The section index source no longer exists.'],
    })
  })

  it('reports quota or blocked storage failures without throwing', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })

    expect(saveQaSourceSectionIndexes([createIndex()])).toEqual({
      ok: false,
      error:
        'QA source section index changes are visible in this session, but they could not be saved to browser storage.',
    })
  })

  it('finds, upserts, removes, and resolves source-scoped indexes', () => {
    const firstIndex = createIndex()
    const secondSource = createQaSource({
      ...qaSource,
      id: 'source-2',
      title: 'Profile PRD',
      content: '# Profile\nDisplay name behavior.',
    })
    const secondIndex = createQaSourceSectionIndex(
      secondSource,
      '2026-05-27T08:02:00.000Z',
    )
    const replacementIndex = {
      ...firstIndex,
      indexedAt: '2026-05-27T08:03:00.000Z',
    }

    const upsertedIndexes = upsertQaSourceSectionIndex(
      [firstIndex, secondIndex],
      replacementIndex,
    )

    expect(upsertedIndexes).toHaveLength(2)
    expect(findQaSourceSectionIndexForSource(upsertedIndexes, 'source-1')).toBe(
      replacementIndex,
    )
    expect(removeQaSourceSectionIndexForSource(upsertedIndexes, 'source-1')).toEqual([
      secondIndex,
    ])

    const staleIndex = {
      ...replacementIndex,
      qaSourceUpdatedAt: '2026-05-27T07:00:00.000Z',
    }
    const resolvedIndexes = createResolvedQaSourceSectionIndexes(
      [qaSource, secondSource],
      [staleIndex, secondIndex],
    )

    expect(resolvedIndexes).toHaveLength(2)
    expect(resolvedIndexes[0].qaSourceUpdatedAt).toBe(qaSource.updatedAt)
    expect(resolvedIndexes[1]).toBe(secondIndex)
  })

  it('reuses a canonical cached index even when its indexedAt differs from a fresh derivation', () => {
    const cachedIndex = createIndex()

    const [resolvedIndex] = createResolvedQaSourceSectionIndexes(
      [qaSource],
      [cachedIndex],
    )

    expect(resolvedIndex).toBe(cachedIndex)
    expect(resolvedIndex).toEqual(cachedIndex)
  })

  it.each([
    [
      'title',
      (sectionIndex: ReturnType<typeof createIndex>) => {
        sectionIndex.sections[0].title = 'Forged checkout title'
      },
    ],
    [
      'path',
      (sectionIndex: ReturnType<typeof createIndex>) => {
        sectionIndex.sections[0].path = ['Forged path']
      },
    ],
    [
      'section id',
      (sectionIndex: ReturnType<typeof createIndex>) => {
        sectionIndex.sections[0].id = 'source-section-forged'
      },
    ],
    [
      'stable key',
      (sectionIndex: ReturnType<typeof createIndex>) => {
        sectionIndex.sections[0].stableKey = 'forged::stable-key::1'
      },
    ],
    [
      'preview',
      (sectionIndex: ReturnType<typeof createIndex>) => {
        sectionIndex.sections[0].preview = 'Forged preview text.'
      },
    ],
    [
      'section fingerprint',
      (sectionIndex: ReturnType<typeof createIndex>) => {
        sectionIndex.sections[0].contentFingerprint = 'section-forged'
      },
    ],
    [
      'section-set fingerprint',
      (sectionIndex: ReturnType<typeof createIndex>) => {
        sectionIndex.sectionSetFingerprint = 'section-set-forged'
      },
    ],
    [
      'coverage inclusion flag',
      (sectionIndex: ReturnType<typeof createIndex>) => {
        sectionIndex.sections[0].includedInCoverage = false
      },
    ],
    [
      'warning metadata',
      (sectionIndex: ReturnType<typeof createIndex>) => {
        sectionIndex.warnings = ['Forged warning text.']
      },
    ],
  ])('rebuilds a shape-valid cache with forged %s metadata', (_, forgeIndex) => {
    const forgedIndex = createIndex()
    forgeIndex(forgedIndex)

    expect(saveQaSourceSectionIndexes([forgedIndex])).toEqual({
      ok: true,
      error: null,
    })

    const loaded = loadQaSourceSectionIndexes()

    expect(loaded.error).toBeNull()
    expect(loaded.sectionIndexes).toHaveLength(1)

    const [resolvedIndex] = createResolvedQaSourceSectionIndexes(
      [qaSource],
      loaded.sectionIndexes,
    )
    const canonicalIndex = createQaSourceSectionIndex(
      qaSource,
      resolvedIndex.indexedAt,
    )

    expect(resolvedIndex).toEqual(canonicalIndex)
    expect(resolvedIndex).not.toEqual(forgedIndex)
  })

  it('never exposes shape-valid forged cache metadata through the AI catalog', () => {
    const forgedIndex = createIndex()
    forgedIndex.sectionSetFingerprint = 'FORGED-SECTION-SET'
    forgedIndex.sections[0] = {
      ...forgedIndex.sections[0],
      id: 'FORGED-SECTION-ID',
      stableKey: 'FORGED-STABLE-KEY',
      title: 'FORGED TITLE',
      path: ['FORGED PATH'],
      contentFingerprint: 'FORGED-CONTENT-FINGERPRINT',
      preview: 'FORGED PREVIEW',
    }

    const [resolvedIndex] = createResolvedQaSourceSectionIndexes(
      [qaSource],
      [forgedIndex],
    )
    const canonicalIndex = createQaSourceSectionIndex(
      qaSource,
      resolvedIndex.indexedAt,
    )
    const catalog = createAiCoveragePlanSectionCatalog(
      resolvedIndex,
      packQaSourceForAiSuggestions(qaSource),
    )
    const runtimeContext = getAiCoveragePlanSectionCatalogRuntimeContext(catalog)

    expect(resolvedIndex).toEqual(canonicalIndex)
    expect(JSON.stringify(catalog)).not.toContain('FORGED')
    expect(catalog.sections[0]).toMatchObject({
      title: canonicalIndex.sections[0].title,
      path: canonicalIndex.sections[0].path,
      preview: canonicalIndex.sections[0].preview,
    })
    expect(
      Array.from(runtimeContext?.visibleCanonicalRefByPairKey.values() ?? []),
    ).toEqual([
      expect.objectContaining({
        sectionId: canonicalIndex.sections[0].id,
        stableKey: canonicalIndex.sections[0].stableKey,
      }),
    ])
  })

  it('rebuilds only forged records while preserving valid sibling caches', () => {
    const forgedIndex = createIndex()
    forgedIndex.sections[0].preview = 'Forged sibling preview.'
    const validSource = createQaSource({
      ...qaSource,
      id: 'source-2',
      title: 'Profile PRD',
      content: '# Profile\nDisplay name behavior.',
    })
    const validIndex = createQaSourceSectionIndex(
      validSource,
      '2026-05-27T08:02:00.000Z',
    )

    const resolvedIndexes = createResolvedQaSourceSectionIndexes(
      [qaSource, validSource],
      [forgedIndex, validIndex],
    )

    expect(resolvedIndexes[0]).toEqual(
      createQaSourceSectionIndex(qaSource, resolvedIndexes[0].indexedAt),
    )
    expect(resolvedIndexes[0]).not.toBe(forgedIndex)
    expect(resolvedIndexes[1]).toBe(validIndex)
  })

  it.each([
    [
      'Hebrew headings',
      '# תשלום\nהתנהגות אישור.\n## אימות\nבדיקה ראשונה.\n## סיכום\nבדיקה שנייה.',
    ],
    [
      'duplicate headings',
      '# Checkout\nIntro.\n## Rules\nFirst.\n## Rules\nSecond.',
    ],
    [
      'fallback parts',
      'This source has no reliable heading. It still needs deterministic fallback indexing.\n\nMore behavior follows here.',
    ],
  ])('reuses deterministic canonical caches for %s', (_, content) => {
    const source = createQaSource({
      ...qaSource,
      content,
    })
    const cachedIndex = createQaSourceSectionIndex(
      source,
      '2026-05-27T08:01:00.000Z',
    )
    const independentlyDerivedIndex = createQaSourceSectionIndex(
      source,
      '2026-05-27T09:01:00.000Z',
    )

    expect(independentlyDerivedIndex).toEqual({
      ...cachedIndex,
      indexedAt: independentlyDerivedIndex.indexedAt,
    })
    expect(
      createResolvedQaSourceSectionIndexes([source], [cachedIndex])[0],
    ).toBe(cachedIndex)
  })

  it('does not write storage while resolving canonical cache integrity', () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem')

    createResolvedQaSourceSectionIndexes([qaSource], [createIndex()])

    expect(setItemSpy).not.toHaveBeenCalled()
  })
})
