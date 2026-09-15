import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createBug } from '../../test/bugFactory'
import { createExecution } from '../../test/executionFactory'
import { createRelease } from '../../test/releaseFactory'
import { createRisk } from '../../test/riskFactory'
import { createTestCase } from '../../test/testCaseFactory'
import { GLOBAL_QUALITY_SIGNAL_NOTE } from './releaseReport'
import { ReleaseReportPage } from './ReleaseReportPage'

function renderReleaseReportPage({
  releases = [createRelease({ id: 'release-1' })],
  testCases = [
    createTestCase({
      id: 'passed-case',
      title: 'Checkout accepts card payment',
    }),
    createTestCase({
      id: 'failed-case',
      title: 'Checkout rejects expired card',
      area: 'Payments',
      priority: 'Critical',
    }),
    createTestCase({
      id: 'blocked-case',
      title: 'Checkout sends receipt email',
      area: 'Notifications',
    }),
    createTestCase({
      id: 'not-run-case',
      title: 'Checkout supports coupons',
      area: 'Promotions',
    }),
  ],
  executions = [
    createExecution({
      releaseId: 'release-1',
      testCaseId: 'passed-case',
      result: 'Passed',
      notes: 'Passed on Chrome.',
    }),
    createExecution({
      releaseId: 'release-1',
      testCaseId: 'failed-case',
      result: 'Failed',
      notes: 'Expired cards fail incorrectly.',
    }),
    createExecution({
      releaseId: 'release-1',
      testCaseId: 'blocked-case',
      result: 'Blocked',
      notes: '',
    }),
  ],
  bugs = [
    createBug({
      title: 'Payment crash',
      severity: 'Critical',
      status: 'Open',
    }),
  ],
  risks = [
    createRisk({
      title: 'Payment provider instability',
      impact: 'High',
      status: 'Open',
    }),
  ],
}: Partial<Parameters<typeof ReleaseReportPage>[0]> = {}) {
  render(
    <ReleaseReportPage
      releases={releases}
      testCases={testCases}
      executions={executions}
      bugs={bugs}
      risks={risks}
    />,
  )
}

function mockClipboard(writeText: () => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: vi.fn(writeText),
    },
  })

  return navigator.clipboard.writeText
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ReleaseReportPage', () => {
  it('keeps execution readiness separate from evidence review and final sign-off', () => {
    renderReleaseReportPage({
      testCases: [createTestCase({ id: 'passed-case' })],
      executions: [createExecution({ releaseId: 'release-1', testCaseId: 'passed-case', result: 'Passed' })],
      bugs: [], risks: [],
    })
    const verdict = screen.getByRole('region', { name: 'Calculated Readiness' })
    expect(verdict).toHaveTextContent('Ready')
    expect(verdict).toHaveTextContent('Execution checks clear. Review source evidence.')
    expect(verdict).toHaveTextContent('This is not final release approval.')
    expect(screen.getByRole('region', { name: 'Recommended next actions' })).toHaveTextContent('Review source evidence and outstanding QA decisions before stakeholder sign-off.')
  })

  it('offers test creation when a release has no executable scope', async () => {
    const onNavigate = vi.fn()
    render(<ReleaseReportPage releases={[createRelease()]} testCases={[]} executions={[]} bugs={[]} risks={[]} onNavigate={onNavigate} />)
    expect(screen.getByRole('region', { name: 'Recommended next actions' })).toHaveTextContent('Define the tests to execute.')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Go to Test Cases' }))
    expect(onNavigate).toHaveBeenCalledWith('test-cases')
  })

  it('shows an empty state when no releases exist', () => {
    renderReleaseReportPage({ releases: [] })

    expect(screen.getByText('No releases available')).toBeInTheDocument()
    expect(
      screen.getByText('Create a release before generating a QA release report.'),
    ).toBeInTheDocument()
  })

  it('renders readiness, execution lists, notes, and global quality wording', () => {
    renderReleaseReportPage()

    expect(screen.getByRole('heading', { name: 'Release Report' })).toBeInTheDocument()
    expect(
      screen.getByRole('region', { name: 'Calculated Readiness' }),
    ).toHaveTextContent('Blocked')
    expect(screen.getByText('Checkout rejects expired card')).toBeInTheDocument()
    expect(
      screen.getAllByText('Expired cards fail incorrectly.').length,
    ).toBeGreaterThan(0)
    expect(screen.getByText('Checkout sends receipt email')).toBeInTheDocument()
    expect(screen.getByText('Checkout supports coupons')).toBeInTheDocument()
    expect(screen.getByText('Passed on Chrome.')).toBeInTheDocument()
    expect(screen.getAllByText(GLOBAL_QUALITY_SIGNAL_NOTE).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Payment crash/).length).toBeGreaterThan(0)
    expect(
      screen.getAllByText(/Payment provider instability/).length,
    ).toBeGreaterThan(0)
  })

  it('updates the report when selecting a different release', async () => {
    const user = userEvent.setup()

    renderReleaseReportPage({
      releases: [
        createRelease({ id: 'release-1', name: 'Checkout GA', version: 'v2.0.0' }),
        createRelease({
          id: 'release-2',
          name: 'Profile Patch',
          version: 'v2.0.1',
        }),
      ],
      executions: [
        createExecution({
          releaseId: 'release-2',
          testCaseId: 'passed-case',
          result: 'Passed',
        }),
      ],
      bugs: [],
      risks: [],
    })

    await user.selectOptions(
      screen.getByLabelText('Select release'),
      'release-2',
    )

    expect(screen.getByText(/Profile Patch v2.0.1 targets/)).toBeInTheDocument()
    expect(
      within(screen.getByRole('region', { name: 'Passed' })).getByText('1'),
    ).toBeInTheDocument()
  })

  it('copies the generated markdown report', async () => {
    const user = userEvent.setup()
    const writeText = mockClipboard(() => Promise.resolve())

    renderReleaseReportPage()

    await user.click(screen.getByRole('button', { name: 'Copy Markdown report' }))

    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining('# QA Release Report: May Checkout Release'),
    )
    expect(screen.getByRole('status')).toHaveTextContent(
      'Markdown report copied.',
    )
  })

  it('shows non-blocking feedback when markdown copy fails', async () => {
    const user = userEvent.setup()

    mockClipboard(() => Promise.reject(new Error('clipboard blocked')))

    renderReleaseReportPage()

    await user.click(screen.getByRole('button', { name: 'Copy Markdown report' }))

    expect(screen.getByRole('status')).toHaveTextContent(
      'Markdown report could not be copied.',
    )
  })
})
