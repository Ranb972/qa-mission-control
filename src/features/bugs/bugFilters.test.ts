import { describe, expect, it } from 'vitest'
import { createBug } from '../../test/bugFactory'
import {
  ALL_BUG_SEVERITIES,
  ALL_BUG_STATUSES,
  filterAndSortBugs,
} from './bugFilters'

describe('filterAndSortBugs', () => {
  const bugs = [
    createBug({
      id: 'checkout',
      title: 'Checkout total is incorrect',
      severity: 'High',
      status: 'Open',
      updatedAt: '2026-05-07T11:00:00.000Z',
    }),
    createBug({
      id: 'login',
      title: 'Login fails on locked accounts',
      severity: 'Critical',
      status: 'Retest',
      updatedAt: '2026-05-07T12:00:00.000Z',
    }),
    createBug({
      id: 'profile',
      title: 'Profile image preview is stretched',
      severity: 'Low',
      status: 'Closed',
      updatedAt: '2026-05-07T10:00:00.000Z',
    }),
  ]

  it('searches by title case-insensitively and trims whitespace', () => {
    const result = filterAndSortBugs(bugs, {
      searchTerm: '  LOGIN  ',
      statusFilter: ALL_BUG_STATUSES,
      severityFilter: ALL_BUG_SEVERITIES,
    })

    expect(result.map((bug) => bug.id)).toEqual(['login'])
  })

  it('filters by status and severity together', () => {
    const result = filterAndSortBugs(bugs, {
      searchTerm: '',
      statusFilter: 'Open',
      severityFilter: 'High',
    })

    expect(result.map((bug) => bug.id)).toEqual(['checkout'])
  })

  it('sorts newest updated bugs first', () => {
    const result = filterAndSortBugs(bugs, {
      searchTerm: '',
      statusFilter: ALL_BUG_STATUSES,
      severityFilter: ALL_BUG_SEVERITIES,
    })

    expect(result.map((bug) => bug.id)).toEqual([
      'login',
      'checkout',
      'profile',
    ])
  })
})
