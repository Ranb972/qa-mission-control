import { useState } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { createTestCase } from '../../test/testCaseFactory'
import type { TestCase } from '../test-cases/testCaseTypes'
import { TestCaseImportPage } from './TestCaseImportPage'

function getSummaryCard(label: string) {
  return within(screen.getByRole('region', { name: label }))
}

function renderImportPage(initialTestCases: TestCase[] = []) {
  let latestTestCases = initialTestCases
  const onViewTestCases = vi.fn()

  function Harness() {
    const [testCases, setTestCases] = useState(initialTestCases)

    function handleChange(nextTestCases: TestCase[]) {
      latestTestCases = nextTestCases
      setTestCases(nextTestCases)
    }

    return (
      <TestCaseImportPage
        testCases={testCases}
        onChange={handleChange}
        onViewTestCases={onViewTestCases}
      />
    )
  }

  render(<Harness />)

  return {
    getLatestTestCases: () => latestTestCases,
    onViewTestCases,
  }
}

async function uploadCsv(user: ReturnType<typeof userEvent.setup>, csv: string) {
  const file = new File([csv], 'test-cases.csv', { type: 'text/csv' })

  await user.upload(screen.getByLabelText('Upload CSV file'), file)
}

describe('TestCaseImportPage', () => {
  it('detects Hebrew columns, previews row status, imports valid rows, and preserves existing cases', async () => {
    const user = userEvent.setup()
    const existingTestCase = createTestCase({
      id: 'existing-test-case',
      title: 'Existing coverage remains',
    })
    const { getLatestTestCases, onViewTestCases } = renderImportPage([
      existingTestCase,
    ])

    await uploadCsv(
      user,
      [
        'שם בדיקה,מודול,פעולות לביצוע,תוצאות צפויות,עדיפות,סוג בדיקה',
        'ייבוא תקין,כניסה,פתח מסך כניסה,מסך כניסה מוצג,High,Smoke',
        'ייבוא עם ברירות מחדל,,בצע פעולה,הפעולה הצליחה,,',
        ',תשלומים,שלם,תשלום מצליח,Urgent,Functional',
      ].join('\n'),
    )

    expect(await screen.findByText(/Detected "שם בדיקה" as Title/)).toBeInTheDocument()
    expect(getSummaryCard('Ready to import').getByText('1')).toBeInTheDocument()
    expect(getSummaryCard('Needs attention').getByText('1')).toBeInTheDocument()
    expect(getSummaryCard('Blocked').getByText('1')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'ייבוא תקין' })).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'ייבוא עם ברירות מחדל' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Missing title' })).toBeInTheDocument()
    expect(screen.getByText('Area is missing. Will use General.')).toBeInTheDocument()
    expect(
      screen.getByText('Title is missing. This row will not be imported.'),
    ).toBeInTheDocument()

    await user.click(
      screen.getByRole('button', {
        name: 'Import ready + rows with defaults',
      }),
    )

    const testCases = getLatestTestCases()

    expect(testCases).toHaveLength(3)
    expect(testCases.map((testCase) => testCase.title)).toEqual(
      expect.arrayContaining([
        'ייבוא תקין',
        'ייבוא עם ברירות מחדל',
        'Existing coverage remains',
      ]),
    )
    expect(
      testCases.find((testCase) => testCase.title === 'ייבוא עם ברירות מחדל'),
    ).toMatchObject({
      area: 'General',
      priority: 'Medium',
      status: 'Not Run',
      type: 'Functional',
    })
    expect(testCases.some((testCase) => testCase.title === '')).toBe(false)
    expect(getSummaryCard('Imported').getByText('2')).toBeInTheDocument()
    expect(getSummaryCard('Defaulted').getByText('1')).toBeInTheDocument()
    expect(getSummaryCard('Skipped').getByText('1')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'View imported test cases' }))

    expect(onViewTestCases).toHaveBeenCalledTimes(1)
  })

  it('lets testers adjust mappings before importing', async () => {
    const user = userEvent.setup()
    const { getLatestTestCases } = renderImportPage()

    await uploadCsv(
      user,
      [
        'Name,Actions,Expected,Area,Priority,Type',
        'Manual mapped login,Open the login screen,The login screen opens,Authentication,High,Functional',
      ].join('\n'),
    )

    expect(getSummaryCard('Ready to import').getByText('0')).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Map Title column'), 'Name')
    await user.selectOptions(screen.getByLabelText('Map Steps column'), 'Actions')

    expect(getSummaryCard('Ready to import').getByText('1')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Import ready rows' }))

    expect(getLatestTestCases()).toEqual([
      expect.objectContaining({
        title: 'Manual mapped login',
        steps: 'Open the login screen',
        expectedResult: 'The login screen opens',
      }),
    ])
  })
})
