import { describe, expect, it } from 'vitest'
import { createTestCase } from '../../test/testCaseFactory'
import {
  ALL_PRIORITIES,
  ALL_STATUSES,
  filterAndSortTestCases,
} from './testCaseFilters'

describe('filterAndSortTestCases', () => {
  const testCases = [
    createTestCase({
      id: 'checkout',
      title: 'Checkout applies discount code',
      priority: 'High',
      status: 'Failed',
      updatedAt: '2026-05-07T11:00:00.000Z',
    }),
    createTestCase({
      id: 'login',
      title: 'Login accepts valid credentials',
      priority: 'Critical',
      status: 'Blocked',
      updatedAt: '2026-05-07T12:00:00.000Z',
    }),
    createTestCase({
      id: 'profile',
      title: 'Profile image upload succeeds',
      priority: 'Low',
      status: 'Passed',
      updatedAt: '2026-05-07T10:00:00.000Z',
    }),
  ]

  it('searches by title case-insensitively and trims whitespace', () => {
    const result = filterAndSortTestCases(testCases, {
      searchTerm: '  LOGIN  ',
      statusFilter: ALL_STATUSES,
      priorityFilter: ALL_PRIORITIES,
    })

    expect(result.map((testCase) => testCase.id)).toEqual(['login'])
  })

  it('filters by status and priority together', () => {
    const result = filterAndSortTestCases(testCases, {
      searchTerm: '',
      statusFilter: 'Failed',
      priorityFilter: 'High',
    })

    expect(result.map((testCase) => testCase.id)).toEqual(['checkout'])
  })

  it('sorts newest updated test cases first', () => {
    const result = filterAndSortTestCases(testCases, {
      searchTerm: '',
      statusFilter: ALL_STATUSES,
      priorityFilter: ALL_PRIORITIES,
    })

    expect(result.map((testCase) => testCase.id)).toEqual([
      'login',
      'checkout',
      'profile',
    ])
  })
})
