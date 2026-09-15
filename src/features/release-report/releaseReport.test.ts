import { describe, expect, it } from 'vitest'
import { createBug } from '../../test/bugFactory'
import { createExecution } from '../../test/executionFactory'
import { createRelease } from '../../test/releaseFactory'
import { createRisk } from '../../test/riskFactory'
import { createTestCase } from '../../test/testCaseFactory'
import {
  GLOBAL_QUALITY_SIGNAL_NOTE,
  buildReleaseReportModel,
  formatReleaseReportMarkdown,
} from './releaseReport'

const release = createRelease({
  id: 'release-1',
  name: 'Checkout GA',
  version: 'v2.0.0',
  targetDate: '2026-05-30',
  status: 'In Testing',
  notes: 'Final checkout validation.',
})

const testCases = [
  createTestCase({
    id: 'passed-case',
    title: 'Checkout accepts card payment',
    area: 'Checkout',
    priority: 'High',
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
    priority: 'Medium',
  }),
  createTestCase({
    id: 'not-run-case',
    title: 'Checkout supports coupons',
    area: 'Promotions',
    priority: 'Low',
  }),
]

describe('releaseReport', () => {
  it('builds a release report model from release, executions, readiness, bugs, and risks', () => {
    const model = buildReleaseReportModel({
      release,
      testCases,
      executions: [
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
          notes: 'Fails on expired card validation.',
          executedAt: '2026-05-11T10:30:00.000Z',
        }),
        createExecution({
          releaseId: 'release-1',
          testCaseId: 'blocked-case',
          result: 'Blocked',
          notes: '',
        }),
        createExecution({
          releaseId: 'other-release',
          testCaseId: 'not-run-case',
          result: 'Passed',
          notes: 'Other release only.',
        }),
        createExecution({
          releaseId: 'release-1',
          testCaseId: 'deleted-test-case',
          result: 'Failed',
          notes: 'Deleted test case should not appear.',
        }),
      ],
      bugs: [
        createBug({
          id: 'critical-bug',
          title: 'Payment crash',
          severity: 'Critical',
          status: 'Open',
        }),
        createBug({
          id: 'medium-bug',
          title: 'Minor copy issue',
          severity: 'Medium',
          status: 'Open',
        }),
      ],
      risks: [
        createRisk({
          id: 'high-risk',
          title: 'Payment provider instability',
          impact: 'High',
          status: 'Open',
        }),
        createRisk({
          id: 'resolved-risk',
          title: 'Resolved infrastructure risk',
          impact: 'Critical',
          status: 'Resolved',
        }),
      ],
    })

    expect(model.release).toMatchObject({
      name: 'Checkout GA',
      version: 'v2.0.0',
      targetDate: '2026-05-30',
      status: 'In Testing',
    })
    expect(model.summary).toEqual({
      total: 4,
      notRun: 1,
      passed: 1,
      failed: 1,
      blocked: 1,
    })
    expect(model.readiness.status).toBe('Blocked')
    expect(model.readiness.reasons.map((reason) => reason.label)).toContain(
      '1 failed test case',
    )
    expect(model.failedTests.map((item) => item.title)).toEqual([
      'Checkout rejects expired card',
    ])
    expect(model.blockedTests.map((item) => item.title)).toEqual([
      'Checkout sends receipt email',
    ])
    expect(model.notRunTests.map((item) => item.title)).toEqual([
      'Checkout supports coupons',
    ])
    expect(model.executionNotes.map((note) => note.title)).toEqual([
      'Checkout accepts card payment',
      'Checkout rejects expired card',
    ])
    expect(model.globalBugs.map((bug) => bug.title)).toEqual(['Payment crash'])
    expect(model.globalRisks.map((risk) => risk.title)).toEqual([
      'Payment provider instability',
    ])
    expect(model.recommendedActions).toEqual([
      'Investigate and resolve failed test cases before release handoff.',
      'Unblock blocked test cases or document accepted release risk.',
      'Run the remaining tests and record their outcomes before assessing execution coverage.',
      'Review open High/Critical global bugs before the release decision.',
      'Review open High/Critical global risks and mitigation plans.',
    ])
  })

  it('formats a markdown report with stable QA report sections and key data', () => {
    const model = buildReleaseReportModel({
      release,
      testCases: [testCases[0]],
      executions: [
        createExecution({
          releaseId: 'release-1',
          testCaseId: 'passed-case',
          result: 'Passed',
          notes: 'Ready for handoff.',
        }),
      ],
      bugs: [],
      risks: [],
    })

    const markdown = formatReleaseReportMarkdown(model)

    expect(markdown).toContain('# QA Release Report: Checkout GA')
    expect(markdown).toContain('## Release Overview')
    expect(markdown).toContain('- Version: v2.0.0')
    expect(markdown).toContain('## Calculated Readiness')
    expect(markdown).toContain('- Status: Ready')
    expect(markdown).toContain('## Execution Summary')
    expect(markdown).toContain('- Passed: 1')
    expect(markdown).toContain('## Failed Tests')
    expect(markdown).toContain('- None.')
    expect(markdown).toContain('## Execution Notes')
    expect(markdown).toContain(
      '- Checkout accepts card payment (Passed): Ready for handoff.',
    )
    expect(markdown).toContain('## Bugs Summary')
    expect(markdown).toContain(GLOBAL_QUALITY_SIGNAL_NOTE)
    expect(markdown).toContain('## Recommended Next Actions')
    expect(markdown).toContain(
      '- Review source evidence and outstanding QA decisions before stakeholder sign-off.',
    )
  })
})
