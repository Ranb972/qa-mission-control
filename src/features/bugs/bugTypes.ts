export const BUG_SEVERITIES = [
  'Low',
  'Medium',
  'High',
  'Critical',
] as const

export const BUG_STATUSES = [
  'Open',
  'In Progress',
  'Fixed',
  'Retest',
  'Closed',
] as const

export type BugSeverity = (typeof BUG_SEVERITIES)[number]
export type BugStatus = (typeof BUG_STATUSES)[number]

export type Bug = {
  id: string
  title: string
  description: string
  severity: BugSeverity
  status: BugStatus
  testCaseId?: string
  stepsToReproduce: string
  expectedBehavior: string
  actualBehavior: string
  createdAt: string
  updatedAt: string
}

export type BugFormValues = Omit<Bug, 'id' | 'createdAt' | 'updatedAt'>

export type BugFormErrors = Partial<Record<keyof BugFormValues, string>>

export const EMPTY_BUG_FORM_VALUES: BugFormValues = {
  title: '',
  description: '',
  severity: 'Medium',
  status: 'Open',
  testCaseId: undefined,
  stepsToReproduce: '',
  expectedBehavior: '',
  actualBehavior: '',
}
