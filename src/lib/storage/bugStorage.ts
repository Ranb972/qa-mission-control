import {
  BUG_SEVERITIES,
  BUG_STATUSES,
  type Bug,
} from '../../features/bugs/bugTypes'

export const BUG_STORAGE_KEY = 'qa-mission-control:bugs:v0.2'

type LoadBugsResult = {
  bugs: Bug[]
  error: string | null
}

type SaveBugsResult = {
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

export function parseBug(value: unknown): Bug | null {
  if (!isRecord(value)) {
    return null
  }

  const {
    id,
    title,
    description,
    severity,
    status,
    testCaseId,
    stepsToReproduce,
    expectedBehavior,
    actualBehavior,
    createdAt,
    updatedAt,
  } = value

  if (
    !isNonEmptyString(id) ||
    !isNonEmptyString(title) ||
    !isNonEmptyString(description) ||
    !isAllowedValue(BUG_SEVERITIES, severity) ||
    !isAllowedValue(BUG_STATUSES, status) ||
    (testCaseId !== undefined && !isString(testCaseId)) ||
    !isNonEmptyString(stepsToReproduce) ||
    !isNonEmptyString(expectedBehavior) ||
    !isNonEmptyString(actualBehavior) ||
    !isValidDateString(createdAt) ||
    !isValidDateString(updatedAt)
  ) {
    return null
  }

  const bug: Bug = {
    id,
    title,
    description,
    severity,
    status,
    stepsToReproduce,
    expectedBehavior,
    actualBehavior,
    createdAt,
    updatedAt,
  }

  if (testCaseId) {
    bug.testCaseId = testCaseId
  }

  return bug
}

function createLoadError(message: string): LoadBugsResult {
  return {
    bugs: [],
    error: message,
  }
}

export function loadBugs(): LoadBugsResult {
  if (typeof window === 'undefined') {
    return {
      bugs: [],
      error: null,
    }
  }

  try {
    const rawValue = window.localStorage.getItem(BUG_STORAGE_KEY)

    if (!rawValue) {
      return {
        bugs: [],
        error: null,
      }
    }

    const parsedValue: unknown = JSON.parse(rawValue)

    if (!Array.isArray(parsedValue)) {
      return createLoadError(
        'Saved bug data is not in the expected format. Existing browser data was not overwritten.',
      )
    }

    const bugs = parsedValue
      .map(parseBug)
      .filter((bug): bug is Bug => bug !== null)

    if (bugs.length !== parsedValue.length) {
      return {
        bugs,
        error:
          'Some saved bugs could not be loaded. Existing browser data was not overwritten on startup.',
      }
    }

    return {
      bugs,
      error: null,
    }
  } catch {
    return createLoadError(
      'Saved bug data could not be read. Existing browser data was not overwritten.',
    )
  }
}

export function saveBugs(bugs: Bug[]): SaveBugsResult {
  if (typeof window === 'undefined') {
    return {
      ok: true,
      error: null,
    }
  }

  try {
    window.localStorage.setItem(BUG_STORAGE_KEY, JSON.stringify(bugs))

    return {
      ok: true,
      error: null,
    }
  } catch {
    return {
      ok: false,
      error:
        'Bug changes are visible in this session, but they could not be saved to browser storage.',
    }
  }
}
