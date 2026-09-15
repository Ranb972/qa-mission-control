import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { RiskForm } from './RiskForm'

describe('RiskForm', () => {
  it('shows accessible validation errors and focuses the first invalid field', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()

    render(
      <RiskForm
        mode="create"
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Create risk' }))

    const titleInput = screen.getByLabelText('Title')
    const descriptionInput = screen.getByLabelText('Description')
    const mitigationPlanInput = screen.getByLabelText('Mitigation Plan')

    expect(onSubmit).not.toHaveBeenCalled()
    expect(titleInput).toHaveFocus()
    expect(titleInput).toHaveAttribute('aria-describedby', 'risk-title-error')
    expect(descriptionInput).toHaveAttribute(
      'aria-describedby',
      'risk-description-error',
    )
    expect(mitigationPlanInput).toHaveAttribute(
      'aria-describedby',
      'risk-mitigation-plan-error',
    )
    expect(screen.getByText('Title is required.')).toHaveAttribute(
      'id',
      'risk-title-error',
    )
  })

  it('submits trimmed risk values', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()

    render(
      <RiskForm
        mode="create"
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    )

    await user.type(screen.getByLabelText('Title'), '  Payment outage risk  ')
    await user.type(
      screen.getByLabelText('Description'),
      '  Provider instability may block checkout testing.  ',
    )
    await user.selectOptions(screen.getByLabelText('Risk impact'), 'Critical')
    await user.selectOptions(screen.getByLabelText('Risk likelihood'), 'High')
    await user.selectOptions(screen.getByLabelText('Risk status'), 'Mitigating')
    await user.type(
      screen.getByLabelText('Mitigation Plan'),
      '  Prepare fallback payment test data.  ',
    )
    await user.click(screen.getByRole('button', { name: 'Create risk' }))

    expect(onSubmit).toHaveBeenCalledWith({
      title: 'Payment outage risk',
      description: 'Provider instability may block checkout testing.',
      impact: 'Critical',
      likelihood: 'High',
      status: 'Mitigating',
      mitigationPlan: 'Prepare fallback payment test data.',
    })
  })
})
