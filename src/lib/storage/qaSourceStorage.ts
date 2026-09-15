import {
  QA_SOURCE_STATUSES,
  QA_SOURCE_TYPES,
  type QaSource,
} from '../../features/qa-sources/qaSourceTypes'
import { parseDocumentImport } from '../../features/document-intelligence/documentImport'

export const QA_SOURCE_STORAGE_KEY = 'qa-mission-control:qa-sources:v0.12'

type LoadQaSourcesResult = {
  qaSources: QaSource[]
  error: string | null
}

type SaveQaSourcesResult = {
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
  if (!isNonEmptyString(value)) {
    return false
  }

  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    return false
  }

  const parsedDate = new Date(value)

  return !Number.isNaN(parsedDate.getTime()) && parsedDate.toISOString() === value
}

function isAllowedValue<T extends readonly string[]>(
  allowedValues: T,
  value: unknown,
): value is T[number] {
  return isString(value) && allowedValues.includes(value)
}

export function parseQaSource(value: unknown): QaSource | null {
  if (!isRecord(value)) {
    return null
  }

  const {
    id,
    title,
    sourceType,
    status,
    content,
    notes,
    createdAt,
    updatedAt,
  } = value

  if (
    !isNonEmptyString(id) ||
    !isNonEmptyString(title) ||
    !isAllowedValue(QA_SOURCE_TYPES, sourceType) ||
    !isAllowedValue(QA_SOURCE_STATUSES, status) ||
    !isNonEmptyString(content) ||
    (notes !== undefined && !isString(notes)) ||
    !isValidDateString(createdAt) ||
    !isValidDateString(updatedAt)
  ) {
    return null
  }

  const documentImport = value.documentImport === undefined ? undefined : parseDocumentImport(value.documentImport, content.length, content)
  if (documentImport === null) return null

  return {
    id,
    title,
    sourceType,
    status,
    content,
    notes: notes ?? '',
    createdAt,
    updatedAt,
    ...(documentImport ? { documentImport } : {}),
  }
}

function createLoadError(message: string): LoadQaSourcesResult {
  return {
    qaSources: [],
    error: message,
  }
}

export function loadQaSources(): LoadQaSourcesResult {
  if (typeof window === 'undefined') {
    return {
      qaSources: [],
      error: null,
    }
  }

  try {
    const rawValue = window.localStorage.getItem(QA_SOURCE_STORAGE_KEY)

    if (!rawValue) {
      return {
        qaSources: [],
        error: null,
      }
    }

    const parsedValue: unknown = JSON.parse(rawValue)

    if (!Array.isArray(parsedValue)) {
      return createLoadError(
        'Saved QA source data is not in the expected format. Existing browser data was not overwritten.',
      )
    }

    const qaSources = parsedValue
      .map(parseQaSource)
      .filter((source): source is QaSource => source !== null)

    if (qaSources.length !== parsedValue.length) {
      return {
        qaSources,
        error:
          'Some saved QA sources could not be loaded. Review the loaded sources before making changes because future edits may replace the saved browser data.',
      }
    }

    return {
      qaSources,
      error: null,
    }
  } catch {
    return createLoadError(
      'Saved QA source data could not be read. Existing browser data was not overwritten.',
    )
  }
}

export function saveQaSources(qaSources: QaSource[]): SaveQaSourcesResult {
  if (typeof window === 'undefined') {
    return {
      ok: true,
      error: null,
    }
  }

  try {
    window.localStorage.setItem(
      QA_SOURCE_STORAGE_KEY,
      JSON.stringify(qaSources),
    )

    return {
      ok: true,
      error: null,
    }
  } catch {
    return {
      ok: false,
      error:
        'QA source changes are visible in this session, but they could not be saved to browser storage.',
    }
  }
}
