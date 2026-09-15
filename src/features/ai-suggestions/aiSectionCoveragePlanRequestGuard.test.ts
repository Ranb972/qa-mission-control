import { describe, expect, it, vi } from 'vitest'
import { createQaSource } from '../../test/qaSourceFactory'
import { createQaSourceSectionIndex } from '../qa-sources/qaSourceSections'
import { resolveAiSectionCoveragePlanContext } from './aiSectionCoveragePlanContext'
import {
  createAiSectionCoveragePlanRequestGuard,
  createAiSectionCoveragePlanRequestIdentity,
  isAiSectionCoveragePlanRequestIdentityCurrent,
} from './aiSectionCoveragePlanRequestGuard'
import type { AiSectionCoveragePlanContext } from './aiSectionCoveragePlanTypes'

function createContexts() {
  const qaSource = createQaSource({
    id: 'source-1',
    content: [
      '# Authentication',
      'Users sign in.',
      '',
      '## Locked accounts',
      'Locked accounts require support review.',
    ].join('\n'),
    createdAt: '2026-07-18T08:00:00.000Z',
    updatedAt: '2026-07-18T08:00:00.000Z',
  })
  const sectionIndex = createQaSourceSectionIndex(qaSource)
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

  return { qaSource, sectionIndex, contexts }
}

function changeContext(
  context: AiSectionCoveragePlanContext,
  overrides: Partial<AiSectionCoveragePlanContext>,
) {
  return { ...context, ...overrides }
}

describe('AI section coverage plan request guard', () => {
  it('binds an immutable identity to exact source and section provenance plus a token', () => {
    const context = createContexts().contexts[0]
    const identity = createAiSectionCoveragePlanRequestIdentity(context, 7)

    expect(identity).toEqual({
      sourceId: context.sourceIdentity.qaSourceId,
      sourceCreatedAt: context.sourceIdentity.qaSourceCreatedAt,
      sourceUpdatedAt: context.sourceIdentity.qaSourceUpdatedAt,
      sourceFingerprint: context.sourceIdentity.sourceFingerprint,
      sectionId: context.sectionIdentity.sectionId,
      sectionStableKey: context.sectionIdentity.stableKey,
      sectionContentFingerprint: context.sectionIdentity.contentFingerprint,
      requestToken: 7,
    })
    expect(Object.isFrozen(identity)).toBe(true)
    expect(isAiSectionCoveragePlanRequestIdentityCurrent(identity, context, 7)).toBe(
      true,
    )
  })

  it('invalidates source edits, deletion, source switch, and selected-section changes', () => {
    const { contexts } = createContexts()
    const original = contexts[0]
    const changedSourceRevision = changeContext(original, {
      sourceIdentity: {
        ...original.sourceIdentity,
        qaSourceUpdatedAt: '2026-07-18T09:00:00.000Z',
        sourceFingerprint: 'source-new-revision',
      },
    })
    const switchedSource = changeContext(original, {
      sourceIdentity: {
        ...original.sourceIdentity,
        qaSourceId: 'source-2',
      },
    })
    const changedSection = contexts[1]
    const changedSectionContent = changeContext(original, {
      sectionIdentity: {
        ...original.sectionIdentity,
        contentFingerprint: 'section-new-content',
      },
    })
    const changedContexts = [
      changedSourceRevision,
      switchedSource,
      changedSection,
      changedSectionContent,
      null,
    ]

    changedContexts.forEach((currentContext) => {
      const guard = createAiSectionCoveragePlanRequestGuard()
      const request = guard.begin(original)

      expect(guard.invalidateIfContextChanged(currentContext)).toBe(true)
      expect(request.signal.aborted).toBe(true)
      expect(guard.canAccept(request.identity, currentContext)).toBe(false)
    })
  })

  it('aborts an older request and assigns a higher token when a newer request begins', () => {
    const context = createContexts().contexts[0]
    const guard = createAiSectionCoveragePlanRequestGuard()
    const first = guard.begin(context)
    const second = guard.begin(context)

    expect(first.signal.aborted).toBe(true)
    expect(second.signal.aborted).toBe(false)
    expect(second.identity.requestToken).toBeGreaterThan(
      first.identity.requestToken,
    )
    expect(guard.canAccept(first.identity, context)).toBe(false)
    expect(guard.canAccept(second.identity, context)).toBe(true)
  })

  it('runs normalization/persistence only for the current response', () => {
    const { contexts } = createContexts()
    const guard = createAiSectionCoveragePlanRequestGuard()
    const staleRequest = guard.begin(contexts[0])
    const currentRequest = guard.begin(contexts[1])
    const normalizeAndPersist = vi.fn()

    expect(
      guard.acceptIfCurrent(
        staleRequest.identity,
        contexts[0],
        normalizeAndPersist,
      ),
    ).toBe(false)
    expect(normalizeAndPersist).not.toHaveBeenCalled()

    expect(
      guard.acceptIfCurrent(
        currentRequest.identity,
        contexts[1],
        normalizeAndPersist,
      ),
    ).toBe(true)
    expect(normalizeAndPersist).toHaveBeenCalledTimes(1)
    expect(guard.canAccept(currentRequest.identity, contexts[1])).toBe(false)
  })

  it('explicit invalidation aborts the active request and prevents a late overwrite', () => {
    const context = createContexts().contexts[0]
    const guard = createAiSectionCoveragePlanRequestGuard()
    const request = guard.begin(context)
    const replaceSavedRecord = vi.fn()

    guard.invalidate()

    expect(request.signal.aborted).toBe(true)
    expect(
      guard.acceptIfCurrent(request.identity, context, replaceSavedRecord),
    ).toBe(false)
    expect(replaceSavedRecord).not.toHaveBeenCalled()
  })
})
