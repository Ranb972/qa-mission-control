import type { DocumentImport } from '../document-intelligence/documentImport'

export const QA_SOURCE_TYPES = [
  'Requirement',
  'User Story',
  'PRD',
  'LLD',
  'Notes',
  'Other',
] as const

export type QaSourceType = (typeof QA_SOURCE_TYPES)[number]

export const QA_SOURCE_STATUSES = [
  'Draft',
  'Reviewed',
  'Ready for test design',
] as const

export type QaSourceStatus = (typeof QA_SOURCE_STATUSES)[number]

export type QaSource = {
  id: string
  title: string
  sourceType: QaSourceType
  status: QaSourceStatus
  content: string
  notes: string
  createdAt: string
  updatedAt: string
  documentImport?: DocumentImport
}

export type QaSourceFormValues = {
  title: string
  sourceType: QaSourceType
  status: QaSourceStatus
  content: string
  notes: string
  documentImport?: DocumentImport
}

export type QaSourceFormErrors = Partial<
  Record<'title' | 'content', string>
>

export const EMPTY_QA_SOURCE_FORM_VALUES: QaSourceFormValues = {
  title: '',
  sourceType: 'Requirement',
  status: 'Draft',
  content: '',
  notes: '',
}
