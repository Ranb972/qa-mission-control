import { describe, expect, it } from 'vitest'
import { createRelease } from '../../test/releaseFactory'
import {
  ALL_RELEASE_STATUSES,
  filterAndSortReleases,
} from './releaseFilters'

describe('filterAndSortReleases', () => {
  it('searches releases by name case-insensitively', () => {
    const releases = [
      createRelease({ id: 'checkout', name: 'Checkout Release' }),
      createRelease({ id: 'profile', name: 'Profile Release' }),
    ]

    const result = filterAndSortReleases(releases, {
      searchTerm: ' checkout ',
      statusFilter: ALL_RELEASE_STATUSES,
    })

    expect(result).toEqual([releases[0]])
  })

  it('searches releases by version case-insensitively', () => {
    const releases = [
      createRelease({ id: 'one', version: 'v1.4.0' }),
      createRelease({ id: 'two', version: 'v2.0.0' }),
    ]

    const result = filterAndSortReleases(releases, {
      searchTerm: 'V2',
      statusFilter: ALL_RELEASE_STATUSES,
    })

    expect(result).toEqual([releases[1]])
  })

  it('filters releases by status', () => {
    const matchingRelease = createRelease({
      id: 'testing',
      status: 'In Testing',
    })
    const releases = [
      createRelease({ id: 'planning', status: 'Planning' }),
      matchingRelease,
      createRelease({ id: 'ready', status: 'Ready' }),
    ]

    const result = filterAndSortReleases(releases, {
      searchTerm: '',
      statusFilter: 'In Testing',
    })

    expect(result).toEqual([matchingRelease])
  })

  it('sorts releases by newest updatedAt first', () => {
    const oldRelease = createRelease({
      id: 'old',
      updatedAt: '2026-05-07T08:00:00.000Z',
    })
    const newRelease = createRelease({
      id: 'new',
      updatedAt: '2026-05-07T09:00:00.000Z',
    })

    const result = filterAndSortReleases([oldRelease, newRelease], {
      searchTerm: '',
      statusFilter: ALL_RELEASE_STATUSES,
    })

    expect(result).toEqual([newRelease, oldRelease])
  })
})
