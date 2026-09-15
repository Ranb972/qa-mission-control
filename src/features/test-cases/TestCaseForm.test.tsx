import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { createTestCase } from '../../test/testCaseFactory'
import { TestCaseForm } from './TestCaseForm'

function renderCreateForm(onSubmit = vi.fn()) {
  render(
    <TestCaseForm mode="create" onSubmit={onSubmit} onCancel={vi.fn()} />,
  )

  return {
    form: within(screen.getByRole('form', { name: 'Create Test Case form' })),
    onSubmit,
  }
}

async function fillBaseFields(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Title'), 'Checkout supports cards')
  await user.type(screen.getByLabelText('Area'), 'Checkout')
}

async function fillStep(
  user: ReturnType<typeof userEvent.setup>,
  stepNumber: number,
  action: string,
  expectedResult: string,
) {
  await user.clear(screen.getByLabelText(`Step ${stepNumber} action`))
  await user.type(screen.getByLabelText(`Step ${stepNumber} action`), action)
  await user.clear(screen.getByLabelText(`Step ${stepNumber} expected result`))
  await user.type(
    screen.getByLabelText(`Step ${stepNumber} expected result`),
    expectedResult,
  )
}

async function openSmartPastePanel(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Smart Paste steps' }))

  return within(screen.getByRole('region', { name: 'Smart Paste Steps' }))
}

async function previewSmartPasteSteps(
  user: ReturnType<typeof userEvent.setup>,
  pastedText: string,
) {
  const panel = await openSmartPastePanel(user)

  await user.type(panel.getByLabelText('Paste step text'), pastedText)
  await user.click(panel.getByRole('button', { name: 'Preview steps' }))

  return panel
}

describe('TestCaseForm', () => {
  it('distinguishes library status from release execution outcomes', () => {
    renderCreateForm()

    expect(screen.getByLabelText('Library status')).toHaveValue('Not Run')
    expect(
      screen.getByText('Release-specific outcomes are recorded in Executions.'),
    ).toBeInTheDocument()
  })

  it('shows accessible validation errors and focuses the first invalid field', async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderCreateForm()

    await user.click(screen.getByRole('button', { name: 'Create test case' }))

    const titleInput = screen.getByLabelText('Title')
    const areaInput = screen.getByLabelText('Area')
    const stepActionInput = screen.getByLabelText('Step 1 action')
    const stepExpectedResultInput = screen.getByLabelText(
      'Step 1 expected result',
    )

    expect(onSubmit).not.toHaveBeenCalled()
    expect(titleInput).toHaveFocus()
    expect(titleInput).toHaveAttribute(
      'aria-describedby',
      'test-case-title-error',
    )
    expect(areaInput).toHaveAttribute(
      'aria-describedby',
      'test-case-area-error',
    )
    expect(stepActionInput).toHaveAttribute(
      'aria-describedby',
      expect.stringContaining('action-error'),
    )
    expect(stepExpectedResultInput).toHaveAttribute(
      'aria-describedby',
      expect.stringContaining('expectedResult-error'),
    )
    expect(screen.getByText('Title is required.')).toHaveAttribute(
      'id',
      'test-case-title-error',
    )
  })

  it('creates a test case with preconditions and multiple structured steps', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()

    renderCreateForm(onSubmit)

    await fillBaseFields(user)
    await user.type(
      screen.getByLabelText('Preconditions'),
      'User exists and payment test data is available.',
    )
    await fillStep(
      user,
      1,
      'Open checkout.',
      'Checkout page is displayed.',
    )
    await user.click(screen.getByRole('button', { name: 'Add step' }))
    await fillStep(
      user,
      2,
      'Submit card payment.',
      'Payment confirmation is displayed.',
    )
    await user.click(screen.getByRole('button', { name: 'Create test case' }))

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Checkout supports cards',
        area: 'Checkout',
        preconditions: 'User exists and payment test data is available.',
        steps: '1. Open checkout.\n2. Submit card payment.',
        expectedResult:
          '1. Checkout page is displayed.\n2. Payment confirmation is displayed.',
        structuredSteps: [
          expect.objectContaining({
            action: 'Open checkout.',
            expectedResult: 'Checkout page is displayed.',
          }),
          expect.objectContaining({
            action: 'Submit card payment.',
            expectedResult: 'Payment confirmation is displayed.',
          }),
        ],
      }),
    )
  })

  it('validates missing step action and focuses it', async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderCreateForm()

    await fillBaseFields(user)
    await user.type(
      screen.getByLabelText('Step 1 expected result'),
      'Checkout opens.',
    )
    await user.click(screen.getByRole('button', { name: 'Create test case' }))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Step 1 action')).toHaveFocus()
    expect(screen.getByText('Step action is required.')).toBeInTheDocument()
  })

  it('validates missing step expected result and focuses it', async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderCreateForm()

    await fillBaseFields(user)
    await user.type(screen.getByLabelText('Step 1 action'), 'Open checkout.')
    await user.click(screen.getByRole('button', { name: 'Create test case' }))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Step 1 expected result')).toHaveFocus()
    expect(
      screen.getByText('Step expected result is required.'),
    ).toBeInTheDocument()
  })

  it('supports add, insert, delete, and move controls for steps', async () => {
    const user = userEvent.setup()

    renderCreateForm()

    await fillStep(user, 1, 'First action', 'First expected')
    await user.click(screen.getByRole('button', { name: 'Add step' }))
    await fillStep(user, 2, 'Third action', 'Third expected')
    await user.click(
      screen.getByRole('button', { name: 'Insert step below Step 1' }),
    )

    await fillStep(user, 2, 'Second action', 'Second expected')

    expect(screen.getByLabelText('Step 3 action')).toHaveValue('Third action')

    await user.click(screen.getByRole('button', { name: 'Move Step 3 up' }))

    expect(screen.getByLabelText('Step 2 action')).toHaveValue('Third action')
    expect(screen.getByLabelText('Step 3 action')).toHaveValue('Second action')

    await user.click(screen.getByRole('button', { name: 'Move Step 2 down' }))

    expect(screen.getByLabelText('Step 2 action')).toHaveValue('Second action')
    expect(screen.getByLabelText('Step 3 action')).toHaveValue('Third action')

    await user.click(screen.getByRole('button', { name: 'Delete Step 2' }))

    expect(screen.getByLabelText('Step 1 action')).toHaveValue('First action')
    expect(screen.getByLabelText('Step 2 action')).toHaveValue('Third action')
    expect(screen.queryByLabelText('Step 3 action')).not.toBeInTheDocument()
  })

  it('opens Smart Paste from the Execution Steps section', async () => {
    const user = userEvent.setup()

    renderCreateForm()

    const panel = await openSmartPastePanel(user)

    expect(panel.getByText('Supported examples')).toBeInTheDocument()
    expect(panel.getByLabelText('Paste step text')).toBeInTheDocument()
    expect(panel.getByRole('button', { name: 'Preview steps' })).toBeInTheDocument()
  })

  it('previews parsed Smart Paste steps and warnings', async () => {
    const user = userEvent.setup()

    renderCreateForm()

    const panel = await previewSmartPasteSteps(
      user,
      ['1. Open login page', '2. Enter valid email'].join('\n'),
    )

    expect(panel.getByText('2 detected')).toBeInTheDocument()
    expect(panel.getByText('0 complete')).toBeInTheDocument()
    expect(panel.getByText('2 needing review')).toBeInTheDocument()
    expect(panel.getByText('0 invalid lines')).toBeInTheDocument()
    expect(panel.getByText('Open login page')).toBeInTheDocument()
    expect(panel.getAllByText('Missing expected result')).toHaveLength(2)
    expect(
      panel.queryByRole('button', { name: 'Append steps' }),
    ).not.toBeInTheDocument()
    expect(
      panel.getByRole('button', { name: 'Append steps needing review' }),
    ).toBeInTheDocument()
    expect(
      panel.getByRole('button', { name: 'Replace with steps needing review' }),
    ).toBeInTheDocument()
  })

  it('clears the Smart Paste preview when pasted text changes', async () => {
    const user = userEvent.setup()

    renderCreateForm()

    const panel = await previewSmartPasteSteps(
      user,
      '1. Old action | Old expected',
    )

    expect(panel.getByText('Old action')).toBeInTheDocument()
    expect(panel.getByRole('button', { name: 'Append steps' })).toBeInTheDocument()

    await user.clear(panel.getByLabelText('Paste step text'))
    await user.type(
      panel.getByLabelText('Paste step text'),
      '1. New action | New expected',
    )

    expect(panel.queryByText('Old action')).not.toBeInTheDocument()
    expect(
      panel.queryByRole('button', { name: 'Append steps' }),
    ).not.toBeInTheDocument()

    await user.click(panel.getByRole('button', { name: 'Preview steps' }))
    await user.click(panel.getByRole('button', { name: 'Append steps' }))

    expect(screen.getByLabelText('Step 1 action')).toHaveValue('New action')
    expect(screen.getByLabelText('Step 1 expected result')).toHaveValue(
      'New expected',
    )
    expect(screen.queryByText('Old action')).not.toBeInTheDocument()
  })

  it('does not offer Smart Paste insert actions when no valid steps are detected', async () => {
    const user = userEvent.setup()

    renderCreateForm()

    const panel = await previewSmartPasteSteps(user, 'Open login without numbering')

    expect(panel.getByText('No steps detected')).toBeInTheDocument()
    expect(panel.getByText('0 detected')).toBeInTheDocument()
    expect(panel.getByText('1 invalid lines')).toBeInTheDocument()
    expect(
      panel.queryByRole('button', { name: 'Append steps' }),
    ).not.toBeInTheDocument()
    expect(
      panel.queryByRole('button', { name: 'Replace current steps' }),
    ).not.toBeInTheDocument()
  })

  it('replaces the blank starter step when appending Smart Paste steps to a fresh form', async () => {
    const user = userEvent.setup()

    renderCreateForm()

    const panel = await previewSmartPasteSteps(
      user,
      [
        '1. Open login page | Login form is displayed',
        '2. Enter valid email | Email is accepted',
      ].join('\n'),
    )

    await user.click(panel.getByRole('button', { name: 'Append steps' }))

    expect(screen.getByLabelText('Step 1 action')).toHaveValue(
      'Open login page',
    )
    expect(screen.getByLabelText('Step 1 expected result')).toHaveValue(
      'Login form is displayed',
    )
    expect(screen.getByLabelText('Step 2 action')).toHaveValue(
      'Enter valid email',
    )
    expect(screen.queryByLabelText('Step 3 action')).not.toBeInTheDocument()
  })

  it('appends Smart Paste steps after existing steps', async () => {
    const user = userEvent.setup()

    renderCreateForm()

    await fillStep(user, 1, 'Existing action', 'Existing expected')

    const panel = await previewSmartPasteSteps(
      user,
      [
        '1. Open login page | Login form is displayed',
        '2. Enter valid email | Email is accepted',
      ].join('\n'),
    )

    await user.click(panel.getByRole('button', { name: 'Append steps' }))

    expect(screen.queryByRole('region', { name: 'Smart Paste Steps' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Step 1 action')).toHaveValue('Existing action')
    expect(screen.getByLabelText('Step 2 action')).toHaveValue(
      'Open login page',
    )
    expect(screen.getByLabelText('Step 2 expected result')).toHaveValue(
      'Login form is displayed',
    )
    expect(screen.getByLabelText('Step 3 action')).toHaveValue(
      'Enter valid email',
    )
  })

  it('replaces current steps only after explicit Smart Paste confirmation', async () => {
    const user = userEvent.setup()

    renderCreateForm()

    await fillStep(user, 1, 'Existing action', 'Existing expected')

    const panel = await previewSmartPasteSteps(
      user,
      '1. Replacement action | Replacement expected',
    )

    expect(screen.getByLabelText('Step 1 action')).toHaveValue('Existing action')

    await user.click(panel.getByRole('button', { name: 'Replace current steps' }))

    expect(screen.getByLabelText('Step 1 action')).toHaveValue(
      'Replacement action',
    )
    expect(screen.getByLabelText('Step 1 expected result')).toHaveValue(
      'Replacement expected',
    )
    expect(screen.queryByLabelText('Step 2 action')).not.toBeInTheDocument()
  })

  it('cancels Smart Paste without changing current steps', async () => {
    const user = userEvent.setup()

    renderCreateForm()

    await fillStep(user, 1, 'Existing action', 'Existing expected')

    const panel = await previewSmartPasteSteps(
      user,
      '1. Replacement action | Replacement expected',
    )

    await user.click(panel.getByRole('button', { name: 'Cancel Smart Paste' }))

    expect(screen.queryByRole('region', { name: 'Smart Paste Steps' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Step 1 action')).toHaveValue('Existing action')
    expect(screen.getByLabelText('Step 1 expected result')).toHaveValue(
      'Existing expected',
    )
  })

  it('prevents saving inserted incomplete Smart Paste steps until expected result is filled', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()

    renderCreateForm(onSubmit)

    await fillBaseFields(user)

    const panel = await previewSmartPasteSteps(user, '1. Open login page')

    await user.click(
      panel.getByRole('button', { name: 'Replace with steps needing review' }),
    )
    await user.click(screen.getByRole('button', { name: 'Create test case' }))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Step 1 expected result')).toHaveFocus()
    expect(
      screen.getByText('Step expected result is required.'),
    ).toBeInTheDocument()

    await user.type(
      screen.getByLabelText('Step 1 expected result'),
      'Login form is displayed',
    )
    await user.click(screen.getByRole('button', { name: 'Create test case' }))

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        steps: '1. Open login page',
        expectedResult: '1. Login form is displayed',
        structuredSteps: [
          expect.objectContaining({
            action: 'Open login page',
            expectedResult: 'Login form is displayed',
          }),
        ],
      }),
    )
  })

  it('submits complete Smart Paste steps as structured steps and compatibility fields', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()

    renderCreateForm(onSubmit)

    await fillBaseFields(user)

    const panel = await previewSmartPasteSteps(
      user,
      [
        '1. Open login page | Login form is displayed',
        '2. Enter valid email | Email is accepted',
      ].join('\n'),
    )

    await user.click(panel.getByRole('button', { name: 'Replace current steps' }))
    await user.click(screen.getByRole('button', { name: 'Create test case' }))

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        steps: '1. Open login page\n2. Enter valid email',
        expectedResult: '1. Login form is displayed\n2. Email is accepted',
        structuredSteps: [
          expect.objectContaining({
            action: 'Open login page',
            expectedResult: 'Login form is displayed',
          }),
          expect.objectContaining({
            action: 'Enter valid email',
            expectedResult: 'Email is accepted',
          }),
        ],
      }),
    )
  })

  it('initializes old flat test cases as one editable structured step', () => {
    render(
      <TestCaseForm
        mode="edit"
        initialValues={createTestCase({
          steps: 'Open the legacy checkout.',
          expectedResult: 'Legacy checkout opens.',
        })}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.getByLabelText('Preconditions')).toHaveValue('')
    expect(screen.getByLabelText('Step 1 action')).toHaveValue(
      'Open the legacy checkout.',
    )
    expect(screen.getByLabelText('Step 1 expected result')).toHaveValue(
      'Legacy checkout opens.',
    )
  })
})
