import { useState } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTestCase } from '../../test/testCaseFactory'
import type { TestCase } from './testCaseTypes'
import { TestCasesPage } from './TestCasesPage'

function getTestCaseCard(title: string) {
  const heading = screen.getByRole('heading', { name: title })
  const card = heading.closest('article')

  if (!card) {
    throw new Error(`Could not find test case card for "${title}"`)
  }

  return within(card)
}

function renderTestCasesPage(initialTestCases: TestCase[] = []) {
  function Harness() {
    const [testCases, setTestCases] = useState(initialTestCases)

    return <TestCasesPage testCases={testCases} onChange={setTestCases} />
  }

  render(<Harness />)
}

async function fillRequiredModalFields(user: ReturnType<typeof userEvent.setup>) {
  const dialog = within(screen.getByRole('dialog', { name: 'Create Test Case' }))

  await user.type(dialog.getByLabelText('Title'), 'Checkout supports cards')
  await user.type(dialog.getByLabelText('Area'), 'Checkout')
  await user.type(dialog.getByLabelText('Step 1 action'), 'Open checkout.')
  await user.type(
    dialog.getByLabelText('Step 1 expected result'),
    'Checkout opens.',
  )
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('TestCasesPage', () => {
  it('opens the create editor as an accessible modal', async () => {
    const user = userEvent.setup()

    renderTestCasesPage()

    await user.click(screen.getByRole('button', { name: 'New test case' }))

    const dialog = screen.getByRole('dialog', { name: 'Create Test Case' })

    expect(dialog).toBeInTheDocument()
    expect(
      within(dialog).getByRole('heading', { name: 'Basic Details' }),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByRole('heading', { name: 'Preconditions' }),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByRole('heading', { name: 'Execution Steps' }),
    ).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Library status')).toBeInTheDocument()
    expect(
      within(dialog).getByText(
        'Release-specific outcomes are recorded in Executions.',
      ),
    ).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Title')).toHaveFocus()
  })

  it('creates a structured test case from the modal', async () => {
    const user = userEvent.setup()

    renderTestCasesPage()

    await user.click(screen.getByRole('button', { name: 'New test case' }))

    const dialog = within(
      screen.getByRole('dialog', { name: 'Create Test Case' }),
    )

    await fillRequiredModalFields(user)
    await user.type(
      dialog.getByLabelText('Preconditions'),
      'User exists and card data is available.',
    )
    await user.click(dialog.getByRole('button', { name: 'Add step' }))
    await user.type(dialog.getByLabelText('Step 2 action'), 'Submit payment.')
    await user.type(
      dialog.getByLabelText('Step 2 expected result'),
      'Payment succeeds.',
    )
    await user.click(dialog.getByRole('button', { name: 'Create test case' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Checkout supports cards' }),
    ).toBeInTheDocument()
    const card = getTestCaseCard('Checkout supports cards')

    expect(card.getByText('2 steps')).toBeInTheDocument()
    expect(card.getByTitle('Preconditions defined')).toBeInTheDocument()
    expect(
      card.queryByText('User exists and card data is available.'),
    ).not.toBeInTheDocument()

    await user.click(card.getByRole('button', { name: 'Expand' }))

    expect(
      card.getByText('User exists and card data is available.'),
    ).toBeInTheDocument()
    expect(card.getByText('Submit payment.')).toBeInTheDocument()
    expect(card.getByText('Payment succeeds.')).toBeInTheDocument()
  })

  it('opens the edit modal and saves changes', async () => {
    const user = userEvent.setup()

    renderTestCasesPage([
      createTestCase({
        id: 'checkout',
        title: 'Checkout supports cards',
        preconditions: 'Old setup.',
        structuredSteps: [
          {
            id: 'step-1',
            action: 'Open checkout.',
            expectedResult: 'Checkout opens.',
          },
        ],
      }),
    ])

    await user.click(
      getTestCaseCard('Checkout supports cards').getByRole('button', {
        name: 'Edit',
      }),
    )

    const dialog = within(screen.getByRole('dialog', { name: 'Edit Test Case' }))

    await user.clear(dialog.getByLabelText('Title'))
    await user.type(dialog.getByLabelText('Title'), 'Checkout supports Visa')
    await user.clear(dialog.getByLabelText('Preconditions'))
    await user.type(
      dialog.getByLabelText('Preconditions'),
      'Visa card is ready.',
    )
    await user.click(dialog.getByRole('button', { name: 'Save changes' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Checkout supports Visa' }),
    ).toBeInTheDocument()

    const card = getTestCaseCard('Checkout supports Visa')

    await user.click(card.getByRole('button', { name: 'Expand' }))

    expect(card.getByText('Visa card is ready.')).toBeInTheDocument()
  })

  it('closes the modal on cancel without saving', async () => {
    const user = userEvent.setup()

    renderTestCasesPage()

    await user.click(screen.getByRole('button', { name: 'New test case' }))
    await user.type(screen.getByLabelText('Title'), 'Unsaved test case')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByText('Unsaved test case')).not.toBeInTheDocument()
    expect(screen.getByText('No test cases yet')).toBeInTheDocument()
  })

  it('renders test case cards collapsed by default with summary details', () => {
    renderTestCasesPage([
      createTestCase({
        title: 'Checkout supports cards',
        area: 'Checkout',
        status: 'Not Run',
        priority: 'Medium',
        type: 'Functional',
        steps: 'Legacy action should not display.',
        expectedResult: 'Legacy expected result should not display.',
        preconditions: 'User exists and test card data is available.',
        structuredSteps: [
          {
            id: 'step-1',
            action: 'Open checkout.',
            expectedResult: 'Checkout opens.',
          },
          {
            id: 'step-2',
            action: 'Submit card payment.',
            expectedResult: 'Payment succeeds.',
          },
        ],
      }),
    ])

    const card = getTestCaseCard('Checkout supports cards')
    const expandButton = card.getByRole('button', { name: 'Expand' })

    expect(card.getByText('Checkout')).toBeInTheDocument()
    expect(screen.getByLabelText('Library status')).toBeInTheDocument()
    expect(
      screen.getByText(
        /Library status is separate from release-specific outcomes recorded in Executions/,
      ),
    ).toBeInTheDocument()
    expect(card.getByLabelText('Library status: Not Run')).toBeInTheDocument()
    expect(card.getByText('Medium')).toBeInTheDocument()
    expect(card.getByText('Functional')).toBeInTheDocument()
    expect(card.getByText('2 steps')).toBeInTheDocument()
    expect(card.getByTitle('Preconditions defined')).toBeInTheDocument()
    expect(expandButton).toHaveAttribute('aria-expanded', 'false')
    expect(
      card.queryByText('User exists and test card data is available.'),
    ).not.toBeInTheDocument()
    expect(card.queryByText('Open checkout.')).not.toBeInTheDocument()
  })

  it('expands and collapses structured test case details', async () => {
    const user = userEvent.setup()

    renderTestCasesPage([
      createTestCase({
        title: 'Checkout supports cards',
        steps: 'Legacy action should not display.',
        expectedResult: 'Legacy expected result should not display.',
        preconditions: 'User exists and test card data is available.',
        structuredSteps: [
          {
            id: 'step-1',
            action: 'Open checkout.',
            expectedResult: 'Checkout opens.',
          },
          {
            id: 'step-2',
            action: 'Submit card payment.',
            expectedResult: 'Payment succeeds.',
          },
        ],
      }),
    ])

    const card = getTestCaseCard('Checkout supports cards')
    const expandButton = card.getByRole('button', { name: 'Expand' })

    await user.click(expandButton)

    expect(
      card.getByText('User exists and test card data is available.'),
    ).toBeInTheDocument()
    expect(card.getByText('Step 1')).toBeInTheDocument()
    expect(card.getByText('Open checkout.')).toBeInTheDocument()
    expect(card.getByText('Checkout opens.')).toBeInTheDocument()
    expect(card.getByText('Step 2')).toBeInTheDocument()
    expect(
      card.queryByText('Legacy action should not display.'),
    ).not.toBeInTheDocument()
    expect(card.getByRole('button', { name: 'Collapse' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )

    await user.click(card.getByRole('button', { name: 'Collapse' }))

    expect(
      card.queryByText('User exists and test card data is available.'),
    ).not.toBeInTheDocument()
    expect(card.queryByText('Open checkout.')).not.toBeInTheDocument()
    expect(card.getByRole('button', { name: 'Expand' })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
  })

  it('renders legacy steps as one fallback structured step after expanding', async () => {
    const user = userEvent.setup()

    renderTestCasesPage([
      createTestCase({
        title: 'Legacy checkout test',
        steps: 'Open legacy checkout.',
        expectedResult: 'Legacy checkout opens.',
      }),
    ])

    const card = getTestCaseCard('Legacy checkout test')

    expect(card.getByText('1 step')).toBeInTheDocument()
    expect(card.getByTitle('No preconditions')).toBeInTheDocument()
    expect(card.queryByText('Open legacy checkout.')).not.toBeInTheDocument()

    await user.click(card.getByRole('button', { name: 'Expand' }))

    expect(card.getByText('No preconditions defined.')).toBeInTheDocument()
    expect(card.getByText('Step 1')).toBeInTheDocument()
    expect(card.getByText('Open legacy checkout.')).toBeInTheDocument()
    expect(card.getByText('Legacy checkout opens.')).toBeInTheDocument()
  })

  it('deletes a test case from a collapsed card and keeps the other card', async () => {
    const user = userEvent.setup()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)

    renderTestCasesPage([
      createTestCase({
        id: 'checkout',
        title: 'Checkout supports cards',
      }),
      createTestCase({
        id: 'login',
        title: 'Login supports MFA',
      }),
    ])

    await user.click(
      getTestCaseCard('Checkout supports cards').getByRole('button', {
        name: 'Delete',
      }),
    )

    expect(confirmSpy).toHaveBeenCalledWith('Delete "Checkout supports cards"?')
    expect(
      screen.queryByRole('heading', { name: 'Checkout supports cards' }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Login supports MFA' }),
    ).toBeInTheDocument()
  })
})
