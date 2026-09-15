import { useState } from 'react'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPersistedCoveragePlanRecord, type PersistedCoveragePlanRecord } from '../../lib/storage/coveragePlanStorage'
import { createPersistedSectionCoveragePlanRecord } from '../../lib/storage/sectionCoveragePlanStorage'
import { createQaSource } from '../../test/qaSourceFactory'
import { createTestCase } from '../../test/testCaseFactory'
import {
  createQaSourceSectionIndex,
  type QaSourceSectionIndex,
} from '../qa-sources/qaSourceSections'
import { createAiCoveragePlanSectionCatalog } from './aiCoveragePlanSectionContext'
import { createAiCoveragePlanMergeSelectedAnalysisRef } from './aiCoveragePlanMergeEligibility'
import {
  AI_COVERAGE_PLAN_MERGE_ORIGIN_SCHEMA_VERSION,
  type AiCoveragePlanSectionMergeOrigin,
} from './aiCoveragePlanMergeTypes'
import { resolveAiSectionCoveragePlanContext } from './aiSectionCoveragePlanContext'
import { packQaSourceForAiSuggestions } from './aiSuggestionContext'
import type { TestCase } from '../test-cases/testCaseTypes'
import type { AiCoverageAreaSuggestionProvider } from './aiCoverageAreaSuggestionTypes'
import type {
  AiCoveragePlan,
  AiCoveragePlanProvider,
  AiCoverageSourceSectionRef,
} from './aiCoveragePlanTypes'
import {
  AI_COVERAGE_PLAN_PROVIDER_UNAVAILABLE_MESSAGE,
} from './aiSuggestionProvider'
import type { AiSuggestionProvider } from './aiSuggestionTypes'
import { AiSuggestionsPage } from './AiSuggestionsPage'
import type { GlobalCoverageMergeReviewState } from './GlobalCoverageMergeCandidateReview'
import {
  AI_SECTION_COVERAGE_PLAN_SCHEMA_VERSION,
  type PersistedSectionCoveragePlanRecord,
} from './aiSectionCoveragePlanTypes'

afterEach(() => {
  vi.restoreAllMocks()
})

function createAvailableProvider(response: unknown): AiSuggestionProvider {
  return {
    isAvailable: true,
    generateTestCaseSuggestions: vi.fn().mockResolvedValue(response),
  }
}

function createAvailableCoverageProvider(response: unknown): AiCoveragePlanProvider {
  return {
    isAvailable: true,
    generateCoveragePlan: vi.fn().mockResolvedValue(response),
  }
}

function createAvailableCoverageAreaSuggestionProvider(
  response: unknown,
): AiCoverageAreaSuggestionProvider {
  return {
    isAvailable: true,
    generateCoverageAreaSuggestions: vi.fn().mockResolvedValue(response),
  }
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve
  })

  return { promise, resolve }
}

function createPaymentAuthorizationCoveragePlan() {
  return {
    schemaVersion: 'ai-coverage-plan-json-v2',
    sourceScope: {
      qaSourceId: 'source-1',
      visibleSourceOnly: true,
      sourceTruncated: false,
      coverageCompleteness: 'visible_source_only',
      sectionContext: null,
    },
    coverageAreas: [
      {
        id: 'coverage-area-1-payment-authorization-outcomes',
        name: 'Payment authorization outcomes',
        summary: 'Coverage for approved responses.',
        behaviors: ['handle approved responses'],
        risks: [],
        evidence: [
          'Payment authorization must handle approved, declined, and timeout responses.',
        ],
        ambiguities: [],
        generationReadiness: 'source_backed',
        sourceSectionRefs: [],
      },
    ],
    actors: [],
    states: [],
    inputs: [],
    failureModes: [],
    integrationRisks: [],
    permissionsSecurity: [],
    dataPersistenceRules: [],
    ambiguities: [],
    nextGenerationAreas: [],
    warnings: [],
  }
}

function createPaymentAuthorizationAreaSuggestionResponse(
  testCaseSuggestions: unknown[] = [],
) {
  return {
    areaSuggestionResult: {
      schemaVersion: 'ai-coverage-area-suggestions-json-v1',
      sourceScope: {
        qaSourceId: 'source-1',
        visibleSourceOnly: true,
        sourceTruncated: false,
        analysisScope: 'visible_source_only',
      },
      areaScope: {
        name: 'Payment authorization outcomes',
        summary: 'Coverage for approved responses.',
        evidence: [
          'Payment authorization must handle approved, declined, and timeout responses.',
        ],
        generationReadiness: 'source_backed',
      },
      testCaseSuggestions,
      coverageAssessment: {
        coverageLevel: 'Low',
        coveredBehaviors: [],
        missingBehaviors: ['Approved response needs follow-up.'],
        blockedAmbiguousItems: [],
        suggestedFollowUpCoverage: [],
        stopReason:
          'Generated 0 suggestions. Stopped because the source is too thin.',
      },
      warnings: [],
    },
    warnings: [],
  }
}

function createReadyPaymentAuthorizationAreaSuggestion() {
  return {
    status: 'Ready',
    confidence: 'High',
    title: 'Checkout approves authorized payment',
    area: 'Payment authorization outcomes',
    priority: 'High',
    type: 'Functional',
    preconditions: 'Checkout user has valid payment details.',
    structuredSteps: [
      {
        action: 'Submit valid payment details.',
        expectedResult: 'Payment authorization is approved.',
      },
    ],
    evidence: [
      'Payment authorization must handle approved, declined, and timeout responses.',
    ],
    assumptions: [],
    warnings: [],
  }
}

function createSuccessfulPaymentAuthorizationAreaSuggestionResponse() {
  return {
    areaSuggestionResult: {
      ...createPaymentAuthorizationAreaSuggestionResponse([
        createReadyPaymentAuthorizationAreaSuggestion(),
      ]).areaSuggestionResult,
      coverageAssessment: {
        coverageLevel: 'Partial',
        coveredBehaviors: ['Approved payment authorization is covered.'],
        missingBehaviors: ['Declined and timeout responses remain follow-up.'],
        blockedAmbiguousItems: [],
        suggestedFollowUpCoverage: ['Generate declined response coverage.'],
        stopReason:
          'Generated 1 suggestion. Stopped because additional cases would be duplicate, speculative, unsupported, or low-value.',
      },
    },
    warnings: [],
  }
}

function createDefaultQaSource() {
  return createQaSource({
    id: 'source-1',
    title: 'Checkout payment LLD',
    sourceType: 'LLD',
    status: 'Ready for test design',
    content:
      'Payment authorization must handle approved, declined, and timeout responses.',
  })
}

function createSavedCoveragePlanRecord(
  overrides: {
    source?: ReturnType<typeof createDefaultQaSource>
    plan?: AiCoveragePlan
    analyzedAt?: string
  } = {},
) {
  const source = overrides.source ?? createDefaultQaSource()
  const plan = overrides.plan ?? createPaymentAuthorizationCoveragePlan()

  return createPersistedCoveragePlanRecord({
    qaSource: source,
    packedSource: packQaSourceForAiSuggestions(source),
    plan,
    analyzedAt: overrides.analyzedAt ?? '2026-05-12T08:01:00.000Z',
  })
}

function createCurrentSectionRef(
  sectionIndex: QaSourceSectionIndex,
  sectionNumber = 0,
  overrides: Partial<AiCoverageSourceSectionRef> = {},
): AiCoverageSourceSectionRef {
  const section = sectionIndex.sections[sectionNumber]

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

function createCurrentSectionContext(
  sectionIndex: QaSourceSectionIndex,
  overrides: Partial<
    NonNullable<AiCoveragePlan['sourceScope']['sectionContext']>
  > = {},
): NonNullable<AiCoveragePlan['sourceScope']['sectionContext']> {
  return {
    available: true,
    sectionSchemaVersion: sectionIndex.schemaVersion,
    sectionerVersion: sectionIndex.sectionerVersion,
    sectionSetFingerprint: sectionIndex.sectionSetFingerprint,
    totalSectionCount: sectionIndex.sections.length,
    visibleSectionCount: sectionIndex.sections.filter(
      (section) => section.includedInCoverage,
    ).length,
    omittedSectionCount: sectionIndex.sections.filter(
      (section) => !section.includedInCoverage,
    ).length,
    ...overrides,
  }
}

function createMergedCoveragePlanFixture() {
  const source = createQaSource({
    id: 'source-1',
    title: 'Merged source',
    sourceType: 'LLD',
    status: 'Ready for test design',
    createdAt: '2026-07-20T08:00:00.000Z',
    updatedAt: '2026-07-20T08:00:00.000Z',
    content: [
      '# Alpha',
      'Shared requirement.',
      '',
      '# Beta',
      'Shared requirement.',
    ].join('\n'),
  })
  const sectionIndex = createQaSourceSectionIndex(source)
  const sectionCoveragePlanRecords = sectionIndex.sections.map(
    (section, index) => {
      const context = resolveAiSectionCoveragePlanContext({
        qaSource: source,
        sectionIndex,
        selectedSection: {
          sectionId: section.id,
          stableKey: section.stableKey,
        },
      })

      if (!context.ok) {
        throw new Error(context.error)
      }

      return createPersistedSectionCoveragePlanRecord({
        context: context.context,
        analyzedAt: `2026-07-20T08:0${index + 1}:00.000Z`,
        plan: {
          schemaVersion: AI_SECTION_COVERAGE_PLAN_SCHEMA_VERSION,
          coverageAreas: [
            {
              id: `section-area-${index + 1}`,
              name: 'Shared behavior',
              summary: 'Review the shared requirement.',
              behaviors: [],
              evidence: ['Shared requirement.'],
              evidenceSupport: 'source_backed',
            },
          ],
          actors: [],
          states: [],
          inputs: [],
          failureModes: [],
          integrationRisks: [],
          permissionsSecurity: [],
          dataPersistenceConcerns: [],
          ambiguities: [],
          nextCoverage: [],
          warnings: [],
        },
      })
    },
  )
  const selectedAnalyses = sectionCoveragePlanRecords.map(
    createAiCoveragePlanMergeSelectedAnalysisRef,
  )
  const contributors = selectedAnalyses.map((analysis, index) => ({
    analysisRefId: analysis.analysisRefId,
    sourceFindingKind: 'coverage_area' as const,
    sourceFindingId: `section-area-${index + 1}`,
  }))
  const plan: AiCoveragePlan = {
    schemaVersion: 'ai-coverage-plan-json-v2',
    sourceScope: {
      qaSourceId: source.id,
      visibleSourceOnly: true,
      sourceTruncated: false,
      coverageCompleteness: 'insufficient_source',
      sectionContext: {
        available: true,
        sectionSchemaVersion: sectionIndex.schemaVersion,
        sectionerVersion: sectionIndex.sectionerVersion,
        sectionSetFingerprint: sectionIndex.sectionSetFingerprint,
        totalSectionCount: sectionIndex.sections.length,
        visibleSectionCount: selectedAnalyses.length,
        omittedSectionCount:
          sectionIndex.sections.length - selectedAnalyses.length,
      },
    },
    coverageAreas: [
      {
        id: 'merged-area-1',
        name: 'Shared behavior',
        summary: 'Merged review of the shared requirement.',
        behaviors: [],
        risks: [],
        evidence: ['Shared requirement.'],
        ambiguities: [],
        generationReadiness: 'source_backed',
        sourceSectionRefs: sectionIndex.sections.map((section) =>
          createCurrentSectionRef(sectionIndex, section.ordinal - 1),
        ),
      },
    ],
    actors: [],
    states: [],
    inputs: [],
    failureModes: [],
    integrationRisks: [],
    permissionsSecurity: [],
    dataPersistenceRules: [],
    ambiguities: [],
    nextGenerationAreas: [],
    warnings: [
      'Merged section-analysis scope counts; selected: 2; current but unselected: 0; stale: 0; unanalyzed: 0; excluded: 0',
    ],
  }
  const origin: AiCoveragePlanSectionMergeOrigin = {
    kind: 'section_merge',
    originSchemaVersion: AI_COVERAGE_PLAN_MERGE_ORIGIN_SCHEMA_VERSION,
    selectedAnalyses,
    outputProvenance: [
      {
        outputFindingId: 'merged-area-1',
        outputFindingKind: 'coverage_area',
        contributors,
        disposition: 'exact_duplicate',
        evidenceOrigins: [
          {
            outputEvidenceIndex: 0,
            contributors,
          },
        ],
      },
    ],
    reviewRelations: [],
  }
  const savedCoveragePlan = createPersistedCoveragePlanRecord({
    qaSource: source,
    packedSource: packQaSourceForAiSuggestions(source),
    plan,
    analyzedAt: '2026-07-20T08:30:00.000Z',
    origin,
  })

  return {
    source,
    sectionIndex,
    sectionCoveragePlanRecords,
    savedCoveragePlan,
  }
}

function renderAiSuggestionsPage({
  initialTestCases = [],
  selectedQaSourceId = 'source-1',
  qaSources = [createDefaultQaSource()],
  savedCoveragePlans = [],
  sourceSectionIndexes = [],
  sectionCoveragePlanRecords = [],
  provider,
  coveragePlanProvider,
  coverageAreaSuggestionProvider,
  globalCoverageMergeReviewState,
}: {
  initialTestCases?: TestCase[]
  selectedQaSourceId?: string
  qaSources?: ReturnType<typeof createDefaultQaSource>[]
  savedCoveragePlans?: PersistedCoveragePlanRecord[]
  sourceSectionIndexes?: QaSourceSectionIndex[]
  sectionCoveragePlanRecords?: PersistedSectionCoveragePlanRecord[]
  provider?: AiSuggestionProvider
  coveragePlanProvider?: AiCoveragePlanProvider
  coverageAreaSuggestionProvider?: AiCoverageAreaSuggestionProvider
  globalCoverageMergeReviewState?: GlobalCoverageMergeReviewState | null
} = {}) {
  const onSelectedQaSourceChange = vi.fn()
  let latestTestCases = initialTestCases
  let latestCoveragePlans = savedCoveragePlans

  function Harness() {
    const [testCases, setTestCases] = useState(initialTestCases)
    const [selectedSourceId, setSelectedSourceId] = useState(selectedQaSourceId)
    const [coveragePlans, setCoveragePlans] = useState(savedCoveragePlans)

    function handleChange(nextTestCases: TestCase[]) {
      latestTestCases = nextTestCases
      setTestCases(nextTestCases)
    }

    function handleSelectedSourceChange(sourceId: string) {
      onSelectedQaSourceChange(sourceId)
      setSelectedSourceId(sourceId)
    }

    function handleSavedCoveragePlansChange(
      nextCoveragePlans: PersistedCoveragePlanRecord[],
    ) {
      latestCoveragePlans = nextCoveragePlans
      setCoveragePlans(nextCoveragePlans)
    }

    return (
      <AiSuggestionsPage
        qaSources={qaSources}
        testCases={testCases}
        onChange={handleChange}
        selectedQaSourceId={selectedSourceId}
        onSelectedQaSourceChange={handleSelectedSourceChange}
        savedCoveragePlans={coveragePlans}
        onSavedCoveragePlansChange={handleSavedCoveragePlansChange}
        sourceSectionIndexes={sourceSectionIndexes}
        sectionCoveragePlanRecords={sectionCoveragePlanRecords}
        coveragePlanProvider={coveragePlanProvider}
        coverageAreaSuggestionProvider={coverageAreaSuggestionProvider}
        provider={provider}
        globalCoverageMergeReviewState={globalCoverageMergeReviewState}
        onRequestGlobalCoverageMergeSave={vi.fn()}
        onCancelGlobalCoverageMergeSave={vi.fn()}
        onConfirmGlobalCoverageMergeSave={vi.fn()}
        onDiscardGlobalCoverageMergeCandidate={vi.fn()}
      />
    )
  }

  render(<Harness />)

  return {
    getLatestTestCases: () => latestTestCases,
    getLatestCoveragePlans: () => latestCoveragePlans,
    onSelectedQaSourceChange,
  }
}

describe('AiSuggestionsPage', () => {
  it('waits for a saved area import, prevents duplicate writes and retains approval after failure', async () => {
    const user = userEvent.setup()
    const pending = createDeferred<{ ok: boolean; error: string | null }>()
    const onChange = vi.fn().mockReturnValue(pending.promise)
    const source = createDefaultQaSource()
    render(<AiSuggestionsPage qaSources={[source]} testCases={[]} onChange={onChange} selectedQaSourceId={source.id}
      savedCoveragePlans={[createSavedCoveragePlanRecord({ source })]}
      coverageAreaSuggestionProvider={createAvailableCoverageAreaSuggestionProvider(createSuccessfulPaymentAuthorizationAreaSuggestionResponse())} />)
    await user.click(within(screen.getByRole('article', { name: 'Payment authorization outcomes' })).getByRole('button', { name: 'Select area' }))
    await user.click(screen.getByRole('button', { name: 'Generate tests for selected area' }))
    await user.click(await screen.findByRole('checkbox', { name: 'Approve for import' }))
    const importButton = screen.getByRole('button', { name: 'Create Test Cases from approved Ready suggestions' })
    await user.dblClick(importButton)
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(screen.queryAllByText(/created from reviewed AI area suggestions/)).toHaveLength(0)
    await act(async () => pending.resolve({ ok: false, error: 'Storage unavailable' }))
    expect(screen.getByRole('checkbox', { name: 'Approve for import' })).toBeChecked()
    expect(screen.getByRole('alert')).toHaveTextContent('not saved')
    onChange.mockResolvedValue({ ok: true, error: null })
    await user.click(importButton)
    expect((await screen.findAllByText(/created from reviewed AI area suggestions/))[0]).toBeVisible()
  })
  it('shows an empty state when no QA Sources exist', () => {
    render(
      <AiSuggestionsPage qaSources={[]} testCases={[]} onChange={vi.fn()} />,
    )

    expect(
      screen.getByRole('heading', { name: 'AI Coverage Workspace' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Every test needs a reason/ })).toBeInTheDocument()
  })

  it('renders merge review as a separate transient branch before the saved-plan workflow', () => {
    renderAiSuggestionsPage({
      globalCoverageMergeReviewState: {
        status: 'building',
        sourceId: 'source-1',
        selectedAnalysisCount: 2,
      },
    })

    expect(
      screen.getByRole('heading', {
        name: 'Building unsaved Global Coverage Plan candidate',
      }),
    ).toHaveFocus()
    expect(screen.queryByRole('region', { name: 'Global coverage & suggestions' })).not.toBeInTheDocument()
    expect(screen.queryByText('Review Inbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Test Case/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Generate/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Import/i })).not.toBeInTheDocument()
  })

  it('shows selected source metadata, collapsed source details, and backend unavailable deck state', () => {
    renderAiSuggestionsPage()

    const deck = screen.getByRole('region', { name: 'Global coverage & suggestions' })

    expect(within(deck).getByLabelText('QA Source')).toHaveValue('source-1')
    expect(deck).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Select QA Source' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText('Choose one saved QA Source as the workspace request context.'),
    ).not.toBeInTheDocument()
    expect(
      within(deck).getByRole('heading', {
        name: 'Ready to analyze selected QA source',
      }),
    ).toBeInTheDocument()
    expect(within(deck).getByText('Locked: awaiting coverage analysis.')).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Generate tests for selected area' }),
    ).not.toBeInTheDocument()
    expect(screen.getByText('Source and evidence details')).toBeVisible()
    expect(screen.getByText('selected QA Source content')).not.toBeVisible()
    expect(screen.getByText('Bugs')).not.toBeVisible()
    expect(
      screen.getByText(AI_COVERAGE_PLAN_PROVIDER_UNAVAILABLE_MESSAGE),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Coverage workflow' }),
    ).toBeInTheDocument()
    expect(
      within(deck).getByRole('group', { name: 'AI workspace mode' }),
    ).toBeInTheDocument()
    expect(
      within(deck).queryByRole('tablist', { name: 'AI workspace mode' }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Advanced: direct suggestions' }),
    ).toBeInTheDocument()
    expect(
      within(deck).getByRole('region', { name: 'Request scope: Full source' }),
    ).toHaveTextContent(/one bounded server request/i)
    expect(
      within(deck).getByText(/Selecting a source or area sends nothing/i),
    ).toBeVisible()
  })

  it('discloses partial source scope before a large-source AI request', () => {
    const source = createQaSource({
      id: 'source-1',
      content: `# Large source\n${'Requirement text. '.repeat(1_700)}`,
    })
    const sectionIndex = createQaSourceSectionIndex(source)

    renderAiSuggestionsPage({
      qaSources: [source],
      selectedQaSourceId: source.id,
      sourceSectionIndexes: [sectionIndex],
    })

    const scope = screen.getByRole('region', {
      name: 'Request scope: Partial source',
    })

    expect(scope).toHaveTextContent(
      `24,000 of ${source.content.length.toLocaleString()} characters`,
    )
    expect(scope).toHaveTextContent(/cannot establish whole-document coverage/i)
    expect(scope).toHaveTextContent(
      /use analyze entire specification to process every source region without manual splitting/i,
    )
  })

  it('discloses section identities omitted by the bounded provider catalog', () => {
    const source = createQaSource({
      id: 'source-many-sections',
      content: Array.from(
        { length: 60 },
        (_, index) => `# Requirement ${index + 1}\nRule ${index + 1}.`,
      ).join('\n\n'),
    })
    const sectionIndex = createQaSourceSectionIndex(source)

    renderAiSuggestionsPage({
      qaSources: [source],
      selectedQaSourceId: source.id,
      sourceSectionIndexes: [sectionIndex],
    })

    const scope = screen.getByRole('region', {
      name: 'Request scope: Full source',
    })

    expect(sectionIndex.sections).toHaveLength(60)
    expect(scope).toHaveTextContent(
      'Source-location identities available: 40 of 60 detected sections; 20 omitted from the bounded reference catalog.',
    )
  })

  it('shows compact source structure context inside the Global coverage & suggestions', async () => {
    const user = userEvent.setup()
    const sectionedSource = createQaSource({
      id: 'source-1',
      title: 'Checkout sectioned LLD',
      sourceType: 'LLD',
      status: 'Ready for test design',
      content: [
        '# Payment authorization',
        'Payment authorization handles approved responses.',
        '',
        '## Gateway timeouts',
        'Timeouts require retry and recovery messaging.',
      ].join('\n'),
    })
    const sourceSectionIndex = createQaSourceSectionIndex(sectionedSource)

    renderAiSuggestionsPage({
      qaSources: [sectionedSource],
      sourceSectionIndexes: [sourceSectionIndex],
    })

    const deck = screen.getByRole('region', { name: 'Global coverage & suggestions' })

    expect(within(deck).getByText(/Structure: 2 sections/)).toBeVisible()
    expect(
      screen.getByText(/Sections identify source locations/),
    ).not.toBeVisible()

    await user.click(screen.getByText('Source and evidence details'))

    expect(
      screen.getByText(/Sections identify source locations/),
    ).toBeVisible()
    expect(screen.getByText('Detected sections')).toBeVisible()
    expect(
      screen.getByText(/1\. Payment authorization - \d+ characters/),
    ).toBeVisible()
    expect(
      screen.getByText(/2\. Payment authorization \/ Gateway timeouts/),
    ).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Generate tests for selected area' }),
    ).not.toBeInTheDocument()
  })

  it('shows coverage planner unavailable state without fake coverage planning', () => {
    renderAiSuggestionsPage()

    expect(
      screen.getByText(AI_COVERAGE_PLAN_PROVIDER_UNAVAILABLE_MESSAGE),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Analyze coverage' }),
    ).toBeDisabled()
  })

  it('renders mocked provider suggestions by review status and imports only explicitly selected Ready suggestions', async () => {
    const user = userEvent.setup()
    const existingTestCase = createTestCase({
      id: 'existing-test-case',
      title: 'Existing coverage remains',
    })
    const provider = createAvailableProvider({
      suggestions: [
        {
          id: 'ready-suggestion',
          title: 'Checkout approves valid card',
          area: 'Checkout',
          priority: 'High',
          type: 'Functional',
          preconditions: 'User is signed in with a valid card.',
          structuredSteps: [
            {
              action: 'Open checkout.',
              expectedResult: 'Checkout page opens.',
            },
            {
              action: 'Enter valid card details.',
              expectedResult: 'Card details are accepted for authorization.',
            },
            {
              action: 'Submit valid card details.',
              expectedResult: 'Payment authorization is approved.',
            },
            {
              action: 'Review the confirmation state.',
              expectedResult: 'Checkout shows an approved payment confirmation.',
            },
          ],
          evidence: ['handle approved responses'],
        },
        {
          id: 'needs-review-suggestion',
          title: 'Checkout declined card copy',
          area: '',
          priority: 'Urgent',
          type: 'Functional',
          assumptions: ['Decline copy is provided by the payment gateway.'],
          evidence: ['handle declined responses'],
          warnings: ['Decline copy is not specified by the source.'],
          structuredSteps: [
            {
              action: 'Submit a declined card.',
              expectedResult: 'A clear decline message is shown.',
            },
          ],
        },
        {
          id: 'rejected-suggestion',
          title: '',
          area: 'Checkout',
          priority: 'Medium',
          type: 'Functional',
          structuredSteps: [],
        },
      ],
    })
    const { getLatestTestCases } = renderAiSuggestionsPage({
      initialTestCases: [existingTestCase],
      provider,
    })

    await user.click(
      screen.getByRole('button', { name: 'Advanced: direct suggestions' }),
    )
    await user.click(
      screen.getByRole('button', { name: 'Generate direct suggestions' }),
    )

    expect(await screen.findByRole('heading', { name: 'Checkout approves valid card' })).toBeInTheDocument()
    expect(
      screen.getByText(/Ready still means eligible for QA approval/),
    ).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Ready' })).toHaveTextContent('1')
    const readySuggestionCard = screen.getByRole('article', {
      name: 'Checkout approves valid card',
    })
    expect(within(readySuggestionCard).getByText('4 steps')).toBeInTheDocument()
    expect(within(readySuggestionCard).getByText('Open checkout.')).toBeInTheDocument()
    expect(
      within(readySuggestionCard).getByText(
        'Card details are accepted for authorization.',
      ),
    ).toBeInTheDocument()
    expect(
      within(readySuggestionCard).getByText(
        'Checkout shows an approved payment confirmation.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'Import-eligible suggestions with evidence and no assumptions or warnings.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Needs review' })).toHaveTextContent(
      '1',
    )
    expect(screen.getByRole('region', { name: 'Rejected' })).toHaveTextContent(
      '1',
    )
    expect(screen.getAllByText('Evidence to verify').length).toBeGreaterThan(0)
    expect(screen.getByText('handle approved responses')).toBeInTheDocument()
    expect(
      screen.getByText('Decline copy is provided by the payment gateway.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Decline copy is not specified by the source.'),
    ).toBeInTheDocument()
    expect(screen.getAllByLabelText('Approve for import')).toHaveLength(1)
    expect(getLatestTestCases()).toEqual([existingTestCase])

    await user.click(screen.getByLabelText('Approve for import'))
    await user.click(
      screen.getByRole('button', {
        name: 'Create Test Cases from approved Ready suggestions',
      }),
    )

    const testCases = getLatestTestCases()

    expect(testCases).toHaveLength(2)
    expect(testCases[0]).toMatchObject({
      title: 'Checkout approves valid card',
      area: 'Checkout',
      priority: 'High',
      status: 'Not Run',
      type: 'Functional',
      preconditions: 'User is signed in with a valid card.',
      qaSourceId: 'source-1',
      structuredSteps: [
        {
          id: 'ai-step-1',
          action: 'Open checkout.',
          expectedResult: 'Checkout page opens.',
        },
        {
          id: 'ai-step-2',
          action: 'Enter valid card details.',
          expectedResult: 'Card details are accepted for authorization.',
        },
        {
          id: 'ai-step-3',
          action: 'Submit valid card details.',
          expectedResult: 'Payment authorization is approved.',
        },
        {
          id: 'ai-step-4',
          action: 'Review the confirmation state.',
          expectedResult: 'Checkout shows an approved payment confirmation.',
        },
      ],
      steps:
        '1. Open checkout.\n2. Enter valid card details.\n3. Submit valid card details.\n4. Review the confirmation state.',
      expectedResult:
        '1. Checkout page opens.\n2. Card details are accepted for authorization.\n3. Payment authorization is approved.\n4. Checkout shows an approved payment confirmation.',
    })
    expect(testCases[1]).toBe(existingTestCase)
  })

  it('renders a mocked coverage map and does not create Test Cases', async () => {
    const user = userEvent.setup()
    const coveragePlanProvider = createAvailableCoverageProvider({
      coveragePlan: {
        schemaVersion: 'ai-coverage-plan-json-v2',
        coverageAreas: [
          {
            id: 'provider-area-id',
            name: 'Payment authorization outcomes',
            summary: 'Coverage for approved, declined, and timeout responses.',
            behaviors: ['handle approved, declined, and timeout responses'],
            risks: ['Timeout handling can block checkout completion.'],
            evidence: ['handle approved, declined, and timeout responses'],
            ambiguities: [],
            generationReadiness: 'source_backed',
          },
          {
            name: 'Gateway timeout copy',
            summary: 'Timeout copy requires QA/product review.',
            behaviors: ['handle timeout responses'],
            risks: ['Timeout feedback may be unclear.'],
            evidence: ['handle timeout responses'],
            ambiguities: ['Exact timeout copy is not finalized.'],
            generationReadiness: 'source_backed',
          },
        ],
        actors: ['Checkout user'],
        states: ['Approved', 'Declined', 'Timeout'],
        inputs: ['Card details'],
        failureModes: ['Gateway timeout'],
        integrationRisks: ['Payment gateway unavailable'],
        permissionsSecurity: [],
        dataPersistenceRules: ['Authorization status is persisted.'],
        ambiguities: [
          {
            question: 'Is timeout copy finalized?',
            whyItMatters: 'Generated tests should not assert exact copy yet.',
            severity: 'Medium',
          },
        ],
        nextGenerationAreas: [
          {
            title: 'Payment outcome generation',
            rationale: 'Payment outcomes are critical checkout paths.',
            priority: 'High',
            relatedAreaNames: ['Payment authorization outcomes'],
            suggestedTestCount: 5,
          },
        ],
        warnings: [],
      },
      warnings: ['Backend coverage warning.'],
    })
    const { getLatestTestCases } = renderAiSuggestionsPage({
      coveragePlanProvider,
    })

    await user.click(screen.getByRole('button', { name: 'Coverage workflow' }))
    await user.click(screen.getByRole('button', { name: 'Analyze coverage' }))

    expect(
      await screen.findByRole('heading', {
        name: 'Payment authorization outcomes',
      }),
    ).toBeInTheDocument()
    expect(screen.getByText('Backend coverage warning.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Coverage Queue' })).toBeInTheDocument()
    expect(screen.getByText('AI-proposed areas')).toBeInTheDocument()
    expect(screen.getByText('Ready suggestions')).toBeInTheDocument()
    expect(screen.getByText('Blocked items')).toBeInTheDocument()
    expect(
      screen.getByRole('complementary', { name: 'Coverage trust definition' }),
    ).toHaveTextContent(/Neither proves correctness, completeness, or QA approval/i)
    expect(
      screen.getByRole('heading', {
        name: 'Select an area from Coverage Queue',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Awaiting area selection from the Coverage Queue.'),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Generate tests for selected area' }),
    ).not.toBeInTheDocument()
    const paymentArea = screen.getByRole('article', {
      name: 'Payment authorization outcomes',
    })
    const timeoutArea = screen.getByRole('article', {
      name: 'Gateway timeout copy',
    })
    expect(within(paymentArea).getByText('Source-backed')).toBeInTheDocument()
    expect(within(timeoutArea).getByText('Needs review')).toBeInTheDocument()
    expect(
      screen.getByText('Exact timeout copy is not finalized.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Gateway timeout')).toBeInTheDocument()
    expect(screen.getByText('Payment gateway unavailable')).toBeInTheDocument()
    expect(screen.getByText(/Payment outcome generation/)).toBeInTheDocument()
    expect(
      screen.getByRole('button', {
        name: 'Create Test Cases from approved Ready suggestions',
      }),
    ).toBeDisabled()
    expect(getLatestTestCases()).toEqual([])
  })

  it('renders compact current section labels and keeps locations behind disclosure', async () => {
    const user = userEvent.setup()
    const sectionedSource = createQaSource({
      id: 'source-1',
      title: 'Payment sectioned LLD',
      sourceType: 'LLD',
      status: 'Ready for test design',
      content: [
        '# Payment authorization',
        'Payment authorization must handle approved responses.',
        '',
        '## Gateway timeout',
        'Gateway timeouts require retry messaging.',
      ].join('\n'),
      createdAt: '2026-05-12T08:00:00.000Z',
      updatedAt: '2026-05-12T08:00:00.000Z',
    })
    const sourceSectionIndex = createQaSourceSectionIndex(sectionedSource)
    const paymentSection = sourceSectionIndex.sections[0]
    const gatewaySection = sourceSectionIndex.sections[1]
    const providerCatalog = createAiCoveragePlanSectionCatalog(
      sourceSectionIndex,
      packQaSourceForAiSuggestions(sectionedSource),
    )
    const paymentProviderSection = providerCatalog.sections.find(
      (section) => section.title === paymentSection.title,
    )
    const gatewayProviderSection = providerCatalog.sections.find(
      (section) => section.title === gatewaySection.title,
    )

    if (!paymentProviderSection || !gatewayProviderSection) {
      throw new Error('Expected both visible sections in the provider catalog.')
    }

    const coveragePlanProvider = createAvailableCoverageProvider({
      coveragePlan: {
        schemaVersion: 'ai-coverage-plan-json-v2',
        coverageAreas: [
          {
            name: 'Gateway timeout',
            summary: 'Coverage for gateway timeout behavior.',
            behaviors: ['Gateway timeouts require retry messaging.'],
            risks: ['Timeouts may leave checkout pending.'],
            evidence: ['Gateway timeouts require retry messaging.'],
            ambiguities: [],
            generationReadiness: 'source_backed',
            sourceSectionRefs: [
              {
                sectionId: gatewayProviderSection.sectionId,
                stableKey: gatewayProviderSection.stableKey,
              },
            ],
          },
          {
            name: 'Payment flow',
            summary: 'Coverage spanning authorization and timeout behavior.',
            behaviors: ['Handle authorization and timeout outcomes.'],
            risks: ['Payment state may diverge.'],
            evidence: ['Payment authorization must handle approved responses.'],
            ambiguities: [],
            generationReadiness: 'needs_review',
            sourceSectionRefs: [
              {
                sectionId: paymentProviderSection.sectionId,
                stableKey: paymentProviderSection.stableKey,
              },
              {
                sectionId: gatewayProviderSection.sectionId,
                stableKey: gatewayProviderSection.stableKey,
              },
            ],
          },
        ],
        actors: [],
        states: [],
        inputs: [],
        failureModes: [],
        integrationRisks: [],
        permissionsSecurity: [],
        dataPersistenceRules: [],
        ambiguities: [],
        nextGenerationAreas: [],
        warnings: [],
      },
      warnings: [],
    })

    renderAiSuggestionsPage({
      qaSources: [sectionedSource],
      sourceSectionIndexes: [sourceSectionIndex],
      coveragePlanProvider,
    })

    await user.click(screen.getByRole('button', { name: 'Analyze coverage' }))

    const gatewayArea = await screen.findByRole('article', {
      name: 'Gateway timeout',
    })
    expect(
      within(gatewayArea).getByText('Gateway timeout', {
        selector: '.coverage-queue-item__section-summary',
      }),
    ).toBeVisible()
    expect(within(gatewayArea).queryByText(/1 section:/i)).not.toBeInTheDocument()

    const paymentFlowArea = screen.getByRole('article', { name: 'Payment flow' })
    expect(
      within(paymentFlowArea).getByText('2 sections', {
        selector: '.coverage-queue-item__section-summary',
      }),
    ).toBeVisible()
    expect(
      within(paymentFlowArea).queryByText('Payment authorization / Gateway timeout'),
    ).not.toBeInTheDocument()

    await user.click(
      within(gatewayArea).getByRole('button', { name: 'Select area' }),
    )

    const activeArea = screen.getByRole('region', { name: 'Gateway timeout' })
    expect(
      within(activeArea).getByText('Gateway timeout', {
        selector: '.coverage-section-chip__title',
      }),
    ).toBeVisible()

    const locationLabel = `${gatewaySection.ordinal}. ${gatewaySection.path.join(
      ' / ',
    )} (lines ${gatewaySection.startLine}-${gatewaySection.endLine})`
    const location = within(activeArea).getByText(locationLabel)
    const disclosure = within(activeArea).getByText('View 1 source location', {
      selector: 'summary',
    })

    expect(disclosure.tagName).toBe('SUMMARY')
    expect(location).not.toBeVisible()
    disclosure.focus()
    expect(disclosure).toHaveFocus()
    await user.click(disclosure)
    expect(location).toBeVisible()
    expect(
      within(activeArea).getByText(
        'Sections identify source locations, not coverage completeness or QA approval.',
      ),
    ).toBeVisible()
  })

  it('loads a fresh saved plan without refs as usable and does not invent refs', async () => {
    const user = userEvent.setup()
    const source = createDefaultQaSource()
    const sourceSectionIndex = createQaSourceSectionIndex(source)
    const savedCoveragePlan = createSavedCoveragePlanRecord({ source })
    const coverageAreaSuggestionProvider =
      createAvailableCoverageAreaSuggestionProvider(
        createSuccessfulPaymentAuthorizationAreaSuggestionResponse(),
      )

    renderAiSuggestionsPage({
      qaSources: [source],
      sourceSectionIndexes: [sourceSectionIndex],
      savedCoveragePlans: [savedCoveragePlan],
      coveragePlanProvider: createAvailableCoverageProvider({}),
      coverageAreaSuggestionProvider,
    })

    expect(screen.getByText(/Saved coverage plan loaded/)).toBeInTheDocument()
    expect(
      screen.getByText(
        'This saved coverage plan has no section references. Re-analyze to add them.',
      ),
    ).toBeVisible()
    expect(
      screen.getByRole('heading', { name: 'Coverage Queue' }),
    ).toBeInTheDocument()
    const deck = screen.getByRole('region', { name: 'Global coverage & suggestions' })
    expect(within(deck).queryByText(/legacy/i)).not.toBeInTheDocument()
    expect(
      within(deck).queryByLabelText('Source section references'),
    ).not.toBeInTheDocument()
    expect(
      within(deck).queryByText(/View \d+ source locations?/),
    ).not.toBeInTheDocument()

    const paymentArea = screen.getByRole('article', {
      name: 'Payment authorization outcomes',
    })
    expect(within(paymentArea).getByText('Not started')).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', {
        name: 'Area suggestions generated for: Payment authorization outcomes',
      }),
    ).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Approve for import')).not.toBeInTheDocument()

    await user.click(
      within(paymentArea).getByRole('button', { name: 'Select area' }),
    )

    const generateButton = screen.getByRole('button', {
      name: 'Generate tests for selected area',
    })
    expect(generateButton).toBeEnabled()
    await user.click(generateButton)

    await waitFor(() =>
      expect(
        coverageAreaSuggestionProvider.generateCoverageAreaSuggestions,
      ).toHaveBeenCalledTimes(1),
    )
    const request = vi.mocked(
      coverageAreaSuggestionProvider.generateCoverageAreaSuggestions,
    ).mock.calls[0][0]
    expect(request.selectedArea.sourceSectionRefs).toEqual([])
  })

  it('hides merged-plan refs when the exact contributing section analyses are unavailable', () => {
    const fixture = createMergedCoveragePlanFixture()

    renderAiSuggestionsPage({
      qaSources: [fixture.source],
      sourceSectionIndexes: [fixture.sectionIndex],
      sectionCoveragePlanRecords: [],
      savedCoveragePlans: [fixture.savedCoveragePlan],
    })

    expect(screen.getByText(/Saved coverage plan loaded/)).toBeInTheDocument()
    expect(screen.queryByText('Source-backed', { exact: true })).not.toBeInTheDocument()
    expect(screen.getAllByText('Needs review', { exact: true }).length).toBeGreaterThan(0)
    expect(screen.getByText('Merged behavior evidence cannot be fully revalidated from the exact current contributing analyses. Review is required; the saved plan has not been rewritten.')).toBeVisible()
    expect(
      screen.getByText(
        'Saved source section locations no longer match the current source structure. Re-analyze coverage to refresh them.',
      ),
    ).toBeVisible()
    expect(
      screen.queryByLabelText('Source section references'),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText(/View \d+ source locations?/),
    ).not.toBeInTheDocument()
  })

  it('hides every saved ref on section-context drift without blocking generation', async () => {
    const user = userEvent.setup()
    const source = createQaSource({
      id: 'source-1',
      title: 'Checkout payment LLD',
      sourceType: 'LLD',
      status: 'Ready for test design',
      content: [
        '# Payment authorization',
        'Payment authorization must handle approved responses.',
        '',
        '# Gateway timeout',
        'Gateway timeouts require retry messaging.',
      ].join('\n'),
      createdAt: '2026-05-12T08:00:00.000Z',
      updatedAt: '2026-05-12T08:00:00.000Z',
    })
    const sourceSectionIndex = createQaSourceSectionIndex(source)
    const basePlan = createPaymentAuthorizationCoveragePlan()
    const staleRef = createCurrentSectionRef(sourceSectionIndex, 0, {
      ordinal: 999,
      title: 'STALE AREA TITLE',
      path: ['STALE AREA PATH'],
    })
    const stalePlan: AiCoveragePlan = {
      ...basePlan,
      sourceScope: {
        ...basePlan.sourceScope,
        sectionContext: createCurrentSectionContext(sourceSectionIndex, {
          sectionSetFingerprint: 'stale-section-set-fingerprint',
        }),
      },
      coverageAreas: [
        {
          ...basePlan.coverageAreas[0],
          sourceSectionRefs: [staleRef],
        },
        {
          ...basePlan.coverageAreas[0],
          id: 'coverage-area-2-blocked',
          name: 'Blocked payment ambiguity',
          generationReadiness: 'blocked_by_ambiguity',
          sourceSectionRefs: [
            {
              ...staleRef,
              title: 'STALE BLOCKED TITLE',
              path: ['STALE BLOCKED PATH'],
            },
          ],
        },
      ],
      ambiguities: [
        {
          id: 'ambiguity-stale',
          question: 'What is the timeout copy?',
          whyItMatters: 'Exact assertions depend on it.',
          severity: 'Medium',
          sourceSectionRefs: [
            {
              ...staleRef,
              title: 'STALE AMBIGUITY TITLE',
              path: ['STALE AMBIGUITY PATH'],
            },
          ],
        },
      ],
      nextGenerationAreas: [
        {
          id: 'next-stale',
          title: 'Timeout recovery',
          rationale: 'Recovery needs focused coverage.',
          priority: 'High',
          relatedAreaIds: [basePlan.coverageAreas[0].id],
          suggestedTestCount: 2,
          sourceSectionRefs: [
            {
              ...staleRef,
              title: 'STALE NEXT TITLE',
              path: ['STALE NEXT PATH'],
            },
          ],
        },
      ],
    }
    const savedCoveragePlan = createSavedCoveragePlanRecord({
      source,
      plan: stalePlan,
    })
    const coverageAreaSuggestionProvider =
      createAvailableCoverageAreaSuggestionProvider(
        createSuccessfulPaymentAuthorizationAreaSuggestionResponse(),
      )

    renderAiSuggestionsPage({
      qaSources: [source],
      sourceSectionIndexes: [sourceSectionIndex],
      savedCoveragePlans: [savedCoveragePlan],
      coveragePlanProvider: createAvailableCoverageProvider({}),
      coverageAreaSuggestionProvider,
    })

    expect(screen.getByText(/Saved coverage plan loaded/)).toBeVisible()
    expect(screen.queryByText(/Saved coverage plan is stale/)).not.toBeInTheDocument()
    expect(
      screen.getAllByText(
        'Saved source section locations no longer match the current source structure. Re-analyze coverage to refresh them.',
      ),
    ).toHaveLength(1)

    const deck = screen.getByRole('region', { name: 'Global coverage & suggestions' })
    expect(deck).not.toHaveTextContent('STALE')
    const paymentArea = within(deck).getByRole('article', {
      name: 'Payment authorization outcomes',
    })
    expect(within(paymentArea).getByText('Source-backed')).toBeVisible()

    await user.click(
      within(paymentArea).getByRole('button', { name: 'Select area' }),
    )
    const generateButton = within(deck).getByRole('button', {
      name: 'Generate tests for selected area',
    })
    expect(generateButton).toBeEnabled()
    await user.click(generateButton)

    await waitFor(() =>
      expect(
        coverageAreaSuggestionProvider.generateCoverageAreaSuggestions,
      ).toHaveBeenCalledTimes(1),
    )
    const request = vi.mocked(
      coverageAreaSuggestionProvider.generateCoverageAreaSuggestions,
    ).mock.calls[0][0]
    expect(request.selectedArea).toMatchObject({
      generationReadiness: 'source_backed',
      sourceSectionRefs: [],
    })
  })

  it('keeps valid current refs while hiding an invalid persisted sibling', async () => {
    const user = userEvent.setup()
    const source = createQaSource({
      id: 'source-1',
      title: 'Checkout payment LLD',
      sourceType: 'LLD',
      status: 'Ready for test design',
      content: '# Payment authorization\nApproved payments complete checkout.',
      createdAt: '2026-05-12T08:00:00.000Z',
      updatedAt: '2026-05-12T08:00:00.000Z',
    })
    const sourceSectionIndex = createQaSourceSectionIndex(source)
    const basePlan = createPaymentAuthorizationCoveragePlan()
    const validRef = createCurrentSectionRef(sourceSectionIndex)
    const invalidRef = {
      ...validRef,
      stableKey: 'mismatched-stable-key',
      title: 'INVALID SIBLING TITLE',
      path: ['INVALID SIBLING PATH'],
    }
    const plan: AiCoveragePlan = {
      ...basePlan,
      sourceScope: {
        ...basePlan.sourceScope,
        sectionContext: createCurrentSectionContext(sourceSectionIndex),
      },
      coverageAreas: [
        {
          ...basePlan.coverageAreas[0],
          sourceSectionRefs: [validRef, invalidRef],
        },
      ],
    }

    renderAiSuggestionsPage({
      qaSources: [source],
      sourceSectionIndexes: [sourceSectionIndex],
      savedCoveragePlans: [createSavedCoveragePlanRecord({ source, plan })],
      coveragePlanProvider: createAvailableCoverageProvider({}),
      coverageAreaSuggestionProvider:
        createAvailableCoverageAreaSuggestionProvider(
          createSuccessfulPaymentAuthorizationAreaSuggestionResponse(),
        ),
    })

    expect(
      screen.getAllByText(
        'Some saved source section locations could not be revalidated and are hidden. Re-analyze coverage to refresh them.',
      ),
    ).toHaveLength(1)
    const deck = screen.getByRole('region', { name: 'Global coverage & suggestions' })
    expect(deck).not.toHaveTextContent('INVALID SIBLING')
    const paymentArea = within(deck).getByRole('article', {
      name: 'Payment authorization outcomes',
    })
    expect(
      within(paymentArea).getByText('Payment authorization', {
        selector: '.coverage-queue-item__section-summary',
      }),
    ).toBeVisible()

    await user.click(
      within(paymentArea).getByRole('button', { name: 'Select area' }),
    )
    const activeArea = within(deck).getByRole('region', {
      name: 'Payment authorization outcomes',
    })
    expect(
      within(activeArea).getByText('View 1 source location', {
        selector: 'summary',
      }),
    ).toBeInTheDocument()
    expect(
      within(deck).getByRole('button', { name: 'Generate tests for selected area' }),
    ).toBeEnabled()
  })

  it('marks a clipped persisted ref as a partial source location without expanding it', async () => {
    const user = userEvent.setup()
    const source = createQaSource({
      id: 'source-1',
      title: 'Checkout payment LLD',
      sourceType: 'LLD',
      status: 'Ready for test design',
      content: [
        '# Payment authorization',
        'Approved payments complete checkout.',
        'Declined payments keep checkout open.',
        'Timeouts leave the order pending.',
      ].join('\n'),
      createdAt: '2026-05-12T08:00:00.000Z',
      updatedAt: '2026-05-12T08:00:00.000Z',
    })
    const sourceSectionIndex = createQaSourceSectionIndex(source)
    const section = sourceSectionIndex.sections[0]
    const partialEndLine = section.startLine + 1
    const partialRef = createCurrentSectionRef(sourceSectionIndex, 0, {
      endLine: partialEndLine,
      visibility: 'partial',
    })
    const basePlan = createPaymentAuthorizationCoveragePlan()
    const plan: AiCoveragePlan = {
      ...basePlan,
      sourceScope: {
        ...basePlan.sourceScope,
        sourceTruncated: true,
        coverageCompleteness: 'partial_due_to_truncation',
        sectionContext: createCurrentSectionContext(sourceSectionIndex),
      },
      coverageAreas: [
        {
          ...basePlan.coverageAreas[0],
          sourceSectionRefs: [partialRef],
        },
      ],
    }

    renderAiSuggestionsPage({
      qaSources: [source],
      sourceSectionIndexes: [sourceSectionIndex],
      savedCoveragePlans: [createSavedCoveragePlanRecord({ source, plan })],
    })

    const paymentArea = screen.getByRole('article', {
      name: 'Payment authorization outcomes',
    })
    await user.click(
      within(paymentArea).getByRole('button', { name: 'Select area' }),
    )

    const activeArea = screen.getByRole('region', {
      name: 'Payment authorization outcomes',
    })
    expect(
      within(activeArea).getByText('Partial source location'),
    ).toBeVisible()
    const partialLocationLabel = `${section.ordinal}. ${section.path.join(
      ' / ',
    )} (visible lines ${section.startLine}-${partialEndLine})`
    const partialLocation = within(activeArea).getByText(partialLocationLabel)
    const disclosure = within(activeArea).getByText('View 1 source location', {
      selector: 'summary',
    })

    expect(partialLocation).not.toBeVisible()
    expect(
      within(activeArea).queryByText(
        `${section.ordinal}. ${section.path.join(' / ')} (lines ${
          section.startLine
        }-${section.endLine})`,
      ),
    ).not.toBeInTheDocument()
    await user.click(disclosure)
    expect(partialLocation).toBeVisible()
  })

  it('loads only the saved plan matching the selected source', async () => {
    const user = userEvent.setup()
    const sourceOne = createDefaultQaSource()
    const sourceTwo = createQaSource({
      ...sourceOne,
      id: 'source-2',
      title: 'Profile settings PRD',
      content: 'Profile settings must save display name changes.',
    })
    const sourceOneRecord = createSavedCoveragePlanRecord({ source: sourceOne })
    const sourceTwoRecord = createSavedCoveragePlanRecord({
      source: sourceTwo,
      plan: {
        ...createPaymentAuthorizationCoveragePlan(),
        sourceScope: {
          ...createPaymentAuthorizationCoveragePlan().sourceScope,
          qaSourceId: 'source-2',
        },
        coverageAreas: [
          {
            id: 'coverage-area-1-profile-settings',
            name: 'Profile settings save',
            summary: 'Coverage for saving profile display names.',
            behaviors: ['save display name changes'],
            risks: [],
            evidence: ['Profile settings must save display name changes.'],
            ambiguities: [],
            generationReadiness: 'source_backed',
          },
        ],
      },
    })

    renderAiSuggestionsPage({
      qaSources: [sourceOne, sourceTwo],
      savedCoveragePlans: [sourceOneRecord, sourceTwoRecord],
    })

    expect(screen.getByText('Payment authorization outcomes')).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('QA Source'), 'source-2')

    expect(screen.getByText('Profile settings save')).toBeInTheDocument()
    expect(screen.queryByText('Payment authorization outcomes')).not.toBeInTheDocument()
  })

  it('shows stale saved plans but blocks selected-area generation until re-analysis', async () => {
    const user = userEvent.setup()
    const savedCoveragePlan = createSavedCoveragePlanRecord()
    const editedSource = createQaSource({
      ...createDefaultQaSource(),
      updatedAt: '2026-05-12T09:00:00.000Z',
      content:
        'Payment authorization must handle approved, declined, timeout, and retry responses.',
    })

    renderAiSuggestionsPage({
      qaSources: [editedSource],
      savedCoveragePlans: [savedCoveragePlan],
      coverageAreaSuggestionProvider: createAvailableCoverageAreaSuggestionProvider(
        createSuccessfulPaymentAuthorizationAreaSuggestionResponse(),
      ),
    })

    expect(screen.getByText(/Saved coverage plan is stale/)).toBeInTheDocument()
    expect(screen.getByText(/Re-analyze coverage before generating tests/)).toBeInTheDocument()

    const paymentArea = screen.getByRole('article', {
      name: 'Payment authorization outcomes',
    })
    await user.click(within(paymentArea).getByRole('button', { name: 'Select area' }))

    expect(
      screen.getByRole('button', { name: 'Generate tests for selected area' }),
    ).toBeDisabled()
  })

  it('invalidates generated approvals when the selected source revision changes', async () => {
    const user = userEvent.setup()
    const source = createDefaultQaSource()
    const savedCoveragePlan = createSavedCoveragePlanRecord({ source })
    const coverageAreaSuggestionProvider =
      createAvailableCoverageAreaSuggestionProvider(
        createSuccessfulPaymentAuthorizationAreaSuggestionResponse(),
      )
    const onChange = vi.fn()
    const view = render(
      <AiSuggestionsPage
        qaSources={[source]}
        testCases={[]}
        onChange={onChange}
        selectedQaSourceId={source.id}
        savedCoveragePlans={[savedCoveragePlan]}
        coverageAreaSuggestionProvider={coverageAreaSuggestionProvider}
      />,
    )

    const paymentArea = screen.getByRole('article', {
      name: 'Payment authorization outcomes',
    })
    await user.click(
      within(paymentArea).getByRole('button', { name: 'Select area' }),
    )
    await user.click(
      screen.getByRole('button', { name: 'Generate tests for selected area' }),
    )
    await user.click(
      await screen.findByRole('checkbox', { name: 'Approve for import' }),
    )
    expect(
      screen.getByRole('button', {
        name: 'Create Test Cases from approved Ready suggestions',
      }),
    ).toBeEnabled()

    const editedSource = {
      ...source,
      updatedAt: '2026-05-12T09:00:00.000Z',
      content: `${source.content}\nRetry behavior was added after generation.`,
    }
    view.rerender(
      <AiSuggestionsPage
        qaSources={[editedSource]}
        testCases={[]}
        onChange={onChange}
        selectedQaSourceId={editedSource.id}
        savedCoveragePlans={[savedCoveragePlan]}
        coverageAreaSuggestionProvider={coverageAreaSuggestionProvider}
      />,
    )

    await waitFor(() =>
      expect(
        screen.queryByRole('heading', {
          name: 'Area suggestions generated for: Payment authorization outcomes',
        }),
      ).not.toBeInTheDocument(),
    )
    expect(screen.queryByRole('checkbox', { name: 'Approve for import' })).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', {
        name: 'Create Test Cases from approved Ready suggestions',
      }),
    ).toBeDisabled()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('discards generated approvals after source switching and deletion', async () => {
    const user = userEvent.setup()
    const sourceOne = createDefaultQaSource()
    const sourceTwo = createQaSource({
      ...sourceOne,
      id: 'source-2',
      title: 'Profile settings PRD',
      content: 'Profile settings must save display name changes.',
    })
    const sourceOneRecord = createSavedCoveragePlanRecord({ source: sourceOne })
    const sourceTwoRecord = createSavedCoveragePlanRecord({
      source: sourceTwo,
      plan: {
        ...createPaymentAuthorizationCoveragePlan(),
        sourceScope: {
          ...createPaymentAuthorizationCoveragePlan().sourceScope,
          qaSourceId: sourceTwo.id,
        },
        coverageAreas: [
          {
            id: 'coverage-area-1-profile-settings',
            name: 'Profile settings save',
            summary: 'Coverage for saving profile display names.',
            behaviors: ['save display name changes'],
            risks: [],
            evidence: ['Profile settings must save display name changes.'],
            ambiguities: [],
            generationReadiness: 'source_backed',
            sourceSectionRefs: [],
          },
        ],
      },
    })
    const coverageAreaSuggestionProvider =
      createAvailableCoverageAreaSuggestionProvider(
        createSuccessfulPaymentAuthorizationAreaSuggestionResponse(),
      )
    const onChange = vi.fn()

    function Harness() {
      const [sources, setSources] = useState([sourceOne, sourceTwo])
      const [selectedSourceId, setSelectedSourceId] = useState(sourceOne.id)

      return (
        <>
          <button type="button" onClick={() => setSources([])}>
            Delete selected source
          </button>
          <button
            type="button"
            onClick={() => setSources([sourceOne, sourceTwo])}
          >
            Restore sources
          </button>
          <AiSuggestionsPage
            qaSources={sources}
            testCases={[]}
            onChange={onChange}
            selectedQaSourceId={selectedSourceId}
            onSelectedQaSourceChange={setSelectedSourceId}
            savedCoveragePlans={[sourceOneRecord, sourceTwoRecord]}
            coverageAreaSuggestionProvider={coverageAreaSuggestionProvider}
          />
        </>
      )
    }

    render(<Harness />)

    await user.click(
      within(
        screen.getByRole('article', {
          name: 'Payment authorization outcomes',
        }),
      ).getByRole('button', { name: 'Select area' }),
    )
    await user.click(
      screen.getByRole('button', { name: 'Generate tests for selected area' }),
    )
    await user.click(
      await screen.findByRole('checkbox', { name: 'Approve for import' }),
    )

    await user.selectOptions(screen.getByLabelText('QA Source'), sourceTwo.id)
    expect(screen.getByLabelText('QA Source')).toHaveValue(sourceTwo.id)
    await user.selectOptions(screen.getByLabelText('QA Source'), sourceOne.id)
    expect(screen.getByLabelText('QA Source')).toHaveValue(sourceOne.id)
    expect(
      screen.queryByRole('heading', {
        name: 'Area suggestions generated for: Payment authorization outcomes',
      }),
    ).not.toBeInTheDocument()

    await user.click(
      within(
        screen.getByRole('article', {
          name: 'Payment authorization outcomes',
        }),
      ).getByRole('button', { name: 'Select area' }),
    )
    await user.click(
      screen.getByRole('button', { name: 'Generate tests for selected area' }),
    )
    await user.click(
      await screen.findByRole('checkbox', { name: 'Approve for import' }),
    )

    await user.click(
      screen.getByRole('button', { name: 'Delete selected source' }),
    )
    expect(screen.getByRole('heading', { name: /Every test needs a reason/ })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Restore sources' }))

    await waitFor(() =>
      expect(
        screen.queryByRole('heading', {
          name: 'Area suggestions generated for: Payment authorization outcomes',
        }),
      ).not.toBeInTheDocument(),
    )
    expect(screen.queryByRole('checkbox', { name: 'Approve for import' })).not.toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('keeps generated approvals when only section-reference context drifts', async () => {
    const user = userEvent.setup()
    const source = createQaSource({
      ...createDefaultQaSource(),
      content: [
        '# Payment authorization',
        'Payment authorization must handle approved, declined, and timeout responses.',
      ].join('\n'),
    })
    const sectionIndex = createQaSourceSectionIndex(source)
    const sectionRef = createCurrentSectionRef(sectionIndex)
    const plan: AiCoveragePlan = {
      ...createPaymentAuthorizationCoveragePlan(),
      sourceScope: {
        ...createPaymentAuthorizationCoveragePlan().sourceScope,
        sectionContext: createCurrentSectionContext(sectionIndex),
      },
      coverageAreas: createPaymentAuthorizationCoveragePlan().coverageAreas.map(
        (area) => ({ ...area, sourceSectionRefs: [sectionRef] }),
      ),
    }
    const savedCoveragePlan = createSavedCoveragePlanRecord({ source, plan })
    const coverageAreaSuggestionProvider =
      createAvailableCoverageAreaSuggestionProvider(
        createSuccessfulPaymentAuthorizationAreaSuggestionResponse(),
      )
    const onChange = vi.fn()
    const view = render(
      <AiSuggestionsPage
        qaSources={[source]}
        testCases={[]}
        onChange={onChange}
        selectedQaSourceId={source.id}
        savedCoveragePlans={[savedCoveragePlan]}
        sourceSectionIndexes={[sectionIndex]}
        coverageAreaSuggestionProvider={coverageAreaSuggestionProvider}
      />,
    )

    await user.click(
      within(
        screen.getByRole('article', {
          name: 'Payment authorization outcomes',
        }),
      ).getByRole('button', { name: 'Select area' }),
    )
    await user.click(
      screen.getByRole('button', { name: 'Generate tests for selected area' }),
    )
    await user.click(
      await screen.findByRole('checkbox', { name: 'Approve for import' }),
    )

    const driftedSectionIndex = {
      ...sectionIndex,
      sectionSetFingerprint: 'section-ref-only-drift',
    }
    view.rerender(
      <AiSuggestionsPage
        qaSources={[source]}
        testCases={[]}
        onChange={onChange}
        selectedQaSourceId={source.id}
        savedCoveragePlans={[savedCoveragePlan]}
        sourceSectionIndexes={[driftedSectionIndex]}
        coverageAreaSuggestionProvider={coverageAreaSuggestionProvider}
      />,
    )

    expect(
      screen.getByText(/Saved source section locations no longer match/),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', {
        name: 'Area suggestions generated for: Payment authorization outcomes',
      }),
    ).toBeInTheDocument()
    const importButton = screen.getByRole('button', {
      name: 'Create Test Cases from approved Ready suggestions',
    })
    expect(importButton).toBeEnabled()
    await user.click(importButton)
    expect(onChange).toHaveBeenCalledTimes(1)
  })
  it('clears only the selected source saved coverage plan', async () => {
    const user = userEvent.setup()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const sourceOne = createDefaultQaSource()
    const sourceTwo = createQaSource({
      ...sourceOne,
      id: 'source-2',
      title: 'Profile settings PRD',
      content: 'Profile settings must save display name changes.',
    })
    const sourceOneRecord = createSavedCoveragePlanRecord({ source: sourceOne })
    const sourceTwoRecord = createSavedCoveragePlanRecord({
      source: sourceTwo,
      plan: {
        ...createPaymentAuthorizationCoveragePlan(),
        sourceScope: {
          ...createPaymentAuthorizationCoveragePlan().sourceScope,
          qaSourceId: 'source-2',
        },
      },
    })
    const { getLatestCoveragePlans } = renderAiSuggestionsPage({
      qaSources: [sourceOne, sourceTwo],
      savedCoveragePlans: [sourceOneRecord, sourceTwoRecord],
    })

    await user.click(
      screen.getByRole('button', { name: 'Clear saved coverage plan' }),
    )

    expect(confirmSpy).toHaveBeenCalledWith(
      'Clear the coverage plan for "Checkout payment LLD"? The saved plan and transient coverage-area suggestions for this source will be removed. Existing Test Cases will not be changed.',
    )
    expect(
      screen.getByRole('heading', {
        name: 'Ready to analyze selected QA source',
      }),
    ).toBeInTheDocument()
    expect(getLatestCoveragePlans()).toEqual([sourceTwoRecord])
  })

  it('preserves a saved coverage plan when clear confirmation is canceled', async () => {
    const user = userEvent.setup()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const savedCoveragePlan = createSavedCoveragePlanRecord()
    const { getLatestCoveragePlans } = renderAiSuggestionsPage({
      savedCoveragePlans: [savedCoveragePlan],
    })

    await user.click(
      screen.getByRole('button', { name: 'Clear saved coverage plan' }),
    )

    expect(confirmSpy).toHaveBeenCalledTimes(1)
    expect(getLatestCoveragePlans()).toEqual([savedCoveragePlan])
    expect(
      screen.getByRole('heading', {
        name: 'Payment authorization outcomes',
      }),
    ).toBeInTheDocument()
  })

  it('re-analysis replaces a saved plan only after validated analysis succeeds', async () => {
    const user = userEvent.setup()
    const savedCoveragePlan = createSavedCoveragePlanRecord()
    const generateCoveragePlan = vi
      .fn()
      .mockResolvedValueOnce({
        coveragePlan: {
          schemaVersion: 'unsupported',
        },
        warnings: [],
      })
      .mockResolvedValueOnce({
        coveragePlan: {
          ...createPaymentAuthorizationCoveragePlan(),
          coverageAreas: [
            {
              name: 'Gateway retry handling',
              summary: 'Coverage for retryable gateway failures.',
              behaviors: ['retry gateway failures'],
              risks: [],
              evidence: [
                'Payment authorization must handle approved, declined, and timeout responses.',
              ],
              ambiguities: [],
              generationReadiness: 'source_backed',
            },
          ],
        },
        warnings: [],
      })
    const coveragePlanProvider: AiCoveragePlanProvider = {
      isAvailable: true,
      generateCoveragePlan,
    }
    const { getLatestCoveragePlans } = renderAiSuggestionsPage({
      savedCoveragePlans: [savedCoveragePlan],
      coveragePlanProvider,
    })

    await user.click(screen.getByRole('button', { name: 'Analyze coverage' }))

    expect(
      await screen.findByText(
        'AI coverage plan response did not match the expected schema.',
      ),
    ).toBeInTheDocument()
    expect(getLatestCoveragePlans()).toEqual([savedCoveragePlan])
    expect(screen.getByText('Payment authorization outcomes')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Analyze coverage' }))

    expect(await screen.findByText('Gateway retry handling')).toBeInTheDocument()
    expect(getLatestCoveragePlans()).toHaveLength(1)
    expect(getLatestCoveragePlans()[0].plan.coverageAreas[0].name).toBe(
      'Gateway retry handling',
    )
  })

  it('updates the active command card on area selection and keeps evidence collapsed until opened', async () => {
    const user = userEvent.setup()
    const coveragePlanProvider = createAvailableCoverageProvider({
      coveragePlan: {
        schemaVersion: 'ai-coverage-plan-json-v2',
        coverageAreas: [
          {
            name: 'Payment authorization outcomes',
            summary: 'Coverage for approved responses.',
            behaviors: ['handle approved responses'],
            risks: ['Approved payment must not bypass authorization.'],
            evidence: [
              'Payment authorization must handle approved, declined, and timeout responses.',
            ],
            ambiguities: ['Timeout copy is not specified.'],
            generationReadiness: 'source_backed',
          },
          {
            name: 'Gateway timeout copy',
            summary: 'Coverage for timeout response copy.',
            behaviors: ['handle timeout copy'],
            risks: [],
            evidence: ['Timeout copy evidence sentence.'],
            ambiguities: [],
            generationReadiness: 'needs_review',
          },
        ],
        actors: [],
        states: [],
        inputs: [],
        failureModes: [],
        integrationRisks: [],
        permissionsSecurity: [],
        dataPersistenceRules: [],
        ambiguities: [],
        nextGenerationAreas: [],
        warnings: [],
      },
      warnings: [],
    })

    renderAiSuggestionsPage({
      coveragePlanProvider,
      coverageAreaSuggestionProvider: createAvailableCoverageAreaSuggestionProvider(
        createPaymentAuthorizationAreaSuggestionResponse(),
      ),
    })

    await user.click(screen.getByRole('button', { name: 'Analyze coverage' }))
    await user.click((await screen.findAllByRole('button', { name: 'Select area' }))[0])

    const activeArea = screen.getByRole('region', {
      name: 'Payment authorization outcomes',
    })
    expect(activeArea).toHaveTextContent('Source-backed')
    expect(activeArea).toHaveTextContent('Evidence: 1')
    expect(activeArea).toHaveTextContent('Risks: 1')
    expect(activeArea).toHaveTextContent('Ambiguities: 1')
    expect(
      within(activeArea).getByRole('button', {
        name: 'Generate tests for selected area',
      }),
    ).toBeEnabled()
    expect(within(activeArea).getByText('Risks to test')).toBeVisible()
    expect(within(activeArea).getByText('Ambiguities to clarify')).toBeVisible()
    expect(within(activeArea).getByText('Source scope')).toBeVisible()
    expect(within(activeArea).getByText('Coverage dimensions')).toBeVisible()
    const evidenceDetails = within(activeArea)
      .getByText('Evidence used')
      .closest('details') as HTMLElement
    const evidence = within(evidenceDetails).getByText(
      'Payment authorization must handle approved, declined, and timeout responses.',
    )

    expect(evidence).not.toBeVisible()

    await user.click(within(activeArea).getByText('Evidence used'))

    expect(evidence).toBeVisible()

    const timeoutArea = screen.getByRole('article', {
      name: 'Gateway timeout copy',
    })
    await user.click(within(timeoutArea).getByRole('button', { name: 'Select area' }))

    expect(
      screen.getByRole('region', { name: 'Gateway timeout copy' }),
    ).toBeInTheDocument()
  })

  it('disables area generation for coverage areas blocked by ambiguity', async () => {
    const user = userEvent.setup()
    const generateCoverageAreaSuggestions = vi.fn()
    const coveragePlanProvider = createAvailableCoverageProvider({
      coveragePlan: {
        schemaVersion: 'ai-coverage-plan-json-v2',
        coverageAreas: [
          {
            name: 'Payment authorization ambiguity',
            summary: 'Coverage is blocked until authorization rules are clear.',
            behaviors: ['handle authorization approvals'],
            risks: [],
            evidence: [
              'Payment authorization must handle approved, declined, and timeout responses.',
            ],
            ambiguities: ['Approval criteria are unresolved.'],
            generationReadiness: 'blocked_by_ambiguity',
          },
        ],
        actors: [],
        states: [],
        inputs: [],
        failureModes: [],
        integrationRisks: [],
        permissionsSecurity: [],
        dataPersistenceRules: [],
        ambiguities: [
          {
            question: 'What defines approval?',
            whyItMatters: 'Import-ready tests need executable criteria.',
            severity: 'High',
          },
        ],
        nextGenerationAreas: [],
        warnings: [],
      },
      warnings: [],
    })
    const coverageAreaSuggestionProvider: AiCoverageAreaSuggestionProvider = {
      isAvailable: true,
      generateCoverageAreaSuggestions,
    }

    renderAiSuggestionsPage({
      coveragePlanProvider,
      coverageAreaSuggestionProvider,
    })

    await user.click(screen.getByRole('button', { name: 'Analyze coverage' }))
    await user.click(await screen.findByRole('button', { name: 'Select area' }))

    expect(
      screen.getAllByText(/Clarify ambiguity before generation/).length,
    ).toBeGreaterThan(0)
    expect(screen.getAllByText('Approval criteria are unresolved.').length).toBeGreaterThan(0)
    expect(
      screen.getByRole('button', {
        name: 'Clarify ambiguity before generation',
      }),
    ).toBeDisabled()
    expect(
      screen.queryByRole('button', { name: 'Generate tests for selected area' }),
    ).not.toBeInTheDocument()
    expect(generateCoverageAreaSuggestions).not.toHaveBeenCalled()
  })

  it('generates selected-area suggestions with assessment and imports only after explicit QA approval', async () => {
    const user = userEvent.setup()
    const coveragePlanProvider = createAvailableCoverageProvider({
      coveragePlan: {
        schemaVersion: 'ai-coverage-plan-json-v2',
        coverageAreas: [
          {
            name: 'Payment authorization outcomes',
            summary: 'Coverage for approved, declined, and timeout responses.',
            behaviors: ['handle approved, declined, and timeout responses'],
            risks: ['Timeout handling can block checkout completion.'],
            evidence: [
              'Payment authorization must handle approved, declined, and timeout responses.',
            ],
            ambiguities: [],
            generationReadiness: 'source_backed',
          },
        ],
        actors: ['Checkout user'],
        states: ['Approved', 'Declined', 'Timeout'],
        inputs: ['Card details'],
        failureModes: ['Gateway timeout'],
        integrationRisks: [],
        permissionsSecurity: [],
        dataPersistenceRules: [],
        ambiguities: [],
        nextGenerationAreas: [],
        warnings: [],
      },
      warnings: [],
    })
    const coverageAreaSuggestionProvider =
      createAvailableCoverageAreaSuggestionProvider({
        areaSuggestionResult: {
          schemaVersion: 'ai-coverage-area-suggestions-json-v1',
          sourceScope: {
            qaSourceId: 'source-1',
            visibleSourceOnly: true,
            sourceTruncated: false,
            analysisScope: 'visible_source_only',
          },
          areaScope: {
            name: 'Payment authorization outcomes',
            summary: 'Coverage for approved, declined, and timeout responses.',
            evidence: [
              'Payment authorization must handle approved, declined, and timeout responses.',
            ],
            generationReadiness: 'source_backed',
          },
          testCaseSuggestions: [
            {
              status: 'Ready',
              confidence: 'High',
              title: 'Checkout approves authorized payment',
              area: 'Payment authorization outcomes',
              priority: 'High',
              type: 'Functional',
              preconditions: 'Checkout user has valid payment details.',
              structuredSteps: [
                {
                  action: 'Submit valid payment details.',
                  expectedResult: 'Payment authorization is approved.',
                },
              ],
              evidence: [
                'Payment authorization must handle approved, declined, and timeout responses.',
              ],
              assumptions: [],
              warnings: [],
            },
          ],
          coverageAssessment: {
            coverageLevel: 'Partial',
            coveredBehaviors: ['Approved payment authorization is covered.'],
            missingBehaviors: ['Declined and timeout responses remain follow-up.'],
            blockedAmbiguousItems: [],
            suggestedFollowUpCoverage: ['Generate declined response coverage.'],
            stopReason:
              'Generated 1 suggestion. Stopped because additional cases would be duplicate, speculative, unsupported, or low-value.',
          },
          warnings: ['Area assessment is qualitative only.'],
        },
        warnings: ['Backend area warning.'],
      })
    const { getLatestTestCases } = renderAiSuggestionsPage({
      coveragePlanProvider,
      coverageAreaSuggestionProvider,
    })

    await user.click(screen.getByRole('button', { name: 'Coverage workflow' }))
    await user.click(screen.getByRole('button', { name: 'Analyze coverage' }))
    await user.click(await screen.findByRole('button', { name: 'Select area' }))
    await user.click(
      screen.getByRole('button', { name: 'Generate tests for selected area' }),
    )

    expect(
      await screen.findByRole('heading', {
        name: 'Area suggestions generated for: Payment authorization outcomes',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'Area suggestions generated for: Payment authorization outcomes. Review the assessment and approve Ready suggestions below.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Ready' })).toHaveTextContent('1')
    expect(screen.getByRole('region', { name: 'Needs review' })).toHaveTextContent(
      '0',
    )
    expect(screen.getByRole('region', { name: 'Rejected' })).toHaveTextContent('0')
    expect(screen.getByRole('region', { name: 'Approved for import' })).toHaveTextContent('0')
    expect(
      screen.getByText('AI suggestion coverage for this area: Partial'),
    ).toBeInTheDocument()
    expect(screen.getByText(/Backend area warning/)).toBeInTheDocument()
    expect(
      screen.getAllByText(/Area assessment is qualitative only/).length,
    ).toBeGreaterThan(0)
    expect(screen.queryByText('Confidence: High')).not.toBeInTheDocument()
    expect(screen.getByText('Approved payment authorization is covered.')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Generated 1 suggestion. Stopped because additional cases would be duplicate, speculative, unsupported, or low-value.',
      ),
    ).toBeInTheDocument()
    expect(getLatestTestCases()).toEqual([])
    expect(
      screen.getByRole('button', {
        name: 'Create Test Cases from approved Ready suggestions',
      }),
    ).toBeDisabled()

    await user.click(screen.getByLabelText('Approve for import'))
    expect(screen.getByRole('region', { name: 'Approved for import' })).toHaveTextContent('1')
    expect(
      screen.getByRole('button', {
        name: 'Create Test Cases from approved Ready suggestions',
      }),
    ).toBeEnabled()
    await user.click(
      screen.getByRole('button', {
        name: 'Create Test Cases from approved Ready suggestions',
      }),
    )

    expect(getLatestTestCases()).toHaveLength(1)
    expect(getLatestTestCases()[0]).toMatchObject({
      title: 'Checkout approves authorized payment',
      area: 'Payment authorization outcomes',
      qaSourceId: 'source-1',
    })
  })

  it('shows mixed review inbox counts, hides non-ready approval, and renders no score-like metrics', async () => {
    const user = userEvent.setup()
    const coveragePlanProvider = createAvailableCoverageProvider({
      coveragePlan: createPaymentAuthorizationCoveragePlan(),
      warnings: [],
    })
    const coverageAreaSuggestionProvider =
      createAvailableCoverageAreaSuggestionProvider(
        createPaymentAuthorizationAreaSuggestionResponse([
          createReadyPaymentAuthorizationAreaSuggestion(),
          {
            ...createReadyPaymentAuthorizationAreaSuggestion(),
            status: 'Needs review',
            title: 'Checkout declined response copy needs review',
            preconditions: 'Declined payment copy is ready for QA review.',
            structuredSteps: [
              {
                action: 'Submit declined payment details.',
                expectedResult: 'A clear decline message is shown.',
              },
            ],
            assumptions: ['Decline copy is not final.'],
          },
          {
            ...createReadyPaymentAuthorizationAreaSuggestion(),
            status: 'Rejected',
            title: 'Checkout speculative fraud workflow',
            preconditions: 'Fraud workflow is not source-backed.',
            structuredSteps: [
              {
                action: 'Trigger unsupported fraud review.',
                expectedResult: 'Speculative fraud routing is not asserted.',
              },
            ],
            warnings: ['Workflow is not supported by the selected source.'],
          },
        ]),
      )

    renderAiSuggestionsPage({
      coveragePlanProvider,
      coverageAreaSuggestionProvider,
    })

    await user.click(screen.getByRole('button', { name: 'Analyze coverage' }))
    await user.click(await screen.findByRole('button', { name: 'Select area' }))
    await user.click(
      screen.getByRole('button', { name: 'Generate tests for selected area' }),
    )

    expect(await screen.findByRole('region', { name: 'Ready' })).toHaveTextContent(
      '1',
    )
    expect(screen.getByRole('region', { name: 'Needs review' })).toHaveTextContent(
      '1',
    )
    expect(screen.getByRole('region', { name: 'Rejected' })).toHaveTextContent('1')
    expect(screen.getAllByLabelText('Approve for import')).toHaveLength(1)
    expect(screen.getAllByText('High confidence').length).toBeGreaterThan(0)
    expect(screen.getAllByText('1 step').length).toBeGreaterThan(0)
    expect(
      screen.queryByText('Checkout user has valid payment details.'),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText('Submit valid payment details.'),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText('Payment authorization is approved.'),
    ).not.toBeInTheDocument()

    const readyCard = screen.getByRole('article', {
      name: 'Checkout approves authorized payment',
    })
    const needsReviewCard = screen.getByRole('article', {
      name: 'Checkout declined response copy needs review',
    })
    const rejectedCard = screen.getByRole('article', {
      name: 'Checkout speculative fraud workflow',
    })
    expect(within(readyCard).getByLabelText('Approve for import')).toBeInTheDocument()
    expect(within(needsReviewCard).queryByLabelText('Approve for import')).not.toBeInTheDocument()
    expect(within(rejectedCard).queryByLabelText('Approve for import')).not.toBeInTheDocument()

    await user.click(within(readyCard).getByRole('button', { name: 'Review details' }))

    const detailPanel = screen.getByRole('region', {
      name: 'Selected suggestion details',
    })
    expect(within(detailPanel).getByText('Checkout user has valid payment details.')).toBeVisible()
    expect(within(detailPanel).getByText('Evidence to verify')).toBeVisible()
    expect(within(detailPanel).getByText('Submit valid payment details.')).toBeVisible()
    expect(within(detailPanel).getByText('Payment authorization is approved.')).toBeVisible()

    await user.click(
      within(needsReviewCard).getByRole('button', { name: 'Review details' }),
    )

    expect(
      within(detailPanel).queryByText('Checkout user has valid payment details.'),
    ).not.toBeInTheDocument()
    expect(
      within(detailPanel).getByText('Declined payment copy is ready for QA review.'),
    ).toBeVisible()
    expect(within(detailPanel).getByText('Decline copy is not final.')).toBeVisible()

    expect(screen.getByRole('region', { name: 'Approved for import' })).toHaveTextContent('0')
    await user.click(within(readyCard).getByLabelText('Approve for import'))
    expect(screen.getByRole('region', { name: 'Approved for import' })).toHaveTextContent('1')
    expect(
      screen
        .getByRole('region', { name: 'Global coverage & suggestions' })
        .textContent,
    ).not.toMatch(/%|\bpts\b|score/i)
  })

  it('shows clear in-flight feedback while generating selected-area suggestions', async () => {
    const user = userEvent.setup()
    const areaGeneration = createDeferred<unknown>()
    const coveragePlanProvider = createAvailableCoverageProvider({
      coveragePlan: createPaymentAuthorizationCoveragePlan(),
      warnings: [],
    })
    const coverageAreaSuggestionProvider: AiCoverageAreaSuggestionProvider = {
      isAvailable: true,
      generateCoverageAreaSuggestions: vi
        .fn()
        .mockReturnValue(areaGeneration.promise),
    }

    renderAiSuggestionsPage({
      coveragePlanProvider,
      coverageAreaSuggestionProvider,
    })

    await user.click(screen.getByRole('button', { name: 'Coverage workflow' }))
    await user.click(screen.getByRole('button', { name: 'Analyze coverage' }))
    await user.click(await screen.findByRole('button', { name: 'Select area' }))
    await user.click(
      screen.getByRole('button', { name: 'Generate tests for selected area' }),
    )

    expect(
      screen.getByRole('button', {
        name: 'Generating tests for selected area...',
      }),
    ).toBeDisabled()
    expect(
      screen.getByText('Selected coverage area'),
    ).toBeInTheDocument()

    await act(async () => {
      areaGeneration.resolve(createPaymentAuthorizationAreaSuggestionResponse())
    })

    expect(
      await screen.findByRole('heading', {
        name: 'Area suggestions generated for: Payment authorization outcomes',
      }),
    ).toBeInTheDocument()
  })

  it('shows a clear empty-result message when no area suggestions are generated', async () => {
    const user = userEvent.setup()
    const coveragePlanProvider = createAvailableCoverageProvider({
      coveragePlan: createPaymentAuthorizationCoveragePlan(),
      warnings: [],
    })
    const coverageAreaSuggestionProvider =
      createAvailableCoverageAreaSuggestionProvider(
        createPaymentAuthorizationAreaSuggestionResponse(),
      )

    renderAiSuggestionsPage({
      coveragePlanProvider,
      coverageAreaSuggestionProvider,
    })

    await user.click(screen.getByRole('button', { name: 'Coverage workflow' }))
    await user.click(screen.getByRole('button', { name: 'Analyze coverage' }))
    await user.click(await screen.findByRole('button', { name: 'Select area' }))
    await user.click(
      screen.getByRole('button', { name: 'Generate tests for selected area' }),
    )

    expect(
      await screen.findByRole('heading', {
        name: 'Area suggestions generated for: Payment authorization outcomes',
      }),
    ).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Ready' })).toHaveTextContent('0')
    expect(screen.getByRole('region', { name: 'Needs review' })).toHaveTextContent(
      '0',
    )
    expect(screen.getByRole('region', { name: 'Rejected' })).toHaveTextContent('0')
    expect(
      screen.getByText('AI suggestion coverage for this area: Low'),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'No import-ready suggestions were generated for this area. The source or selected area did not safely support executable suggestions.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'Generated 0 suggestions. Stopped because the source is too thin.',
      ),
    ).toBeInTheDocument()
  })

  it('shows area generation errors near the selected coverage area', async () => {
    const user = userEvent.setup()
    const coveragePlanProvider = createAvailableCoverageProvider({
      coveragePlan: createPaymentAuthorizationCoveragePlan(),
      warnings: [],
    })
    const coverageAreaSuggestionProvider: AiCoverageAreaSuggestionProvider = {
      isAvailable: true,
      generateCoverageAreaSuggestions: vi
        .fn()
        .mockRejectedValue(new Error('Area backend failed safely.')),
    }

    renderAiSuggestionsPage({
      coveragePlanProvider,
      coverageAreaSuggestionProvider,
    })

    await user.click(screen.getByRole('button', { name: 'Coverage workflow' }))
    await user.click(screen.getByRole('button', { name: 'Analyze coverage' }))
    await user.click(await screen.findByRole('button', { name: 'Select area' }))
    await user.click(
      screen.getByRole('button', { name: 'Generate tests for selected area' }),
    )

    expect(
      await screen.findByText(
        'Area suggestion generation failed for Payment authorization outcomes: Area backend failed safely. Review the source and try again.',
      ),
    ).toBeInTheDocument()
  })

  it('shows rate-limit failures as request failures without rendering zero suggestions and allows retry', async () => {
    const user = userEvent.setup()
    const coveragePlanProvider = createAvailableCoverageProvider({
      coveragePlan: createPaymentAuthorizationCoveragePlan(),
      warnings: [],
    })
    const generateCoverageAreaSuggestions = vi
      .fn()
      .mockRejectedValueOnce(
        new Error(
          'AI provider rate limit reached (HTTP 429). Please wait and try again.',
        ),
      )
      .mockResolvedValueOnce(
        createSuccessfulPaymentAuthorizationAreaSuggestionResponse(),
      )
    const coverageAreaSuggestionProvider: AiCoverageAreaSuggestionProvider = {
      isAvailable: true,
      generateCoverageAreaSuggestions,
    }

    renderAiSuggestionsPage({
      coveragePlanProvider,
      coverageAreaSuggestionProvider,
    })

    await user.click(screen.getByRole('button', { name: 'Coverage workflow' }))
    await user.click(screen.getByRole('button', { name: 'Analyze coverage' }))
    await user.click(await screen.findByRole('button', { name: 'Select area' }))
    await user.click(
      screen.getByRole('button', { name: 'Generate tests for selected area' }),
    )

    expect(
      await screen.findByText(
        'Area suggestion generation failed for Payment authorization outcomes: AI provider rate limit reached (HTTP 429). Please wait and try again. The request was sent, but no suggestions were generated.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getAllByRole('heading', {
        name: 'Payment authorization outcomes',
      }).length,
    ).toBeGreaterThan(0)
    expect(
      screen.queryByRole('heading', {
        name: 'Area suggestions generated for: Payment authorization outcomes',
      }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText(/No import-ready suggestions were generated/),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Generate tests for selected area' }),
    ).toBeEnabled()

    await user.click(
      screen.getByRole('button', { name: 'Generate tests for selected area' }),
    )

    expect(
      await screen.findByRole('heading', {
        name: 'Area suggestions generated for: Payment authorization outcomes',
      }),
    ).toBeInTheDocument()
    expect(screen.queryByText(/rate limit reached/)).not.toBeInTheDocument()
    expect(generateCoverageAreaSuggestions).toHaveBeenCalledTimes(2)
  })

  it('keeps an existing same-area result visible when a rate-limited retry fails', async () => {
    const user = userEvent.setup()
    const coveragePlanProvider = createAvailableCoverageProvider({
      coveragePlan: createPaymentAuthorizationCoveragePlan(),
      warnings: [],
    })
    const generateCoverageAreaSuggestions = vi
      .fn()
      .mockResolvedValueOnce(
        createSuccessfulPaymentAuthorizationAreaSuggestionResponse(),
      )
      .mockRejectedValueOnce(
        new Error(
          'AI provider rate limit reached (HTTP 429). Please wait and try again.',
        ),
      )
    const coverageAreaSuggestionProvider: AiCoverageAreaSuggestionProvider = {
      isAvailable: true,
      generateCoverageAreaSuggestions,
    }

    renderAiSuggestionsPage({
      coveragePlanProvider,
      coverageAreaSuggestionProvider,
    })

    await user.click(screen.getByRole('button', { name: 'Coverage workflow' }))
    await user.click(screen.getByRole('button', { name: 'Analyze coverage' }))
    await user.click(await screen.findByRole('button', { name: 'Select area' }))
    await user.click(
      screen.getByRole('button', { name: 'Generate tests for selected area' }),
    )

    expect(
      await screen.findByRole('heading', {
        name: 'Area suggestions generated for: Payment authorization outcomes',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Checkout approves authorized payment'),
    ).toBeInTheDocument()

    await user.click(
      screen.getByRole('button', { name: 'Generate tests for selected area' }),
    )

    expect(
      await screen.findByText(
        'Area suggestion generation failed for Payment authorization outcomes: AI provider rate limit reached (HTTP 429). Please wait and try again. The request was sent, but no suggestions were generated.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', {
        name: 'Area suggestions generated for: Payment authorization outcomes',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Checkout approves authorized payment'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Generate tests for selected area' }),
    ).toBeEnabled()
  })

  it('does not allow import when provider marks the area output as blocked', async () => {
    const user = userEvent.setup()
    const coveragePlanProvider = createAvailableCoverageProvider({
      coveragePlan: {
        schemaVersion: 'ai-coverage-plan-json-v2',
        coverageAreas: [
          {
            name: 'Payment authorization outcomes',
            summary: 'Coverage for approved, declined, and timeout responses.',
            behaviors: ['handle approved, declined, and timeout responses'],
            risks: ['Timeout handling can block checkout completion.'],
            evidence: [
              'Payment authorization must handle approved, declined, and timeout responses.',
            ],
            ambiguities: [],
            generationReadiness: 'source_backed',
          },
        ],
        actors: [],
        states: [],
        inputs: [],
        failureModes: [],
        integrationRisks: [],
        permissionsSecurity: [],
        dataPersistenceRules: [],
        ambiguities: [],
        nextGenerationAreas: [],
        warnings: [],
      },
      warnings: [],
    })
    const coverageAreaSuggestionProvider =
      createAvailableCoverageAreaSuggestionProvider({
        areaSuggestionResult: {
          schemaVersion: 'ai-coverage-area-suggestions-json-v1',
          sourceScope: {
            qaSourceId: 'source-1',
            visibleSourceOnly: true,
            sourceTruncated: false,
            analysisScope: 'visible_source_only',
          },
          areaScope: {
            name: 'Payment authorization outcomes',
            summary: 'Coverage for approved, declined, and timeout responses.',
            evidence: [
              'Payment authorization must handle approved, declined, and timeout responses.',
            ],
            generationReadiness: 'blocked_by_ambiguity',
          },
          testCaseSuggestions: [
            {
              status: 'Ready',
              confidence: 'High',
              title: 'Checkout approves authorized payment',
              area: 'Payment authorization outcomes',
              priority: 'High',
              type: 'Functional',
              preconditions: 'Checkout user has valid payment details.',
              structuredSteps: [
                {
                  action: 'Submit valid payment details.',
                  expectedResult: 'Payment authorization is approved.',
                },
              ],
              evidence: [
                'Payment authorization must handle approved, declined, and timeout responses.',
              ],
              assumptions: [],
              warnings: [],
            },
          ],
          coverageAssessment: {
            coverageLevel: 'High',
            coveredBehaviors: ['Approved payment authorization is covered.'],
            missingBehaviors: [],
            blockedAmbiguousItems: ['Authorization approval rules are unresolved.'],
            suggestedFollowUpCoverage: [
              'Clarify authorization approval rules before import-ready generation.',
            ],
            stopReason:
              'Generated 1 suggestion. Stopped because additional cases would be duplicate, speculative, unsupported, or low-value.',
          },
          warnings: [],
        },
        warnings: [],
      })
    const { getLatestTestCases } = renderAiSuggestionsPage({
      coveragePlanProvider,
      coverageAreaSuggestionProvider,
    })

    await user.click(screen.getByRole('button', { name: 'Coverage workflow' }))
    await user.click(screen.getByRole('button', { name: 'Analyze coverage' }))
    await user.click(await screen.findByRole('button', { name: 'Select area' }))
    await user.click(
      screen.getByRole('button', { name: 'Generate tests for selected area' }),
    )

    expect(await screen.findByText('AI Area Suggestion Coverage')).toBeInTheDocument()
    expect(
      screen.getByText('AI suggestion coverage for this area: Low'),
    ).toBeInTheDocument()
    expect(
      screen.getAllByText(
        /Provider marked the selected area as blocked by ambiguity/,
      ).length,
    ).toBeGreaterThan(0)
    expect(
      screen.getAllByText(
        /Blocked areas cannot produce import-ready suggestions/,
      ).length,
    ).toBeGreaterThan(0)
    expect(screen.queryByLabelText('Approve for import')).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', {
        name: 'Create Test Cases from approved Ready suggestions',
      }),
    ).toBeDisabled()
    expect(getLatestTestCases()).toEqual([])
  })

  it('clears transient selected-area results when the QA Source changes', async () => {
    const user = userEvent.setup()
    const coveragePlanProvider = createAvailableCoverageProvider({
      coveragePlan: {
        schemaVersion: 'ai-coverage-plan-json-v2',
        coverageAreas: [
          {
            name: 'Payment authorization outcomes',
            summary: 'Coverage for approved responses.',
            behaviors: ['handle approved responses'],
            risks: [],
            evidence: [
              'Payment authorization must handle approved, declined, and timeout responses.',
            ],
            ambiguities: [],
            generationReadiness: 'source_backed',
          },
        ],
        actors: [],
        states: [],
        inputs: [],
        failureModes: [],
        integrationRisks: [],
        permissionsSecurity: [],
        dataPersistenceRules: [],
        ambiguities: [],
        nextGenerationAreas: [],
        warnings: [],
      },
      warnings: [],
    })
    const coverageAreaSuggestionProvider =
      createAvailableCoverageAreaSuggestionProvider({
        areaSuggestionResult: {
          schemaVersion: 'ai-coverage-area-suggestions-json-v1',
          sourceScope: {
            qaSourceId: 'source-1',
            visibleSourceOnly: true,
            sourceTruncated: false,
            analysisScope: 'visible_source_only',
          },
          areaScope: {
            name: 'Payment authorization outcomes',
            summary: 'Coverage for approved responses.',
            evidence: [
              'Payment authorization must handle approved, declined, and timeout responses.',
            ],
            generationReadiness: 'source_backed',
          },
          testCaseSuggestions: [],
          coverageAssessment: {
            coverageLevel: 'Low',
            coveredBehaviors: [],
            missingBehaviors: ['Approved response needs follow-up.'],
            blockedAmbiguousItems: [],
            suggestedFollowUpCoverage: [],
            stopReason:
              'Generated 0 suggestions. Stopped because the source is too thin.',
          },
          warnings: [],
        },
        warnings: [],
      })

    render(
      <AiSuggestionsPage
        qaSources={[
          createQaSource({
            id: 'source-1',
            title: 'Source 1',
            content:
              'Payment authorization must handle approved, declined, and timeout responses.',
          }),
          createQaSource({ id: 'source-2', title: 'Source 2' }),
        ]}
        testCases={[]}
        onChange={vi.fn()}
        selectedQaSourceId="source-1"
        onSelectedQaSourceChange={vi.fn()}
        coveragePlanProvider={coveragePlanProvider}
        coverageAreaSuggestionProvider={coverageAreaSuggestionProvider}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Coverage workflow' }))
    await user.click(screen.getByRole('button', { name: 'Analyze coverage' }))
    await user.click(await screen.findByRole('button', { name: 'Select area' }))
    await user.click(
      screen.getByRole('button', { name: 'Generate tests for selected area' }),
    )
    expect(await screen.findByText('AI Area Suggestion Coverage')).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('QA Source'), 'source-2')

    expect(screen.queryByText('AI Area Suggestion Coverage')).not.toBeInTheDocument()
  })

  it('clears stale selected-area suggestions when coverage is re-analyzed', async () => {
    const user = userEvent.setup()
    const coveragePlanProvider = createAvailableCoverageProvider({
      coveragePlan: {
        schemaVersion: 'ai-coverage-plan-json-v2',
        coverageAreas: [
          {
            name: 'Payment authorization outcomes',
            summary: 'Coverage for approved responses.',
            behaviors: ['handle approved responses'],
            risks: [],
            evidence: [
              'Payment authorization must handle approved, declined, and timeout responses.',
            ],
            ambiguities: [],
            generationReadiness: 'source_backed',
          },
        ],
        actors: [],
        states: [],
        inputs: [],
        failureModes: [],
        integrationRisks: [],
        permissionsSecurity: [],
        dataPersistenceRules: [],
        ambiguities: [],
        nextGenerationAreas: [],
        warnings: [],
      },
      warnings: [],
    })
    const coverageAreaSuggestionProvider =
      createAvailableCoverageAreaSuggestionProvider({
        areaSuggestionResult: {
          schemaVersion: 'ai-coverage-area-suggestions-json-v1',
          sourceScope: {
            qaSourceId: 'source-1',
            visibleSourceOnly: true,
            sourceTruncated: false,
            analysisScope: 'visible_source_only',
          },
          areaScope: {
            name: 'Payment authorization outcomes',
            summary: 'Coverage for approved responses.',
            evidence: [
              'Payment authorization must handle approved, declined, and timeout responses.',
            ],
            generationReadiness: 'source_backed',
          },
          testCaseSuggestions: [],
          coverageAssessment: {
            coverageLevel: 'Low',
            coveredBehaviors: [],
            missingBehaviors: ['Approved response needs follow-up.'],
            blockedAmbiguousItems: [],
            suggestedFollowUpCoverage: [],
            stopReason:
              'Generated 0 suggestions. Stopped because the source is too thin.',
          },
          warnings: [],
        },
        warnings: [],
      })

    renderAiSuggestionsPage({
      coveragePlanProvider,
      coverageAreaSuggestionProvider,
    })

    await user.click(screen.getByRole('button', { name: 'Coverage workflow' }))
    await user.click(screen.getByRole('button', { name: 'Analyze coverage' }))
    await user.click(await screen.findByRole('button', { name: 'Select area' }))
    await user.click(
      screen.getByRole('button', { name: 'Generate tests for selected area' }),
    )
    expect(await screen.findByText('AI Area Suggestion Coverage')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Analyze coverage' }))

    await waitFor(() => {
      expect(screen.queryByText('AI Area Suggestion Coverage')).not.toBeInTheDocument()
    })
  })

  it('clears stale selected-area suggestions when the coverage map is cleared', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const coveragePlanProvider = createAvailableCoverageProvider({
      coveragePlan: {
        schemaVersion: 'ai-coverage-plan-json-v2',
        coverageAreas: [
          {
            name: 'Payment authorization outcomes',
            summary: 'Coverage for approved responses.',
            behaviors: ['handle approved responses'],
            risks: [],
            evidence: [
              'Payment authorization must handle approved, declined, and timeout responses.',
            ],
            ambiguities: [],
            generationReadiness: 'source_backed',
          },
        ],
        actors: [],
        states: [],
        inputs: [],
        failureModes: [],
        integrationRisks: [],
        permissionsSecurity: [],
        dataPersistenceRules: [],
        ambiguities: [],
        nextGenerationAreas: [],
        warnings: [],
      },
      warnings: [],
    })
    const coverageAreaSuggestionProvider =
      createAvailableCoverageAreaSuggestionProvider({
        areaSuggestionResult: {
          schemaVersion: 'ai-coverage-area-suggestions-json-v1',
          sourceScope: {
            qaSourceId: 'source-1',
            visibleSourceOnly: true,
            sourceTruncated: false,
            analysisScope: 'visible_source_only',
          },
          areaScope: {
            name: 'Payment authorization outcomes',
            summary: 'Coverage for approved responses.',
            evidence: [
              'Payment authorization must handle approved, declined, and timeout responses.',
            ],
            generationReadiness: 'source_backed',
          },
          testCaseSuggestions: [],
          coverageAssessment: {
            coverageLevel: 'Low',
            coveredBehaviors: [],
            missingBehaviors: ['Approved response needs follow-up.'],
            blockedAmbiguousItems: [],
            suggestedFollowUpCoverage: [],
            stopReason:
              'Generated 0 suggestions. Stopped because the source is too thin.',
          },
          warnings: [],
        },
        warnings: [],
      })

    renderAiSuggestionsPage({
      coveragePlanProvider,
      coverageAreaSuggestionProvider,
    })

    await user.click(screen.getByRole('button', { name: 'Coverage workflow' }))
    await user.click(screen.getByRole('button', { name: 'Analyze coverage' }))
    await user.click(await screen.findByRole('button', { name: 'Select area' }))
    await user.click(
      screen.getByRole('button', { name: 'Generate tests for selected area' }),
    )
    expect(await screen.findByText('AI Area Suggestion Coverage')).toBeInTheDocument()

    await user.click(
      screen.getByRole('button', { name: 'Clear saved coverage plan' }),
    )

    await waitFor(() => {
      expect(screen.queryByText('AI Area Suggestion Coverage')).not.toBeInTheDocument()
    })
    expect(
      screen.queryByRole('heading', { name: 'Payment authorization outcomes' }),
    ).not.toBeInTheDocument()
  })

  it('shows malformed coverage-plan responses as errors without mutating Test Cases', async () => {
    const user = userEvent.setup()
    const coveragePlanProvider = createAvailableCoverageProvider({
      coveragePlan: {
        schemaVersion: 'ai-coverage-plan-json-v1',
        coverageAreas: [],
      },
      warnings: [],
    })
    const { getLatestTestCases } = renderAiSuggestionsPage({
      coveragePlanProvider,
    })

    await user.click(screen.getByRole('button', { name: 'Coverage workflow' }))
    await user.click(screen.getByRole('button', { name: 'Analyze coverage' }))

    expect(
      await screen.findByText(
        'AI coverage plan response did not match the expected schema.',
      ),
    ).toBeInTheDocument()
    expect(getLatestTestCases()).toEqual([])
  })

  it('does not let duplicate provider IDs select or import multiple suggestions', async () => {
    const user = userEvent.setup()
    const provider = createAvailableProvider({
      suggestions: [
        {
          id: 'provider-duplicate-id',
          title: 'Checkout approves valid card',
          area: 'Checkout',
          priority: 'High',
          type: 'Functional',
          evidence: ['Approved card responses must be handled.'],
          structuredSteps: [
            {
              action: 'Submit valid card details.',
              expectedResult: 'Payment is approved.',
            },
          ],
        },
        {
          id: 'provider-duplicate-id',
          title: 'Checkout declines invalid card',
          area: 'Checkout',
          priority: 'High',
          type: 'Functional',
          evidence: ['Declined card responses must be handled.'],
          structuredSteps: [
            {
              action: 'Submit declined card details.',
              expectedResult: 'Payment is declined.',
            },
          ],
        },
      ],
    })
    const { getLatestTestCases } = renderAiSuggestionsPage({ provider })

    await user.click(
      screen.getByRole('button', { name: 'Advanced: direct suggestions' }),
    )
    await user.click(
      screen.getByRole('button', { name: 'Generate direct suggestions' }),
    )
    expect(await screen.findByRole('heading', { name: 'Checkout approves valid card' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Checkout declines invalid card' })).toBeInTheDocument()

    await user.click(screen.getAllByLabelText('Approve for import')[0])
    await user.click(
      screen.getByRole('button', {
        name: 'Create Test Cases from approved Ready suggestions',
      }),
    )

    expect(getLatestTestCases().map((testCase) => testCase.title)).toEqual([
      'Checkout approves valid card',
    ])
  })

  it('rejects and cancels suggestions without creating Test Cases', async () => {
    const user = userEvent.setup()
    const provider = createAvailableProvider({
      suggestions: [
        {
          id: 'ready-suggestion',
          title: 'Checkout approves valid card',
          area: 'Checkout',
          priority: 'High',
          type: 'Functional',
          evidence: ['Approved card responses must be handled.'],
          structuredSteps: [
            {
              action: 'Submit valid card details.',
              expectedResult: 'Payment is approved.',
            },
          ],
        },
      ],
    })
    const { getLatestTestCases } = renderAiSuggestionsPage({ provider })

    await user.click(
      screen.getByRole('button', { name: 'Advanced: direct suggestions' }),
    )
    await user.click(
      screen.getByRole('button', { name: 'Generate direct suggestions' }),
    )
    await user.click(screen.getByRole('button', { name: 'Reject' }))

    expect(screen.getAllByText('Rejected').length).toBeGreaterThan(0)
    expect(screen.getByText('Rejected by tester.')).toBeInTheDocument()
    expect(getLatestTestCases()).toEqual([])

    await user.click(screen.getByRole('button', { name: 'Cancel suggestions' }))

    expect(screen.queryByRole('heading', { name: 'Checkout approves valid card' })).not.toBeInTheDocument()
    expect(getLatestTestCases()).toEqual([])
  })

  it('shows malformed provider responses as errors without mutating Test Cases', async () => {
    const user = userEvent.setup()
    const provider = createAvailableProvider('{not json')
    const { getLatestTestCases } = renderAiSuggestionsPage({ provider })

    await user.click(
      screen.getByRole('button', { name: 'Advanced: direct suggestions' }),
    )
    await user.click(
      screen.getByRole('button', { name: 'Generate direct suggestions' }),
    )

    expect(
      await screen.findByText('AI response was not valid JSON.'),
    ).toBeInTheDocument()
    expect(getLatestTestCases()).toEqual([])
  })

  it('updates source selection and clears suggestions', async () => {
    const user = userEvent.setup()
    const onSelectedQaSourceChange = vi.fn()
    const provider = createAvailableProvider({
      suggestions: [
        {
          title: 'Checkout approves valid card',
          area: 'Checkout',
          priority: 'High',
          type: 'Functional',
          structuredSteps: [
            {
              action: 'Submit valid card details.',
              expectedResult: 'Payment is approved.',
            },
          ],
        },
      ],
    })

    render(
      <AiSuggestionsPage
        qaSources={[
          createQaSource({ id: 'source-1', title: 'Source 1' }),
          createQaSource({ id: 'source-2', title: 'Source 2' }),
        ]}
        testCases={[]}
        onChange={vi.fn()}
        selectedQaSourceId="source-1"
        onSelectedQaSourceChange={onSelectedQaSourceChange}
        provider={provider}
      />,
    )

    await user.click(
      screen.getByRole('button', { name: 'Advanced: direct suggestions' }),
    )
    await user.click(
      screen.getByRole('button', { name: 'Generate direct suggestions' }),
    )
    expect(await screen.findByRole('heading', { name: 'Checkout approves valid card' })).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('QA Source'), 'source-2')

    expect(onSelectedQaSourceChange).toHaveBeenCalledWith('source-2')
    expect(screen.queryByRole('heading', { name: 'Checkout approves valid card' })).not.toBeInTheDocument()
  })

  it('ignores stale provider responses after the selected source changes', async () => {
    const user = userEvent.setup()
    const sourceAResponse = createDeferred<unknown>()
    const provider: AiSuggestionProvider = {
      isAvailable: true,
      generateTestCaseSuggestions: vi.fn().mockReturnValue(sourceAResponse.promise),
    }
    let latestTestCases: TestCase[] = []

    function Harness() {
      const [selectedQaSourceId, setSelectedQaSourceId] = useState('source-a')
      const [testCases, setTestCases] = useState<TestCase[]>([])

      function handleChange(nextTestCases: TestCase[]) {
        latestTestCases = nextTestCases
        setTestCases(nextTestCases)
      }

      return (
        <AiSuggestionsPage
          qaSources={[
            createQaSource({
              id: 'source-a',
              title: 'Source A',
              content: 'Source A checkout rules.',
            }),
            createQaSource({
              id: 'source-b',
              title: 'Source B',
              content: 'Source B profile rules.',
            }),
          ]}
          testCases={testCases}
          onChange={handleChange}
          selectedQaSourceId={selectedQaSourceId}
          onSelectedQaSourceChange={setSelectedQaSourceId}
          provider={provider}
        />
      )
    }

    render(<Harness />)

    await user.click(
      screen.getByRole('button', { name: 'Advanced: direct suggestions' }),
    )
    await user.click(
      screen.getByRole('button', { name: 'Generate direct suggestions' }),
    )
    expect(provider.generateTestCaseSuggestions).toHaveBeenCalledTimes(1)

    await user.selectOptions(screen.getByLabelText('QA Source'), 'source-b')

    await act(async () => {
      sourceAResponse.resolve({
        suggestions: [
          {
            title: 'Source A stale suggestion',
            area: 'Checkout',
            priority: 'High',
            type: 'Functional',
            structuredSteps: [
              {
                action: 'Run the stale Source A flow.',
                expectedResult: 'The stale Source A flow passes.',
              },
            ],
          },
        ],
      })
      await sourceAResponse.promise
    })

    await waitFor(() => {
      expect(
        screen.queryByRole('heading', { name: 'Source A stale suggestion' }),
      ).not.toBeInTheDocument()
    })
    expect(screen.getByLabelText('QA Source')).toHaveValue('source-b')
    expect(latestTestCases).toEqual([])
  })
})
