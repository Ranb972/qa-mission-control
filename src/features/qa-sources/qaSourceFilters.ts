import type {
  QaSource,
  QaSourceStatus,
  QaSourceType,
} from './qaSourceTypes'

export const ALL_QA_SOURCE_TYPES = 'All source types' as const
export const ALL_QA_SOURCE_STATUSES = 'All statuses' as const

export type QaSourceTypeFilter =
  | QaSourceType
  | typeof ALL_QA_SOURCE_TYPES

export type QaSourceStatusFilter =
  | QaSourceStatus
  | typeof ALL_QA_SOURCE_STATUSES

type QaSourceFilterOptions = {
  searchTerm: string
  sourceTypeFilter: QaSourceTypeFilter
  statusFilter: QaSourceStatusFilter
}

function searchableText(source: QaSource) {
  return `${source.title} ${source.content} ${source.notes}`.toLowerCase()
}

export function filterAndSortQaSources(
  sources: QaSource[],
  { searchTerm, sourceTypeFilter, statusFilter }: QaSourceFilterOptions,
) {
  const normalizedSearch = searchTerm.trim().toLowerCase()

  return [...sources]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .filter((source) => {
      const matchesSearch =
        normalizedSearch === '' ||
        searchableText(source).includes(normalizedSearch)
      const matchesType =
        sourceTypeFilter === ALL_QA_SOURCE_TYPES ||
        source.sourceType === sourceTypeFilter
      const matchesStatus =
        statusFilter === ALL_QA_SOURCE_STATUSES ||
        source.status === statusFilter

      return matchesSearch && matchesType && matchesStatus
    })
}
