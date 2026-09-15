import type { ParsedCsv } from './testCaseImportTypes'

const CANDIDATE_DELIMITERS = [',', ';', '\t'] as const

function stripBom(value: string) {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value
}

function countDelimiterOutsideQuotes(line: string, delimiter: string) {
  let count = 0
  let inQuotes = false

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]
    const nextCharacter = line[index + 1]

    if (character === '"' && inQuotes && nextCharacter === '"') {
      index += 1
    } else if (character === '"') {
      inQuotes = !inQuotes
    } else if (character === delimiter && !inQuotes) {
      count += 1
    }
  }

  return count
}

function getFirstLine(text: string) {
  const newlineIndex = text.search(/\r?\n/)

  if (newlineIndex === -1) {
    return text
  }

  return text.slice(0, newlineIndex)
}

export function detectCsvDelimiter(text: string) {
  const firstLine = getFirstLine(stripBom(text))
  const [bestDelimiter] = [...CANDIDATE_DELIMITERS].sort(
    (left, right) =>
      countDelimiterOutsideQuotes(firstLine, right) -
      countDelimiterOutsideQuotes(firstLine, left),
  )

  return bestDelimiter
}

function parseCsvRecords(text: string, delimiter: string) {
  const records: string[][] = []
  const errors: string[] = []
  let currentRecord: string[] = []
  let currentValue = ''
  let inQuotes = false

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    const nextCharacter = text[index + 1]

    if (character === '"' && inQuotes && nextCharacter === '"') {
      currentValue += '"'
      index += 1
    } else if (character === '"') {
      inQuotes = !inQuotes
    } else if (character === delimiter && !inQuotes) {
      currentRecord.push(currentValue)
      currentValue = ''
    } else if ((character === '\n' || character === '\r') && !inQuotes) {
      currentRecord.push(currentValue)
      records.push(currentRecord)
      currentRecord = []
      currentValue = ''

      if (character === '\r' && nextCharacter === '\n') {
        index += 1
      }
    } else {
      currentValue += character
    }
  }

  if (inQuotes) {
    errors.push('The CSV has an unfinished quoted value.')
  }

  currentRecord.push(currentValue)
  records.push(currentRecord)

  return {
    records: records.filter((record) =>
      record.some((value) => value.trim().length > 0),
    ),
    errors,
  }
}

function createUniqueHeaders(headers: string[]) {
  const seenHeaders = new Map<string, number>()

  return headers.map((header, index) => {
    const trimmedHeader = header.trim() || `Column ${index + 1}`
    const seenCount = seenHeaders.get(trimmedHeader) ?? 0

    seenHeaders.set(trimmedHeader, seenCount + 1)

    if (seenCount === 0) {
      return trimmedHeader
    }

    return `${trimmedHeader} ${seenCount + 1}`
  })
}

export function parseCsv(text: string): ParsedCsv {
  const normalizedText = stripBom(text)
  const delimiter = detectCsvDelimiter(normalizedText)
  const { records, errors } = parseCsvRecords(normalizedText, delimiter)

  if (records.length === 0) {
    return {
      headers: [],
      rows: [],
      delimiter,
      errors: ['The CSV file is empty.'],
    }
  }

  const headers = createUniqueHeaders(records[0])
  const rows = records.slice(1).map((record, rowIndex) => ({
    rowNumber: rowIndex + 2,
    values: headers.reduce<Record<string, string>>((values, header, index) => {
      values[header] = record[index]?.trim() ?? ''
      return values
    }, {}),
  }))

  return {
    headers,
    rows,
    delimiter,
    errors,
  }
}
