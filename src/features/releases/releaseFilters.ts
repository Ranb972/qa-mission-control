import type { Release, ReleaseStatus } from './releaseTypes'

export const ALL_RELEASE_STATUSES = 'All statuses' as const

export type ReleaseStatusFilter =
  | ReleaseStatus
  | typeof ALL_RELEASE_STATUSES

type ReleaseFilterOptions = {
  searchTerm: string
  statusFilter: ReleaseStatusFilter
}

export function filterAndSortReleases(
  releases: Release[],
  { searchTerm, statusFilter }: ReleaseFilterOptions,
) {
  const normalizedSearch = searchTerm.trim().toLowerCase()

  return [...releases]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .filter((release) => {
      const matchesSearch =
        release.name.toLowerCase().includes(normalizedSearch) ||
        release.version.toLowerCase().includes(normalizedSearch)
      const matchesStatus =
        statusFilter === ALL_RELEASE_STATUSES ||
        release.status === statusFilter

      return matchesSearch && matchesStatus
    })
}
