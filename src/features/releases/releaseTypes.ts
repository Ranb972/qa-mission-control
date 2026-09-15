export const RELEASE_STATUSES = [
  'Planning',
  'In Testing',
  'Blocked',
  'Ready',
  'Released',
] as const

export type ReleaseStatus = (typeof RELEASE_STATUSES)[number]

export type Release = {
  id: string
  name: string
  version: string
  targetDate: string
  status: ReleaseStatus
  notes: string
  createdAt: string
  updatedAt: string
}

export type ReleaseFormValues = Omit<Release, 'id' | 'createdAt' | 'updatedAt'>

export type ReleaseFormErrors = Partial<Record<keyof ReleaseFormValues, string>>

export const EMPTY_RELEASE_FORM_VALUES: ReleaseFormValues = {
  name: '',
  version: '',
  targetDate: '',
  status: 'Planning',
  notes: '',
}
