import {
  TEST_CASE_PRIORITIES,
  TEST_CASE_STATUSES,
  TEST_CASE_TYPES,
  type TestCase,
  type TestCaseStep,
} from '../../features/test-cases/testCaseTypes'

export const TEST_CASE_STORAGE_KEY = 'qa-mission-control:test-cases:v0.1'

type LoadTestCasesResult = {
  testCases: TestCase[]
  error: string | null
}

type SaveTestCasesResult = {
  ok: boolean
  error: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isAllowedValue<T extends readonly string[]>(
  allowedValues: T,
  value: unknown,
): value is T[number] {
  return isString(value) && allowedValues.includes(value)
}

function parseStructuredStep(value: unknown): TestCaseStep | null {
  if (!isRecord(value)) {
    return null
  }

  const { id, action, expectedResult } = value

  if (
    !isString(id) ||
    !isString(action) ||
    !isString(expectedResult) ||
    action.trim() === '' ||
    expectedResult.trim() === ''
  ) {
    return null
  }

  return {
    id,
    action,
    expectedResult,
  }
}

function parseStructuredSteps(value: unknown) {
  if (value === undefined) {
    return {
      structuredSteps: undefined,
      hasInvalidStructuredSteps: false,
    }
  }

  if (!Array.isArray(value)) {
    return {
      structuredSteps: undefined,
      hasInvalidStructuredSteps: true,
    }
  }

  const structuredSteps = value
    .map(parseStructuredStep)
    .filter((step): step is TestCaseStep => step !== null)

  return {
    structuredSteps:
      structuredSteps.length > 0 ? structuredSteps : undefined,
    hasInvalidStructuredSteps: structuredSteps.length !== value.length,
  }
}

export function parseTestCase(value: unknown) {
  if (!isRecord(value)) {
    return null
  }

  const {
    id,
    title,
    area,
    priority,
    status,
    type,
    steps,
    expectedResult,
    preconditions,
    structuredSteps,
    qaSourceId,
    createdAt,
    updatedAt,
  } = value

  if (
    !isString(id) ||
    !isString(title) ||
    !isString(area) ||
    !isAllowedValue(TEST_CASE_PRIORITIES, priority) ||
    !isAllowedValue(TEST_CASE_STATUSES, status) ||
    !isAllowedValue(TEST_CASE_TYPES, type) ||
    !isString(steps) ||
    !isString(expectedResult) ||
    !isString(createdAt) ||
    !isString(updatedAt)
  ) {
    return null
  }

  const parsedStructuredSteps = parseStructuredSteps(structuredSteps)

  return {
    testCase: {
      id,
      title,
      area,
      priority,
      status,
      type,
      steps,
      expectedResult,
      preconditions: isString(preconditions) ? preconditions : undefined,
      structuredSteps: parsedStructuredSteps.structuredSteps,
      qaSourceId: isString(qaSourceId) ? qaSourceId : undefined,
      createdAt,
      updatedAt,
    },
    hasInvalidStructuredSteps:
      parsedStructuredSteps.hasInvalidStructuredSteps ||
      (preconditions !== undefined && !isString(preconditions)) ||
      (qaSourceId !== undefined && !isString(qaSourceId)),
  }
}

function createLoadError(message: string): LoadTestCasesResult {
  return {
    testCases: [],
    error: message,
  }
}

export function loadTestCases(): LoadTestCasesResult {
  if (typeof window === 'undefined') {
    return {
      testCases: [],
      error: null,
    }
  }

  try {
    const rawValue = window.localStorage.getItem(TEST_CASE_STORAGE_KEY)

    if (!rawValue) {
      return {
        testCases: [],
        error: null,
      }
    }

    const parsedValue: unknown = JSON.parse(rawValue)

    if (!Array.isArray(parsedValue)) {
      return createLoadError(
        'Saved test case data is not in the expected format. Existing browser data was not overwritten.',
      )
    }

    const parsedTestCases = parsedValue.map(parseTestCase)
    const testCases = parsedTestCases
      .filter((result): result is NonNullable<typeof result> => result !== null)
      .map((result) => result.testCase)
    const hasInvalidStructuredSteps = parsedTestCases.some(
      (result) => result?.hasInvalidStructuredSteps,
    )

    if (testCases.length !== parsedValue.length || hasInvalidStructuredSteps) {
      return {
        testCases,
        error:
          'Some saved test cases could not be loaded. Existing browser data was not overwritten on startup.',
      }
    }

    return {
      testCases,
      error: null,
    }
  } catch {
    return createLoadError(
      'Saved test case data could not be read. Existing browser data was not overwritten.',
    )
  }
}

export function saveTestCases(testCases: TestCase[]): SaveTestCasesResult {
  if (typeof window === 'undefined') {
    return {
      ok: true,
      error: null,
    }
  }

  try {
    window.localStorage.setItem(TEST_CASE_STORAGE_KEY, JSON.stringify(testCases))

    return {
      ok: true,
      error: null,
    }
  } catch {
    return {
      ok: false,
      error:
        'Changes are visible in this session, but they could not be saved to browser storage.',
    }
  }
}
