import { describe, expect, it } from 'vitest'
import { createBug } from '../../test/bugFactory'
import { createExecution } from '../../test/executionFactory'
import { createRisk } from '../../test/riskFactory'
import { createTestCase } from '../../test/testCaseFactory'
import {
  calculateReleaseReadiness,
  type ReleaseReadinessResult,
} from './releaseReadiness'

function getReasonCodes(result: ReleaseReadinessResult) {
  return result.reasons.map((reason) => reason.code)
}

describe('calculateReleaseReadiness', () => {
  it('returns Ready when all current test cases passed and no open high or critical signals exist', () => {
    const result = calculateReleaseReadiness({
      releaseId: 'release-1',
      testCases: [
        createTestCase({ id: 'login' }),
        createTestCase({ id: 'checkout' }),
      ],
      executions: [
        createExecution({
          id: 'login-execution',
          releaseId: 'release-1',
          testCaseId: 'login',
          result: 'Passed',
        }),
        createExecution({
          id: 'checkout-execution',
          releaseId: 'release-1',
          testCaseId: 'checkout',
          result: 'Passed',
        }),
      ],
      bugs: [],
      risks: [],
    })

    expect(result).toEqual({
      status: 'Ready',
      reasons: [
        {
          code: 'ready',
          label:
            'All current test cases passed and no blocking signals are open.',
        },
      ],
    })
  })

  it('returns At Risk for a failed execution without an explicit blocking signal', () => {
    const result = calculateReleaseReadiness({
      releaseId: 'release-1',
      testCases: [createTestCase({ id: 'login' })],
      executions: [
        createExecution({
          releaseId: 'release-1',
          testCaseId: 'login',
          result: 'Failed',
        }),
      ],
      bugs: [],
      risks: [],
    })

    expect(result.status).toBe('At Risk')
    expect(result.reasons).toContainEqual({
      code: 'failed-test-cases',
      count: 1,
      label: '1 failed test case',
    })
  })

  it('returns Blocked for a blocked execution', () => {
    const result = calculateReleaseReadiness({
      releaseId: 'release-1',
      testCases: [createTestCase({ id: 'login' })],
      executions: [
        createExecution({
          releaseId: 'release-1',
          testCaseId: 'login',
          result: 'Blocked',
        }),
      ],
      bugs: [],
      risks: [],
    })

    expect(result.status).toBe('Blocked')
    expect(result.reasons).toContainEqual({
      code: 'blocked-test-cases',
      count: 1,
      label: '1 blocked test case',
    })
  })

  it('returns Blocked for an open Critical bug', () => {
    const result = calculateReleaseReadiness({
      releaseId: 'release-1',
      testCases: [createTestCase({ id: 'login' })],
      executions: [
        createExecution({
          releaseId: 'release-1',
          testCaseId: 'login',
          result: 'Passed',
        }),
      ],
      bugs: [createBug({ severity: 'Critical', status: 'Open' })],
      risks: [],
    })

    expect(result.status).toBe('Blocked')
    expect(result.reasons).toContainEqual({
      code: 'open-critical-bugs',
      count: 1,
      label: '1 open Critical bug',
    })
  })

  it('returns Blocked for an open Critical risk', () => {
    const result = calculateReleaseReadiness({
      releaseId: 'release-1',
      testCases: [createTestCase({ id: 'login' })],
      executions: [
        createExecution({
          releaseId: 'release-1',
          testCaseId: 'login',
          result: 'Passed',
        }),
      ],
      bugs: [],
      risks: [createRisk({ impact: 'Critical', status: 'Open' })],
    })

    expect(result.status).toBe('Blocked')
    expect(result.reasons).toContainEqual({
      code: 'open-critical-risks',
      count: 1,
      label: '1 open Critical risk',
    })
  })

  it('returns At Risk when there are no current test cases', () => {
    const result = calculateReleaseReadiness({
      releaseId: 'release-1',
      testCases: [],
      executions: [],
      bugs: [],
      risks: [],
    })

    expect(result).toEqual({
      status: 'At Risk',
      reasons: [
        {
          code: 'no-test-cases',
          label: 'No test cases available',
        },
      ],
    })
  })

  it('returns At Risk when a current test case is missing an execution', () => {
    const result = calculateReleaseReadiness({
      releaseId: 'release-1',
      testCases: [createTestCase({ id: 'login' })],
      executions: [],
      bugs: [],
      risks: [],
    })

    expect(result.status).toBe('At Risk')
    expect(result.reasons).toContainEqual({
      code: 'test-cases-not-run',
      count: 1,
      label: '1 test case not run',
    })
  })

  it('returns At Risk when a current test case is explicitly Not Run', () => {
    const result = calculateReleaseReadiness({
      releaseId: 'release-1',
      testCases: [createTestCase({ id: 'login' })],
      executions: [
        createExecution({
          releaseId: 'release-1',
          testCaseId: 'login',
          result: 'Not Run',
          executedAt: undefined,
        }),
      ],
      bugs: [],
      risks: [],
    })

    expect(result.status).toBe('At Risk')
    expect(result.reasons).toContainEqual({
      code: 'test-cases-not-run',
      count: 1,
      label: '1 test case not run',
    })
  })

  it('returns At Risk for an open High bug', () => {
    const result = calculateReleaseReadiness({
      releaseId: 'release-1',
      testCases: [createTestCase({ id: 'login' })],
      executions: [
        createExecution({
          releaseId: 'release-1',
          testCaseId: 'login',
          result: 'Passed',
        }),
      ],
      bugs: [createBug({ severity: 'High', status: 'Open' })],
      risks: [],
    })

    expect(result.status).toBe('At Risk')
    expect(result.reasons).toContainEqual({
      code: 'open-high-bugs',
      count: 1,
      label: '1 open High bug',
    })
  })

  it('returns At Risk for an open High risk', () => {
    const result = calculateReleaseReadiness({
      releaseId: 'release-1',
      testCases: [createTestCase({ id: 'login' })],
      executions: [
        createExecution({
          releaseId: 'release-1',
          testCaseId: 'login',
          result: 'Passed',
        }),
      ],
      bugs: [],
      risks: [createRisk({ impact: 'High', status: 'Open' })],
    })

    expect(result.status).toBe('At Risk')
    expect(result.reasons).toContainEqual({
      code: 'open-high-risks',
      count: 1,
      label: '1 open High risk',
    })
  })

  it('prioritizes Blocked over At Risk when both conditions exist', () => {
    const result = calculateReleaseReadiness({
      releaseId: 'release-1',
      testCases: [
        createTestCase({ id: 'login' }),
        createTestCase({ id: 'checkout' }),
      ],
      executions: [
        createExecution({
          releaseId: 'release-1',
          testCaseId: 'login',
          result: 'Failed',
        }),
      ],
      bugs: [createBug({ severity: 'Critical', status: 'Open' })],
      risks: [],
    })

    expect(result.status).toBe('Blocked')
    expect(getReasonCodes(result)).toEqual([
      'open-critical-bugs',
      'failed-test-cases',
      'test-cases-not-run',
    ])
  })

  it('ignores executions for other releases', () => {
    const result = calculateReleaseReadiness({
      releaseId: 'release-1',
      testCases: [createTestCase({ id: 'login' })],
      executions: [
        createExecution({
          releaseId: 'release-2',
          testCaseId: 'login',
          result: 'Passed',
        }),
      ],
      bugs: [],
      risks: [],
    })

    expect(result.status).toBe('At Risk')
    expect(result.reasons).toContainEqual({
      code: 'test-cases-not-run',
      count: 1,
      label: '1 test case not run',
    })
  })

  it('ignores executions for deleted test cases', () => {
    const result = calculateReleaseReadiness({
      releaseId: 'release-1',
      testCases: [createTestCase({ id: 'login' })],
      executions: [
        createExecution({
          releaseId: 'release-1',
          testCaseId: 'login',
          result: 'Passed',
        }),
        createExecution({
          releaseId: 'release-1',
          testCaseId: 'deleted-test-case',
          result: 'Failed',
        }),
      ],
      bugs: [],
      risks: [],
    })

    expect(result.status).toBe('Ready')
    expect(getReasonCodes(result)).toEqual(['ready'])
  })
})
