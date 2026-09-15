import { describe, expect, it, vi } from 'vitest'
import { createAiCoveragePlanMergeSelectedSetDigest } from './aiCoveragePlanMergeEligibility'
import {
  createAiCoveragePlanMergeRequestContext,
  createAiCoveragePlanMergeRequestGuard,
  createAiCoveragePlanMergeRequestIdentity,
  isAiCoveragePlanMergeRequestIdentityCurrent,
  type AiCoveragePlanMergeRequestContext,
} from './aiCoveragePlanMergeRequestGuard'
import type {
  AiCoveragePlanMergeSelectedAnalysisRef,
  AiCoveragePlanMergeSourceRevision,
} from './aiCoveragePlanMergeTypes'

function createSourceRevision(
  overrides: Partial<AiCoveragePlanMergeSourceRevision> = {},
): AiCoveragePlanMergeSourceRevision {
  return {
    qaSourceId: 'source-1',
    qaSourceCreatedAt: '2026-07-18T08:00:00.000Z',
    qaSourceUpdatedAt: '2026-07-18T08:00:00.000Z',
    sourceFingerprint: 'source-fingerprint-1',
    sectionSchemaVersion: 'qa-source-sections-json-v1',
    sectionerVersion: 'qa-source-sectioner-v1',
    sectionSetFingerprint: 'section-set-1',
    ...overrides,
  }
}

function createAnalysisRef(
  index: number,
  overrides: Partial<AiCoveragePlanMergeSelectedAnalysisRef> = {},
): AiCoveragePlanMergeSelectedAnalysisRef {
  return {
    analysisRefId: `analysis-ref-${index}`,
    sectionPlanRecordId: `section-plan-record-${index}`,
    analyzedAt: `2026-07-18T08:${String(index + 10).padStart(2, '0')}:00.000Z`,
    planFingerprint: `section-plan-fingerprint-${index}`,
    sectionId: `section-${index}`,
    stableKey: `stable-key-${index}`,
    contentFingerprint: `content-fingerprint-${index}`,
    ...overrides,
  }
}

function createContext({
  sourceRevision = createSourceRevision(),
  selectedAnalyses = [createAnalysisRef(1), createAnalysisRef(2)],
}: {
  sourceRevision?: AiCoveragePlanMergeSourceRevision
  selectedAnalyses?: AiCoveragePlanMergeSelectedAnalysisRef[]
} = {}) {
  return createAiCoveragePlanMergeRequestContext({
    sourceRevision,
    selectedAnalyses,
  })
}

function mutateContext(
  context: AiCoveragePlanMergeRequestContext,
  mutate: (
    sourceRevision: AiCoveragePlanMergeSourceRevision,
    selectedAnalyses: AiCoveragePlanMergeSelectedAnalysisRef[],
  ) => void,
) {
  const sourceRevision = { ...context.sourceRevision }
  const selectedAnalyses = context.selectedAnalyses.map((item) => ({ ...item }))
  mutate(sourceRevision, selectedAnalyses)

  return createContext({ sourceRevision, selectedAnalyses })
}

describe('coverage-plan merge request guard', () => {
  it('binds and deeply freezes the whole sorted selected-set identity', () => {
    const context = createContext({
      selectedAnalyses: [createAnalysisRef(2), createAnalysisRef(1)],
    })
    const identity = createAiCoveragePlanMergeRequestIdentity(context, 7)

    expect(identity).toMatchObject({
      requestToken: 7,
      sourceRevision: context.sourceRevision,
      selectedSetDigest: createAiCoveragePlanMergeSelectedSetDigest(
        context.selectedAnalyses,
      ),
    })
    expect(identity.selectedAnalyses.map((item) => item.sectionId)).toEqual([
      'section-1',
      'section-2',
    ])
    expect(Object.isFrozen(identity)).toBe(true)
    expect(Object.isFrozen(identity.sourceRevision)).toBe(true)
    expect(Object.isFrozen(identity.selectedAnalyses)).toBe(true)
    expect(Object.isFrozen(identity.selectedAnalyses[0])).toBe(true)
  })

  it('treats reordered identical analyses as the same request identity', () => {
    const original = createContext()
    const reordered = createContext({
      selectedAnalyses: [...original.selectedAnalyses].reverse(),
    })
    const identity = createAiCoveragePlanMergeRequestIdentity(original, 1)

    expect(
      isAiCoveragePlanMergeRequestIdentityCurrent(identity, reordered, 1),
    ).toBe(true)
  })

  it('invalidates source edit, deletion, switch, schema, sectioner, and section-index changes', () => {
    const original = createContext()
    const mutations: Array<AiCoveragePlanMergeRequestContext | null> = [
      null,
      mutateContext(original, (source) => {
        source.qaSourceId = 'source-2'
      }),
      mutateContext(original, (source) => {
        source.qaSourceUpdatedAt = '2026-07-18T09:00:00.000Z'
      }),
      mutateContext(original, (source) => {
        source.sourceFingerprint = 'source-fingerprint-2'
      }),
      mutateContext(original, (source) => {
        source.sectionSchemaVersion = 'qa-source-sections-json-v2'
      }),
      mutateContext(original, (source) => {
        source.sectionerVersion = 'qa-source-sectioner-v2'
      }),
      mutateContext(original, (source) => {
        source.sectionSetFingerprint = 'section-set-2'
      }),
    ]

    mutations.forEach((currentContext) => {
      const identity = createAiCoveragePlanMergeRequestIdentity(original, 1)

      expect(
        isAiCoveragePlanMergeRequestIdentityCurrent(
          identity,
          currentContext,
          1,
        ),
      ).toBe(false)
    })
  })

  it('invalidates section-plan replacement, analyzedAt, plan, section content, and selection changes', () => {
    const original = createContext()
    const mutations = [
      mutateContext(original, (_source, selected) => {
        selected[0].sectionPlanRecordId = 'replacement-record'
      }),
      mutateContext(original, (_source, selected) => {
        selected[0].analyzedAt = '2026-07-18T10:00:00.000Z'
      }),
      mutateContext(original, (_source, selected) => {
        selected[0].planFingerprint = 'replacement-plan-fingerprint'
      }),
      mutateContext(original, (_source, selected) => {
        selected[0].contentFingerprint = 'replacement-content-fingerprint'
      }),
      mutateContext(original, (_source, selected) => {
        selected[0].sectionId = 'replacement-section'
      }),
      createContext({
        selectedAnalyses: [
          ...original.selectedAnalyses,
          createAnalysisRef(3),
        ],
      }),
    ]
    const identity = createAiCoveragePlanMergeRequestIdentity(original, 1)

    mutations.forEach((currentContext) => {
      expect(
        isAiCoveragePlanMergeRequestIdentityCurrent(
          identity,
          currentContext,
          1,
        ),
      ).toBe(false)
    })
  })

  it('rejects a forged supplied selected-set digest', () => {
    const context = createContext()
    const forged = {
      ...context,
      selectedSetDigest: 'merge-selected-set-forged',
    }

    expect(() =>
      createAiCoveragePlanMergeRequestIdentity(forged, 1),
    ).toThrow(/digest/i)
  })

  it('uses a synchronous lock to prevent a rapid second begin', () => {
    const context = createContext()
    const guard = createAiCoveragePlanMergeRequestGuard()
    const first = guard.begin(context)
    const second = guard.begin(context)
    const changed = guard.begin(
      mutateContext(context, (_source, selected) => {
        selected[0].planFingerprint = 'changed'
      }),
    )

    expect(first).not.toBeNull()
    expect(second).toBeNull()
    expect(changed).toBeNull()
    expect(first?.signal.aborted).toBe(false)
    expect(guard.isInFlight()).toBe(true)
  })

  it('explicit replacement aborts the older request and issues a higher token', () => {
    const context = createContext()
    const guard = createAiCoveragePlanMergeRequestGuard()
    const first = guard.begin(context)
    const second = guard.replace(context)

    expect(first).not.toBeNull()
    expect(second).not.toBeNull()
    expect(first?.signal.aborted).toBe(true)
    expect(second?.signal.aborted).toBe(false)
    expect(second!.identity.requestToken).toBeGreaterThan(
      first!.identity.requestToken,
    )
    expect(guard.canAccept(first!.identity, context)).toBe(false)
    expect(guard.canAccept(second!.identity, context)).toBe(true)
  })

  it('aborts when the current selected-set context changes', () => {
    const context = createContext()
    const changed = mutateContext(context, (_source, selected) => {
      selected[1].analyzedAt = '2026-07-18T11:00:00.000Z'
    })
    const guard = createAiCoveragePlanMergeRequestGuard()
    const request = guard.begin(context)

    expect(request).not.toBeNull()
    expect(guard.invalidateIfContextChanged(changed)).toBe(true)
    expect(request?.signal.aborted).toBe(true)
    expect(guard.canAccept(request!.identity, changed)).toBe(false)
  })

  it('ignores late responses before validation or candidate publication', () => {
    const context = createContext()
    const guard = createAiCoveragePlanMergeRequestGuard()
    const stale = guard.begin(context)
    const current = guard.replace(context)
    const validateAndPublish = vi.fn()

    expect(
      guard.acceptIfCurrent(stale!.identity, context, validateAndPublish),
    ).toBe(false)
    expect(validateAndPublish).not.toHaveBeenCalled()

    expect(
      guard.acceptIfCurrent(current!.identity, context, validateAndPublish),
    ).toBe(true)
    expect(validateAndPublish).toHaveBeenCalledTimes(1)
    expect(guard.isInFlight()).toBe(false)
  })

  it('releases the lock after a handled failure without accepting a result', () => {
    const context = createContext()
    const guard = createAiCoveragePlanMergeRequestGuard()
    const request = guard.begin(context)

    expect(guard.releaseIfCurrent(request!.identity)).toBe(true)
    expect(guard.isInFlight()).toBe(false)
    expect(guard.begin(context)).not.toBeNull()
  })

  it('dispose aborts on unmount, ignores late work, and cannot be reused', () => {
    const context = createContext()
    const guard = createAiCoveragePlanMergeRequestGuard()
    const request = guard.begin(context)
    const publish = vi.fn()

    expect(guard.dispose()).toBe(true)
    expect(request?.signal.aborted).toBe(true)
    expect(
      guard.acceptIfCurrent(request!.identity, context, publish),
    ).toBe(false)
    expect(publish).not.toHaveBeenCalled()
    expect(guard.begin(context)).toBeNull()
    expect(guard.replace(context)).toBeNull()
  })
})
