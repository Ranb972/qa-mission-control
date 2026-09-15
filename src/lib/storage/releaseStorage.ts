import {
  RELEASE_STATUSES,
  type Release,
} from '../../features/releases/releaseTypes'

export const RELEASE_STORAGE_KEY = 'qa-mission-control:releases:v0.4'

type LoadReleasesResult = {
  releases: Release[]
  error: string | null
}

type SaveReleasesResult = {
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

function isValidDateInput(value: unknown): value is string {
  if (!isNonEmptyString(value) || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false
  }

  const date = new Date(`${value}T00:00:00.000Z`)

  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value)
}

function isAllowedValue<T extends readonly string[]>(
  allowedValues: T,
  value: unknown,
): value is T[number] {
  return isString(value) && allowedValues.includes(value)
}

export function parseRelease(value: unknown): Release | null {
  if (!isRecord(value)) {
    return null
  }

  const {
    id,
    name,
    version,
    targetDate,
    status,
    notes,
    createdAt,
    updatedAt,
  } = value

  if (
    !isNonEmptyString(id) ||
    !isNonEmptyString(name) ||
    !isNonEmptyString(version) ||
    !isValidDateInput(targetDate) ||
    !isAllowedValue(RELEASE_STATUSES, status) ||
    (notes !== undefined && !isString(notes)) ||
    !isValidDateString(createdAt) ||
    !isValidDateString(updatedAt)
  ) {
    return null
  }

  return {
    id,
    name,
    version,
    targetDate,
    status,
    notes: notes ?? '',
    createdAt,
    updatedAt,
  }
}

function createLoadError(message: string): LoadReleasesResult {
  return {
    releases: [],
    error: message,
  }
}

export function loadReleases(): LoadReleasesResult {
  if (typeof window === 'undefined') {
    return {
      releases: [],
      error: null,
    }
  }

  try {
    const rawValue = window.localStorage.getItem(RELEASE_STORAGE_KEY)

    if (!rawValue) {
      return {
        releases: [],
        error: null,
      }
    }

    const parsedValue: unknown = JSON.parse(rawValue)

    if (!Array.isArray(parsedValue)) {
      return createLoadError(
        'Saved release data is not in the expected format. Existing browser data was not overwritten.',
      )
    }

    const releases = parsedValue
      .map(parseRelease)
      .filter((release): release is Release => release !== null)

    if (releases.length !== parsedValue.length) {
      return {
        releases,
        error:
          'Some saved releases could not be loaded. Existing browser data was not overwritten on startup.',
      }
    }

    return {
      releases,
      error: null,
    }
  } catch {
    return createLoadError(
      'Saved release data could not be read. Existing browser data was not overwritten.',
    )
  }
}

export function saveReleases(releases: Release[]): SaveReleasesResult {
  if (typeof window === 'undefined') {
    return {
      ok: true,
      error: null,
    }
  }

  try {
    window.localStorage.setItem(RELEASE_STORAGE_KEY, JSON.stringify(releases))

    return {
      ok: true,
      error: null,
    }
  } catch {
    return {
      ok: false,
      error:
        'Release changes are visible in this session, but they could not be saved to browser storage.',
    }
  }
}
