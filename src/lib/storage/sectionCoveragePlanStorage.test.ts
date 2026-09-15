import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createQaSource } from '../../test/qaSourceFactory'
import {
  createQaSourceSectionIndex,
  type QaSourceSectionIndex,
} from '../../features/qa-sources/qaSourceSections'
import { resolveAiSectionCoveragePlanContext } from '../../features/ai-suggestions/aiSectionCoveragePlanContext'
import { AI_SECTION_COVERAGE_PLAN_SCHEMA_VERSION } from '../../features/ai-suggestions/aiSectionCoveragePlanTypes'
import type {
  AiSectionCoveragePlan,
  AiSectionCoveragePlanContext,
  PersistedSectionCoveragePlanRecord,
} from '../../features/ai-suggestions/aiSectionCoveragePlanTypes'
import {
  SECTION_COVERAGE_PLAN_STORAGE_KEY,
  SECTION_COVERAGE_PLAN_STORAGE_SCHEMA_VERSION,
  createPersistedSectionCoveragePlanRecord,
  findSectionCoveragePlanForSection,
  getSectionCoveragePlanFreshness,
  loadSectionCoveragePlans,
  removeSectionCoveragePlanForSection,
  saveSectionCoveragePlans,
  upsertSectionCoveragePlanRecord,
} from './sectionCoveragePlanStorage'

const GLOBAL_COVERAGE_PLAN_STORAGE_KEY =
  'qa-mission-control:ai-coverage-plans:v0.18'

function createPlan(): AiSectionCoveragePlan {
  return {
    schemaVersion: AI_SECTION_COVERAGE_PLAN_SCHEMA_VERSION,
    coverageAreas: [
      {
        id: 'section-coverage-area-1-locked-account-recovery',
        name: 'Locked account recovery',
        summary: 'Review support-assisted recovery.',
        behaviors: ['Locked accounts require support review.'],
        evidence: ['Locked accounts require support review.'],
        evidenceSupport: 'source_backed',
      },
    ],
    actors: ['Support agent'],
    states: ['Locked'],
    inputs: ['Account identifier'],
    failureModes: ['Support unavailable'],
    integrationRisks: [],
    permissionsSecurity: ['Only support can unlock an account'],
    dataPersistenceConcerns: ['Unlock actions should be auditable'],
    ambiguities: [
      {
        id: 'section-ambiguity-1',
        question: 'What proves account ownership?',
        whyItMatters: 'Recovery needs a verification boundary.',
        severity: 'high',
      },
    ],
    nextCoverage: [
      {
        id: 'section-next-coverage-1',
        title: 'Ownership verification',
        rationale: 'The verification rule is unspecified.',
        priority: 'high',
      },
    ],
    warnings: [],
  }
}

function createContextFixture(
  content = [
    '# Authentication',
    'Users sign in with valid credentials.',
    '',
    '## Locked accounts',
    'Locked accounts require support review.',
  ].join('\n'),
  sectionOffset = 1,
) {
  const qaSource = createQaSource({
    id: 'source-1',
    content,
    createdAt: '2026-07-18T08:00:00.000Z',
    updatedAt: '2026-07-18T08:00:00.000Z',
  })
  const sectionIndex = createQaSourceSectionIndex(
    qaSource,
    '2026-07-18T08:01:00.000Z',
  )
  const selectedSection = sectionIndex.sections[sectionOffset]
  const result = resolveAiSectionCoveragePlanContext({
    qaSource,
    sectionIndex,
    selectedSection: {
      sectionId: selectedSection.id,
      stableKey: selectedSection.stableKey,
    },
  })

  if (!result.ok) {
    throw new Error(result.error)
  }

  return { qaSource, sectionIndex, context: result.context }
}

function createRecord({
  context = createContextFixture().context,
  analyzedAt = '2026-07-18T08:02:00.000Z',
  id,
}: {
  context?: AiSectionCoveragePlanContext
  analyzedAt?: string
  id?: string
} = {}) {
  const record = createPersistedSectionCoveragePlanRecord({
    context,
    plan: createPlan(),
    analyzedAt,
  })

  return id ? { ...record, id } : record
}

function writeRawRecords(records: unknown[]) {
  window.localStorage.setItem(
    SECTION_COVERAGE_PLAN_STORAGE_KEY,
    JSON.stringify({
      storageSchemaVersion: SECTION_COVERAGE_PLAN_STORAGE_SCHEMA_VERSION,
      records,
    }),
  )
}

describe('sectionCoveragePlanStorage', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.restoreAllMocks()
  })

  it('round trips one safe record without persisting source or section content', () => {
    const record = createRecord()

    expect(saveSectionCoveragePlans([record])).toEqual({ ok: true, error: null })
    expect(loadSectionCoveragePlans()).toEqual({ records: [record], error: null })

    const rawValue = window.localStorage.getItem(
      SECTION_COVERAGE_PLAN_STORAGE_KEY,
    )
    expect(rawValue).not.toContain('Users sign in with valid credentials.')
    expect(rawValue).not.toContain('preview')
    expect(rawValue).not.toContain('startOffset')
    expect(rawValue).not.toContain('rawResponse')
  })

  it('stores independent sections and replaces only the latest exact identity', () => {
    const fixture = createContextFixture()
    const firstSection = fixture.sectionIndex.sections[0]
    const firstContextResult = resolveAiSectionCoveragePlanContext({
      qaSource: fixture.qaSource,
      sectionIndex: fixture.sectionIndex,
      selectedSection: {
        sectionId: firstSection.id,
        stableKey: firstSection.stableKey,
      },
    })

    if (!firstContextResult.ok) {
      throw new Error(firstContextResult.error)
    }

    const first = createRecord({ context: firstContextResult.context })
    const second = createRecord({ context: fixture.context })
    const replacement = createRecord({
      context: fixture.context,
      analyzedAt: '2026-07-18T08:03:00.000Z',
    })
    const records = upsertSectionCoveragePlanRecord(
      upsertSectionCoveragePlanRecord([first], second),
      replacement,
    )

    expect(records).toHaveLength(2)
    expect(
      findSectionCoveragePlanForSection(
        records,
        fixture.context.sourceIdentity.qaSourceId,
        fixture.context.sectionIdentity.sectionId,
        fixture.context.sectionIdentity.stableKey,
      )?.analyzedAt,
    ).toBe('2026-07-18T08:03:00.000Z')
    expect(
      removeSectionCoveragePlanForSection(
        records,
        fixture.context.sourceIdentity.qaSourceId,
        fixture.context.sectionIdentity.sectionId,
        fixture.context.sectionIdentity.stableKey,
      ),
    ).toEqual([first])
  })

  it('keeps the previous valid value when a replacement save is unsafe', () => {
    const record = createRecord()
    expect(saveSectionCoveragePlans([record]).ok).toBe(true)
    const previousRawValue = window.localStorage.getItem(
      SECTION_COVERAGE_PLAN_STORAGE_KEY,
    )
    const unsafeReplacement = {
      ...record,
      plan: { ...record.plan, prompt: 'do not persist' },
    } as unknown as PersistedSectionCoveragePlanRecord

    expect(saveSectionCoveragePlans([unsafeReplacement]).ok).toBe(false)
    expect(
      window.localStorage.getItem(SECTION_COVERAGE_PLAN_STORAGE_KEY),
    ).toBe(previousRawValue)
  })

  it('orders records deterministically', () => {
    const firstFixture = createContextFixture()
    const secondSource = createContextFixture('# Other source\nOther behavior.', 0)
    const first = createRecord({ context: firstFixture.context, id: 'record-z' })
    const earlier = createRecord({
      context: firstFixture.context,
      analyzedAt: '2026-07-18T08:01:00.000Z',
      id: 'record-a',
    })
    const other = createRecord({
      context: {
        ...secondSource.context,
        sourceIdentity: {
          ...secondSource.context.sourceIdentity,
          qaSourceId: 'source-2',
        },
      },
      id: 'record-other',
    })

    writeRawRecords([other, earlier, first])
    const loaded = loadSectionCoveragePlans()

    expect(loaded.records.map((record) => record.id)).toEqual([
      'record-z',
      'record-other',
    ])
    expect(loaded.error).toMatch(/duplicate/i)
  })

  it('isolates malformed siblings and preserves corrupt roots without rewriting', () => {
    const validRecord = createRecord()
    writeRawRecords([validRecord, { ...validRecord, id: ' padded-id ' }])

    const isolated = loadSectionCoveragePlans()
    expect(isolated.records).toEqual([validRecord])
    expect(isolated.error).toMatch(/ignored/i)

    const corruptRawValue = '{not json'
    window.localStorage.setItem(
      SECTION_COVERAGE_PLAN_STORAGE_KEY,
      corruptRawValue,
    )
    expect(loadSectionCoveragePlans()).toMatchObject({ records: [], error: expect.any(String) })
    expect(
      window.localStorage.getItem(SECTION_COVERAGE_PLAN_STORAGE_KEY),
    ).toBe(corruptRawValue)
  })

  it('rejects forbidden persisted data recursively', () => {
    const record = createRecord()
    const forbiddenRecords = [
      { ...record, prompt: 'unsafe' },
      { ...record, sectionSnapshot: { ...record.sectionSnapshot, content: 'unsafe' } },
      {
        ...record,
        plan: {
          ...record.plan,
          coverageAreas: [
            { ...record.plan.coverageAreas[0], providerPayload: { raw: true } },
          ],
        },
      },
      { ...record, approvals: ['approved'] },
      { ...record, imports: ['test-case-1'] },
      { ...record, providerUsage: { tokens: 10 } },
    ]

    forbiddenRecords.forEach((candidate) => {
      expect(
        saveSectionCoveragePlans([
          candidate as unknown as PersistedSectionCoveragePlanRecord,
        ]).ok,
      ).toBe(false)
    })
    expect(window.localStorage.getItem(SECTION_COVERAGE_PLAN_STORAGE_KEY)).toBeNull()
  })

  it('does not corrupt existing data when localStorage rejects a write', () => {
    const record = createRecord()
    expect(saveSectionCoveragePlans([record]).ok).toBe(true)
    const previousRawValue = window.localStorage.getItem(
      SECTION_COVERAGE_PLAN_STORAGE_KEY,
    )
    const setItem = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new DOMException('Quota exceeded', 'QuotaExceededError')
      })

    expect(saveSectionCoveragePlans([record])).toMatchObject({
      ok: false,
      error: expect.any(String),
    })
    setItem.mockRestore()
    expect(
      window.localStorage.getItem(SECTION_COVERAGE_PLAN_STORAGE_KEY),
    ).toBe(previousRawValue)
  })

  it('classifies the exact unchanged canonical source section as current', () => {
    const fixture = createContextFixture()
    const record = createRecord({ context: fixture.context })

    expect(
      getSectionCoveragePlanFreshness(
        record,
        fixture.qaSource,
        fixture.sectionIndex,
      ),
    ).toEqual({ isFresh: true, reasons: [] })
  })

  it('classifies every persisted source and section provenance mismatch as stale', () => {
    const fixture = createContextFixture()
    const record = createRecord({ context: fixture.context })
    const mutations: PersistedSectionCoveragePlanRecord[] = [
      { ...record, sourceIdentity: { ...record.sourceIdentity, qaSourceId: 'other' } },
      {
        ...record,
        sourceIdentity: {
          ...record.sourceIdentity,
          qaSourceCreatedAt: '2026-07-17T08:00:00.000Z',
        },
      },
      {
        ...record,
        sourceIdentity: {
          ...record.sourceIdentity,
          qaSourceUpdatedAt: '2026-07-17T08:00:00.000Z',
        },
      },
      {
        ...record,
        sourceIdentity: { ...record.sourceIdentity, sourceFingerprint: 'wrong' },
      },
      { ...record, analyzedAt: '2026-07-17T08:00:00.000Z' },
      {
        ...record,
        sectionIdentity: { ...record.sectionIdentity, sectionId: 'unknown' },
      },
      {
        ...record,
        sectionIdentity: { ...record.sectionIdentity, stableKey: 'unknown' },
      },
      {
        ...record,
        sectionIdentity: {
          ...record.sectionIdentity,
          sectionSchemaVersion: 'old-schema',
        },
      },
      {
        ...record,
        sectionIdentity: {
          ...record.sectionIdentity,
          sectionerVersion: 'old-sectioner',
        },
      },
      {
        ...record,
        sectionIdentity: {
          ...record.sectionIdentity,
          contentFingerprint: 'wrong',
        },
      },
      { ...record, sectionSnapshot: { ...record.sectionSnapshot, ordinal: 99 } },
      { ...record, sectionSnapshot: { ...record.sectionSnapshot, title: 'Other' } },
      { ...record, sectionSnapshot: { ...record.sectionSnapshot, path: ['Other'] } },
      { ...record, sectionSnapshot: { ...record.sectionSnapshot, startLine: 99 } },
      { ...record, sectionSnapshot: { ...record.sectionSnapshot, endLine: 99 } },
      {
        ...record,
        sectionSnapshot: { ...record.sectionSnapshot, characterCount: 99 },
      },
    ]

    mutations.forEach((candidate) => {
      expect(
        getSectionCoveragePlanFreshness(
          candidate,
          fixture.qaSource,
          fixture.sectionIndex,
        ).isFresh,
      ).toBe(false)
    })
    expect(
      getSectionCoveragePlanFreshness(record, null, null).isFresh,
    ).toBe(false)
  })

  it('marks an unrelated source edit stale and never reattaches a changed section by display metadata', () => {
    const fixture = createContextFixture()
    const record = createRecord({ context: fixture.context })
    const unrelatedEdit = {
      ...fixture.qaSource,
      content: `${fixture.qaSource.content}\n\nUnrelated footer note.`,
      updatedAt: '2026-07-18T09:00:00.000Z',
    }
    const unrelatedIndex = createQaSourceSectionIndex(unrelatedEdit)
    expect(
      getSectionCoveragePlanFreshness(record, unrelatedEdit, unrelatedIndex)
        .isFresh,
    ).toBe(false)

    const changedSource = {
      ...fixture.qaSource,
      content: fixture.qaSource.content.replace(
        'Locked accounts require support review.',
        'Locked accounts use automated recovery.',
      ),
      updatedAt: '2026-07-18T10:00:00.000Z',
    }
    const changedIndex = createQaSourceSectionIndex(changedSource)
    const changedSection = changedIndex.sections.find(
      (section) => section.title === record.sectionSnapshot.title,
    )

    expect(changedSection).toBeDefined()
    expect(
      findSectionCoveragePlanForSection(
        [record],
        changedSource.id,
        changedSection!.id,
        changedSection!.stableKey,
      ),
    ).toBeNull()
    expect(
      getSectionCoveragePlanFreshness(record, changedSource, changedIndex).isFresh,
    ).toBe(false)
  })

  it('rejects a forged current index and leaves global storage untouched', () => {
    const fixture = createContextFixture()
    const record = createRecord({ context: fixture.context })
    const forgedIndex: QaSourceSectionIndex = {
      ...fixture.sectionIndex,
      sections: fixture.sectionIndex.sections.map((section) =>
        section.id === record.sectionIdentity.sectionId
          ? { ...section, includedInCoverage: false }
          : section,
      ),
    }
    const globalRawValue = '{"existing":"global-plan"}'
    window.localStorage.setItem(GLOBAL_COVERAGE_PLAN_STORAGE_KEY, globalRawValue)

    expect(
      getSectionCoveragePlanFreshness(record, fixture.qaSource, forgedIndex)
        .isFresh,
    ).toBe(false)
    expect(saveSectionCoveragePlans([record]).ok).toBe(true)
    expect(window.localStorage.getItem(GLOBAL_COVERAGE_PLAN_STORAGE_KEY)).toBe(
      globalRawValue,
    )
  })
})


describe('section coverage plan successful stale replacement', () => {
  it('explicitly replaces an identity-changing stale record without creating history', () => {
    const fixture = createContextFixture()
    const staleRecord = createRecord({ context: fixture.context })
    const changedSource = {
      ...fixture.qaSource,
      content: fixture.qaSource.content.replace(
        'Locked accounts require support review.',
        'Locked accounts use automated recovery.',
      ),
      updatedAt: '2026-07-18T09:00:00.000Z',
    }
    const changedIndex = createQaSourceSectionIndex(changedSource)
    const changedSection = changedIndex.sections.find(
      (section) => section.title === staleRecord.sectionSnapshot.title,
    )

    if (!changedSection) {
      throw new Error('Expected changed canonical section.')
    }

    const changedContext = resolveAiSectionCoveragePlanContext({
      qaSource: changedSource,
      sectionIndex: changedIndex,
      selectedSection: {
        sectionId: changedSection.id,
        stableKey: changedSection.stableKey,
      },
    })

    if (!changedContext.ok) {
      throw new Error(changedContext.error)
    }

    const replacement = createRecord({
      context: changedContext.context,
      analyzedAt: '2026-07-18T09:01:00.000Z',
    })
    const records = upsertSectionCoveragePlanRecord(
      [staleRecord],
      replacement,
      staleRecord.id,
    )

    expect(records).toEqual([replacement])
    expect(records).not.toContainEqual(staleRecord)
  })
})
