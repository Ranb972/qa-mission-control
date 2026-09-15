import type { TestCase } from '../test-cases/testCaseTypes'
import type { ImportPreviewRow } from './testCaseImportTypes'

type BuildImportedTestCasesOptions = {
  includeWarnings: boolean
  now: string
  createId: () => string
}

export function buildImportedTestCases(
  rows: ImportPreviewRow[],
  { includeWarnings, now, createId }: BuildImportedTestCasesOptions,
): TestCase[] {
  return rows
    .filter(
      (row) =>
        row.status === 'ready' || (includeWarnings && row.status === 'warning'),
    )
    .map((row) => ({
      id: createId(),
      title: row.values.title,
      area: row.values.area,
      priority: row.values.priority,
      status: 'Not Run',
      type: row.values.type,
      steps: row.values.steps,
      expectedResult: row.values.expectedResult,
      createdAt: now,
      updatedAt: now,
    }))
}

export function mergeImportedTestCases(
  existingTestCases: TestCase[],
  importedTestCases: TestCase[],
) {
  return [...importedTestCases, ...existingTestCases]
}
