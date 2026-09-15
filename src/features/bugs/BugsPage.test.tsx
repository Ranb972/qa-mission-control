import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createBug } from '../../test/bugFactory'
import type { TestCase } from '../test-cases/testCaseTypes'
import type { Bug } from './bugTypes'
import { BugsPage } from './BugsPage'

function renderBugsPage(initialBugs: Bug[] = [], testCases: TestCase[] = []) {
  function Harness() {
    const [bugs, setBugs] = useState(initialBugs)

    return <BugsPage bugs={bugs} testCases={testCases} onChange={setBugs} />
  }

  return render(<Harness />)
}

describe('BugsPage', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('wires create, edit, delete, and list updates', async () => {
    const user = userEvent.setup()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)

    renderBugsPage()

    await user.click(screen.getByRole('button', { name: 'New bug' }))
    await user.type(screen.getByLabelText('Title'), 'Checkout total is wrong')
    await user.type(
      screen.getByLabelText('Description'),
      'The checkout summary shows the wrong total.',
    )
    await user.type(
      screen.getByLabelText('Steps To Reproduce'),
      'Add a discounted item and open checkout.',
    )
    await user.type(
      screen.getByLabelText('Expected Behavior'),
      'The total includes the discount.',
    )
    await user.type(
      screen.getByLabelText('Actual Behavior'),
      'The total ignores the discount.',
    )
    await user.click(screen.getByRole('button', { name: 'Create bug' }))

    expect(
      screen.getByRole('heading', { name: 'Checkout total is wrong' }),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Edit' }))
    await user.clear(screen.getByLabelText('Title'))
    await user.type(screen.getByLabelText('Title'), 'Checkout total is fixed')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(screen.queryByText('Checkout total is wrong')).not.toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Checkout total is fixed' }),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Delete' }))

    expect(confirmSpy).toHaveBeenCalledWith('Delete "Checkout total is fixed"?')
    expect(screen.queryByText('Checkout total is fixed')).not.toBeInTheDocument()
    expect(screen.getByText('No bugs yet')).toBeInTheDocument()
  })

  it('shows and clears an unavailable linked test case while editing', async () => {
    const user = userEvent.setup()

    renderBugsPage([
      createBug({
        id: 'bug-with-stale-link',
        title: 'Login linked test was deleted',
        testCaseId: 'deleted-test-case',
      }),
    ])

    expect(screen.getByText('Linked test case unavailable')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Edit' }))

    const linkedTestCaseSelect = screen.getByLabelText('Linked Test Case')

    expect(linkedTestCaseSelect).toHaveDisplayValue(
      'Linked test case unavailable',
    )
    expect(
      screen.getByRole('option', { name: 'Linked test case unavailable' }),
    ).toBeDisabled()

    await user.selectOptions(linkedTestCaseSelect, '')

    expect(linkedTestCaseSelect).toHaveDisplayValue('No linked test case')

    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(
      screen.queryByText('Linked test case unavailable'),
    ).not.toBeInTheDocument()
  })
})
