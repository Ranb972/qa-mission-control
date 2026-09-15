import {
  TEST_SUITE_TYPES,
  type TestSuite,
} from '../../features/test-suites/testSuiteTypes'

export const TEST_SUITE_STORAGE_KEY = 'qa-mission-control:test-suites:v0.9'

type LoadTestSuitesResult = {
  testSuites: TestSuite[]
  error: string | null
}

type SaveTestSuitesResult = {
  ok: boolean
  error: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isNonEmptyString(value: unknown): value is string {
  return isString(value) && value.trim().length > 0
}

function isValidDateString(value: unknown): value is string {
  return isNonEmptyString(value) && !Number.isNaN(Date.parse(value))
}

function isAllowedValue<T extends readonly string[]>(
  allowedValues: T,
  value: unknown,
): value is T[number] {
  return isString(value) && allowedValues.includes(value)
}

function parseTestCaseIds(value: unknown) {
  if (!Array.isArray(value)) {
    return null
  }

  if (!value.every(isNonEmptyString)) {
    return null
  }

  return value
}

export function parseTestSuite(value: unknown): TestSuite | null {
  if (!isRecord(value)) {
    return null
  }

  const {
    id,
    name,
    description,
    type,
    testCaseIds,
    createdAt,
    updatedAt,
  } = value
  const parsedTestCaseIds = parseTestCaseIds(testCaseIds)

  if (
    !isNonEmptyString(id) ||
    !isNonEmptyString(name) ||
    !isAllowedValue(TEST_SUITE_TYPES, type) ||
    (description !== undefined && !isString(description)) ||
    !parsedTestCaseIds ||
    !isValidDateString(createdAt) ||
    !isValidDateString(updatedAt)
  ) {
    return null
  }

  return {
    id,
    name,
    description: description ?? '',
    type,
    testCaseIds: parsedTestCaseIds,
    createdAt,
    updatedAt,
  }
}

function createLoadError(message: string): LoadTestSuitesResult {
  return {
    testSuites: [],
    error: message,
  }
}

export function loadTestSuites(): LoadTestSuitesResult {
  if (typeof window === 'undefined') {
    return {
      testSuites: [],
      error: null,
    }
  }

  try {
    const rawValue = window.localStorage.getItem(TEST_SUITE_STORAGE_KEY)

    if (!rawValue) {
      return {
        testSuites: [],
        error: null,
      }
    }

    const parsedValue: unknown = JSON.parse(rawValue)

    if (!Array.isArray(parsedValue)) {
      return createLoadError(
        'Saved test suite data is not in the expected format. Existing browser data was not overwritten.',
      )
    }

    const testSuites = parsedValue
      .map(parseTestSuite)
      .filter((suite): suite is TestSuite => suite !== null)

    if (testSuites.length !== parsedValue.length) {
      return {
        testSuites,
        error:
          'Some saved test suites could not be loaded. Existing browser data was not overwritten on startup.',
      }
    }

    return {
      testSuites,
      error: null,
    }
  } catch {
    return createLoadError(
      'Saved test suite data could not be read. Existing browser data was not overwritten.',
    )
  }
}

export function saveTestSuites(
  testSuites: TestSuite[],
): SaveTestSuitesResult {
  if (typeof window === 'undefined') {
    return {
      ok: true,
      error: null,
    }
  }

  try {
    window.localStorage.setItem(
      TEST_SUITE_STORAGE_KEY,
      JSON.stringify(testSuites),
    )

    return {
      ok: true,
      error: null,
    }
  } catch {
    return {
      ok: false,
      error:
        'Test suite changes are visible in this session, but they could not be saved to browser storage.',
    }
  }
}
