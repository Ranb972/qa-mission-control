import type {
  TestCasePriority,
  TestCaseType,
} from '../test-cases/testCaseTypes'

export const IMPORT_FIELDS = [
  'title',
  'area',
  'priority',
  'type',
  'steps',
  'expectedResult',
] as const

export type ImportField = (typeof IMPORT_FIELDS)[number]

export type ImportColumnMapping = Partial<Record<ImportField, string>>

export type MappingConfidence =
  | 'High confidence'
  | 'Medium confidence'
  | 'Needs review'

export type DetectedColumnMapping = {
  header: string
  confidence: MappingConfidence
}

export type CsvRow = {
  rowNumber: number
  values: Record<string, string>
}

export type ParsedCsv = {
  headers: string[]
  rows: CsvRow[]
  delimiter: string
  errors: string[]
}

export type ImportRowStatus = 'ready' | 'warning' | 'blocked'

export type ImportRowMessage = {
  type: 'warning' | 'error'
  text: string
}

export type ImportPreviewRow = {
  rowNumber: number
  status: ImportRowStatus
  values: {
    title: string
    area: string
    priority: TestCasePriority
    type: TestCaseType
    steps: string
    expectedResult: string
  }
  messages: ImportRowMessage[]
}

export const IMPORT_FIELD_LABELS: Record<ImportField, string> = {
  title: 'Title',
  area: 'Area',
  priority: 'Priority',
  type: 'Type',
  steps: 'Steps',
  expectedResult: 'Expected Result',
}

export const REQUIRED_IMPORT_FIELDS: ImportField[] = [
  'title',
  'steps',
  'expectedResult',
]
