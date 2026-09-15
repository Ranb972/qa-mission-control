export const TEST_CASE_PRIORITIES = [
  'Low',
  'Medium',
  'High',
  'Critical',
] as const

export const TEST_CASE_STATUSES = [
  'Not Run',
  'Passed',
  'Failed',
  'Blocked',
] as const

export const TEST_CASE_TYPES = [
  'Functional',
  'UI',
  'Regression',
  'Smoke',
  'Edge Case',
] as const

export type TestCasePriority = (typeof TEST_CASE_PRIORITIES)[number]
export type TestCaseStatus = (typeof TEST_CASE_STATUSES)[number]
export type TestCaseType = (typeof TEST_CASE_TYPES)[number]

export type TestCaseStep = {
  id: string
  action: string
  expectedResult: string
}

export type TestCase = {
  id: string
  title: string
  area: string
  priority: TestCasePriority
  status: TestCaseStatus
  type: TestCaseType
  steps: string
  expectedResult: string
  preconditions?: string
  structuredSteps?: TestCaseStep[]
  qaSourceId?: string
  createdAt: string
  updatedAt: string
}

export type TestCaseFormValues = {
  title: string
  area: string
  priority: TestCasePriority
  status: TestCaseStatus
  type: TestCaseType
  steps: string
  expectedResult: string
  preconditions: string
  structuredSteps: TestCaseStep[]
}

export type TestCaseStepFormErrors = Partial<
  Record<'action' | 'expectedResult', string>
>

export type TestCaseFormErrors = Partial<Record<'title' | 'area', string>> & {
  structuredSteps?: Record<string, TestCaseStepFormErrors>
}

export const EMPTY_TEST_CASE_FORM_VALUES: TestCaseFormValues = {
  title: '',
  area: '',
  priority: 'Medium',
  status: 'Not Run',
  type: 'Functional',
  steps: '',
  expectedResult: '',
  preconditions: '',
  structuredSteps: [
    {
      id: 'step-1',
      action: '',
      expectedResult: '',
    },
  ],
}
