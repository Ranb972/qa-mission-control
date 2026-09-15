import { useState } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRisk } from '../../test/riskFactory'
import type { Risk } from './riskTypes'
import { RisksPage } from './RisksPage'

function renderRisksPage(initialRisks: Risk[] = []) {
  function Harness() {
    const [risks, setRisks] = useState(initialRisks)

    return <RisksPage risks={risks} onChange={setRisks} />
  }

  return render(<Harness />)
}

function getRiskCard(title: string) {
  const heading = screen.getByRole('heading', { name: title })
  const card = heading.closest('article')

  if (!card) {
    throw new Error(`Could not find risk card for "${title}"`)
  }

  return within(card)
}

async function createRiskThroughPage(
  user: ReturnType<typeof userEvent.setup>,
  values: {
    title: string
    description: string
    mitigationPlan: string
    status: Risk['status']
    impact: Risk['impact']
    likelihood: Risk['likelihood']
  },
) {
  await user.click(screen.getByRole('button', { name: 'New risk' }))

  const form = within(screen.getByRole('form', { name: 'Create Risk form' }))

  await user.type(form.getByLabelText('Title'), values.title)
  await user.type(form.getByLabelText('Description'), values.description)
  await user.selectOptions(form.getByLabelText('Risk status'), values.status)
  await user.selectOptions(form.getByLabelText('Risk impact'), values.impact)
  await user.selectOptions(
    form.getByLabelText('Risk likelihood'),
    values.likelihood,
  )
  await user.type(form.getByLabelText('Mitigation Plan'), values.mitigationPlan)
  await user.click(form.getByRole('button', { name: 'Create risk' }))
}

describe('RisksPage', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('creates multiple risks with distinct status, impact, and likelihood values', async () => {
    const user = userEvent.setup()

    renderRisksPage()

    await createRiskThroughPage(user, {
      title: 'Payment provider outage',
      description: 'Provider instability may block checkout testing.',
      mitigationPlan: 'Prepare fallback payment test data.',
      status: 'Mitigating',
      impact: 'Critical',
      likelihood: 'High',
    })
    await createRiskThroughPage(user, {
      title: 'Documentation delay',
      description: 'Release notes may not be ready for signoff.',
      mitigationPlan: 'Assign a backup owner for release notes.',
      status: 'Accepted',
      impact: 'Low',
      likelihood: 'Low',
    })

    const paymentCard = getRiskCard('Payment provider outage')
    const documentationCard = getRiskCard('Documentation delay')

    expect(paymentCard.getAllByText('Mitigating')).toHaveLength(2)
    expect(paymentCard.getByText('Impact: Critical')).toBeInTheDocument()
    expect(paymentCard.getByText('Likelihood: High')).toBeInTheDocument()
    expect(documentationCard.getAllByText('Accepted')).toHaveLength(2)
    expect(documentationCard.getByText('Impact: Low')).toBeInTheDocument()
    expect(documentationCard.getByText('Likelihood: Low')).toBeInTheDocument()
    expect(screen.getByText('2 total')).toBeInTheDocument()
  })

  it('filters risks by title search only', async () => {
    const user = userEvent.setup()

    renderRisksPage([
      createRisk({
        id: 'matching',
        title: 'Payment provider outage',
        status: 'Mitigating',
        impact: 'Critical',
        likelihood: 'High',
      }),
      createRisk({
        id: 'hidden',
        title: 'Documentation delay',
        status: 'Open',
        impact: 'Low',
        likelihood: 'Low',
      }),
    ])

    const filters = within(
      screen.getByRole('region', { name: 'Risk Search and Filters' }),
    )

    await user.type(filters.getByLabelText('Search by title'), 'payment')

    expect(screen.getByText('Payment provider outage')).toBeInTheDocument()
    expect(screen.queryByText('Documentation delay')).not.toBeInTheDocument()
    expect(screen.getByText('1 of 2 shown')).toBeInTheDocument()
  })

  it('filters risks by status only', async () => {
    const user = userEvent.setup()

    renderRisksPage([
      createRisk({
        id: 'matching',
        title: 'Payment provider outage',
        status: 'Mitigating',
        impact: 'Low',
        likelihood: 'Low',
      }),
      createRisk({
        id: 'hidden',
        title: 'Documentation delay',
        status: 'Open',
        impact: 'Critical',
        likelihood: 'High',
      }),
    ])

    const filters = within(
      screen.getByRole('region', { name: 'Risk Search and Filters' }),
    )

    await user.selectOptions(filters.getByLabelText('Filter by status'), [
      'Mitigating',
    ])

    expect(screen.getByText('Payment provider outage')).toBeInTheDocument()
    expect(screen.queryByText('Documentation delay')).not.toBeInTheDocument()
    expect(screen.getByText('1 of 2 shown')).toBeInTheDocument()
  })

  it('deletes one risk without removing the remaining risks', async () => {
    const user = userEvent.setup()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)

    renderRisksPage([
      createRisk({
        id: 'delete-target',
        title: 'Payment provider outage',
      }),
      createRisk({
        id: 'keep-target',
        title: 'Documentation delay',
      }),
    ])

    await user.click(getRiskCard('Payment provider outage').getByRole('button', {
      name: 'Delete',
    }))

    expect(confirmSpy).toHaveBeenCalledWith('Delete "Payment provider outage"?')
    expect(screen.queryByText('Payment provider outage')).not.toBeInTheDocument()
    expect(screen.getByText('Documentation delay')).toBeInTheDocument()
    expect(screen.getByText('1 total')).toBeInTheDocument()
  })
})
