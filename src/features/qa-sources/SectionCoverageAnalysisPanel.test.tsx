import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveAiSectionCoveragePlanContext } from '../ai-suggestions/aiSectionCoveragePlanContext'
import type { AiSectionCoveragePlanProvider } from '../ai-suggestions/aiSectionCoveragePlanTypes'
import { parseAiSectionCoveragePlanResponse } from '../ai-suggestions/aiSectionCoveragePlanValidation'
import {
  createPersistedSectionCoveragePlanRecord,
  getSectionCoveragePlanFreshness,
  parsePersistedRecord,
} from '../../lib/storage/sectionCoveragePlanStorage'
import { createQaSource } from '../../test/qaSourceFactory'
import { createQaSourceSectionIndex } from './qaSourceSections'
import type { QaSource } from './qaSourceTypes'
import {
  SectionCoverageAnalysisPanel,
  type SectionCoverageAnalysisRequestState,
} from './SectionCoverageAnalysisPanel'

function createProviderResponse() {
  return {
    schemaVersion: 'section-coverage-plan-json-v1' as const,
    coverageAreas: [
      {
        name: 'Selected recovery behavior',
        summary: 'Review the selected recovery rule.',
        behaviors: ['Recover a locked account'],
        evidence: ['Locked accounts require support review. שלום'],
        behaviorEvidence: [{ behavior: 'Recover a locked account', evidence: ['Locked accounts require support review. שלום'] }],
      },
      {
        name: 'Unsupported recovery detail',
        summary: 'This area needs QA review.',
        behaviors: ['Confirm an unspecified recovery detail'],
        evidence: ['Fabricated recovery evidence.'],
      },
    ],
    actors: ['Support agent'],
    states: ['Locked'],
    inputs: ['Account identifier'],
    failureModes: ['Support unavailable'],
    integrationRisks: ['Identity provider timeout'],
    permissionsSecurity: ['Only support may unlock an account'],
    dataPersistenceConcerns: ['Unlock actions should be auditable'],
    ambiguities: [
      {
        question: 'What proves account ownership?',
        whyItMatters: 'Recovery needs a verification boundary.',
        severity: 'high' as const,
      },
    ],
    nextCoverage: [
      {
        title: 'Ownership verification',
        rationale: 'The verification rule is unspecified.',
        priority: 'high' as const,
      },
    ],
    warnings: ['Review ambiguous ownership verification.'],
  }
}

function createFixture(
  overrides: Partial<QaSource> = {},
  selectedTitle = 'Locked accounts',
) {
  const qaSource = createQaSource({
    id: 'source-1',
    title: 'Authentication LLD',
    content: [
      '# Authentication',
      'Users sign in with valid credentials.',
      '',
      '## Locked accounts',
      'Locked accounts require support review. שלום',
      '',
      '# Billing',
      'Billing behavior belongs to the following section.',
    ].join('\n'),
    createdAt: '2026-07-18T08:00:00.000Z',
    updatedAt: '2026-07-18T08:00:00.000Z',
    ...overrides,
  })
  const sectionIndex = createQaSourceSectionIndex(qaSource)
  const section = sectionIndex.sections.find(
    (candidate) => candidate.title === selectedTitle,
  )

  if (!section) {
    throw new Error(`Expected section ${selectedTitle}.`)
  }

  const contextResult = resolveAiSectionCoveragePlanContext({
    qaSource,
    sectionIndex,
    selectedSection: {
      sectionId: section.id,
      stableKey: section.stableKey,
    },
  })

  if (!contextResult.ok) {
    throw new Error(contextResult.error)
  }

  return {
    qaSource,
    sectionIndex,
    section,
    context: contextResult.context,
  }
}

function createRecord(fixture = createFixture()) {
  const normalized = parseAiSectionCoveragePlanResponse(
    createProviderResponse(),
    { visibleSectionContent: fixture.context.visibleSection.content },
  )

  if (!normalized.ok || !normalized.plan) {
    throw new Error(normalized.error ?? 'Expected a normalized plan.')
  }

  return createPersistedSectionCoveragePlanRecord({
    context: fixture.context,
    plan: normalized.plan,
    analyzedAt: '2026-07-18T08:01:00.000Z',
  })
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })

  return { promise, resolve, reject }
}

type HarnessProps = {
  fixture: ReturnType<typeof createFixture>
  provider: AiSectionCoveragePlanProvider
  initialRecord?: ReturnType<typeof createRecord> | null
  onUpsert?: ReturnType<typeof vi.fn>
}

function PanelHarness({
  fixture,
  provider,
  initialRecord = null,
  onUpsert = vi.fn(),
}: HarnessProps) {
  const [requestState, setRequestState] =
    useState<SectionCoverageAnalysisRequestState>({ status: 'idle' })
  const [savedRecord, setSavedRecord] = useState(initialRecord)
  const freshness = savedRecord
    ? getSectionCoveragePlanFreshness(
        savedRecord,
        fixture.qaSource,
        fixture.sectionIndex,
      )
    : null

  return (
    <SectionCoverageAnalysisPanel
      qaSource={fixture.qaSource}
      sectionIndex={fixture.sectionIndex}
      section={fixture.section}
      selectedSection={{
        sectionId: fixture.section.id,
        stableKey: fixture.section.stableKey,
      }}
      savedRecord={savedRecord}
      freshness={freshness}
      provider={provider}
      requestState={requestState}
      onRequestStateChange={setRequestState}
      onUpsert={(nextRecord, replacedRecordId) => {
        onUpsert(nextRecord, replacedRecordId)
        setSavedRecord(nextRecord)
        return { ok: true, error: null }
      }}
    />
  )
}

function createProvider(
  generateSectionCoveragePlan: AiSectionCoveragePlanProvider['generateSectionCoveragePlan'],
): AiSectionCoveragePlanProvider {
  return {
    isAvailable: true,
    generateSectionCoveragePlan,
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('SectionCoverageAnalysisPanel', () => {
  it('shows the not-analyzed state and precise privacy/review meaning', () => {
    const fixture = createFixture()
    const provider = createProvider(vi.fn())

    render(<PanelHarness fixture={fixture} provider={provider} />)

    expect(
      screen.getByRole('region', {
        name: 'Section coverage analysis for Locked accounts',
      }),
    ).not.toHaveAttribute('aria-busy', 'true')
    expect(screen.getByText(/has not been analyzed/)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Analyze section' }),
    ).toBeEnabled()
    expect(
      screen.getByText(/Only the selected section’s visible source text/),
    ).toHaveTextContent('up to 24,000 characters')
    expect(
      screen.getByText(
        'Section analysis is review material, not coverage proof or QA approval.',
      ),
    ).toBeInTheDocument()
    expect(provider.generateSectionCoveragePlan).not.toHaveBeenCalled()
  })

  it('disables duplicate submission, saves one normalized result, renders review categories, and focuses completion', async () => {
    const user = userEvent.setup()
    const fixture = createFixture()
    const deferred = createDeferred<
      Awaited<
        ReturnType<AiSectionCoveragePlanProvider['generateSectionCoveragePlan']>
      >
    >()
    const generateSectionCoveragePlan = vi.fn(() => deferred.promise)
    const provider = createProvider(generateSectionCoveragePlan)
    const onUpsert = vi.fn()

    render(
      <PanelHarness
        fixture={fixture}
        provider={provider}
        onUpsert={onUpsert}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Analyze section' }))

    const panel = screen.getByRole('region', {
      name: 'Section coverage analysis for Locked accounts',
    })

    expect(panel).toHaveAttribute('aria-busy', 'true')
    expect(
      screen.getByRole('button', { name: 'Analyzing…' }),
    ).toBeDisabled()
    expect(
      screen.getByText('Analyzing “Locked accounts”…', {
        selector: '[aria-live]',
      }),
    ).toBeInTheDocument()
    expect(generateSectionCoveragePlan).toHaveBeenCalledTimes(1)

    await act(async () => {
      deferred.resolve({
        analysis: createProviderResponse(),
        warnings: ['Server validation warning.'],
      })
      await deferred.promise
    })

    const resultHeading = await screen.findByRole('heading', {
      name: 'Current section analysis',
    })

    expect(resultHeading).toHaveFocus()
    expect(onUpsert).toHaveBeenCalledTimes(1)
    expect(onUpsert.mock.calls[0][0].plan.coverageAreas).toEqual([
      expect.objectContaining({ evidenceSupport: 'source_backed' }),
      expect.objectContaining({ evidenceSupport: 'needs_review' }),
    ])
    expect(screen.getByText('Selected recovery behavior')).toBeInTheDocument()
    expect(screen.getByText('Evidence linked for each behavior')).toBeInTheDocument()
    expect(screen.getByText('No validated behavior evidence')).toBeInTheDocument()
    expect(screen.getByText('Support agent')).toBeInTheDocument()
    expect(screen.getByText('Locked')).toBeInTheDocument()
    expect(screen.getByText('Account identifier')).toBeInTheDocument()
    expect(screen.getByText('Support unavailable')).toBeInTheDocument()
    expect(screen.getByText('Identity provider timeout')).toBeInTheDocument()
    expect(
      screen.getByText('Only support may unlock an account'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Unlock actions should be auditable'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('What proves account ownership?'),
    ).toBeInTheDocument()
    expect(screen.getByText('Ownership verification')).toBeInTheDocument()
    expect(screen.getByText('Server validation warning.')).toBeInTheDocument()
    expect(screen.queryByText(/readiness/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/approval control/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /import/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Test Case/i })).not.toBeInTheDocument()
  })

  it.each(['linked', 'legacy'] as const)('restores a current %s result with honest evidence state and no provider call', (format) => {
    const fixture = createFixture()
    const record = createRecord(fixture)
    const provider = createProvider(vi.fn())
    if (format === 'legacy') {
      record.plan.coverageAreas.forEach((area) => { delete area.behaviorEvidence })
    }
    expect(parsePersistedRecord(JSON.parse(JSON.stringify(record)))).toEqual(record)

    render(
      <PanelHarness
        fixture={fixture}
        provider={provider}
        initialRecord={record}
      />,
    )

    expect(
      screen.getByRole('heading', { name: 'Current section analysis' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Selected recovery behavior')).toBeInTheDocument()
    expect(screen.getByText(format === 'legacy' ? 'Partial evidence · review behaviors' : 'Evidence linked for each behavior')).toBeInTheDocument()
    if (format === 'legacy') expect(screen.queryByText('Evidence linked for each behavior')).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Re-analyze section' }),
    ).toBeEnabled()
    expect(provider.generateSectionCoveragePlan).not.toHaveBeenCalled()
  })

  it('keeps a stale saved snapshot visible when re-analysis fails and never exposes the thrown error', async () => {
    const user = userEvent.setup()
    const originalFixture = createFixture()
    const staleRecord = createRecord(originalFixture)
    const changedFixture = createFixture({
      content: `${originalFixture.qaSource.content}\nUnrelated billing note.`,
      updatedAt: '2026-07-18T09:00:00.000Z',
    })
    const deferred = createDeferred<never>()
    const provider = createProvider(vi.fn(() => deferred.promise))
    const onUpsert = vi.fn()

    render(
      <PanelHarness
        fixture={changedFixture}
        provider={provider}
        initialRecord={staleRecord}
        onUpsert={onUpsert}
      />,
    )

    expect(
      screen.getByText(/This saved analysis reflects an earlier source revision/),
    ).toBeInTheDocument()
    expect(screen.getByText(/Saved snapshot:/)).toHaveTextContent(
      'Authentication / Locked accounts',
    )

    await user.click(
      screen.getByRole('button', { name: 'Re-analyze section' }),
    )

    expect(
      screen.getByText(/This saved analysis reflects an earlier source revision/),
    ).toBeInTheDocument()

    await act(async () => {
      deferred.reject(new Error('SECRET_SOURCE_STACK provider payload'))
      try {
        await deferred.promise
      } catch {
        // Expected rejection drives the safe transient failure state.
      }
    })

    const errorHeading = await screen.findByRole('heading', {
      name: 'Section analysis failed',
    })

    expect(errorHeading).toHaveFocus()
    expect(screen.getByText(/could not be completed safely/)).toBeInTheDocument()
    expect(screen.queryByText(/SECRET_SOURCE_STACK/)).not.toBeInTheDocument()
    expect(
      screen.getByText(/This saved analysis reflects an earlier source revision/),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled()
    expect(onUpsert).not.toHaveBeenCalled()
  })

  it('aborts and ignores a late response after the source revision changes', async () => {
    const user = userEvent.setup()
    const originalFixture = createFixture()
    const changedFixture = createFixture({
      content: `${originalFixture.qaSource.content}\nUnrelated billing note.`,
      updatedAt: '2026-07-18T09:00:00.000Z',
    })
    const deferred = createDeferred<
      Awaited<
        ReturnType<AiSectionCoveragePlanProvider['generateSectionCoveragePlan']>
      >
    >()
    const provider = createProvider(vi.fn(() => deferred.promise))
    const onUpsert = vi.fn()
    const view = render(
      <PanelHarness
        fixture={originalFixture}
        provider={provider}
        onUpsert={onUpsert}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Analyze section' }))

    const signal = vi.mocked(provider.generateSectionCoveragePlan).mock.calls[0][1]
      ?.signal

    view.rerender(
      <PanelHarness
        fixture={changedFixture}
        provider={provider}
        onUpsert={onUpsert}
      />,
    )

    await waitFor(() => expect(signal?.aborted).toBe(true))

    await act(async () => {
      deferred.resolve({ analysis: createProviderResponse(), warnings: [] })
      await deferred.promise
    })

    expect(onUpsert).not.toHaveBeenCalled()
    expect(
      screen.queryByRole('heading', { name: 'Current section analysis' }),
    ).not.toBeInTheDocument()
  })

  it('lets a newer selected-section request win and ignores the older response', async () => {
    const user = userEvent.setup()
    const lockedFixture = createFixture()
    const billingFixture = createFixture({}, 'Billing')
    const first = createDeferred<
      Awaited<
        ReturnType<AiSectionCoveragePlanProvider['generateSectionCoveragePlan']>
      >
    >()
    const second = createDeferred<
      Awaited<
        ReturnType<AiSectionCoveragePlanProvider['generateSectionCoveragePlan']>
      >
    >()
    const provider = createProvider(
      vi
        .fn()
        .mockImplementationOnce(() => first.promise)
        .mockImplementationOnce(() => second.promise),
    )
    const onUpsert = vi.fn()
    const view = render(
      <PanelHarness
        fixture={lockedFixture}
        provider={provider}
        onUpsert={onUpsert}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Analyze section' }))
    const firstSignal = vi.mocked(provider.generateSectionCoveragePlan).mock
      .calls[0][1]?.signal

    view.rerender(
      <PanelHarness
        fixture={billingFixture}
        provider={provider}
        onUpsert={onUpsert}
      />,
    )

    await waitFor(() => expect(firstSignal?.aborted).toBe(true))
    await user.click(screen.getByRole('button', { name: 'Analyze section' }))

    await act(async () => {
      second.resolve({
        analysis: {
          ...createProviderResponse(),
          coverageAreas: [
            {
              name: 'Billing behavior',
              summary: 'Review billing behavior.',
              behaviors: ['Review billing'],
              evidence: [
                'Billing behavior belongs to the following section.',
              ],
            },
          ],
        },
        warnings: [],
      })
      await second.promise
    })

    await waitFor(() => expect(onUpsert).toHaveBeenCalledTimes(1))
    expect(onUpsert.mock.calls[0][0].sectionIdentity.sectionId).toBe(
      billingFixture.section.id,
    )

    await act(async () => {
      first.resolve({ analysis: createProviderResponse(), warnings: [] })
      await first.promise
    })

    expect(onUpsert).toHaveBeenCalledTimes(1)
  })

  it('aborts the active request on unmount so source deletion cannot persist a late response', async () => {
    const user = userEvent.setup()
    const fixture = createFixture()
    const deferred = createDeferred<
      Awaited<
        ReturnType<AiSectionCoveragePlanProvider['generateSectionCoveragePlan']>
      >
    >()
    const provider = createProvider(vi.fn(() => deferred.promise))
    const onUpsert = vi.fn()
    const view = render(
      <PanelHarness
        fixture={fixture}
        provider={provider}
        onUpsert={onUpsert}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Analyze section' }))
    const signal = vi.mocked(provider.generateSectionCoveragePlan).mock.calls[0][1]
      ?.signal

    view.unmount()
    expect(signal?.aborted).toBe(true)

    await act(async () => {
      deferred.resolve({ analysis: createProviderResponse(), warnings: [] })
      await deferred.promise
    })

    expect(onUpsert).not.toHaveBeenCalled()
  })
})
