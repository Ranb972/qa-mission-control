import { describe, expect, it, vi } from 'vitest'
import { createQaSource } from '../../test/qaSourceFactory'
import {
  createQaSourceSectionIndex,
  type QaSourceSection,
  type QaSourceSectionIndex,
} from '../qa-sources/qaSourceSections'
import {
  AI_COVERAGE_PLAN_SCHEMA_VERSION,
  type AiCoveragePlan,
  type AiCoveragePlanSectionCatalog,
  type AiCoverageSourceSectionRef,
} from './aiCoveragePlanTypes'
import { packQaSourceForAiSuggestions } from './aiSuggestionContext'
import {
  createAiCoveragePlanSectionCatalog,
  createAiCoveragePlanSectionRefPairKey,
  getAiCoveragePlanSectionCatalogRuntimeContext,
} from './aiCoveragePlanSectionContext'
import { resolveAiCoveragePlanSectionRefs } from './aiCoveragePlanSectionRefResolution'

const SECTION_INDEX_SOURCE_CONTENT = [
  '# Checkout',
  'A shopper submits an order.',
  'The service validates every item.',
  '',
  '## Payment authorization',
  'The gateway can approve or decline.',
  'A timeout leaves the order pending.',
  '',
  '## Internal appendix',
  'This section is deliberately excluded from coverage.',
].join('\n')

function createSectionIndex(): QaSourceSectionIndex {
  const source = createQaSource({
    id: 'source-1',
    content: SECTION_INDEX_SOURCE_CONTENT,
    createdAt: '2026-05-12T08:00:00.000Z',
    updatedAt: '2026-05-12T08:00:00.000Z',
  })
  const index = createQaSourceSectionIndex(source)

  return {
    ...index,
    sections: index.sections.map((section, sectionIndex) =>
      sectionIndex === index.sections.length - 1
        ? { ...section, includedInCoverage: false }
        : section,
    ),
  }
}

function createCatalogForIndex(index: QaSourceSectionIndex) {
  const source = createQaSource({
    id: index.qaSourceId,
    content: SECTION_INDEX_SOURCE_CONTENT,
    createdAt: index.qaSourceCreatedAt,
    updatedAt: index.qaSourceUpdatedAt,
  })

  return createAiCoveragePlanSectionCatalog(
    index,
    packQaSourceForAiSuggestions(source, { maxCharacterCount: 24_000 }),
  )
}

function createCatalogFixture(content: string, maxCharacterCount = 24_000) {
  const source = createQaSource({
    id: 'source-1',
    content,
    createdAt: '2026-05-12T08:00:00.000Z',
    updatedAt: '2026-05-12T08:00:00.000Z',
  })
  const index = createQaSourceSectionIndex(source)
  const packedSource = packQaSourceForAiSuggestions(source, {
    maxCharacterCount,
  })
  const catalog = createAiCoveragePlanSectionCatalog(index, packedSource)

  return { catalog, index, packedSource }
}

function resolveForTest(
  plan: AiCoveragePlan,
  currentIndex: QaSourceSectionIndex | null,
  currentCatalog: AiCoveragePlanSectionCatalog | null = currentIndex
    ? createCatalogForIndex(currentIndex)
    : null,
) {
  return resolveAiCoveragePlanSectionRefs(plan, currentIndex, currentCatalog)
}

function createRef(
  section: QaSourceSection,
  overrides: Partial<AiCoverageSourceSectionRef> = {},
): AiCoverageSourceSectionRef {
  return {
    sectionId: section.id,
    stableKey: section.stableKey,
    ordinal: section.ordinal,
    title: section.title,
    path: [...section.path],
    startLine: section.startLine,
    endLine: section.endLine,
    visibility: 'full',
    ...overrides,
  }
}

function createPlan(
  index: QaSourceSectionIndex,
  refs: AiCoverageSourceSectionRef[] = [createRef(index.sections[0])],
): AiCoveragePlan {
  return {
    schemaVersion: AI_COVERAGE_PLAN_SCHEMA_VERSION,
    sourceScope: {
      qaSourceId: 'source-1',
      visibleSourceOnly: true,
      sourceTruncated: false,
      coverageCompleteness: 'visible_source_only',
      sectionContext: {
        available: true,
        sectionSchemaVersion: index.schemaVersion,
        sectionerVersion: index.sectionerVersion,
        sectionSetFingerprint: index.sectionSetFingerprint,
        totalSectionCount: index.sections.length,
        visibleSectionCount: index.sections.length - 1,
        omittedSectionCount: 1,
      },
    },
    coverageAreas: [
      {
        id: 'coverage-area-1',
        name: 'Checkout flow',
        summary: 'Order submission coverage.',
        behaviors: ['Submit an order'],
        risks: ['Duplicate orders'],
        evidence: ['A shopper submits an order.'],
        ambiguities: [],
        generationReadiness: 'source_backed',
        sourceSectionRefs: refs,
      },
    ],
    actors: ['Shopper'],
    states: ['Pending'],
    inputs: ['Cart'],
    failureModes: ['Timeout'],
    integrationRisks: ['Gateway outage'],
    permissionsSecurity: ['Shopper only'],
    dataPersistenceRules: ['Persist the order once'],
    ambiguities: [
      {
        id: 'ambiguity-1',
        question: 'What is the timeout copy?',
        whyItMatters: 'Exact assertions depend on it.',
        severity: 'Medium',
        sourceSectionRefs: refs,
      },
    ],
    nextGenerationAreas: [
      {
        id: 'next-area-1',
        title: 'Payment recovery',
        rationale: 'Timeout recovery needs focused tests.',
        priority: 'High',
        relatedAreaIds: ['coverage-area-1'],
        suggestedTestCount: 2,
        sourceSectionRefs: refs,
      },
    ],
    warnings: [],
  }
}

function getAllResolvedRefs(plan: AiCoveragePlan) {
  return [
    ...plan.coverageAreas.flatMap((area) => area.sourceSectionRefs),
    ...plan.ambiguities.flatMap((ambiguity) => ambiguity.sourceSectionRefs),
    ...plan.nextGenerationAreas.flatMap((area) => area.sourceSectionRefs),
  ]
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    Object.values(value).forEach((nestedValue) => deepFreeze(nestedValue))
  }

  return value
}

describe('resolveAiCoveragePlanSectionRefs', () => {
  it('resolves matching refs from the current index across every plan surface', () => {
    const index = createSectionIndex()
    const section = index.sections[0]
    const spoofedRef = createRef(section, {
      ordinal: 99,
      title: 'Saved spoofed title',
      path: ['Saved', 'Spoofed', 'Path'],
    })

    const result = resolveForTest(
      createPlan(index, [spoofedRef]),
      index,
    )

    expect(result).toMatchObject({
      status: 'resolved',
      isFresh: true,
      hasSavedRefs: true,
      canDisplayResolvedRefs: true,
      storedRefCount: 3,
      resolvedRefCount: 3,
      rejectedRefCount: 0,
      deduplicatedRefCount: 0,
      reasons: [],
    })
    expect(getAllResolvedRefs(result.resolvedPlan)).toEqual(
      Array.from({ length: 3 }, () => ({
        sectionId: section.id,
        stableKey: section.stableKey,
        ordinal: section.ordinal,
        title: section.title,
        path: section.path,
        startLine: section.startLine,
        endLine: section.endLine,
        visibility: 'full',
      })),
    )
    expect(JSON.stringify(result.resolvedPlan)).not.toContain('Saved spoofed')
  })

  it('keeps valid siblings and rejects mismatched id/stable-key pairs', () => {
    const index = createSectionIndex()
    const plan = createPlan(index, [
      createRef(index.sections[0]),
      createRef(index.sections[1], { stableKey: index.sections[0].stableKey }),
    ])
    plan.ambiguities = []
    plan.nextGenerationAreas = []

    const result = resolveForTest(plan, index)

    expect(result.status).toBe('resolved_with_omissions')
    expect(result.isFresh).toBe(false)
    expect(result.canDisplayResolvedRefs).toBe(true)
    expect(result.rejectedRefCount).toBe(1)
    expect(result.resolvedPlan.coverageAreas[0].sourceSectionRefs).toEqual([
      createRef(index.sections[0]),
    ])
    expect(result.reasons).toEqual([
      '1 saved source section reference could not be revalidated.',
    ])
  })

  it.each([
    [
      'section-set fingerprint',
      { sectionSetFingerprint: 'changed-section-set-fingerprint' },
      'The saved plan section references no longer match the source structure.',
    ],
    [
      'sectioner version',
      { sectionerVersion: 'qa-source-sectioner-v0' },
      'The saved plan references an older source sectioner version.',
    ],
    [
      'section schema',
      { sectionSchemaVersion: 'qa-source-sections-json-v0' },
      'The saved plan references an older source section schema.',
    ],
  ])('hides every ref when the saved %s differs', (_label, contextChange, reason) => {
    const index = createSectionIndex()
    const plan = createPlan(index)
    plan.sourceScope.sectionContext = {
      ...plan.sourceScope.sectionContext!,
      ...contextChange,
    }

    const result = resolveForTest(plan, index)

    expect(result.status).toBe('stale_context')
    expect(result.isFresh).toBe(false)
    expect(result.canDisplayResolvedRefs).toBe(false)
    expect(getAllResolvedRefs(result.resolvedPlan)).toEqual([])
    expect(result.rejectedRefCount).toBe(3)
    expect(result.reasons).toContain(reason)
  })

  it('hides every ref when the current index is unavailable', () => {
    const index = createSectionIndex()
    const result = resolveForTest(createPlan(index), null)

    expect(result).toMatchObject({
      status: 'unavailable_index',
      isFresh: false,
      hasSavedRefs: true,
      canDisplayResolvedRefs: false,
      storedRefCount: 3,
      resolvedRefCount: 0,
      rejectedRefCount: 3,
      reasons: ['The saved section references cannot be checked right now.'],
    })
    expect(getAllResolvedRefs(result.resolvedPlan)).toEqual([])
  })

  it('hides every ref when the current index belongs to another source', () => {
    const index = createSectionIndex()
    const result = resolveForTest(createPlan(index), {
      ...index,
      qaSourceId: 'source-2',
    })

    expect(result.status).toBe('stale_context')
    expect(getAllResolvedRefs(result.resolvedPlan)).toEqual([])
    expect(result.reasons).toContain(
      'The saved plan section references belong to a different QA Source.',
    )
  })

  it('deduplicates each ref collection and sorts refs by current ordinal', () => {
    const index = createSectionIndex()
    const plan = createPlan(index, [
      createRef(index.sections[1], { ordinal: 100 }),
      createRef(index.sections[0], { ordinal: 200 }),
      createRef(index.sections[1], { ordinal: 100 }),
    ])
    plan.ambiguities = []
    plan.nextGenerationAreas = []

    const result = resolveForTest(plan, index)

    expect(result.status).toBe('resolved')
    expect(result.deduplicatedRefCount).toBe(1)
    expect(result.resolvedPlan.coverageAreas[0].sourceSectionRefs).toEqual([
      createRef(index.sections[0]),
      createRef(index.sections[1]),
    ])
  })

  it('preserves a safe partial end without expanding or promoting it', () => {
    const index = createSectionIndex()
    const section = index.sections[0]
    const partialEndLine = section.endLine - 1
    const plan = createPlan(index, [
      createRef(section, { endLine: partialEndLine, visibility: 'partial' }),
    ])
    plan.ambiguities = []
    plan.nextGenerationAreas = []

    const result = resolveForTest(plan, index)

    expect(result.resolvedPlan.coverageAreas[0].sourceSectionRefs[0]).toEqual({
      ...createRef(section),
      endLine: partialEndLine,
      visibility: 'partial',
    })
  })

  it.each([
    ['a shifted partial start', { startLine: 2, visibility: 'partial' as const }],
    ['an overlong partial end', { endLine: 10_000, visibility: 'partial' as const }],
    ['a shortened full range', { endLine: 1, visibility: 'full' as const }],
  ])('rejects %s instead of repairing or expanding it', (_label, rangeChange) => {
    const index = createSectionIndex()
    const plan = createPlan(index, [createRef(index.sections[0], rangeChange)])
    plan.ambiguities = []
    plan.nextGenerationAreas = []

    const result = resolveForTest(plan, index)

    expect(result.status).toBe('resolved_with_omissions')
    expect(result.resolvedPlan.coverageAreas[0].sourceSectionRefs).toEqual([])
    expect(result.rejectedRefCount).toBe(1)
  })

  it('rejects refs to sections excluded from coverage', () => {
    const index = createSectionIndex()
    const excludedSection = index.sections[index.sections.length - 1]
    const plan = createPlan(index, [createRef(excludedSection)])
    plan.ambiguities = []
    plan.nextGenerationAreas = []

    const result = resolveForTest(plan, index)

    expect(result.status).toBe('resolved_with_omissions')
    expect(result.resolvedPlan.coverageAreas[0].sourceSectionRefs).toEqual([])
  })

  it('does not invent refs or mark drift when no refs were saved', () => {
    const index = createSectionIndex()
    const plan = createPlan(index, [])
    plan.ambiguities[0].sourceSectionRefs = []
    plan.nextGenerationAreas[0].sourceSectionRefs = []
    plan.sourceScope.sectionContext = null

    const result = resolveForTest(plan, null)

    expect(result).toMatchObject({
      status: 'no_refs',
      isFresh: true,
      hasSavedRefs: false,
      canDisplayResolvedRefs: false,
      storedRefCount: 0,
      resolvedRefCount: 0,
      rejectedRefCount: 0,
      deduplicatedRefCount: 0,
      reasons: [],
    })
    expect(getAllResolvedRefs(result.resolvedPlan)).toEqual([])
    expect(result.resolvedPlan.coverageAreas[0].generationReadiness).toBe(
      'source_backed',
    )
  })

  it('renders the 40th visible section and omits the 41st section', () => {
    const content = Array.from({ length: 41 }, (_, index) =>
      [`# Section ${index + 1}`, `Visible rule ${index + 1}.`].join('\n'),
    ).join('\n')
    const { catalog, index } = createCatalogFixture(content)
    const plan = createPlan(index, [
      createRef(index.sections[39]),
      createRef(index.sections[40]),
    ])
    plan.ambiguities = []
    plan.nextGenerationAreas = []
    plan.sourceScope.sectionContext = {
      ...getAiCoveragePlanSectionCatalogRuntimeContext(catalog)!.sectionContext,
    }

    const result = resolveForTest(plan, index, catalog)

    expect(catalog.sections).toHaveLength(40)
    expect(result.status).toBe('resolved_with_omissions')
    expect(result.resolvedPlan.coverageAreas[0].sourceSectionRefs).toEqual([
      createRef(index.sections[39]),
    ])
    expect(result.rejectedRefCount).toBe(1)
  })

  it('omits persisted refs excluded by the real serialized catalog byte limit', () => {
    const content = Array.from({ length: 30 }, (_, index) => {
      const marker = `${index + 1}`.padStart(2, '0')
      const title = `Long visible section ${marker} ${'metadata '.repeat(15)}`
      const body = `Visible behavior ${marker} ${'must remain bounded. '.repeat(7)}`
      return [`# ${title}`, body].join('\n')
    }).join('\n')
    const { catalog, index, packedSource } = createCatalogFixture(content)
    const firstOmittedOrdinal = catalog.sections.length
    const lastVisibleSection = index.sections[firstOmittedOrdinal - 1]
    const firstOmittedSection = index.sections[firstOmittedOrdinal]
    const runtimeContext =
      getAiCoveragePlanSectionCatalogRuntimeContext(catalog)!
    const expectedVisibleRef = runtimeContext.visibleCanonicalRefByPairKey.get(
      createAiCoveragePlanSectionRefPairKey(
        lastVisibleSection.id,
        lastVisibleSection.stableKey,
      ),
    )!
    const plan = createPlan(index, [
      createRef(lastVisibleSection),
      createRef(firstOmittedSection),
    ])
    plan.ambiguities = []
    plan.nextGenerationAreas = []
    plan.sourceScope.sectionContext = {
      ...getAiCoveragePlanSectionCatalogRuntimeContext(catalog)!.sectionContext,
    }

    const result = resolveForTest(plan, index, catalog)

    expect(packedSource.truncated).toBe(false)
    expect(catalog.sections.length).toBeGreaterThan(0)
    expect(catalog.sections.length).toBeLessThan(30)
    expect(result.status).toBe('resolved_with_omissions')
    expect(result.resolvedPlan.coverageAreas[0].sourceSectionRefs).toEqual([
      expectedVisibleRef,
    ])
    expect(result.rejectedRefCount).toBe(1)
  })

  it('gates partial refs to visible bounds across all collections without changing source or generation semantics', () => {
    const visiblePrefix = [
      '# Partial checkout',
      'Visible line two.',
      'Visible line three.',
    ].join('\n')
    const content = `${visiblePrefix}\nUnseen line four.`
    const { catalog, index } = createCatalogFixture(
      content,
      visiblePrefix.length,
    )
    const runtimeContext =
      getAiCoveragePlanSectionCatalogRuntimeContext(catalog)!
    const section = index.sections[0]
    const visibleCanonicalRef = [
      ...runtimeContext.visibleCanonicalRefByPairKey.values(),
    ][0]
    const plan = createPlan(index, [
      createRef(section, {
        endLine: visibleCanonicalRef.endLine,
        visibility: 'partial',
      }),
    ])
    plan.sourceScope.sectionContext = { ...runtimeContext.sectionContext }
    plan.ambiguities[0].sourceSectionRefs = [
      createRef(section, {
        endLine: visibleCanonicalRef.endLine - 1,
        visibility: 'partial',
      }),
    ]
    plan.nextGenerationAreas[0].sourceSectionRefs = [
      createRef(section, {
        endLine: section.endLine,
        visibility: 'partial',
      }),
    ]
    const sourceScopeSnapshot = structuredClone(plan.sourceScope)
    const readinessSnapshot = plan.coverageAreas[0].generationReadiness

    const result = resolveForTest(plan, index, catalog)

    expect(visibleCanonicalRef.visibility).toBe('partial')
    expect(result.status).toBe('resolved_with_omissions')
    expect(result.resolvedPlan.coverageAreas[0].sourceSectionRefs[0]).toMatchObject({
      sectionId: section.id,
      stableKey: section.stableKey,
      endLine: visibleCanonicalRef.endLine,
      visibility: 'partial',
    })
    expect(result.resolvedPlan.ambiguities[0].sourceSectionRefs[0]).toMatchObject({
      sectionId: section.id,
      stableKey: section.stableKey,
      endLine: visibleCanonicalRef.endLine - 1,
      visibility: 'partial',
    })
    expect(result.resolvedPlan.nextGenerationAreas[0].sourceSectionRefs).toEqual([])
    expect(result.resolvedPlan.sourceScope).toEqual(sourceScopeSnapshot)
    expect(result.resolvedPlan.coverageAreas[0].generationReadiness).toBe(
      readinessSnapshot,
    )
    expect(result.resolvedPlan.coverageAreas[0].evidence).toEqual(
      plan.coverageAreas[0].evidence,
    )
  })

  it('hides saved refs when the current bounded catalog is unavailable', () => {
    const index = createSectionIndex()
    const result = resolveForTest(createPlan(index), index, null)

    expect(result.status).toBe('unavailable_index')
    expect(result.canDisplayResolvedRefs).toBe(false)
    expect(getAllResolvedRefs(result.resolvedPlan)).toEqual([])
    expect(result.rejectedRefCount).toBe(3)
  })
  it('is pure and preserves all non-reference plan data', () => {
    const index = deepFreeze(createSectionIndex())
    const plan = createPlan(index)
    plan.coverageAreas.push({
      ...plan.coverageAreas[0],
      id: 'coverage-area-2',
      name: 'Blocked checkout gap',
      generationReadiness: 'blocked_by_ambiguity',
    })
    const planSnapshot = structuredClone(plan)
    const indexSnapshot = structuredClone(index)
    deepFreeze(plan)
    const storageWrite = vi.spyOn(Storage.prototype, 'setItem')

    const result = resolveForTest(plan, index)

    expect(plan).toEqual(planSnapshot)
    expect(index).toEqual(indexSnapshot)
    expect(storageWrite).not.toHaveBeenCalled()

    const withoutRefs = (candidate: AiCoveragePlan) => ({
      ...candidate,
      coverageAreas: candidate.coverageAreas.map((area) => ({
        ...area,
        sourceSectionRefs: [],
      })),
      ambiguities: candidate.ambiguities.map((ambiguity) => ({
        ...ambiguity,
        sourceSectionRefs: [],
      })),
      nextGenerationAreas: candidate.nextGenerationAreas.map((area) => ({
        ...area,
        sourceSectionRefs: [],
      })),
    })
    expect(withoutRefs(result.resolvedPlan)).toEqual(withoutRefs(planSnapshot))

    storageWrite.mockRestore()
  })
})
