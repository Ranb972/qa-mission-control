import type { TestSuite } from '../test-suites/testSuiteTypes'
import type { TestCase } from '../test-cases/testCaseTypes'
import type { Execution, ExecutionResult } from './executionTypes'
import { indexReleaseExecutions } from './executionSelectors'

export const ALL_EXECUTION_STATUS_FILTER = 'All' as const
export const ALL_TEST_CASES_SUITE_FILTER = '__all-test-cases__' as const

export type ExecutionStatusFilter =
  | typeof ALL_EXECUTION_STATUS_FILTER
  | ExecutionResult

type FilterExecutionQueueOptions = {
  testCases: TestCase[]
  testSuites: TestSuite[]
  executions: Execution[]
  releaseId: string
  statusFilter: ExecutionStatusFilter
  suiteFilterId: string
  query?: string
}

export function getSuiteScopedTestCases(
  testCases: TestCase[],
  testSuites: TestSuite[],
  suiteFilterId: string,
) {
  if (suiteFilterId === ALL_TEST_CASES_SUITE_FILTER) {
    return testCases
  }

  const selectedSuite = testSuites.find((suite) => suite.id === suiteFilterId)

  if (!selectedSuite) {
    return []
  }

  const suiteTestCaseIds = new Set(selectedSuite.testCaseIds)

  return testCases.filter((testCase) => suiteTestCaseIds.has(testCase.id))
}

export function filterExecutionQueue({
  testCases,
  testSuites,
  executions,
  releaseId,
  statusFilter,
  suiteFilterId,
  query = '',
}: FilterExecutionQueueOptions) {
  const suiteScopedTestCases = getSuiteScopedTestCases(
    testCases,
    testSuites,
    suiteFilterId,
  )

  if (statusFilter === ALL_EXECUTION_STATUS_FILTER && !query.trim()) {
    return suiteScopedTestCases
  }

  const index = indexReleaseExecutions(executions, releaseId)
  const search = query.trim().toLocaleLowerCase()
  return suiteScopedTestCases.filter((testCase) => {
    const result =
      index.get(testCase.id)?.result ?? 'Not Run'

    return (statusFilter === ALL_EXECUTION_STATUS_FILTER || result === statusFilter) && (!search || `${testCase.title} ${testCase.area}`.toLocaleLowerCase().includes(search))
  })
}

export function resolveSelectedTestCaseId(
  queue: TestCase[],
  selectedTestCaseId: string,
) {
  if (queue.some((testCase) => testCase.id === selectedTestCaseId)) {
    return selectedTestCaseId
  }

  return queue[0]?.id ?? ''
}

export function getExecutionQueueNavigation(
  queue: TestCase[],
  selectedTestCaseId: string,
) {
  const currentIndex = queue.findIndex(
    (testCase) => testCase.id === selectedTestCaseId,
  )

  if (currentIndex === -1) {
    return {
      currentIndex: -1,
      previousId: null,
      nextId: null,
    }
  }

  return {
    currentIndex,
    previousId: currentIndex > 0 ? queue[currentIndex - 1].id : null,
    nextId:
      currentIndex < queue.length - 1 ? queue[currentIndex + 1].id : null,
  }
}
