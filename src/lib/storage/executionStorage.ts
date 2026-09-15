import {
  EXECUTION_RESULTS,
  type Execution,
} from '../../features/executions/executionTypes'

export const EXECUTION_STORAGE_KEY = 'qa-mission-control:executions:v0.5'

type LoadExecutionsResult = {
  executions: Execution[]
  error: string | null
}

type SaveExecutionsResult = {
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

export function parseExecution(value: unknown): Execution | null {
  if (!isRecord(value)) {
    return null
  }

  const {
    id,
    releaseId,
    testCaseId,
    result,
    notes,
    executedAt,
    testDesignFingerprint,
    createdAt,
    updatedAt,
  } = value

  if (
    !isNonEmptyString(id) ||
    !isNonEmptyString(releaseId) ||
    !isNonEmptyString(testCaseId) ||
    !isAllowedValue(EXECUTION_RESULTS, result) ||
    (testDesignFingerprint !== undefined && (typeof testDesignFingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(testDesignFingerprint))) ||
    (notes !== undefined && !isString(notes)) ||
    !isValidDateString(createdAt) ||
    !isValidDateString(updatedAt)
  ) {
    return null
  }

  if (result === 'Not Run' && (executedAt !== undefined || testDesignFingerprint !== undefined)) {
    return null
  }

  const executionBase = {
    id,
    releaseId,
    testCaseId,
    result,
    notes: notes ?? '',
    createdAt,
    updatedAt,
  }

  if (result === 'Not Run') {
    return executionBase
  }

  if (!isValidDateString(executedAt)) {
    return null
  }

  return {
    ...executionBase,
    executedAt,
    ...(testDesignFingerprint ? { testDesignFingerprint } : {}),
  }
}

function createLoadError(message: string): LoadExecutionsResult {
  return {
    executions: [],
    error: message,
  }
}

export function loadExecutions(): LoadExecutionsResult {
  if (typeof window === 'undefined') {
    return {
      executions: [],
      error: null,
    }
  }

  try {
    const rawValue = window.localStorage.getItem(EXECUTION_STORAGE_KEY)

    if (!rawValue) {
      return {
        executions: [],
        error: null,
      }
    }

    const parsedValue: unknown = JSON.parse(rawValue)

    if (!Array.isArray(parsedValue)) {
      return createLoadError(
        'Saved execution data is not in the expected format. Existing browser data was not overwritten.',
      )
    }

    const executions = parsedValue
      .map(parseExecution)
      .filter((execution): execution is Execution => execution !== null)

    if (executions.length !== parsedValue.length) {
      return {
        executions,
        error:
          'Some saved executions could not be loaded. Existing browser data was not overwritten on startup.',
      }
    }

    return {
      executions,
      error: null,
    }
  } catch {
    return createLoadError(
      'Saved execution data could not be read. Existing browser data was not overwritten.',
    )
  }
}

export function saveExecutions(
  executions: Execution[],
): SaveExecutionsResult {
  if (typeof window === 'undefined') {
    return {
      ok: true,
      error: null,
    }
  }

  try {
    window.localStorage.setItem(
      EXECUTION_STORAGE_KEY,
      JSON.stringify(executions),
    )

    return {
      ok: true,
      error: null,
    }
  } catch {
    return {
      ok: false,
      error:
        'Execution changes are visible in this session, but they could not be saved to browser storage.',
    }
  }
}
