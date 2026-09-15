import { describe, expect, it } from 'vitest'
import { createQaSource } from '../../test/qaSourceFactory'
import { createPersistedSectionCoveragePlanRecord } from '../../lib/storage/sectionCoveragePlanStorage'
import {
  createQaSourceSectionIndex,
  type QaSourceSectionIndex,
} from '../qa-sources/qaSourceSections'
import { resolveAiSectionCoveragePlanContext } from './aiSectionCoveragePlanContext'
import {
  createAiCoveragePlanMergePlanFingerprint,
  createAiCoveragePlanMergeSelectedAnalysisRef,
  resolveAiCoveragePlanMergeEligibility,
} from './aiCoveragePlanMergeEligibility'
import {
  AI_SECTION_COVERAGE_PLAN_SCHEMA_VERSION,
  type AiSectionCoveragePlan,
  type AiSectionCoveragePlanContext,
  type PersistedSectionCoveragePlanRecord,
} from './aiSectionCoveragePlanTypes'

const SOURCE_UPDATED_AT = '2026-07-18T08:00:00.000Z'
const ANALYZED_AT = '2026-07-18T08:10:00.000Z'

function createPlan(
  context: AiSectionCoveragePlanContext,
  suffix = '',
): AiSectionCoveragePlan {
  const evidenceLine = context.visibleSection.content
    .split(/\r?\n/)
    .find((line) => line.startsWith('Requirement '))
  const evidence = evidenceLine?.slice(0, 200)

  return {
    schemaVersion: AI_SECTION_COVERAGE_PLAN_SCHEMA_VERSION,
    coverageAreas: [
      {
        id: `area-${context.sectionSnapshot.ordinal}${suffix}`,
        name: `Coverage ${context.sectionSnapshot.ordinal}${suffix}`,
        summary: `Validate section ${context.sectionSnapshot.ordinal}${suffix}.`,
        behaviors: [`Behavior ${context.sectionSnapshot.ordinal}${suffix}`],
        evidence: evidence ? [evidence] : [],
        evidenceSupport: evidence ? 'source_backed' : 'needs_review',
      },
    ],
    actors: [`Actor ${context.sectionSnapshot.ordinal}${suffix}`],
    states: [],
    inputs: [],
    failureModes: [],
    integrationRisks: [],
    permissionsSecurity: [],
    dataPersistenceConcerns: [],
    ambiguities: [],
    nextCoverage: [],
    warnings: [],
  }
}

function createFixture({
  sectionCount = 9,
  firstSectionBody,
}: {
  sectionCount?: number
  firstSectionBody?: string
} = {}) {
  const content = Array.from({ length: sectionCount }, (_, index) => {
    const ordinal = index + 1
    const body =
      index === 0 && firstSectionBody !== undefined
        ? firstSectionBody
        : `Requirement ${ordinal} supports שלום and English.`

    return `# Section ${ordinal}\n${body}`
  }).join('\n\n')
  const qaSource = createQaSource({
    id: 'source-merge-1',
    title: 'מפרט Mixed coverage',
    content,
    createdAt: SOURCE_UPDATED_AT,
    updatedAt: SOURCE_UPDATED_AT,
  })
  const sectionIndex = createQaSourceSectionIndex(
    qaSource,
    '2026-07-18T08:01:00.000Z',
  )
  const contexts = sectionIndex.sections.map((section) => {
    const result = resolveAiSectionCoveragePlanContext({
      qaSource,
      sectionIndex,
      selectedSection: {
        sectionId: section.id,
        stableKey: section.stableKey,
      },
    })

    if (!result.ok) {
      throw new Error(result.error)
    }

    return result.context
  })
  const records = contexts.map((context) =>
    createPersistedSectionCoveragePlanRecord({
      context,
      plan: createPlan(context),
      analyzedAt: ANALYZED_AT,
    }),
  )

  return { qaSource, sectionIndex, contexts, records }
}

function resolve(
  fixture: ReturnType<typeof createFixture>,
  selectedRecords: readonly unknown[],
  overrides: {
    sectionIndex?: QaSourceSectionIndex
    allRecords?: readonly unknown[]
  } = {},
) {
  return resolveAiCoveragePlanMergeEligibility({
    qaSource: fixture.qaSource,
    sectionIndex: overrides.sectionIndex ?? fixture.sectionIndex,
    selectedRecords,
    allRecords: overrides.allRecords ?? fixture.records,
  })
}

function cloneRecord(record: PersistedSectionCoveragePlanRecord) {
  return structuredClone(record)
}

describe('coverage-plan merge eligibility', () => {
  it('accepts exactly two and exactly eight current records in canonical order', () => {
    const fixture = createFixture()
    const two = resolve(fixture, [fixture.records[1], fixture.records[0]])
    const eight = resolve(fixture, fixture.records.slice(0, 8).reverse())

    expect(two.ok).toBe(true)
    expect(eight.ok).toBe(true)

    if (!two.ok || !eight.ok) {
      throw new Error(two.error ?? eight.error)
    }

    expect(two.selectedAnalyses.map(({ section }) => section.ordinal)).toEqual([
      1, 2,
    ])
    expect(eight.selectedAnalyses).toHaveLength(8)
    expect(two.sourceRevision).toMatchObject({
      qaSourceId: fixture.qaSource.id,
      sectionSetFingerprint: fixture.sectionIndex.sectionSetFingerprint,
    })
  })

  it('rejects one and nine selected records', () => {
    const fixture = createFixture()

    expect(resolve(fixture, fixture.records.slice(0, 1))).toMatchObject({
      ok: false,
    })
    expect(resolve(fixture, fixture.records.slice(0, 9))).toMatchObject({
      ok: false,
    })
  })

  it('rejects mixed source, revision, schema, and sectioner identities', () => {
    const fixture = createFixture()
    const base = fixture.records[1]
    const mutations: PersistedSectionCoveragePlanRecord[] = [
      {
        ...base,
        sourceIdentity: { ...base.sourceIdentity, qaSourceId: 'other-source' },
      },
      {
        ...base,
        sourceIdentity: {
          ...base.sourceIdentity,
          qaSourceUpdatedAt: '2026-07-18T07:00:00.000Z',
        },
      },
      {
        ...base,
        sectionIdentity: {
          ...base.sectionIdentity,
          sectionSchemaVersion: 'qa-source-sections-json-old',
        },
      },
      {
        ...base,
        sectionIdentity: {
          ...base.sectionIdentity,
          sectionerVersion: 'qa-source-sectioner-old',
        },
      },
    ]

    mutations.forEach((record) => {
      expect(resolve(fixture, [fixture.records[0], record]).ok).toBe(false)
    })
  })

  it('rejects duplicate record IDs, section identities, and analysis identities', () => {
    const fixture = createFixture()
    const duplicateRecordId = {
      ...fixture.records[1],
      id: fixture.records[0].id,
    }
    const duplicateSection = {
      ...cloneRecord(fixture.records[0]),
      id: 'distinct-record-id',
    }

    expect(resolve(fixture, [fixture.records[0], duplicateRecordId]).ok).toBe(
      false,
    )
    expect(resolve(fixture, [fixture.records[0], duplicateSection]).ok).toBe(
      false,
    )
  })

  it('rejects stale, missing, excluded, and forged canonical sections', () => {
    const fixture = createFixture()
    const stale = {
      ...fixture.records[1],
      analyzedAt: '2026-07-18T07:59:59.000Z',
    }
    const missing = {
      ...fixture.records[1],
      sectionIdentity: {
        ...fixture.records[1].sectionIdentity,
        sectionId: 'missing-section',
      },
    }
    const forgedIndex = {
      ...fixture.sectionIndex,
      sections: fixture.sectionIndex.sections.map((section, index) =>
        index === 0
          ? { ...section, title: 'Forged title', includedInCoverage: false }
          : section,
      ),
    }

    expect(resolve(fixture, [fixture.records[0], stale]).ok).toBe(false)
    expect(resolve(fixture, [fixture.records[0], missing]).ok).toBe(false)
    expect(
      resolve(fixture, fixture.records.slice(0, 2), { sectionIndex: forgedIndex })
        .ok,
    ).toBe(false)
  })

  it('rejects padded record, source, section, and stable-key identities', () => {
    const fixture = createFixture()
    const base = fixture.records[1]
    const mutations: PersistedSectionCoveragePlanRecord[] = [
      { ...base, id: ` ${base.id}` },
      {
        ...base,
        sourceIdentity: {
          ...base.sourceIdentity,
          qaSourceId: `${base.sourceIdentity.qaSourceId} `,
        },
      },
      {
        ...base,
        sectionIdentity: {
          ...base.sectionIdentity,
          sectionId: ` ${base.sectionIdentity.sectionId}`,
        },
      },
      {
        ...base,
        sectionIdentity: {
          ...base.sectionIdentity,
          stableKey: `${base.sectionIdentity.stableKey} `,
        },
      },
    ]

    mutations.forEach((record) => {
      expect(resolve(fixture, [fixture.records[0], record]).ok).toBe(false)
    })
  })

  it('rejects visible-count and truncation mismatches', () => {
    const fixture = createFixture()
    const base = fixture.records[1]
    const mismatchedCount = {
      ...base,
      sectionSnapshot: {
        ...base.sectionSnapshot,
        visibleCharacterCount: base.sectionSnapshot.characterCount - 1,
        truncated: true,
      },
    }
    const inconsistentTruncation = {
      ...base,
      sectionSnapshot: {
        ...base.sectionSnapshot,
        visibleCharacterCount: base.sectionSnapshot.characterCount - 1,
        truncated: false,
      },
    }

    expect(resolve(fixture, [fixture.records[0], mismatchedCount]).ok).toBe(false)
    expect(resolve(fixture, [fixture.records[0], inconsistentTruncation]).ok).toBe(
      false,
    )
  })

  it('derives partial visible bounds from the canonical current substring', () => {
    const longBody = `Requirement 1 ${'א'.repeat(23_970)}\nHidden tail line.`
    const fixture = createFixture({ sectionCount: 2, firstSectionBody: longBody })
    const result = resolve(fixture, fixture.records)

    expect(result.ok).toBe(true)

    if (!result.ok) {
      throw new Error(result.error)
    }

    expect(result.selectedAnalyses[0].section).toMatchObject({
      visibleCharacterCount: 24_000,
      truncated: true,
      visibleEndLine: 3,
    })
    expect(result.selectedAnalyses[0].context.visibleSection.content).toHaveLength(
      24_000,
    )
  })

  it('changes exact analysis identity for a newer analysis using the same record ID', () => {
    const fixture = createFixture()
    const original = resolve(fixture, fixture.records.slice(0, 2))
    const newer = {
      ...fixture.records[0],
      analyzedAt: '2026-07-18T08:20:00.000Z',
    }
    const replacement = resolve(fixture, [newer, fixture.records[1]])

    expect(original.ok).toBe(true)
    expect(replacement.ok).toBe(true)

    if (!original.ok || !replacement.ok) {
      throw new Error(original.error ?? replacement.error)
    }

    expect(newer.id).toBe(fixture.records[0].id)
    expect(replacement.selectedAnalyses[0].analysisRef.analysisRefId).not.toBe(
      original.selectedAnalyses[0].analysisRef.analysisRefId,
    )
    expect(replacement.selectedSetDigest).not.toBe(original.selectedSetDigest)
  })

  it('freshly fingerprints the complete plan and changes identity when it changes', () => {
    const fixture = createFixture()
    const changed = cloneRecord(fixture.records[0])
    changed.plan.actors.push('מנהל / Admin')
    const originalRef = createAiCoveragePlanMergeSelectedAnalysisRef(
      fixture.records[0],
    )
    const changedRef = createAiCoveragePlanMergeSelectedAnalysisRef(changed)
    const result = resolve(fixture, [changed, fixture.records[1]])

    expect(result.ok).toBe(true)
    expect(createAiCoveragePlanMergePlanFingerprint(changed.plan)).not.toBe(
      createAiCoveragePlanMergePlanFingerprint(fixture.records[0].plan),
    )
    expect(changedRef.planFingerprint).not.toBe(originalRef.planFingerprint)
    expect(changedRef.analysisRefId).not.toBe(originalRef.analysisRefId)
  })

  it('rejects forged or case-changed source-backed evidence', () => {
    const fixture = createFixture()
    const forged = cloneRecord(fixture.records[0])
    forged.plan.coverageAreas[0].evidence = [
      forged.plan.coverageAreas[0].evidence[0].toUpperCase(),
    ]

    expect(resolve(fixture, [forged, fixture.records[1]]).ok).toBe(false)
  })

  it('produces the same selected-set digest for every checkbox order', () => {
    const fixture = createFixture()
    const forward = resolve(fixture, fixture.records.slice(0, 4))
    const reverse = resolve(fixture, fixture.records.slice(0, 4).reverse())

    expect(forward.ok).toBe(true)
    expect(reverse.ok).toBe(true)

    if (!forward.ok || !reverse.ok) {
      throw new Error(forward.error ?? reverse.error)
    }

    expect(reverse.selectedSetDigest).toBe(forward.selectedSetDigest)
    expect(reverse.selectedAnalyses.map(({ analysisRef }) => analysisRef)).toEqual(
      forward.selectedAnalyses.map(({ analysisRef }) => analysisRef),
    )
  })

  it('supports Hebrew and mixed Unicode without locale-dependent ordering', () => {
    const fixture = createFixture({ sectionCount: 3 })
    const result = resolve(fixture, [fixture.records[2], fixture.records[0]])

    expect(result.ok).toBe(true)

    if (!result.ok) {
      throw new Error(result.error)
    }

    expect(result.selectedSetDigest).toMatch(/^merge-selected-set-/)
    expect(result.selectedAnalyses[0].context.visibleSection.content).toContain(
      'שלום',
    )
  })

  it('fails a malformed selected record but isolates malformed unselected siblings', () => {
    const fixture = createFixture({ sectionCount: 4 })
    const malformed = {
      ...fixture.records[2],
      plan: { ...fixture.records[2].plan, rawProviderResponse: 'unsafe' },
    }

    expect(resolve(fixture, [fixture.records[0], malformed]).ok).toBe(false)

    const isolated = resolve(fixture, fixture.records.slice(0, 2), {
      allRecords: [...fixture.records, malformed],
    })

    expect(isolated.ok).toBe(true)
  })

  it('classifies selected, current unselected, stale, and unanalyzed scope', () => {
    const fixture = createFixture({ sectionCount: 5 })
    const stale = {
      ...fixture.records[3],
      analyzedAt: '2026-07-18T07:00:00.000Z',
    }
    const result = resolve(fixture, fixture.records.slice(0, 2), {
      allRecords: [
        fixture.records[0],
        fixture.records[1],
        fixture.records[2],
        stale,
      ],
    })

    expect(result.ok).toBe(true)

    if (!result.ok) {
      throw new Error(result.error)
    }

    expect(result.sectionScope.selected).toHaveLength(2)
    expect(result.sectionScope.unselected).toHaveLength(1)
    expect(result.sectionScope.stale).toHaveLength(1)
    expect(result.sectionScope.unanalyzed).toHaveLength(1)
    expect(result.sectionScope.excluded).toEqual([])
  })
})
