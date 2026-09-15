import { describe, expect, it } from 'vitest'
import { createExecution } from '../../test/executionFactory'
import { createTestCase } from '../../test/testCaseFactory'
import { createTestSuite } from '../../test/testSuiteFactory'
import {
  ALL_EXECUTION_STATUS_FILTER,
  ALL_TEST_CASES_SUITE_FILTER,
  filterExecutionQueue,
  getExecutionQueueNavigation,
  getSuiteScopedTestCases,
  resolveSelectedTestCaseId,
} from './executionWorkspace'

const loginTestCase = createTestCase({
  id: 'login',
  title: 'Login works',
})
const checkoutTestCase = createTestCase({
  id: 'checkout',
  title: 'Checkout works',
})
const profileTestCase = createTestCase({
  id: 'profile',
  title: 'Profile works',
})

const testCases = [loginTestCase, checkoutTestCase, profileTestCase]

describe('executionWorkspace', () => {
  it('filters the execution queue by selected-release status', () => {
    const queue = filterExecutionQueue({
      testCases,
      testSuites: [],
      executions: [
        createExecution({
          releaseId: 'release-1',
          testCaseId: 'login',
          result: 'Passed',
        }),
        createExecution({
          releaseId: 'release-1',
          testCaseId: 'checkout',
          result: 'Failed',
        }),
        createExecution({
          releaseId: 'release-2',
          testCaseId: 'profile',
          result: 'Passed',
        }),
      ],
      releaseId: 'release-1',
      statusFilter: 'Not Run',
      suiteFilterId: ALL_TEST_CASES_SUITE_FILTER,
    })

    expect(queue.map((testCase) => testCase.id)).toEqual(['profile'])
  })

  it('returns all suite-scoped cases when the status filter is All', () => {
    const queue = filterExecutionQueue({
      testCases,
      testSuites: [],
      executions: [
        createExecution({
          releaseId: 'release-1',
          testCaseId: 'login',
          result: 'Passed',
        }),
      ],
      releaseId: 'release-1',
      statusFilter: ALL_EXECUTION_STATUS_FILTER,
      suiteFilterId: ALL_TEST_CASES_SUITE_FILTER,
    })

    expect(queue.map((testCase) => testCase.id)).toEqual([
      'login',
      'checkout',
      'profile',
    ])
  })

  it('filters the execution queue by suite membership without mutating test cases', () => {
    const suite = createTestSuite({
      id: 'suite-1',
      testCaseIds: ['checkout', 'login'],
    })

    const queue = filterExecutionQueue({
      testCases,
      testSuites: [suite],
      executions: [],
      releaseId: 'release-1',
      statusFilter: ALL_EXECUTION_STATUS_FILTER,
      suiteFilterId: 'suite-1',
    })

    expect(queue.map((testCase) => testCase.id)).toEqual(['login', 'checkout'])
    expect(suite.testCaseIds).toEqual(['checkout', 'login'])
  })

  it('ignores unavailable suite test case ids', () => {
    const suite = createTestSuite({
      id: 'suite-1',
      testCaseIds: ['missing-test-case', 'profile'],
    })

    expect(getSuiteScopedTestCases(testCases, [suite], 'suite-1')).toEqual([
      profileTestCase,
    ])
  })

  it('resolves the selected test case when filters remove the current selection', () => {
    expect(resolveSelectedTestCaseId(testCases, 'checkout')).toBe('checkout')
    expect(resolveSelectedTestCaseId(testCases, 'missing')).toBe('login')
    expect(resolveSelectedTestCaseId([], 'missing')).toBe('')
  })

  it('calculates previous and next boundaries inside the filtered queue', () => {
    expect(getExecutionQueueNavigation(testCases, 'login')).toEqual({
      currentIndex: 0,
      previousId: null,
      nextId: 'checkout',
    })
    expect(getExecutionQueueNavigation(testCases, 'checkout')).toEqual({
      currentIndex: 1,
      previousId: 'login',
      nextId: 'profile',
    })
    expect(getExecutionQueueNavigation(testCases, 'profile')).toEqual({
      currentIndex: 2,
      previousId: 'checkout',
      nextId: null,
    })
  })
})
