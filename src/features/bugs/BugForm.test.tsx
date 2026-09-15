import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { createTestCase } from '../../test/testCaseFactory'
import { BugForm } from './BugForm'

describe('BugForm', () => {
  it('shows accessible validation errors and focuses the first invalid field', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()

    render(
      <BugForm
        mode="create"
        testCases={[]}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Create bug' }))

    const titleInput = screen.getByLabelText('Title')
    const descriptionInput = screen.getByLabelText('Description')
    const stepsInput = screen.getByLabelText('Steps To Reproduce')
    const expectedBehaviorInput = screen.getByLabelText('Expected Behavior')
    const actualBehaviorInput = screen.getByLabelText('Actual Behavior')

    expect(onSubmit).not.toHaveBeenCalled()
    expect(titleInput).toHaveFocus()
    expect(titleInput).toHaveAttribute('aria-describedby', 'bug-title-error')
    expect(descriptionInput).toHaveAttribute(
      'aria-describedby',
      'bug-description-error',
    )
    expect(stepsInput).toHaveAttribute(
      'aria-describedby',
      'bug-steps-to-reproduce-error',
    )
    expect(expectedBehaviorInput).toHaveAttribute(
      'aria-describedby',
      'bug-expected-behavior-error',
    )
    expect(actualBehaviorInput).toHaveAttribute(
      'aria-describedby',
      'bug-actual-behavior-error',
    )
    expect(screen.getByText('Title is required.')).toHaveAttribute(
      'id',
      'bug-title-error',
    )
  })

  it('submits a linked test case when selected', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()

    render(
      <BugForm
        mode="create"
        testCases={[
          createTestCase({
            id: 'test-case-login',
            title: 'Login accepts valid credentials',
          }),
        ]}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    )

    await user.type(screen.getByLabelText('Title'), 'Login lockout bug')
    await user.type(screen.getByLabelText('Description'), 'Lockout is skipped.')
    await user.selectOptions(screen.getByLabelText('Linked Test Case'), [
      'test-case-login',
    ])
    await user.type(
      screen.getByLabelText('Steps To Reproduce'),
      'Try locked account login.',
    )
    await user.type(
      screen.getByLabelText('Expected Behavior'),
      'The user cannot log in.',
    )
    await user.type(
      screen.getByLabelText('Actual Behavior'),
      'The user reaches the dashboard.',
    )
    await user.click(screen.getByRole('button', { name: 'Create bug' }))

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Login lockout bug',
        testCaseId: 'test-case-login',
      }),
    )
  })
})
