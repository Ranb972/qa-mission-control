import type { TestSuite, TestSuiteType } from './testSuiteTypes'

export const ALL_TEST_SUITE_TYPES = 'All suite types' as const

export type TestSuiteTypeFilter =
  | TestSuiteType
  | typeof ALL_TEST_SUITE_TYPES

type TestSuiteFilterOptions = {
  searchTerm: string
  typeFilter: TestSuiteTypeFilter
}

export function getUniqueTestCaseIds(testCaseIds: string[]) {
  return Array.from(new Set(testCaseIds))
}

export function filterAndSortTestSuites(
  suites: TestSuite[],
  { searchTerm, typeFilter }: TestSuiteFilterOptions,
) {
  const normalizedSearch = searchTerm.trim().toLowerCase()

  return [...suites]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .filter((suite) => {
      const matchesSearch = suite.name.toLowerCase().includes(normalizedSearch)
      const matchesType =
        typeFilter === ALL_TEST_SUITE_TYPES || suite.type === typeFilter

      return matchesSearch && matchesType
    })
}
