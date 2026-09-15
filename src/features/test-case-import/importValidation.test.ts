import { describe, expect, it } from 'vitest'
import { createTestCase } from '../../test/testCaseFactory'
import { buildImportedTestCases, mergeImportedTestCases } from './importConversion'
import { classifyImportRows } from './importValidation'
import type { CsvRow, ImportColumnMapping } from './testCaseImportTypes'

const mapping: ImportColumnMapping = {
  title: 'Title',
  area: 'Area',
  priority: 'Priority',
  type: 'Type',
  steps: 'Steps',
  expectedResult: 'Expected Result',
}

function createRow(rowNumber: number, values: Record<string, string>): CsvRow {
  return { rowNumber, values }
}

describe('test case import validation', () => {
  it('classifies complete rows as ready', () => {
    const rows = classifyImportRows(
      [
        createRow(2, {
          Title: 'Login accepts valid credentials',
          Area: 'Authentication',
          Priority: 'High',
          Type: 'Functional',
          Steps: 'Submit valid credentials.',
          'Expected Result': 'User lands on dashboard.',
        }),
      ],
      mapping,
    )

    expect(rows[0]).toMatchObject({
      status: 'ready',
      values: {
        title: 'Login accepts valid credentials',
        area: 'Authentication',
        priority: 'High',
        type: 'Functional',
      },
      messages: [],
    })
  })

  it('classifies missing optional values as warnings with defaults', () => {
    const rows = classifyImportRows(
      [
        createRow(2, {
          Title: 'Profile update works',
          Area: '',
          Priority: '',
          Type: '',
          Steps: 'Save profile changes.',
          'Expected Result': 'Profile updates successfully.',
        }),
      ],
      mapping,
    )

    expect(rows[0]).toMatchObject({
      status: 'warning',
      values: {
        area: 'General',
        priority: 'Medium',
        type: 'Functional',
      },
    })
    expect(rows[0].messages.map((message) => message.text)).toEqual([
      'Area is missing. Will use General.',
      'Priority is missing. Will use Medium.',
      'Type is missing. Will use Functional.',
    ])
  })

  it('blocks missing required values and invalid enum values', () => {
    const rows = classifyImportRows(
      [
        createRow(2, {
          Title: '',
          Area: 'Checkout',
          Priority: 'Urgent',
          Type: 'Exploratory',
          Steps: '',
          'Expected Result': '',
        }),
      ],
      mapping,
    )

    expect(rows[0].status).toBe('blocked')
    expect(rows[0].messages.map((message) => message.text)).toEqual([
      'Title is missing. This row will not be imported.',
      'Steps are missing. This row will not be imported.',
      'Expected Result is missing. This row will not be imported.',
      'Priority "Urgent" is not supported. Choose Low, Medium, High, or Critical.',
      'Type "Exploratory" is not supported. Choose Functional, UI, Regression, Smoke, or Edge Case.',
    ])
  })

  it('blocks rows when required columns are not mapped', () => {
    const rows = classifyImportRows(
      [createRow(2, { Title: 'Login', Steps: 'Open', Expected: 'Success' })],
      { title: 'Title' },
    )

    expect(rows[0].status).toBe('blocked')
    expect(rows[0].messages.map((message) => message.text)).toContain(
      'Steps column is not mapped.',
    )
    expect(rows[0].messages.map((message) => message.text)).toContain(
      'Expected Result column is not mapped.',
    )
  })

  it('blocks rows when one column is mapped to multiple fields', () => {
    const rows = classifyImportRows(
      [
        createRow(2, {
          Scenario: 'Login',
          Steps: 'Open',
          Expected: 'Success',
        }),
      ],
      {
        title: 'Scenario',
        steps: 'Scenario',
        expectedResult: 'Expected',
      },
    )

    expect(rows[0].status).toBe('blocked')
    expect(rows[0].messages.map((message) => message.text)).toContain(
      '"Scenario" is mapped to multiple fields: Title, Steps.',
    )
  })

  it('converts importable rows to TestCase objects and preserves existing cases', () => {
    const previewRows = classifyImportRows(
      [
        createRow(2, {
          Title: 'Login accepts valid credentials',
          Area: 'Authentication',
          Priority: 'Critical',
          Type: 'Smoke',
          Steps: 'Submit credentials.',
          'Expected Result': 'Dashboard opens.',
        }),
        createRow(3, {
          Title: 'Profile update works',
          Area: '',
          Priority: '',
          Type: '',
          Steps: 'Save profile.',
          'Expected Result': 'Profile is saved.',
        }),
        createRow(4, {
          Title: '',
          Area: 'Checkout',
          Priority: 'High',
          Type: 'Functional',
          Steps: 'Pay.',
          'Expected Result': 'Payment completes.',
        }),
      ],
      mapping,
    )
    const importedTestCases = buildImportedTestCases(previewRows, {
      includeWarnings: true,
      now: '2026-05-10T08:00:00.000Z',
      createId: (() => {
        let index = 0
        return () => {
          index += 1
          return `imported-${index}`
        }
      })(),
    })
    const existingTestCase = createTestCase({ id: 'existing' })

    expect(importedTestCases).toEqual([
      {
        id: 'imported-1',
        title: 'Login accepts valid credentials',
        area: 'Authentication',
        priority: 'Critical',
        status: 'Not Run',
        type: 'Smoke',
        steps: 'Submit credentials.',
        expectedResult: 'Dashboard opens.',
        createdAt: '2026-05-10T08:00:00.000Z',
        updatedAt: '2026-05-10T08:00:00.000Z',
      },
      {
        id: 'imported-2',
        title: 'Profile update works',
        area: 'General',
        priority: 'Medium',
        status: 'Not Run',
        type: 'Functional',
        steps: 'Save profile.',
        expectedResult: 'Profile is saved.',
        createdAt: '2026-05-10T08:00:00.000Z',
        updatedAt: '2026-05-10T08:00:00.000Z',
      },
    ])
    expect(mergeImportedTestCases([existingTestCase], importedTestCases)).toEqual([
      ...importedTestCases,
      existingTestCase,
    ])
  })
})
