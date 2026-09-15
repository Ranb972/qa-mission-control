import type { Bug, BugSeverity, BugStatus } from './bugTypes'

export const ALL_BUG_STATUSES = 'All statuses' as const
export const ALL_BUG_SEVERITIES = 'All severities' as const

export type BugStatusFilter = BugStatus | typeof ALL_BUG_STATUSES
export type BugSeverityFilter = BugSeverity | typeof ALL_BUG_SEVERITIES

type BugFilterOptions = {
  searchTerm: string
  statusFilter: BugStatusFilter
  severityFilter: BugSeverityFilter
}

export function filterAndSortBugs(
  bugs: Bug[],
  { searchTerm, statusFilter, severityFilter }: BugFilterOptions,
) {
  const normalizedSearch = searchTerm.trim().toLowerCase()

  return [...bugs]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .filter((bug) => {
      const matchesSearch = bug.title.toLowerCase().includes(normalizedSearch)
      const matchesStatus =
        statusFilter === ALL_BUG_STATUSES || bug.status === statusFilter
      const matchesSeverity =
        severityFilter === ALL_BUG_SEVERITIES || bug.severity === severityFilter

      return matchesSearch && matchesStatus && matchesSeverity
    })
}
