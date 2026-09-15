import {
  RISK_IMPACTS,
  RISK_LIKELIHOODS,
  RISK_STATUSES,
  type Risk,
} from '../../features/risks/riskTypes'

export const RISK_STORAGE_KEY = 'qa-mission-control:risks:v0.3'

type LoadRisksResult = {
  risks: Risk[]
  error: string | null
}

type SaveRisksResult = {
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

export function parseRisk(value: unknown): Risk | null {
  if (!isRecord(value)) {
    return null
  }

  const {
    id,
    title,
    description,
    impact,
    likelihood,
    status,
    mitigationPlan,
    createdAt,
    updatedAt,
  } = value

  if (
    !isNonEmptyString(id) ||
    !isNonEmptyString(title) ||
    !isNonEmptyString(description) ||
    !isAllowedValue(RISK_IMPACTS, impact) ||
    !isAllowedValue(RISK_LIKELIHOODS, likelihood) ||
    !isAllowedValue(RISK_STATUSES, status) ||
    !isNonEmptyString(mitigationPlan) ||
    !isValidDateString(createdAt) ||
    !isValidDateString(updatedAt)
  ) {
    return null
  }

  return {
    id,
    title,
    description,
    impact,
    likelihood,
    status,
    mitigationPlan,
    createdAt,
    updatedAt,
  }
}

function createLoadError(message: string): LoadRisksResult {
  return {
    risks: [],
    error: message,
  }
}

export function loadRisks(): LoadRisksResult {
  if (typeof window === 'undefined') {
    return {
      risks: [],
      error: null,
    }
  }

  try {
    const rawValue = window.localStorage.getItem(RISK_STORAGE_KEY)

    if (!rawValue) {
      return {
        risks: [],
        error: null,
      }
    }

    const parsedValue: unknown = JSON.parse(rawValue)

    if (!Array.isArray(parsedValue)) {
      return createLoadError(
        'Saved risk data is not in the expected format. Existing browser data was not overwritten.',
      )
    }

    const risks = parsedValue
      .map(parseRisk)
      .filter((risk): risk is Risk => risk !== null)

    if (risks.length !== parsedValue.length) {
      return {
        risks,
        error:
          'Some saved risks could not be loaded. Existing browser data was not overwritten on startup.',
      }
    }

    return {
      risks,
      error: null,
    }
  } catch {
    return createLoadError(
      'Saved risk data could not be read. Existing browser data was not overwritten.',
    )
  }
}

export function saveRisks(risks: Risk[]): SaveRisksResult {
  if (typeof window === 'undefined') {
    return {
      ok: true,
      error: null,
    }
  }

  try {
    window.localStorage.setItem(RISK_STORAGE_KEY, JSON.stringify(risks))

    return {
      ok: true,
      error: null,
    }
  } catch {
    return {
      ok: false,
      error:
        'Risk changes are visible in this session, but they could not be saved to browser storage.',
    }
  }
}
