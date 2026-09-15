import { describe, expect, it } from 'vitest'
import { createTestSuite } from '../../test/testSuiteFactory'
import {
  ALL_TEST_SUITE_TYPES,
  filterAndSortTestSuites,
  getUniqueTestCaseIds,
} from './testSuiteFilters'

describe('testSuiteFilters', () => {
  it('filters suites by name and type and sorts by updated date', () => {
    const suites = [
      createTestSuite({
        id: 'old-smoke',
        name: 'Checkout Smoke',
        type: 'Smoke',
        updatedAt: '2026-05-10T08:00:00.000Z',
      }),
      createTestSuite({
        id: 'new-regression',
        name: 'Checkout Regression',
        type: 'Regression',
        updatedAt: '2026-05-11T08:00:00.000Z',
      }),
      createTestSuite({
        id: 'profile',
        name: 'Profile Smoke',
        type: 'Smoke',
        updatedAt: '2026-05-12T08:00:00.000Z',
      }),
    ]

    expect(
      filterAndSortTestSuites(suites, {
        searchTerm: 'checkout',
        typeFilter: ALL_TEST_SUITE_TYPES,
      }).map((suite) => suite.id),
    ).toEqual(['new-regression', 'old-smoke'])

    expect(
      filterAndSortTestSuites(suites, {
        searchTerm: '',
        typeFilter: 'Smoke',
      }).map((suite) => suite.id),
    ).toEqual(['profile', 'old-smoke'])
  })

  it('deduplicates test case ids while preserving order', () => {
    expect(getUniqueTestCaseIds(['a', 'b', 'a', 'c', 'b'])).toEqual([
      'a',
      'b',
      'c',
    ])
  })
})
