import { useState } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRelease } from '../../test/releaseFactory'
import type { Release } from './releaseTypes'
import { ReleasesPage } from './ReleasesPage'

function renderReleasesPage(initialReleases: Release[] = []) {
  function Harness() {
    const [releases, setReleases] = useState(initialReleases)

    return <ReleasesPage releases={releases} onChange={setReleases} />
  }

  return render(<Harness />)
}

function getReleaseCard(name: string) {
  const heading = screen.getByRole('heading', { name })
  const card = heading.closest('article')

  if (!card) {
    throw new Error(`Could not find release card for "${name}"`)
  }

  return within(card)
}

async function createReleaseThroughPage(
  user: ReturnType<typeof userEvent.setup>,
  values: {
    name: string
    version: string
    targetDate: string
    status: Release['status']
    notes?: string
  },
) {
  await user.click(screen.getByRole('button', { name: 'New release' }))

  const form = within(screen.getByRole('form', { name: 'Create Release form' }))

  await user.type(form.getByLabelText('Release name'), values.name)
  await user.type(form.getByLabelText('Version'), values.version)
  await user.type(form.getByLabelText('Target date'), values.targetDate)
  await user.selectOptions(form.getByLabelText('Release status'), values.status)

  if (values.notes) {
    await user.type(form.getByLabelText('Notes'), values.notes)
  }

  await user.click(form.getByRole('button', { name: 'Create release' }))
}

describe('ReleasesPage', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('creates multiple releases with distinct status values', async () => {
    const user = userEvent.setup()

    renderReleasesPage()

    await createReleaseThroughPage(user, {
      name: 'Checkout GA',
      version: 'v1.4.0',
      targetDate: '2026-05-21',
      status: 'In Testing',
      notes: 'Checkout validation in progress.',
    })
    await createReleaseThroughPage(user, {
      name: 'Profile Patch',
      version: 'v1.4.1',
      targetDate: '2026-05-28',
      status: 'Ready',
    })

    const checkoutCard = getReleaseCard('Checkout GA')
    const profileCard = getReleaseCard('Profile Patch')

    expect(checkoutCard.getByText('v1.4.0')).toBeInTheDocument()
    expect(checkoutCard.getByText('In Testing')).toBeInTheDocument()
    expect(checkoutCard.getByText('Target: 2026-05-21')).toBeInTheDocument()
    expect(checkoutCard.getByText('Checkout validation in progress.')).toBeInTheDocument()
    expect(profileCard.getByText('v1.4.1')).toBeInTheDocument()
    expect(profileCard.getByText('Ready')).toBeInTheDocument()
    expect(profileCard.getByText('Target: 2026-05-28')).toBeInTheDocument()
    expect(screen.getByText('2 total')).toBeInTheDocument()
  })

  it('edits and deletes releases without removing the remaining releases', async () => {
    const user = userEvent.setup()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)

    renderReleasesPage([
      createRelease({
        id: 'checkout',
        name: 'Checkout GA',
        version: 'v1.4.0',
      }),
      createRelease({
        id: 'profile',
        name: 'Profile Patch',
        version: 'v1.4.1',
      }),
    ])

    await user.click(getReleaseCard('Checkout GA').getByRole('button', {
      name: 'Edit',
    }))

    const form = within(screen.getByRole('form', { name: 'Edit Release form' }))

    await user.clear(form.getByLabelText('Release name'))
    await user.type(form.getByLabelText('Release name'), 'Checkout GA Candidate')
    await user.selectOptions(form.getByLabelText('Release status'), 'Released')
    await user.click(form.getByRole('button', { name: 'Save changes' }))

    expect(screen.queryByText('Checkout GA')).not.toBeInTheDocument()
    expect(screen.getByText('Checkout GA Candidate')).toBeInTheDocument()
    expect(getReleaseCard('Checkout GA Candidate').getByText('Released')).toBeInTheDocument()

    await user.click(getReleaseCard('Checkout GA Candidate').getByRole('button', {
      name: 'Delete',
    }))

    expect(confirmSpy).toHaveBeenCalledWith('Delete "Checkout GA Candidate"?')
    expect(screen.queryByText('Checkout GA Candidate')).not.toBeInTheDocument()
    expect(screen.getByText('Profile Patch')).toBeInTheDocument()
    expect(screen.getByText('1 total')).toBeInTheDocument()
  })

  it('filters releases by name or version search only', async () => {
    const user = userEvent.setup()

    renderReleasesPage([
      createRelease({ id: 'checkout', name: 'Checkout GA', version: 'v1.4.0' }),
      createRelease({ id: 'profile', name: 'Profile Patch', version: 'v1.4.1' }),
    ])

    const filters = within(
      screen.getByRole('region', { name: 'Release Search and Filters' }),
    )

    await user.type(filters.getByLabelText('Search by name or version'), '1.4.1')

    expect(screen.queryByText('Checkout GA')).not.toBeInTheDocument()
    expect(screen.getByText('Profile Patch')).toBeInTheDocument()
    expect(screen.getByText('1 of 2 shown')).toBeInTheDocument()
  })

  it('filters releases by status only', async () => {
    const user = userEvent.setup()

    renderReleasesPage([
      createRelease({
        id: 'testing',
        name: 'Checkout GA',
        status: 'In Testing',
      }),
      createRelease({
        id: 'blocked',
        name: 'Profile Patch',
        status: 'Blocked',
      }),
    ])

    const filters = within(
      screen.getByRole('region', { name: 'Release Search and Filters' }),
    )

    await user.selectOptions(filters.getByLabelText('Filter by status'), [
      'Blocked',
    ])

    expect(screen.queryByText('Checkout GA')).not.toBeInTheDocument()
    expect(screen.getByText('Profile Patch')).toBeInTheDocument()
    expect(screen.getByText('1 of 2 shown')).toBeInTheDocument()
  })
})
