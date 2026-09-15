import { useState } from 'react'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { createBug } from '../../test/bugFactory'
import { createExecution } from '../../test/executionFactory'
import { createRelease } from '../../test/releaseFactory'
import { createRisk } from '../../test/riskFactory'
import { createTestCase } from '../../test/testCaseFactory'
import { createTestSuite } from '../../test/testSuiteFactory'
import type { Bug } from '../bugs/bugTypes'
import type { Release } from '../releases/releaseTypes'
import type { Risk } from '../risks/riskTypes'
import type { TestCase } from '../test-cases/testCaseTypes'
import type { TestSuite } from '../test-suites/testSuiteTypes'
import type { Execution } from './executionTypes'
import { ExecutionsPage } from './ExecutionsPage'

type RenderOptions = {
  releases?: Release[]
  testCases?: TestCase[]
  testSuites?: TestSuite[]
  executions?: Execution[]
  bugs?: Bug[]
  risks?: Risk[]
}

function renderExecutionsPage({
  releases = [createRelease({ id: 'release-1' })],
  testCases = [createTestCase({ id: 'test-case-1' })],
  testSuites = [],
  executions: initialExecutions = [],
  bugs = [],
  risks = [],
}: RenderOptions = {}) {
  let latestExecutions = initialExecutions

  function Harness() {
    const [executions, setExecutions] = useState(initialExecutions)

    function handleChange(nextExecutions: Execution[]) {
      latestExecutions = nextExecutions
      setExecutions(nextExecutions)
    }

    return (
      <ExecutionsPage
        releases={releases}
        testCases={testCases}
        testSuites={testSuites}
        executions={executions}
        bugs={bugs}
        risks={risks}
        onChange={handleChange}
      />
    )
  }

  return {
    ...render(<Harness />),
    getLatestExecutions: () => latestExecutions,
  }
}

function getSummaryCard(label: string) {
  return within(screen.getByRole('region', { name: label }))
}

function getExecutionCard(title: string) {
  const heading = screen.getByRole('heading', { name: title })
  const card = heading.closest('article')

  if (!card) {
    throw new Error(`Could not find execution card for "${title}"`)
  }

  return within(card)
}

function getReadinessPanel() {
  return within(screen.getByRole('region', { name: 'Release Readiness' }))
}

describe('ExecutionsPage', () => {
  it('shows an empty state when no releases exist', () => {
    renderExecutionsPage({ releases: [], testCases: [createTestCase()] })

    expect(screen.getByText('No releases available')).toBeInTheDocument()
    expect(
      screen.getByText('Create a release first before tracking execution results.'),
    ).toBeInTheDocument()
  })

  it('shows an empty state when no test cases exist', () => {
    renderExecutionsPage({
      releases: [createRelease({ id: 'release-1' })],
      testCases: [],
    })

    expect(screen.getByText('No test cases available')).toBeInTheDocument()
    expect(
      screen.getByText('Create test cases first before tracking execution results.'),
    ).toBeInTheDocument()
  })

  it('selects a release and renders existing execution values for that release', async () => {
    const user = userEvent.setup()

    renderExecutionsPage({
      releases: [
        createRelease({ id: 'release-1', name: 'Checkout GA', version: 'v1.4.0' }),
        createRelease({ id: 'release-2', name: 'Profile Patch', version: 'v1.4.1' }),
      ],
      testCases: [
        createTestCase({
          id: 'test-case-1',
          title: 'Login accepts valid credentials',
        }),
      ],
      executions: [
        createExecution({
          id: 'execution-2',
          releaseId: 'release-2',
          testCaseId: 'test-case-1',
          result: 'Failed',
          notes: 'Regression in profile patch.',
        }),
      ],
    })

    const scope = within(
      screen.getByRole('region', { name: 'Release Execution Scope' }),
    )

    await user.selectOptions(scope.getByLabelText('Select release'), 'release-2')

    const card = getExecutionCard('Login accepts valid credentials')

    expect(card.getByLabelText('Execution result')).toHaveValue('Failed')
    expect(card.getByLabelText('Execution notes')).toHaveValue(
      'Regression in profile patch.',
    )
    expect(getSummaryCard('Failed').getByText('1')).toBeInTheDocument()
  })

  it('displays readiness status and reasons for the selected release', () => {
    renderExecutionsPage({
      testCases: [createTestCase({ id: 'test-case-1' })],
      executions: [
        createExecution({
          releaseId: 'release-1',
          testCaseId: 'test-case-1',
          result: 'Passed',
        }),
      ],
    })

    const readinessPanel = getReadinessPanel()

    expect(readinessPanel.getByText('Ready')).toBeInTheDocument()
    expect(
      readinessPanel.getByText(
        'All current test cases passed and no blocking signals are open.',
      ),
    ).toBeInTheDocument()
  })

  it('shows preconditions and structured steps while executing a test case', () => {
    renderExecutionsPage({
      testCases: [
        createTestCase({
          id: 'structured-test-case',
          title: 'Checkout supports cards',
          preconditions: 'User exists and test card data is available.',
          structuredSteps: [
            {
              id: 'step-1',
              action: 'Open checkout.',
              expectedResult: 'Checkout opens.',
            },
            {
              id: 'step-2',
              action: 'Submit card payment.',
              expectedResult: 'Payment succeeds.',
            },
          ],
        }),
      ],
    })

    const card = getExecutionCard('Checkout supports cards')

    expect(
      card.getByText('User exists and test card data is available.'),
    ).toBeInTheDocument()
    expect(card.getByText('Step 1')).toBeInTheDocument()
    expect(card.getByText('Open checkout.')).toBeInTheDocument()
    expect(card.getByText('Checkout opens.')).toBeInTheDocument()
    expect(card.getByText('Step 2')).toBeInTheDocument()
    expect(card.getByText('Submit card payment.')).toBeInTheDocument()
    expect(card.getByText('Payment succeeds.')).toBeInTheDocument()
  })

  it('updates readiness reasons when switching releases', async () => {
    const user = userEvent.setup()

    renderExecutionsPage({
      releases: [
        createRelease({ id: 'release-1', name: 'Checkout GA', version: 'v1.4.0' }),
        createRelease({ id: 'release-2', name: 'Profile Patch', version: 'v1.4.1' }),
      ],
      testCases: [createTestCase({ id: 'test-case-1' })],
      executions: [
        createExecution({
          releaseId: 'release-1',
          testCaseId: 'test-case-1',
          result: 'Passed',
        }),
      ],
      bugs: [createBug({ severity: 'Low', status: 'Open' })],
      risks: [createRisk({ impact: 'Medium', status: 'Open' })],
    })

    let readinessPanel = getReadinessPanel()

    expect(readinessPanel.getByText('Ready')).toBeInTheDocument()

    const scope = within(
      screen.getByRole('region', { name: 'Release Execution Scope' }),
    )

    await user.selectOptions(scope.getByLabelText('Select release'), 'release-2')

    readinessPanel = getReadinessPanel()

    expect(readinessPanel.getByText('At Risk')).toBeInTheDocument()
    expect(readinessPanel.getByText('1 test awaiting run')).toBeInTheDocument()
  })

  it('keeps execution results and notes isolated by release', async () => {
    const user = userEvent.setup()

    renderExecutionsPage({
      releases: [
        createRelease({ id: 'release-1', name: 'Checkout GA', version: 'v1.4.0' }),
        createRelease({ id: 'release-2', name: 'Profile Patch', version: 'v1.4.1' }),
      ],
      testCases: [
        createTestCase({
          id: 'test-case-1',
          title: 'Login accepts valid credentials',
        }),
      ],
    })

    let card = getExecutionCard('Login accepts valid credentials')

    await user.selectOptions(card.getByLabelText('Execution result'), 'Passed')
    await user.type(
      card.getByLabelText('Execution notes'),
      'Passed on Release 1.',
    )
    await user.tab()

    const scope = within(
      screen.getByRole('region', { name: 'Release Execution Scope' }),
    )

    await user.selectOptions(scope.getByLabelText('Select release'), 'release-2')

    card = getExecutionCard('Login accepts valid credentials')

    expect(card.getByLabelText('Execution result')).toHaveValue('Not Run')
    expect(card.getByLabelText('Execution notes')).toHaveValue('')
    expect(getSummaryCard('Awaiting run').getByText('1')).toBeInTheDocument()

    await user.selectOptions(card.getByLabelText('Execution result'), 'Failed')

    expect(getSummaryCard('Failed').getByText('1')).toBeInTheDocument()

    await user.selectOptions(scope.getByLabelText('Select release'), 'release-1')

    card = getExecutionCard('Login accepts valid credentials')

    expect(card.getByLabelText('Execution result')).toHaveValue('Passed')
    expect(card.getByLabelText('Execution notes')).toHaveValue(
      'Passed on Release 1.',
    )
    expect(getSummaryCard('Passed').getByText('1')).toBeInTheDocument()
  })

  it('marks test cases Passed, Failed, and Blocked for the selected release', async () => {
    const user = userEvent.setup()

    renderExecutionsPage({
      testCases: [
        createTestCase({ id: 'login', title: 'Login works' }),
        createTestCase({ id: 'checkout', title: 'Checkout works' }),
        createTestCase({ id: 'profile', title: 'Profile works' }),
      ],
    })

    await user.selectOptions(
      getExecutionCard('Login works').getByLabelText('Execution result'),
      'Passed',
    )
    await user.click(screen.getByRole('button', { name: /Checkout works/ }))
    await user.selectOptions(
      getExecutionCard('Checkout works').getByLabelText('Execution result'),
      'Failed',
    )
    await user.click(screen.getByRole('button', { name: /Profile works/ }))
    await user.selectOptions(
      getExecutionCard('Profile works').getByLabelText('Execution result'),
      'Blocked',
    )

    expect(getSummaryCard('Total').getByText('3')).toBeInTheDocument()
    expect(getSummaryCard('Awaiting run').getByText('0')).toBeInTheDocument()
    expect(getSummaryCard('Passed').getByText('1')).toBeInTheDocument()
    expect(getSummaryCard('Failed').getByText('1')).toBeInTheDocument()
    expect(getSummaryCard('Blocked').getByText('1')).toBeInTheDocument()
    expect(
      getExecutionCard('Profile works').getByLabelText('Execution result'),
    ).toHaveValue('Blocked')
    expect(getReadinessPanel().getByText('Blocked')).toBeInTheDocument()
  })

  it('renders a focused runner and changes selection from the execution queue', async () => {
    const user = userEvent.setup()

    renderExecutionsPage({
      testCases: [
        createTestCase({ id: 'login', title: 'Login works' }),
        createTestCase({ id: 'checkout', title: 'Checkout works' }),
      ],
    })

    expect(getExecutionCard('Login works').getByText('Preconditions')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Checkout works/ }))

    expect(getExecutionCard('Checkout works')).toBeTruthy()
    expect(screen.getByText('2 of 2')).toBeInTheDocument()
  })

  it('filters the execution queue by status', async () => {
    const user = userEvent.setup()

    renderExecutionsPage({
      testCases: [
        createTestCase({ id: 'login', title: 'Login works' }),
        createTestCase({ id: 'checkout', title: 'Checkout works' }),
      ],
      executions: [
        createExecution({
          releaseId: 'release-1',
          testCaseId: 'checkout',
          result: 'Failed',
        }),
      ],
    })

    const filters = within(
      screen.getByRole('region', { name: 'Execution Workspace Filters' }),
    )

    await user.selectOptions(
      filters.getByLabelText('Filter by execution status'),
      'Failed',
    )

    const queue = within(screen.getByRole('region', { name: 'Execution Queue' }))

    expect(queue.queryByRole('button', { name: /Login works/ })).not.toBeInTheDocument()
    expect(queue.getByRole('button', { name: /Checkout works/ })).toBeInTheDocument()
    expect(getExecutionCard('Checkout works')).toBeTruthy()
  })

  it('filters the execution queue by suite without mutating suite data', async () => {
    const user = userEvent.setup()
    const suite = createTestSuite({
      id: 'suite-1',
      name: 'Smoke Suite',
      testCaseIds: ['checkout'],
    })

    renderExecutionsPage({
      testCases: [
        createTestCase({ id: 'login', title: 'Login works' }),
        createTestCase({ id: 'checkout', title: 'Checkout works' }),
      ],
      testSuites: [suite],
    })

    const filters = within(
      screen.getByRole('region', { name: 'Execution Workspace Filters' }),
    )

    await user.selectOptions(
      filters.getByLabelText('Filter by test suite'),
      'suite-1',
    )

    const queue = within(screen.getByRole('region', { name: 'Execution Queue' }))

    expect(queue.queryByRole('button', { name: /Login works/ })).not.toBeInTheDocument()
    expect(queue.getByRole('button', { name: /Checkout works/ })).toBeInTheDocument()
    expect(suite.testCaseIds).toEqual(['checkout'])
  })

  it('shows an empty queue state when a suite has no available test cases', async () => {
    const user = userEvent.setup()

    renderExecutionsPage({
      testCases: [createTestCase({ id: 'login', title: 'Login works' })],
      testSuites: [
        createTestSuite({
          id: 'suite-1',
          name: 'Deleted Coverage Suite',
          testCaseIds: ['deleted-test-case'],
        }),
      ],
    })

    const filters = within(
      screen.getByRole('region', { name: 'Execution Workspace Filters' }),
    )

    await user.selectOptions(
      filters.getByLabelText('Filter by test suite'),
      'suite-1',
    )

    expect(
      screen.getByText('No available test cases in this suite'),
    ).toBeInTheDocument()
    expect(screen.getByText('No test case selected')).toBeInTheDocument()
  })

  it('moves previous and next through the filtered queue', async () => {
    const user = userEvent.setup()

    renderExecutionsPage({
      testCases: [
        createTestCase({ id: 'login', title: 'Login works' }),
        createTestCase({ id: 'checkout', title: 'Checkout works' }),
      ],
    })

    let runner = within(
      screen.getByRole('region', { name: 'Focused Test Case Runner' }),
    )

    expect(runner.getByRole('button', { name: 'Previous' })).toBeDisabled()

    await user.click(runner.getByRole('button', { name: 'Next' }))

    runner = within(screen.getByRole('region', { name: 'Focused Test Case Runner' }))

    expect(getExecutionCard('Checkout works')).toBeTruthy()
    expect(runner.getByRole('button', { name: 'Next' })).toBeDisabled()

    await user.click(runner.getByRole('button', { name: 'Previous' }))

    expect(getExecutionCard('Login works')).toBeTruthy()
  })

  it('saves notes on blur for a release/test case pair', async () => {
    const user = userEvent.setup()
    const view = renderExecutionsPage()

    const card = getExecutionCard('Login accepts valid credentials')

    await user.type(card.getByLabelText('Execution notes'), 'Retest on Chrome.')
    await user.tab()

    expect(view.getLatestExecutions()[0]).toMatchObject({
      releaseId: 'release-1',
      testCaseId: 'test-case-1',
      result: 'Not Run',
      notes: 'Retest on Chrome.',
    })
    expect(view.getLatestExecutions()[0].executedAt).toBeUndefined()
  })

  it('preserves notes when switching focused test cases', async () => {
    const user = userEvent.setup()

    renderExecutionsPage({
      testCases: [
        createTestCase({ id: 'login', title: 'Login works' }),
        createTestCase({ id: 'checkout', title: 'Checkout works' }),
      ],
    })

    await user.type(
      getExecutionCard('Login works').getByLabelText('Execution notes'),
      'Observed on Chrome.',
    )
    await user.click(screen.getByRole('button', { name: /Checkout works/ }))
    await user.click(screen.getByRole('button', { name: /Login works/ }))

    expect(getExecutionCard('Login works').getByLabelText('Execution notes')).toHaveValue(
      'Observed on Chrome.',
    )
  })

  it('preserves notes when a status filter changes the focused runner', async () => {
    const user = userEvent.setup()

    renderExecutionsPage({
      testCases: [
        createTestCase({ id: 'login', title: 'Login works' }),
        createTestCase({ id: 'checkout', title: 'Checkout works' }),
      ],
      executions: [
        createExecution({
          releaseId: 'release-1',
          testCaseId: 'checkout',
          result: 'Passed',
        }),
      ],
    })

    await user.type(
      getExecutionCard('Login works').getByLabelText('Execution notes'),
      'Investigate before running.',
    )

    const filters = within(
      screen.getByRole('region', { name: 'Execution Workspace Filters' }),
    )

    await user.selectOptions(
      filters.getByLabelText('Filter by execution status'),
      'Passed',
    )

    expect(getExecutionCard('Checkout works')).toBeTruthy()

    await user.selectOptions(
      filters.getByLabelText('Filter by execution status'),
      'All',
    )

    expect(getExecutionCard('Login works').getByLabelText('Execution notes')).toHaveValue(
      'Investigate before running.',
    )
  })

  it('preserves notes when an immediately following result waits on asynchronous storage', async () => {
    const user = userEvent.setup()
    const pending: (() => void)[] = []
    let saved: Execution[] = []
    const release = createRelease({ id: 'release-1' }); const testCase = createTestCase({ id: 'test-case-1' })
    function Harness() {
      const [executions, setExecutions] = useState<Execution[]>([])
      return <ExecutionsPage releases={[release]} testCases={[testCase]} testSuites={[]} executions={executions} bugs={[]} risks={[]} onChange={(next) => new Promise<void>((resolve) => pending.push(() => { saved = next; setExecutions(next); resolve() }))} />
    }
    render(<Harness />)
    await user.type(screen.getByLabelText('Execution notes'), 'Reproduced with the second account.')
    await user.tab()
    await waitFor(() => expect(pending).toHaveLength(1))
    await user.selectOptions(screen.getByLabelText('Execution result'), 'Failed')
    await act(async () => { pending.shift()!() })
    await waitFor(() => expect(pending).toHaveLength(1))
    await act(async () => { pending.shift()!() })
    await waitFor(() => expect(screen.getByLabelText('Execution result')).toHaveValue('Failed'))
    expect(saved).toHaveLength(1)
    expect(saved[0].notes).toBe('Reproduced with the second account.')
    expect(saved[0].testDesignFingerprint).toMatch(/^[a-f0-9]{64}$/)
  })

  it('keeps failed notes visible and stops a result from replacing that unsaved text', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn().mockResolvedValue({ ok: false, error: 'Storage failure' })
    render(<ExecutionsPage releases={[createRelease()]} testCases={[createTestCase()]} testSuites={[]} executions={[]} bugs={[]} risks={[]} onChange={onChange} />)
    await user.type(screen.getByLabelText('Execution notes'), 'Keep this unsaved investigation.')
    await user.tab()
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('notes could not be saved'))
    await user.selectOptions(screen.getByLabelText('Execution result'), 'Failed')
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Execution could not be saved safely'))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(screen.getByLabelText('Execution notes')).toHaveValue('Keep this unsaved investigation.')
    expect(screen.getByLabelText('Execution result')).toHaveValue('Not Run')
  })

  it('ignores saved executions for deleted references without crashing', () => {
    renderExecutionsPage({
      releases: [createRelease({ id: 'current-release' })],
      testCases: [createTestCase({ id: 'current-test-case' })],
      executions: [
        createExecution({
          id: 'stale-execution',
          releaseId: 'deleted-release',
          testCaseId: 'deleted-test-case',
          result: 'Passed',
        }),
      ],
    })

    expect(
      screen.getByRole('heading', { name: 'Login accepts valid credentials' }),
    ).toBeInTheDocument()
    expect(getSummaryCard('Awaiting run').getByText('1')).toBeInTheDocument()
  })
})
