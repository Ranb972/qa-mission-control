import {
  IMPORT_FIELDS,
  type DetectedColumnMapping,
  type ImportColumnMapping,
  type ImportField,
  type MappingConfidence,
} from './testCaseImportTypes'

const FIELD_SYNONYMS: Record<ImportField, string[]> = {
  title: [
    'Title',
    'Test Name',
    'Test Case',
    'Scenario',
    'שם בדיקה',
    'תסריט',
    'מה בודקים',
    'שם התסריט',
  ],
  area: [
    'Area',
    'Module',
    'Feature',
    'Component',
    'מודול',
    'רכיב',
    'מסך',
    'אזור במערכת',
    'מסך / רכיב',
  ],
  steps: [
    'Steps',
    'Test Steps',
    'Procedure',
    'צעדים',
    'פעולות לביצוע',
    'שלבי בדיקה',
  ],
  expectedResult: [
    'Expected Result',
    'Expected',
    'Expected Outcome',
    'תוצאה צפויה',
    'תוצאות צפויות',
    'מצופה',
  ],
  priority: [
    'Priority',
    'Severity',
    'עדיפות',
    'חשיבות',
    'חומרה',
  ],
  type: [
    'Type',
    'Test Type',
    'Category',
    'סוג בדיקה',
    'קטגוריה',
  ],
}

function normalizeColumnName(value: string) {
  return value
    .trim()
    .toLocaleLowerCase()
    .replace(/["'`]/g, '')
    .replace(/[()[\]{}:;,.\\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function compactColumnName(value: string) {
  return normalizeColumnName(value).replace(/\s+/g, '')
}

function getConfidence(
  header: string,
  synonym: string,
): MappingConfidence | null {
  const normalizedHeader = normalizeColumnName(header)
  const normalizedSynonym = normalizeColumnName(synonym)
  const compactHeader = compactColumnName(header)
  const compactSynonym = compactColumnName(synonym)

  if (
    normalizedHeader === normalizedSynonym ||
    compactHeader === compactSynonym
  ) {
    return 'High confidence'
  }

  if (
    normalizedHeader.includes(normalizedSynonym) ||
    normalizedSynonym.includes(normalizedHeader) ||
    compactHeader.includes(compactSynonym) ||
    compactSynonym.includes(compactHeader)
  ) {
    return 'Medium confidence'
  }

  return null
}

function compareConfidence(
  left: MappingConfidence,
  right: MappingConfidence,
) {
  const confidenceScore: Record<MappingConfidence, number> = {
    'High confidence': 2,
    'Medium confidence': 1,
    'Needs review': 0,
  }

  return confidenceScore[left] - confidenceScore[right]
}

export function detectColumnMapping(headers: string[]) {
  return IMPORT_FIELDS.reduce<Partial<Record<ImportField, DetectedColumnMapping>>>(
    (detectedMapping, field) => {
      const candidates = headers
        .map((header) => {
          const confidence =
            FIELD_SYNONYMS[field]
              .map((synonym) => getConfidence(header, synonym))
              .filter(
                (value): value is MappingConfidence => value !== null,
              )
              .sort(compareConfidence)
              .at(-1) ?? null

          return confidence ? { header, confidence } : null
        })
        .filter(
          (candidate): candidate is DetectedColumnMapping =>
            candidate !== null,
        )
        .sort((left, right) =>
          compareConfidence(left.confidence, right.confidence),
        )

      const bestCandidate = candidates.at(-1)

      if (bestCandidate) {
        detectedMapping[field] = bestCandidate
      }

      return detectedMapping
    },
    {},
  )
}

export function createInitialColumnMapping(
  detectedMapping: Partial<Record<ImportField, DetectedColumnMapping>>,
): ImportColumnMapping {
  return IMPORT_FIELDS.reduce<ImportColumnMapping>((mapping, field) => {
    if (detectedMapping[field]) {
      mapping[field] = detectedMapping[field].header
    }

    return mapping
  }, {})
}

export function findMappingConflicts(mapping: ImportColumnMapping) {
  const usedColumns = new Map<string, ImportField[]>()

  IMPORT_FIELDS.forEach((field) => {
    const header = mapping[field]

    if (!header) {
      return
    }

    usedColumns.set(header, [...(usedColumns.get(header) ?? []), field])
  })

  return [...usedColumns.entries()]
    .filter(([, fields]) => fields.length > 1)
    .map(([header, fields]) => ({
      header,
      fields,
    }))
}
