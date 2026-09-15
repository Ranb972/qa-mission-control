import { StrictMode } from 'react'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { createBug } from '../test/bugFactory'
import { createExecution } from '../test/executionFactory'
import { createRelease } from '../test/releaseFactory'
import { createQaSource } from '../test/qaSourceFactory'
import { createRisk } from '../test/riskFactory'
import { createTestCase } from '../test/testCaseFactory'
import { createTestSuite } from '../test/testSuiteFactory'
import { BUG_STORAGE_KEY } from '../lib/storage/bugStorage'
import {
  COVERAGE_PLAN_STORAGE_KEY,
  COVERAGE_PLAN_STORAGE_SCHEMA_VERSION,
  createPersistedCoveragePlanRecord,
} from '../lib/storage/coveragePlanStorage'
import { EXECUTION_STORAGE_KEY } from '../lib/storage/executionStorage'
import { QA_SOURCE_SECTION_INDEX_STORAGE_KEY } from '../lib/storage/qaSourceSectionStorage'
import { QA_SOURCE_STORAGE_KEY } from '../lib/storage/qaSourceStorage'
import { RELEASE_STORAGE_KEY } from '../lib/storage/releaseStorage'
import { RISK_STORAGE_KEY } from '../lib/storage/riskStorage'
import { TEST_CASE_STORAGE_KEY } from '../lib/storage/testCaseStorage'
import { TEST_SUITE_STORAGE_KEY } from '../lib/storage/testSuiteStorage'
import { packQaSourceForAiSuggestions } from '../features/ai-suggestions/aiSuggestionContext'
import { AI_COVERAGE_PLAN_SCHEMA_VERSION } from '../features/ai-suggestions/aiCoveragePlanTypes'
import { resolveAiSectionCoveragePlanContext } from '../features/ai-suggestions/aiSectionCoveragePlanContext'
import { AI_SECTION_COVERAGE_PLAN_SCHEMA_VERSION } from '../features/ai-suggestions/aiSectionCoveragePlanTypes'
import { createQaSourceSectionIndex } from '../features/qa-sources/qaSourceSections'
import {
  SECTION_COVERAGE_PLAN_STORAGE_KEY,
  SECTION_COVERAGE_PLAN_STORAGE_SCHEMA_VERSION,
  createPersistedSectionCoveragePlanRecord,
} from '../lib/storage/sectionCoveragePlanStorage'

function getSummaryCard(label: string) {
  return within(screen.getByRole('region', { name: label }))
}

function createFetchResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response
}

function createSavedCoveragePlanForSource(source: ReturnType<typeof createQaSource>) {
  return createPersistedCoveragePlanRecord({
    qaSource: source,
    packedSource: packQaSourceForAiSuggestions(source),
    analyzedAt: '2026-05-12T08:01:00.000Z',
    plan: {
      schemaVersion: AI_COVERAGE_PLAN_SCHEMA_VERSION,
      sourceScope: {
        qaSourceId: source.id,
        visibleSourceOnly: true,
        sourceTruncated: false,
        coverageCompleteness: 'visible_source_only',
        sectionContext: null,
      },
      coverageAreas: [
        {
          id: 'coverage-area-1-payment-authorization',
          name: 'Payment authorization outcomes',
          summary: 'Coverage for payment authorization outcomes.',
          behaviors: ['handle payment authorization'],
          risks: [],
          evidence: [source.content],
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
    },
  })
}

function createSectionCoverageSource() {
  return createQaSource({
    id: 'section-source-1',
    title: 'Section Coverage LLD',
    sourceType: 'LLD',
    createdAt: '2026-07-18T08:00:00.000Z',
    updatedAt: '2026-07-18T08:00:00.000Z',
    content: [
      '# Before',
      'Previous section content.',
      '',
      '# Selected',
      'Selected behavior requires review.',
      '',
      '# After',
      'Following section content.',
    ].join('\n'),
  })
}

function createSavedSectionCoveragePlan(
  source: ReturnType<typeof createSectionCoverageSource>,
) {
  const sectionIndex = createQaSourceSectionIndex(source)
  const section = sectionIndex.sections.find(
    (candidate) => candidate.title === 'Selected',
  )
  if (!section) {
    throw new Error('Expected the Selected section.')
  }
  const contextResult = resolveAiSectionCoveragePlanContext({
    qaSource: source,
    sectionIndex,
    selectedSection: {
      sectionId: section.id,
      stableKey: section.stableKey,
    },
  })
  if (!contextResult.ok) {
    throw new Error(contextResult.error)
  }
  return createPersistedSectionCoveragePlanRecord({
    context: contextResult.context,
    analyzedAt: '2026-07-18T08:01:00.000Z',
    plan: {
      schemaVersion: AI_SECTION_COVERAGE_PLAN_SCHEMA_VERSION,
      coverageAreas: [
        {
          id: 'section-coverage-area-1-selected-behavior',
          name: 'Selected behavior',
          summary: 'Review the selected behavior.',
          behaviors: ['Selected behavior requires review.'],
          evidence: ['Selected behavior requires review.'],
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
}

function createSuccessfulSectionCoverageResponse() {
  return {
    ok: true,
    analysis: {
      schemaVersion: AI_SECTION_COVERAGE_PLAN_SCHEMA_VERSION,
      coverageAreas: [
        {
          name: 'Selected behavior',
          summary: 'Review the selected behavior.',
          behaviors: ['Selected behavior requires review.'],
          evidence: ['Selected behavior requires review.'],
        },
      ],
      actors: ['QA reviewer'],
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
    warnings: [],
  }
}

function createGlobalMergeFixture(uncertain = false) {
  const source = createQaSource({
    id: uncertain ? 'merge-source-uncertain' : 'merge-source-exact',
    title: uncertain ? 'Uncertain Merge LLD' : 'Exact Merge LLD',
    sourceType: 'LLD',
    status: 'Ready for test design',
    createdAt: '2026-07-20T08:00:00.000Z',
    updatedAt: '2026-07-20T08:00:00.000Z',
    content: [
      '# Alpha',
      uncertain ? 'Authorize a payment request.' : 'Shared behavior.',
      '',
      '# Beta',
      uncertain ? 'Authorise the payment request.' : 'Shared behavior.',
      '',
      '# Audit',
      'Audit remains unanalyzed.',
    ].join('\n'),
  })
  const sectionIndex = createQaSourceSectionIndex(source)
  const records = sectionIndex.sections.slice(0, 2).map((section, index) => {
    const contextResult = resolveAiSectionCoveragePlanContext({
      qaSource: source,
      sectionIndex,
      selectedSection: {
        sectionId: section.id,
        stableKey: section.stableKey,
      },
    })
    if (!contextResult.ok) throw new Error(contextResult.error)

    const evidence = uncertain
      ? index === 0
        ? 'Authorize a payment request.'
        : 'Authorise the payment request.'
      : 'Shared behavior.'

    return createPersistedSectionCoveragePlanRecord({
      context: contextResult.context,
      analyzedAt: `2026-07-20T08:0${index + 1}:00.000Z`,
      plan: {
        schemaVersion: AI_SECTION_COVERAGE_PLAN_SCHEMA_VERSION,
        coverageAreas: [
          {
            id: `section-area-${index + 1}`,
            name: uncertain
              ? index === 0
                ? 'Payment authorization'
                : 'Payment authorisation'
              : 'Shared access',
            summary: uncertain
              ? 'Review the payment access decision.'
              : 'Review shared access.',
            behaviors: [evidence],
            evidence: [evidence],
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
  })

  return { source, sectionIndex, records }
}

function seedGlobalMergeFixture(
  fixture: ReturnType<typeof createGlobalMergeFixture>,
  savedCoveragePlan?: ReturnType<typeof createSavedCoveragePlanForSource>,
) {
  window.localStorage.setItem(
    QA_SOURCE_STORAGE_KEY,
    JSON.stringify([fixture.source]),
  )
  window.localStorage.setItem(
    SECTION_COVERAGE_PLAN_STORAGE_KEY,
    JSON.stringify({
      storageSchemaVersion: SECTION_COVERAGE_PLAN_STORAGE_SCHEMA_VERSION,
      records: fixture.records,
    }),
  )
  if (savedCoveragePlan) {
    window.localStorage.setItem(
      COVERAGE_PLAN_STORAGE_KEY,
      JSON.stringify({
        storageSchemaVersion: COVERAGE_PLAN_STORAGE_SCHEMA_VERSION,
        records: [savedCoveragePlan],
      }),
    )
  }
}

async function openGlobalMergeSelection(
  user: ReturnType<typeof userEvent.setup>,
  sourceTitle: string,
) {
  await user.click(screen.getByRole('button', { name: /QA Sources/ }))
  const sourceCard = within(screen.getByRole('article', { name: sourceTitle }))
  await user.click(sourceCard.getByText('Source Structure'))
  await user.click(
    sourceCard.getByRole('button', { name: 'Select analyses to merge' }),
  )
  const checkboxes = sourceCard.getAllByRole('checkbox')
  await user.click(checkboxes[0])
  await user.click(checkboxes[1])
  return sourceCard
}

function createMergeBackendResponse(request: {
  candidatePairs: Array<{ pairAlias: string }>
}) {
  return new Response(
    JSON.stringify({
      ok: true,
      classification: {
        schemaVersion: 'coverage-plan-merge-decisions-json-v1',
        decisions: request.candidatePairs.map((pair) => ({
          pairAlias: pair.pairAlias,
          relation: 'likely_overlap',
          reasonCode: 'same_intent',
        })),
      },
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    },
  )
}
async function openSelectedSection(
  user: ReturnType<typeof userEvent.setup>,
) {
  await user.click(screen.getByRole('button', { name: /QA Sources/ }))
  const sourceCard = within(
    screen.getByRole('article', { name: 'Section Coverage LLD' }),
  )
  await user.click(sourceCard.getByText('Source Structure'))
  await user.click(sourceCard.getByRole('radio', { name: /2\. Selected/ }))
  return sourceCard
}

describe('App storage handling', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows a finished product shell with its human-review boundary', () => {
    render(<App />)

    expect(screen.getByRole('heading', { level: 1, name: 'QA Mission Control' })).toBeVisible()
    expect(screen.getByText('AI suggests. QA approves.')).toBeInTheDocument()
    expect(screen.queryByText(/current milestone/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/out of scope for this milestone/i)).not.toBeInTheDocument()
  })

  it('does not overwrite corrupt saved data on first render', () => {
    window.localStorage.setItem(TEST_CASE_STORAGE_KEY, '{not valid json')

    render(<App />)

    expect(screen.getByRole('status')).toHaveTextContent(
      'Saved test case data could not be read',
    )
    expect(window.localStorage.getItem(TEST_CASE_STORAGE_KEY)).toBe(
      '{not valid json',
    )
  })

  it('does not overwrite corrupt saved bug data on first render', () => {
    window.localStorage.setItem(BUG_STORAGE_KEY, '{not valid bug json')

    render(<App />)

    expect(screen.getByRole('status')).toHaveTextContent(
      'Saved bug data could not be read',
    )
    expect(window.localStorage.getItem(BUG_STORAGE_KEY)).toBe(
      '{not valid bug json',
    )
  })

  it('does not overwrite corrupt saved test suite data on first render', () => {
    window.localStorage.setItem(TEST_SUITE_STORAGE_KEY, '{not valid suite json')

    render(<App />)

    expect(screen.getByRole('status')).toHaveTextContent(
      'Saved test suite data could not be read',
    )
    expect(window.localStorage.getItem(TEST_SUITE_STORAGE_KEY)).toBe(
      '{not valid suite json',
    )
  })

  it('does not overwrite corrupt saved QA source data on first render', () => {
    window.localStorage.setItem(QA_SOURCE_STORAGE_KEY, '{not valid source json')

    render(<App />)

    expect(screen.getByRole('status')).toHaveTextContent(
      'Saved QA source data could not be read',
    )
    expect(window.localStorage.getItem(QA_SOURCE_STORAGE_KEY)).toBe(
      '{not valid source json',
    )
  })

  it('does not overwrite corrupt saved risk data on first render', () => {
    window.localStorage.setItem(RISK_STORAGE_KEY, '{not valid risk json')

    render(<App />)

    expect(screen.getByRole('status')).toHaveTextContent(
      'Saved risk data could not be read',
    )
    expect(window.localStorage.getItem(RISK_STORAGE_KEY)).toBe(
      '{not valid risk json',
    )
  })

  it('does not overwrite corrupt saved release data on first render', () => {
    window.localStorage.setItem(RELEASE_STORAGE_KEY, '{not valid release json')

    render(<App />)

    expect(screen.getByRole('status')).toHaveTextContent(
      'Saved release data could not be read',
    )
    expect(window.localStorage.getItem(RELEASE_STORAGE_KEY)).toBe(
      '{not valid release json',
    )
  })

  it('does not overwrite corrupt saved execution data on first render', () => {
    window.localStorage.setItem(
      EXECUTION_STORAGE_KEY,
      '{not valid execution json',
    )

    render(<App />)

    expect(screen.getByRole('status')).toHaveTextContent(
      'Saved execution data could not be read',
    )
    expect(window.localStorage.getItem(EXECUTION_STORAGE_KEY)).toBe(
      '{not valid execution json',
    )
  })

  it('does not overwrite corrupt saved AI coverage plan data on first render', () => {
    window.localStorage.setItem(
      COVERAGE_PLAN_STORAGE_KEY,
      '{not valid coverage plan json',
    )

    render(<App />)

    expect(screen.getByRole('status')).toHaveTextContent(
      'Saved AI coverage plan data could not be read',
    )
    expect(window.localStorage.getItem(COVERAGE_PLAN_STORAGE_KEY)).toBe(
      '{not valid coverage plan json',
    )
  })

  it('does not overwrite corrupt saved QA source section index data on first render', () => {
    window.localStorage.setItem(
      QA_SOURCE_SECTION_INDEX_STORAGE_KEY,
      '{not valid section index json',
    )

    render(<App />)

    expect(screen.getByRole('status')).toHaveTextContent(
      'Saved QA source section index data could not be read',
    )
    expect(window.localStorage.getItem(QA_SOURCE_SECTION_INDEX_STORAGE_KEY)).toBe(
      '{not valid section index json',
    )
  })

  it('loads valid saved collections on first render', () => {
    window.localStorage.setItem(
      TEST_CASE_STORAGE_KEY,
      JSON.stringify([
        createTestCase({ id: 'test-case-1' }),
        createTestCase({ id: 'test-case-2' }),
      ]),
    )
    window.localStorage.setItem(
      BUG_STORAGE_KEY,
      JSON.stringify([
        createBug({ id: 'bug-1' }),
        createBug({ id: 'bug-2' }),
        createBug({ id: 'bug-3' }),
      ]),
    )
    window.localStorage.setItem(
      RISK_STORAGE_KEY,
      JSON.stringify([createRisk({ id: 'risk-1' })]),
    )
    window.localStorage.setItem(
      RELEASE_STORAGE_KEY,
      JSON.stringify([
        createRelease({ id: 'release-1' }),
        createRelease({ id: 'release-2' }),
      ]),
    )
    window.localStorage.setItem(
      EXECUTION_STORAGE_KEY,
      JSON.stringify([createExecution({ id: 'execution-1' })]),
    )
    window.localStorage.setItem(
      QA_SOURCE_STORAGE_KEY,
      JSON.stringify([createQaSource({ id: 'qa-source-1' })]),
    )

    render(<App />)

    expect(getSummaryCard('Test Cases').getByText('2')).toBeInTheDocument()
    expect(getSummaryCard('Active Bugs').getByText('3')).toBeInTheDocument()
    expect(getSummaryCard('Active Releases').getByText('2')).toBeInTheDocument()
    const riskRow = screen.getByText('Open risks').closest('.definition-list__row')
    expect(riskRow).not.toBeNull()
    expect(within(riskRow!).getByText('1')).toBeInTheDocument()
  })

  it('loads valid saved test suites when navigating to Test Suites', async () => {
    const user = userEvent.setup()

    window.localStorage.setItem(
      TEST_CASE_STORAGE_KEY,
      JSON.stringify([createTestCase({ id: 'test-case-1' })]),
    )
    window.localStorage.setItem(
      TEST_SUITE_STORAGE_KEY,
      JSON.stringify([
        createTestSuite({
          id: 'suite-1',
          name: 'Saved Smoke Suite',
          testCaseIds: ['test-case-1'],
        }),
      ]),
    )

    render(<App />)

    await user.click(screen.getByRole('button', { name: /Test Suites/ }))

    expect(screen.getByRole('heading', { name: 'Test Suites' })).toBeInTheDocument()
    expect(screen.getByText('Saved Smoke Suite')).toBeInTheDocument()
    expect(screen.getByText('1 test case')).toBeInTheDocument()
  })

  it('opens the Release Report page from navigation', async () => {
    const user = userEvent.setup()

    window.localStorage.setItem(
      RELEASE_STORAGE_KEY,
      JSON.stringify([createRelease({ id: 'release-1', name: 'Saved Release' })]),
    )

    render(<App />)

    await user.click(screen.getByRole('button', { name: /Release Report/ }))

    expect(screen.getByRole('heading', { name: 'Release Report' })).toBeInTheDocument()
    expect(screen.getByText(/Saved Release v1.4.0 targets/)).toBeInTheDocument()
  })

  it('loads valid saved QA sources when navigating to QA Sources', async () => {
    const user = userEvent.setup()

    window.localStorage.setItem(
      QA_SOURCE_STORAGE_KEY,
      JSON.stringify([
        createQaSource({
          id: 'qa-source-1',
          title: 'Saved Checkout LLD',
          sourceType: 'LLD',
        }),
      ]),
    )

    render(<App />)

    await user.click(screen.getByRole('button', { name: /QA Sources/ }))

    expect(screen.getByRole('heading', { name: 'QA Sources' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Saved Checkout LLD' })).toBeInTheDocument()
    expect(screen.getAllByText('LLD').length).toBeGreaterThan(0)
  })

  it('opens the AI Coverage Workspace page from navigation', async () => {
    const user = userEvent.setup()

    window.localStorage.setItem(
      QA_SOURCE_STORAGE_KEY,
      JSON.stringify([
        createQaSource({
          id: 'qa-source-1',
          title: 'Saved Checkout LLD',
          status: 'Ready for test design',
        }),
      ]),
    )

    render(<App />)

    await user.click(
      screen.getByRole('button', { name: /AI Coverage Workspace/ }),
    )

    expect(
      screen.getByRole('heading', { name: 'AI Coverage Workspace' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', {
        name: /Focused workspace for QA coverage/,
      }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('heading', {
        name: 'Select a QA Source to launch coverage analysis',
      }),
    ).toBeInTheDocument()
    expect(screen.getByText('AI suggests. QA approves.')).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('QA Source'), 'qa-source-1')

    expect(
      screen.getByRole('button', { name: 'Analyze coverage' }),
    ).toBeEnabled()
  })

  it('loads a saved AI coverage plan after selecting the same QA Source', async () => {
    const user = userEvent.setup()
    const savedSource = createQaSource({
      id: 'qa-source-1',
      title: 'Saved Checkout LLD',
      sourceType: 'LLD',
      status: 'Ready for test design',
      content: 'Payment authorization outcomes must be covered.',
    })
    const savedCoveragePlan = createSavedCoveragePlanForSource(savedSource)

    window.localStorage.setItem(
      QA_SOURCE_STORAGE_KEY,
      JSON.stringify([savedSource]),
    )
    window.localStorage.setItem(
      COVERAGE_PLAN_STORAGE_KEY,
      JSON.stringify({
        storageSchemaVersion: COVERAGE_PLAN_STORAGE_SCHEMA_VERSION,
        records: [savedCoveragePlan],
      }),
    )

    render(<App />)

    await user.click(
      screen.getByRole('button', { name: /AI Coverage Workspace/ }),
    )
    await user.selectOptions(screen.getByLabelText('QA Source'), 'qa-source-1')

    expect(screen.getByText(/Saved coverage plan loaded/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Coverage Queue' })).toBeInTheDocument()
    expect(screen.getByText('Payment authorization outcomes')).toBeInTheDocument()
    expect(screen.queryByLabelText('Approve for import')).not.toBeInTheDocument()
  })

  it('keeps the product identity in the masthead and named pages in navigation', () => {
    render(<App />)

    expect(within(screen.getByRole('banner')).getByRole('heading', { name: 'QA Mission Control', level: 1 })).toBeVisible()
    expect(within(screen.getByRole('navigation', { name: 'Workspace pages' })).getByRole('button', { name: 'QA Sources', exact: true })).toBeVisible()
    expect(screen.getByRole('banner')).toHaveTextContent('Dashboard')
    expect(
      screen.queryByRole('heading', { name: /Focused workspace for QA coverage/ }),
    ).not.toBeInTheDocument()
  })

  it('opens AI Coverage Workspace from a saved QA Source card and handles backend unavailable without creating Test Cases', async () => {
    const user = userEvent.setup()

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        createFetchResponse(503, {
          ok: false,
          error: {
            code: 'provider_unavailable',
            message:
              'AI generation requires a configured server-side provider and is not enabled yet.',
            retryable: true,
          },
        }),
      ),
    )

    window.localStorage.setItem(
      QA_SOURCE_STORAGE_KEY,
      JSON.stringify([
        createQaSource({
          id: 'qa-source-1',
          title: 'Saved Checkout LLD',
          sourceType: 'LLD',
          status: 'Ready for test design',
        }),
      ]),
    )

    render(<App />)

    await user.click(screen.getByRole('button', { name: /QA Sources/ }))
    const sourceCard = within(
      screen.getByRole('article', { name: 'Saved Checkout LLD' }),
    )

    await user.click(
      sourceCard.getByRole('button', { name: 'Open AI coverage workspace' }),
    )

    expect(
      screen.getByRole('heading', { name: 'AI Coverage Workspace' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('QA Source')).toHaveValue('qa-source-1')

    await user.click(
      screen.getByRole('button', { name: 'Advanced: direct suggestions' }),
    )
    await user.click(
      screen.getByRole('button', { name: 'Generate direct suggestions' }),
    )

    expect(
      screen.getByText(
        'AI generation requires a configured server-side provider and is not enabled yet.',
      ),
    ).toBeInTheDocument()
    expect(window.localStorage.getItem(TEST_CASE_STORAGE_KEY)).toBeNull()
  })

  it('does not overwrite corrupt saved Section Coverage Plan data on first render', () => {
    window.localStorage.setItem(
      SECTION_COVERAGE_PLAN_STORAGE_KEY,
      '{not valid section coverage plan json',
    )
    render(<App />)
    expect(screen.getByRole('status')).toHaveTextContent(
      'Saved section coverage plan data is not valid JSON',
    )
    expect(
      window.localStorage.getItem(SECTION_COVERAGE_PLAN_STORAGE_KEY),
    ).toBe('{not valid section coverage plan json')
  })

  it('restores a current saved section analysis after refresh without a backend request', async () => {
    const user = userEvent.setup()
    const source = createSectionCoverageSource()
    const record = createSavedSectionCoveragePlan(source)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    window.localStorage.setItem(
      QA_SOURCE_STORAGE_KEY,
      JSON.stringify([source]),
    )
    window.localStorage.setItem(
      SECTION_COVERAGE_PLAN_STORAGE_KEY,
      JSON.stringify({
        storageSchemaVersion: SECTION_COVERAGE_PLAN_STORAGE_SCHEMA_VERSION,
        records: [record],
      }),
    )
    render(<App />)
    const sourceCard = await openSelectedSection(user)
    expect(
      sourceCard.getByRole('heading', { name: 'Current section analysis' }),
    ).toBeVisible()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('persists one successful section analysis independently without creating a Test Case', async () => {
    const user = userEvent.setup()
    const source = createSectionCoverageSource()
    const globalCoveragePlanRaw = JSON.stringify({
      storageSchemaVersion: COVERAGE_PLAN_STORAGE_SCHEMA_VERSION,
      records: [createSavedCoveragePlanForSource(source)],
    })
    const testCasesRaw = JSON.stringify([
      createTestCase({ id: 'existing-test-case' }),
    ])
    const fetchMock = vi.fn().mockResolvedValue(
      createFetchResponse(200, createSuccessfulSectionCoverageResponse()),
    )
    vi.stubGlobal('fetch', fetchMock)
    window.localStorage.setItem(
      QA_SOURCE_STORAGE_KEY,
      JSON.stringify([source]),
    )
    window.localStorage.setItem(
      COVERAGE_PLAN_STORAGE_KEY,
      globalCoveragePlanRaw,
    )
    window.localStorage.setItem(TEST_CASE_STORAGE_KEY, testCasesRaw)
    render(<App />)
    const sourceCard = await openSelectedSection(user)
    await user.click(
      sourceCard.getByRole('button', { name: 'Analyze section' }),
    )
    expect(
      await sourceCard.findByRole('heading', {
        name: 'Current section analysis',
      }),
    ).toBeVisible()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const savedSectionPlans = window.localStorage.getItem(
      SECTION_COVERAGE_PLAN_STORAGE_KEY,
    )
    expect(savedSectionPlans).not.toBeNull()
    expect(JSON.parse(savedSectionPlans ?? '{}').records).toHaveLength(1)
    expect(savedSectionPlans).not.toContain(source.content)
    expect(window.localStorage.getItem(COVERAGE_PLAN_STORAGE_KEY)).toBe(
      globalCoveragePlanRaw,
    )
    expect(window.localStorage.getItem(TEST_CASE_STORAGE_KEY)).toBe(
      testCasesRaw,
    )
  })

  it('builds a deterministic zero-pair candidate locally and saves only after explicit create confirmation', async () => {
    const user = userEvent.setup()
    const fixture = createGlobalMergeFixture()
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    seedGlobalMergeFixture(fixture)
    const sectionStorageBefore = window.localStorage.getItem(
      SECTION_COVERAGE_PLAN_STORAGE_KEY,
    )

    render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
    const sourceCard = await openGlobalMergeSelection(user, fixture.source.title)

    expect(fetchMock).not.toHaveBeenCalled()
    await user.click(
      sourceCard.getByRole('button', { name: 'Build global coverage plan' }),
    )

    expect(
      await screen.findByRole('heading', {
        name: 'Unsaved Global Coverage Plan candidate',
      }),
    ).toHaveFocus()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(window.localStorage.getItem(COVERAGE_PLAN_STORAGE_KEY)).toBeNull()
    expect(window.localStorage.getItem(TEST_CASE_STORAGE_KEY)).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Review save options' }))
    expect(
      screen.getByRole('heading', { name: 'Save new Global Coverage Plan?' }),
    ).toHaveFocus()
    expect(window.localStorage.getItem(COVERAGE_PLAN_STORAGE_KEY)).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(
      screen.getByRole('heading', {
        name: 'Unsaved Global Coverage Plan candidate',
      }),
    ).toHaveFocus()
    expect(window.localStorage.getItem(COVERAGE_PLAN_STORAGE_KEY)).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Review save options' }))
    const storageWriteSpy = vi.spyOn(Storage.prototype, 'setItem')
    await user.click(
      screen.getByRole('button', { name: 'Save new Global Coverage Plan' }),
    )
    expect(
      storageWriteSpy.mock.calls.filter(
        ([key]) => key === COVERAGE_PLAN_STORAGE_KEY,
      ),
    ).toHaveLength(1)
    storageWriteSpy.mockRestore()

    expect(
      await screen.findByRole('heading', { name: 'Coverage Queue' }),
    ).toBeVisible()
    const saved = JSON.parse(
      window.localStorage.getItem(COVERAGE_PLAN_STORAGE_KEY) ?? '{}',
    )
    expect(saved.records).toHaveLength(1)
    expect(saved.records[0].origin.kind).toBe('section_merge')
    expect(saved.records[0].origin.selectedAnalyses).toHaveLength(2)
    expect(saved.records[0].plan.coverageAreas[0].generationReadiness).toBe('needs_review')
    expect(screen.getByText('Review behavior-level evidence in the contributing section analyses. Area excerpts alone do not establish support for every behavior.')).toBeVisible()
    expect(saved.records[0].plan.coverageAreas[0].sourceSectionRefs).toHaveLength(2)
    expect(window.localStorage.getItem(SECTION_COVERAGE_PLAN_STORAGE_KEY)).toBe(
      sectionStorageBefore,
    )
    expect(window.localStorage.getItem(TEST_CASE_STORAGE_KEY)).toBeNull()
  })

  it('marks an existing merge candidate stale as soon as its selected analyses change', async () => {
    const user = userEvent.setup()
    const fixture = createGlobalMergeFixture()
    vi.stubGlobal('fetch', vi.fn())
    seedGlobalMergeFixture(fixture)

    render(<App />)
    const sourceCard = await openGlobalMergeSelection(user, fixture.source.title)
    await user.click(
      sourceCard.getByRole('button', { name: 'Build global coverage plan' }),
    )
    await screen.findByRole('heading', {
      name: 'Unsaved Global Coverage Plan candidate',
    })

    await user.click(screen.getByRole('button', { name: /QA Sources/ }))
    const currentCard = within(
      screen.getByRole('article', { name: fixture.source.title }),
    )
    await user.click(currentCard.getByText('Source Structure'))
    await user.click(
      currentCard.getByRole('button', { name: 'Select analyses to merge' }),
    )
    const selectedAnalyses = currentCard.getAllByRole('checkbox')
    expect(selectedAnalyses[0]).not.toBeChecked()
    expect(selectedAnalyses[1]).not.toBeChecked()
    await user.click(
      screen.getByRole('button', { name: /AI Coverage Workspace/ }),
    )

    expect(
      await screen.findByRole('heading', { name: 'Candidate is stale' }),
    ).toHaveFocus()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'The selected section analyses changed. Build a new candidate.',
    )
    expect(window.localStorage.getItem(COVERAGE_PLAN_STORAGE_KEY)).toBeNull()
  })

  it('discards a transient merge candidate when the user explicitly opens another source', async () => {
    const user = userEvent.setup()
    const fixture = createGlobalMergeFixture()
    const otherSource = createQaSource({
      id: 'other-source',
      title: 'Other source',
      content: '# Other\nIndependent source behavior.',
    })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    seedGlobalMergeFixture(fixture)
    window.localStorage.setItem(
      QA_SOURCE_STORAGE_KEY,
      JSON.stringify([fixture.source, otherSource]),
    )

    render(<App />)
    const sourceCard = await openGlobalMergeSelection(user, fixture.source.title)
    await user.click(
      sourceCard.getByRole('button', { name: 'Build global coverage plan' }),
    )
    await screen.findByRole('heading', {
      name: 'Unsaved Global Coverage Plan candidate',
    })

    await user.click(screen.getByRole('button', { name: /QA Sources/ }))
    await user.click(screen.getByRole('button', { name: 'Open source: Other source' }))
    const otherCard = within(
      screen.getByRole('article', { name: otherSource.title }),
    )
    await user.click(
      otherCard.getByRole('button', { name: 'Open AI coverage workspace' }),
    )

    expect(
      screen.getByRole('region', { name: 'Global coverage & suggestions' }),
    ).toBeVisible()
    expect(screen.getByLabelText('QA Source', { exact: true })).toHaveValue(
      otherSource.id,
    )
    expect(
      screen.queryByRole('heading', {
        name: 'Unsaved Global Coverage Plan candidate',
      }),
    ).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(window.localStorage.getItem(COVERAGE_PLAN_STORAGE_KEY)).toBeNull()
  })

  it('uses exactly one privacy-bounded classifier request for uncertain pairs without auto-saving', async () => {
    const user = userEvent.setup()
    const fixture = createGlobalMergeFixture(true)
    let capturedRequest: {
      requestVersion: string
      findings: Array<Record<string, unknown>>
      candidatePairs: Array<{ pairAlias: string }>
    } | null = null
    const fetchMock = vi.fn().mockImplementation(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        capturedRequest = JSON.parse(String(init?.body))
        return createMergeBackendResponse(capturedRequest!)
      },
    )
    vi.stubGlobal('fetch', fetchMock)
    seedGlobalMergeFixture(fixture)

    render(<App />)
    const sourceCard = await openGlobalMergeSelection(user, fixture.source.title)
    expect(fetchMock).not.toHaveBeenCalled()
    await user.click(
      sourceCard.getByRole('button', { name: 'Build global coverage plan' }),
    )

    expect(
      await screen.findByRole('heading', {
        name: 'Unsaved Global Coverage Plan candidate',
      }),
    ).toBeVisible()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(capturedRequest).not.toBeNull()
    expect(Object.keys(capturedRequest!)).toEqual([
      'requestVersion',
      'findings',
      'candidatePairs',
    ])
    expect(capturedRequest!.candidatePairs.length).toBeGreaterThan(0)
    expect(Object.keys(capturedRequest!.findings[0])).toEqual([
      'alias',
      'sectionAlias',
      'kind',
      'text',
      'context',
    ])
    const serializedRequest = JSON.stringify(capturedRequest)
    expect(serializedRequest).not.toContain(fixture.source.id)
    expect(serializedRequest).not.toContain(fixture.source.content)
    expect(serializedRequest).not.toContain(fixture.records[0].id)
    expect(serializedRequest).not.toContain(
      fixture.records[0].sectionIdentity.sectionId,
    )
    expect(serializedRequest).not.toContain('evidence')
    expect(serializedRequest).not.toContain('fingerprint')
    expect(serializedRequest).not.toContain('prompt')
    expect(serializedRequest).not.toContain('apiKey')
    expect(serializedRequest).not.toContain('Authorization')
    expect(screen.getByText(/likely overlaps are kept separate/i)).toBeVisible()
    expect(window.localStorage.getItem(COVERAGE_PLAN_STORAGE_KEY)).toBeNull()
    expect(window.localStorage.getItem(TEST_CASE_STORAGE_KEY)).toBeNull()
  })

  it('ignores a late merge response after the source revision changes and does not retry', async () => {
    const user = userEvent.setup()
    const fixture = createGlobalMergeFixture(true)
    let capturedRequest: { candidatePairs: Array<{ pairAlias: string }> } | null = null
    let resolveFetch!: (response: Response) => void
    const delayedResponse = new Promise<Response>((resolve) => {
      resolveFetch = resolve
    })
    const fetchMock = vi.fn().mockImplementation(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        capturedRequest = JSON.parse(String(init?.body))
        return delayedResponse
      },
    )
    vi.stubGlobal('fetch', fetchMock)
    seedGlobalMergeFixture(fixture)

    render(<App />)
    const sourceCard = await openGlobalMergeSelection(user, fixture.source.title)
    await user.click(
      sourceCard.getByRole('button', { name: 'Build global coverage plan' }),
    )
    expect(
      await screen.findByRole('heading', {
        name: 'Building unsaved Global Coverage Plan candidate',
      }),
    ).toBeVisible()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: /QA Sources/ }))
    const currentCard = within(
      screen.getByRole('article', { name: fixture.source.title }),
    )
    await user.click(currentCard.getByRole('button', { name: 'Edit' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Edit QA Source' }))
    await user.clear(dialog.getByLabelText('Source content'))
    await user.type(
      dialog.getByLabelText('Source content'),
      '# Alpha{enter}Changed source revision.{enter}{enter}# Beta{enter}Changed again.',
    )
    await user.click(dialog.getByRole('button', { name: 'Save changes' }))

    await act(async () => {
      resolveFetch(createMergeBackendResponse(capturedRequest!))
      await delayedResponse
    })
    await user.click(
      screen.getByRole('button', { name: /AI Coverage Workspace/ }),
    )

    expect(
      await screen.findByRole('heading', { name: 'Candidate is stale' }),
    ).toHaveFocus()
    expect(
      screen.queryByRole('heading', {
        name: 'Unsaved Global Coverage Plan candidate',
      }),
    ).not.toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(window.localStorage.getItem(COVERAGE_PLAN_STORAGE_KEY)).toBeNull()
    expect(window.localStorage.getItem(TEST_CASE_STORAGE_KEY)).toBeNull()
  })

  it('requires replace confirmation again when the saved target appears or changes after candidate construction', async () => {
    const user = userEvent.setup()
    const fixture = createGlobalMergeFixture()
    vi.stubGlobal('fetch', vi.fn())
    seedGlobalMergeFixture(fixture)

    render(<App />)
    const sourceCard = await openGlobalMergeSelection(user, fixture.source.title)
    await user.click(
      sourceCard.getByRole('button', { name: 'Build global coverage plan' }),
    )
    await screen.findByRole('heading', {
      name: 'Unsaved Global Coverage Plan candidate',
    })

    const appearedPlan = createSavedCoveragePlanForSource(fixture.source)
    window.localStorage.setItem(
      COVERAGE_PLAN_STORAGE_KEY,
      JSON.stringify({
        storageSchemaVersion: COVERAGE_PLAN_STORAGE_SCHEMA_VERSION,
        records: [appearedPlan],
      }),
    )

    await user.click(screen.getByRole('button', { name: 'Review save options' }))
    expect(
      screen.getByRole('heading', {
        name: 'Replace the saved Global Coverage Plan?',
      }),
    ).toHaveFocus()

    const changedPlan = createSavedCoveragePlanForSource(fixture.source)
    const changedBytes = JSON.stringify({
      storageSchemaVersion: COVERAGE_PLAN_STORAGE_SCHEMA_VERSION,
      records: [changedPlan],
    })
    window.localStorage.setItem(COVERAGE_PLAN_STORAGE_KEY, changedBytes)

    await user.click(
      screen.getByRole('button', { name: 'Replace saved Global Coverage Plan' }),
    )
    expect(screen.getByRole('alert')).toHaveTextContent(
      'The saved Global Coverage Plan changed. Confirm replacement again.',
    )
    expect(window.localStorage.getItem(COVERAGE_PLAN_STORAGE_KEY)).toBe(
      changedBytes,
    )

    await user.click(
      screen.getByRole('button', { name: 'Replace saved Global Coverage Plan' }),
    )
    const saved = JSON.parse(
      window.localStorage.getItem(COVERAGE_PLAN_STORAGE_KEY) ?? '{}',
    )
    expect(saved.records).toHaveLength(1)
    expect(saved.records[0].origin.kind).toBe('section_merge')
  })

  it('preserves unreadable coverage-plan storage instead of replacing it from a candidate', async () => {
    const user = userEvent.setup()
    const fixture = createGlobalMergeFixture()
    vi.stubGlobal('fetch', vi.fn())
    seedGlobalMergeFixture(fixture)

    render(<App />)
    const sourceCard = await openGlobalMergeSelection(user, fixture.source.title)
    await user.click(
      sourceCard.getByRole('button', { name: 'Build global coverage plan' }),
    )
    await screen.findByRole('heading', {
      name: 'Unsaved Global Coverage Plan candidate',
    })

    const unreadableBytes = '{not valid coverage plan json'
    window.localStorage.setItem(COVERAGE_PLAN_STORAGE_KEY, unreadableBytes)
    await user.click(screen.getByRole('button', { name: 'Review save options' }))

    expect(
      screen.getByRole('heading', {
        name: 'Unsaved Global Coverage Plan candidate',
      }),
    ).toBeVisible()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Saved Global Coverage Plan data could not be checked safely. Existing browser data was not changed.',
    )
    expect(
      screen.queryByRole('heading', { name: /Save new|Replace the saved/ }),
    ).not.toBeInTheDocument()
    expect(window.localStorage.getItem(COVERAGE_PLAN_STORAGE_KEY)).toBe(
      unreadableBytes,
    )
  })

  it('preserves the old saved plan and unsaved candidate when transactional storage fails', async () => {
    const user = userEvent.setup()
    const fixture = createGlobalMergeFixture()
    const previousPlan = createSavedCoveragePlanForSource(fixture.source)
    seedGlobalMergeFixture(fixture, previousPlan)
    const previousBytes = window.localStorage.getItem(COVERAGE_PLAN_STORAGE_KEY)
    vi.stubGlobal('fetch', vi.fn())

    render(<App />)
    const sourceCard = await openGlobalMergeSelection(user, fixture.source.title)
    await user.click(
      sourceCard.getByRole('button', { name: 'Build global coverage plan' }),
    )
    await screen.findByRole('heading', {
      name: 'Unsaved Global Coverage Plan candidate',
    })
    await user.click(screen.getByRole('button', { name: 'Review save options' }))
    expect(
      screen.getByRole('heading', {
        name: 'Replace the saved Global Coverage Plan?',
      }),
    ).toHaveFocus()

    const originalSetItem = Storage.prototype.setItem
    const setItemSpy = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(function (key: string, value: string) {
        if (key === COVERAGE_PLAN_STORAGE_KEY) {
          throw new DOMException('Quota exceeded', 'QuotaExceededError')
        }
        return originalSetItem.call(this, key, value)
      })

    await user.click(
      screen.getByRole('button', {
        name: 'Replace saved Global Coverage Plan',
      }),
    )

    expect(window.localStorage.getItem(COVERAGE_PLAN_STORAGE_KEY)).toBe(
      previousBytes,
    )
    expect(
      screen.getByRole('heading', {
        name: 'Replace the saved Global Coverage Plan?',
      }),
    ).toBeVisible()
    expect(screen.getByRole('alert')).toHaveTextContent(/could not be saved/i)
    setItemSpy.mockRestore()

    await user.click(screen.getByRole('button', { name: 'Discard candidate' }))
    expect(
      await screen.findByText('Payment authorization outcomes'),
    ).toBeVisible()
    expect(window.localStorage.getItem(TEST_CASE_STORAGE_KEY)).toBeNull()
  })
  it('preserves a previous saved record when re-analysis fails', async () => {
    const user = userEvent.setup()
    const source = createSectionCoverageSource()
    const record = createSavedSectionCoveragePlan(source)
    const savedSectionPlans = JSON.stringify({
      storageSchemaVersion: SECTION_COVERAGE_PLAN_STORAGE_SCHEMA_VERSION,
      records: [record],
    })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        createFetchResponse(503, {
          ok: false,
          error: {
            code: 'provider_unavailable',
            message: 'Provider details must not be exposed.',
            retryable: true,
          },
        }),
      ),
    )
    window.localStorage.setItem(
      QA_SOURCE_STORAGE_KEY,
      JSON.stringify([source]),
    )
    window.localStorage.setItem(
      SECTION_COVERAGE_PLAN_STORAGE_KEY,
      savedSectionPlans,
    )
    render(<App />)
    const sourceCard = await openSelectedSection(user)
    await user.click(
      sourceCard.getByRole('button', { name: 'Re-analyze section' }),
    )
    expect(
      await sourceCard.findByRole('heading', {
        name: 'Section analysis failed',
      }),
    ).toBeVisible()
    expect(
      sourceCard.getByRole('heading', { name: 'Current section analysis' }),
    ).toBeVisible()
    expect(
      window.localStorage.getItem(SECTION_COVERAGE_PLAN_STORAGE_KEY),
    ).toBe(savedSectionPlans)
  })
})
