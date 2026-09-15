import type {
  TestCase,
  TestCasePriority,
  TestCaseStatus,
} from './testCaseTypes'

export const ALL_STATUSES = 'All statuses' as const
export const ALL_PRIORITIES = 'All priorities' as const

export type StatusFilter = TestCaseStatus | typeof ALL_STATUSES
export type PriorityFilter = TestCasePriority | typeof ALL_PRIORITIES

type TestCaseFilterOptions = {
  searchTerm: string
  statusFilter: StatusFilter
  priorityFilter: PriorityFilter
}

export function filterAndSortTestCases(
  testCases: TestCase[],
  { searchTerm, statusFilter, priorityFilter }: TestCaseFilterOptions,
) {
  const normalizedSearch = searchTerm.trim().toLowerCase()

  return [...testCases]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .filter((testCase) => {
      const matchesSearch = testCase.title
        .toLowerCase()
        .includes(normalizedSearch)
      const matchesStatus =
        statusFilter === ALL_STATUSES || testCase.status === statusFilter
      const matchesPriority =
        priorityFilter === ALL_PRIORITIES || testCase.priority === priorityFilter

      return matchesSearch && matchesStatus && matchesPriority
    })
}
