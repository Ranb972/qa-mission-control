import {
  TEST_CASE_PRIORITIES,
  TEST_CASE_TYPES,
  type TestCasePriority,
  type TestCaseType,
} from '../test-cases/testCaseTypes'
import { findMappingConflicts } from './columnDetection'
import {
  IMPORT_FIELD_LABELS,
  REQUIRED_IMPORT_FIELDS,
  type CsvRow,
  type ImportColumnMapping,
  type ImportField,
  type ImportPreviewRow,
  type ImportRowMessage,
} from './testCaseImportTypes'

function readMappedValue(row: CsvRow, mapping: ImportColumnMapping, field: ImportField) {
  const mappedColumn = mapping[field]

  if (!mappedColumn) {
    return ''
  }

  return row.values[mappedColumn]?.trim() ?? ''
}

function getAllowedValue<T extends readonly string[]>(
  allowedValues: T,
  value: string,
): T[number] | null {
  const normalizedValue = value.trim().toLocaleLowerCase()

  return (
    allowedValues.find(
      (allowedValue) => allowedValue.toLocaleLowerCase() === normalizedValue,
    ) ?? null
  )
}

function getPriority(value: string): TestCasePriority | null {
  return getAllowedValue(TEST_CASE_PRIORITIES, value)
}

function getType(value: string): TestCaseType | null {
  return getAllowedValue(TEST_CASE_TYPES, value)
}

function getMappingErrorMessages(mapping: ImportColumnMapping) {
  const messages: string[] = []

  REQUIRED_IMPORT_FIELDS.forEach((field) => {
    if (!mapping[field]) {
      messages.push(`${IMPORT_FIELD_LABELS[field]} column is not mapped.`)
    }
  })

  findMappingConflicts(mapping).forEach((conflict) => {
    const fieldLabels = conflict.fields
      .map((field) => IMPORT_FIELD_LABELS[field])
      .join(', ')

    messages.push(
      `"${conflict.header}" is mapped to multiple fields: ${fieldLabels}.`,
    )
  })

  return messages
}

function createMessage(type: ImportRowMessage['type'], text: string) {
  return { type, text }
}

export function classifyImportRows(
  rows: CsvRow[],
  mapping: ImportColumnMapping,
): ImportPreviewRow[] {
  const mappingErrorMessages = getMappingErrorMessages(mapping)

  return rows.map((row) => {
    const messages: ImportRowMessage[] = mappingErrorMessages.map((message) =>
      createMessage('error', message),
    )
    const title = readMappedValue(row, mapping, 'title')
    const area = readMappedValue(row, mapping, 'area')
    const priorityValue = readMappedValue(row, mapping, 'priority')
    const typeValue = readMappedValue(row, mapping, 'type')
    const steps = readMappedValue(row, mapping, 'steps')
    const expectedResult = readMappedValue(row, mapping, 'expectedResult')
    const priority = priorityValue ? getPriority(priorityValue) : 'Medium'
    const type = typeValue ? getType(typeValue) : 'Functional'

    if (!title) {
      messages.push(createMessage('error', 'Title is missing. This row will not be imported.'))
    }

    if (!steps) {
      messages.push(createMessage('error', 'Steps are missing. This row will not be imported.'))
    }

    if (!expectedResult) {
      messages.push(
        createMessage(
          'error',
          'Expected Result is missing. This row will not be imported.',
        ),
      )
    }

    if (priorityValue && !priority) {
      messages.push(
        createMessage(
          'error',
          `Priority "${priorityValue}" is not supported. Choose Low, Medium, High, or Critical.`,
        ),
      )
    }

    if (typeValue && !type) {
      messages.push(
        createMessage(
          'error',
          `Type "${typeValue}" is not supported. Choose Functional, UI, Regression, Smoke, or Edge Case.`,
        ),
      )
    }

    if (!area) {
      messages.push(createMessage('warning', 'Area is missing. Will use General.'))
    }

    if (!priorityValue) {
      messages.push(
        createMessage('warning', 'Priority is missing. Will use Medium.'),
      )
    }

    if (!typeValue) {
      messages.push(createMessage('warning', 'Type is missing. Will use Functional.'))
    }

    const hasErrors = messages.some((message) => message.type === 'error')
    const hasWarnings = messages.some((message) => message.type === 'warning')

    return {
      rowNumber: row.rowNumber,
      status: hasErrors ? 'blocked' : hasWarnings ? 'warning' : 'ready',
      values: {
        title,
        area: area || 'General',
        priority: priority ?? 'Medium',
        type: type ?? 'Functional',
        steps,
        expectedResult,
      },
      messages,
    }
  })
}

export function getImportCounts(rows: ImportPreviewRow[]) {
  return {
    ready: rows.filter((row) => row.status === 'ready').length,
    warning: rows.filter((row) => row.status === 'warning').length,
    blocked: rows.filter((row) => row.status === 'blocked').length,
  }
}
