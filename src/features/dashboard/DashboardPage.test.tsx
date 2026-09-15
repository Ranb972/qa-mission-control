import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createBug } from '../../test/bugFactory'
import { createExecution } from '../../test/executionFactory'
import { createRelease } from '../../test/releaseFactory'
import { createRisk } from '../../test/riskFactory'
import { createTestCase } from '../../test/testCaseFactory'
import { DashboardPage } from './DashboardPage'

function getSummaryCard(label: string) {
  return within(screen.getByRole('region', { name: label }))
}

function getPanel(label: string) {
  return within(screen.getByRole('region', { name: label }))
}

function getMetricValue(label: string) {
  const row = screen.getByText(label, { selector: 'dt' }).closest('.definition-list__row')
  if (!row) {
    throw new Error(`Missing metric row for ${label}`)
  }

  return within(row)
}

describe('DashboardPage', () => {
  it('shows recorded release failures even when library status has passed, without changing saved release status', () => {
    render(<DashboardPage
      testCases={[createTestCase({ id: 'test-1', status: 'Passed' })]}
      releases={[createRelease({ id: 'release-1', status: 'In Testing' })]}
      executions={[createExecution({ releaseId: 'release-1', testCaseId: 'test-1', result: 'Failed' })]}
      bugs={[]} risks={[]}
    />)
    const targets = getPanel('Release targets')
    expect(targets.getByText('At Risk')).toBeVisible()
    expect(targets.getByText(/1 failed test case/)).toBeVisible()
    expect(targets.getByText(/Saved status: In Testing/)).toBeVisible()
    expect(targets.getByText(/Source coverage and final sign-off require separate review/)).toBeVisible()
    expect(getMetricValue('Passed').getByText('1')).toBeVisible()
  })

  it('orients users around the finished source-to-report workflow without roadmap placeholders', () => {
    render(
      <DashboardPage testCases={[]} bugs={[]} risks={[]} releases={[]} />,
    )

    expect(
      screen.getByRole('heading', { name: 'From source to release confidence' }),
    ).toBeVisible()
    const workflow = within(
      screen.getByRole('list', { name: 'QA Mission Control workflow' }),
    )
    expect(workflow.getByText('Local structure')).toBeVisible()
    expect(workflow.getByText('Explicit AI request')).toBeVisible()
    expect(workflow.getByText('Human approval')).toBeVisible()
    expect(workflow.getByText('Test Case library')).toBeVisible()
    expect(workflow.getByText('Recorded execution')).toBeVisible()
    expect(workflow.getByText('Report')).toBeVisible()
    expect(
      workflow.getByText(/Opening and organizing the source sends no AI request/),
    ).toBeVisible()
    expect(
      workflow.getByText(/Release-specific results stay separate from library status/),
    ).toBeVisible()
    expect(
      screen.queryByRole('heading', { name: 'Planned Next Modules' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByText(/v0\./i)).not.toBeInTheDocument()
  })

  it('renders accurate test case summary counts', () => {
    render(
      <DashboardPage
        testCases={[
          createTestCase({ id: 'not-run', status: 'Not Run', priority: 'Low' }),
          createTestCase({ id: 'passed', status: 'Passed', priority: 'Medium' }),
          createTestCase({ id: 'failed', status: 'Failed', priority: 'Critical' }),
          createTestCase({ id: 'blocked', status: 'Blocked', priority: 'Critical' }),
        ]}
        bugs={[]}
        risks={[]}
        releases={[]}
      />,
    )

    expect(getSummaryCard('Test Cases').getByText('4')).toBeInTheDocument()
    expect(
      getSummaryCard('Library needs attention').getByText('2'),
    ).toBeInTheDocument()
    const executionPanel = getPanel('Test Case library status')
    expect(executionPanel.getByText('Passed')).toBeInTheDocument()
    expect(getMetricValue('Passed').getByText('1')).toBeInTheDocument()
    expect(executionPanel.getByText('Critical priority')).toBeInTheDocument()
    expect(getMetricValue('Critical priority').getByText('2')).toBeInTheDocument()
  })

  it('renders accurate bug summary counts', () => {
    render(
      <DashboardPage
        testCases={[]}
        bugs={[
          createBug({ id: 'open', status: 'Open', severity: 'Low' }),
          createBug({ id: 'critical', status: 'In Progress', severity: 'Critical' }),
          createBug({ id: 'retest', status: 'Retest', severity: 'Critical' }),
          createBug({ id: 'closed', status: 'Closed', severity: 'Critical' }),
        ]}
        risks={[]}
        releases={[]}
      />,
    )

    expect(getSummaryCard('Active Bugs').getByText('3')).toBeInTheDocument()
    const pressurePanel = getPanel('Defect and risk pressure')
    expect(pressurePanel.getByText('Open bugs')).toBeInTheDocument()
    expect(getMetricValue('Open bugs').getByText('1')).toBeInTheDocument()
    expect(pressurePanel.getByText('Critical bugs')).toBeInTheDocument()
    expect(getMetricValue('Critical bugs').getByText('2')).toBeInTheDocument()
    expect(pressurePanel.getByText('Ready for retest')).toBeInTheDocument()
    expect(getMetricValue('Ready for retest').getByText('1')).toBeInTheDocument()
  })

  it('renders accurate risk summary counts', () => {
    render(
      <DashboardPage
        testCases={[]}
        bugs={[]}
        risks={[
          createRisk({ id: 'open', status: 'Open', impact: 'Low' }),
          createRisk({ id: 'critical', status: 'Accepted', impact: 'Critical' }),
          createRisk({ id: 'mitigating', status: 'Mitigating', impact: 'Critical' }),
          createRisk({ id: 'resolved', status: 'Resolved', impact: 'Critical' }),
        ]}
        releases={[]}
      />,
    )

    const pressurePanel = getPanel('Defect and risk pressure')
    expect(pressurePanel.getByText('Open risks')).toBeInTheDocument()
    expect(getMetricValue('Open risks').getByText('1')).toBeInTheDocument()
    expect(pressurePanel.getByText('Critical risks')).toBeInTheDocument()
    expect(getMetricValue('Critical risks').getByText('2')).toBeInTheDocument()
    expect(pressurePanel.getByText('Mitigating risks')).toBeInTheDocument()
    expect(getMetricValue('Mitigating risks').getByText('1')).toBeInTheDocument()
  })

  it('renders accurate release summary counts', () => {
    render(
      <DashboardPage
        testCases={[]}
        bugs={[]}
        risks={[]}
        releases={[
          createRelease({ id: 'planning', status: 'Planning' }),
          createRelease({ id: 'testing', status: 'In Testing' }),
          createRelease({ id: 'blocked', status: 'Blocked' }),
          createRelease({ id: 'ready', status: 'Ready' }),
          createRelease({ id: 'released', status: 'Released' }),
        ]}
      />,
    )

    expect(getSummaryCard('Active Releases').getByText('4')).toBeInTheDocument()
    const releasePanel = getPanel('Release status')
    expect(releasePanel.getByText('Planning')).toBeInTheDocument()
    expect(getMetricValue('Planning').getByText('1')).toBeInTheDocument()
    expect(releasePanel.getByText('In Testing')).toBeInTheDocument()
    expect(getMetricValue('In Testing').getByText('1')).toBeInTheDocument()
    expect(releasePanel.getByText('Blocked')).toBeInTheDocument()
    expect(getMetricValue('Blocked').getByText('1')).toBeInTheDocument()
    expect(releasePanel.getByText('Ready')).toBeInTheDocument()
    expect(getMetricValue('Ready').getByText('1')).toBeInTheDocument()
    expect(releasePanel.getByText('Released')).toBeInTheDocument()
    expect(getMetricValue('Released').getByText('1')).toBeInTheDocument()
  })
})
