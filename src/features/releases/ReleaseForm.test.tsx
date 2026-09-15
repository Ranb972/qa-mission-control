import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ReleaseForm } from './ReleaseForm'

describe('ReleaseForm', () => {
  it('shows accessible validation errors and focuses the first invalid field', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()

    render(
      <ReleaseForm
        mode="create"
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Create release' }))

    const nameInput = screen.getByLabelText('Release name')
    const versionInput = screen.getByLabelText('Version')
    const targetDateInput = screen.getByLabelText('Target date')

    expect(onSubmit).not.toHaveBeenCalled()
    expect(nameInput).toHaveFocus()
    expect(nameInput).toHaveAttribute('aria-describedby', 'release-name-error')
    expect(versionInput).toHaveAttribute(
      'aria-describedby',
      'release-version-error',
    )
    expect(targetDateInput).toHaveAttribute(
      'aria-describedby',
      'release-target-date-error',
    )
    expect(screen.getByText('Release name is required.')).toHaveAttribute(
      'id',
      'release-name-error',
    )
  })

  it('submits trimmed values and allows empty notes', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()

    render(
      <ReleaseForm
        mode="create"
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    )

    await user.type(screen.getByLabelText('Release name'), '  Checkout GA  ')
    await user.type(screen.getByLabelText('Version'), '  v1.4.0  ')
    await user.type(screen.getByLabelText('Target date'), '2026-05-21')
    await user.selectOptions(screen.getByLabelText('Release status'), 'Ready')
    await user.click(screen.getByRole('button', { name: 'Create release' }))

    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Checkout GA',
      version: 'v1.4.0',
      targetDate: '2026-05-21',
      status: 'Ready',
      notes: '',
    })
  })
})
