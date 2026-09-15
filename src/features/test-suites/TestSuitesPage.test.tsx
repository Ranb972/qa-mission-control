import { useState } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTestCase } from '../../test/testCaseFactory'
import { createTestSuite } from '../../test/testSuiteFactory'
import type { TestCase } from '../test-cases/testCaseTypes'
import type { TestSuite } from './testSuiteTypes'
import { TestSuitesPage } from './TestSuitesPage'

const checkoutTestCase = createTestCase({
  id: 'checkout',
  title: 'Checkout critical path',
  area: 'Checkout',
  priority: 'Critical',
  type: 'Smoke',
})

const loginTestCase = createTestCase({
  id: 'login',
  title: 'Login happy path',
  area: 'Authentication',
  priority: 'High',
  type: 'Functional',
})

function renderTestSuitesPage({
  initialSuites = [],
  testCases = [checkoutTestCase, loginTestCase],
}: {
  initialSuites?: TestSuite[]
  testCases?: TestCase[]
} = {}) {
  function Harness() {
    const [testSuites, setTestSuites] = useState(initialSuites)

    return (
      <TestSuitesPage
        testSuites={testSuites}
        testCases={testCases}
        onChange={setTestSuites}
      />
    )
  }

  render(<Harness />)
}

function getSuiteCard(name: string) {
  const heading = screen.getByRole('heading', { name })
  const card = heading.closest('article')

  if (!card) {
    throw new Error(`Could not find suite card for "${name}"`)
  }

  return within(card)
}

async function createSuiteThroughPage(
  user: ReturnType<typeof userEvent.setup>,
  values: {
    name: string
    type?: TestSuite['type']
    description?: string
    testCaseNames?: string[]
  },
) {
  await user.click(screen.getByRole('button', { name: 'New suite' }))

  const dialog = within(screen.getByRole('dialog', { name: 'Create Test Suite' }))

  await user.type(dialog.getByLabelText('Suite name'), values.name)

  if (values.type) {
    await user.selectOptions(dialog.getByLabelText('Suite type'), values.type)
  }

  if (values.description) {
    await user.type(dialog.getByLabelText('Description'), values.description)
  }

  for (const testCaseName of values.testCaseNames ?? []) {
    await user.click(dialog.getByLabelText(new RegExp(testCaseName)))
  }

  await user.click(dialog.getByRole('button', { name: 'Create suite' }))
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('TestSuitesPage', () => {
  it('creates a suite with selected test cases', async () => {
    const user = userEvent.setup()

    renderTestSuitesPage()

    await createSuiteThroughPage(user, {
      name: 'Checkout Smoke Suite',
      type: 'Smoke',
      description: 'Fast confidence checks for checkout.',
      testCaseNames: ['Checkout critical path', 'Login happy path'],
    })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    const card = getSuiteCard('Checkout Smoke Suite')

    expect(card.getAllByText('Smoke').length).toBeGreaterThan(0)
    expect(card.getByText('2 test cases')).toBeInTheDocument()
    expect(
      card.getByText('Fast confidence checks for checkout.'),
    ).toBeInTheDocument()
    expect(card.getByText('Checkout critical path')).toBeInTheDocument()
    expect(card.getByText('Login happy path')).toBeInTheDocument()
  })

  it('edits suite metadata and membership, including unavailable references', async () => {
    const user = userEvent.setup()

    renderTestSuitesPage({
      initialSuites: [
        createTestSuite({
          id: 'smoke',
          name: 'Core Smoke Suite',
          testCaseIds: ['checkout', 'missing-test-case'],
        }),
      ],
    })

    const initialCard = getSuiteCard('Core Smoke Suite')

    expect(initialCard.getByText('1 test case')).toBeInTheDocument()
    expect(initialCard.getByText('1 unavailable')).toBeInTheDocument()
    expect(initialCard.getByText('Unavailable test case')).toBeInTheDocument()

    await user.click(initialCard.getByRole('button', { name: 'Edit' }))

    const dialog = within(screen.getByRole('dialog', { name: 'Edit Test Suite' }))

    await user.clear(dialog.getByLabelText('Suite name'))
    await user.type(dialog.getByLabelText('Suite name'), 'Core Regression Suite')
    await user.selectOptions(dialog.getByLabelText('Suite type'), 'Regression')
    await user.click(
      dialog.getByRole('button', {
        name: 'Remove Unavailable test case from suite',
      }),
    )
    await user.click(dialog.getByLabelText(/Login happy path/))
    await user.click(dialog.getByRole('button', { name: 'Save changes' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    const updatedCard = getSuiteCard('Core Regression Suite')

    expect(updatedCard.getAllByText('Regression').length).toBeGreaterThan(0)
    expect(updatedCard.getByText('2 test cases')).toBeInTheDocument()
    expect(updatedCard.queryByText('1 unavailable')).not.toBeInTheDocument()
    expect(updatedCard.queryByText('Unavailable test case')).not.toBeInTheDocument()
    expect(updatedCard.getByText('Login happy path')).toBeInTheDocument()
  })

  it('validates suite name', async () => {
    const user = userEvent.setup()

    renderTestSuitesPage()

    await user.click(screen.getByRole('button', { name: 'New suite' }))

    const dialog = within(screen.getByRole('dialog', { name: 'Create Test Suite' }))

    await user.click(dialog.getByRole('button', { name: 'Create suite' }))

    expect(dialog.getByLabelText('Suite name')).toHaveFocus()
    expect(dialog.getByText('Suite name is required.')).toBeInTheDocument()
  })

  it('deletes a suite without deleting test cases or other suites', async () => {
    const user = userEvent.setup()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)

    renderTestSuitesPage({
      initialSuites: [
        createTestSuite({ id: 'smoke', name: 'Core Smoke Suite' }),
        createTestSuite({ id: 'regression', name: 'Full Regression Suite' }),
      ],
    })

    await user.click(
      getSuiteCard('Core Smoke Suite').getByRole('button', { name: 'Delete' }),
    )

    expect(confirmSpy).toHaveBeenCalledWith('Delete "Core Smoke Suite"?')
    expect(screen.queryByText('Core Smoke Suite')).not.toBeInTheDocument()
    expect(screen.getByText('Full Regression Suite')).toBeInTheDocument()
    expect(screen.getByText('1 total')).toBeInTheDocument()
  })

  it('filters suites by name and type', async () => {
    const user = userEvent.setup()

    renderTestSuitesPage({
      initialSuites: [
        createTestSuite({
          id: 'smoke',
          name: 'Checkout Smoke Suite',
          type: 'Smoke',
        }),
        createTestSuite({
          id: 'regression',
          name: 'Profile Regression Suite',
          type: 'Regression',
        }),
      ],
    })

    const filters = within(
      screen.getByRole('region', { name: 'Suite Search and Filters' }),
    )

    await user.type(filters.getByLabelText('Search by suite name'), 'profile')

    expect(screen.queryByText('Checkout Smoke Suite')).not.toBeInTheDocument()
    expect(screen.getByText('Profile Regression Suite')).toBeInTheDocument()
    expect(screen.getByText('1 of 2 shown')).toBeInTheDocument()

    await user.click(filters.getByRole('button', { name: 'Clear filters' }))
    await user.selectOptions(
      filters.getByLabelText('Filter by suite type'),
      'Smoke',
    )

    expect(screen.getByText('Checkout Smoke Suite')).toBeInTheDocument()
    expect(screen.queryByText('Profile Regression Suite')).not.toBeInTheDocument()
  })
})
