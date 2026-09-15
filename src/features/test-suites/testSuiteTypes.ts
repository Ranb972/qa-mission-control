export const TEST_SUITE_TYPES = [
  'Smoke',
  'Regression',
  'Sanity',
  'Feature',
  'Custom',
] as const

export type TestSuiteType = (typeof TEST_SUITE_TYPES)[number]

export type TestSuite = {
  id: string
  name: string
  description: string
  type: TestSuiteType
  testCaseIds: string[]
  createdAt: string
  updatedAt: string
}

export type TestSuiteFormValues = {
  name: string
  description: string
  type: TestSuiteType
  testCaseIds: string[]
}

export type TestSuiteFormErrors = Partial<Record<'name', string>>

export const EMPTY_TEST_SUITE_FORM_VALUES: TestSuiteFormValues = {
  name: '',
  description: '',
  type: 'Smoke',
  testCaseIds: [],
}
