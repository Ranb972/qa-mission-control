import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import {
  GlobalCoverageMergeSelection,
  type GlobalCoverageMergeSelectionItem,
} from './GlobalCoverageMergeSelection'

function createItem(
  ordinal: number,
  status: GlobalCoverageMergeSelectionItem['status'] = 'Current',
): GlobalCoverageMergeSelectionItem {
  return {
    sectionId: `section-${ordinal}`,
    recordId: status === 'Current' ? `record-${ordinal}` : null,
    ordinal,
    title: `Section ${ordinal}`,
    path: ['Source', `Section ${ordinal}`],
    startLine: ordinal * 10,
    endLine: ordinal * 10 + 4,
    characterCount: 120 + ordinal,
    status,
    ineligibilityReason:
      status === 'Current'
        ? null
        : status === 'Stale'
          ? 'Re-analyze this section for the current source revision.'
          : status === 'Excluded'
            ? 'This section is excluded from coverage.'
            : `${status} analyses cannot be merged.`,
  }
}

function Harness({
  items,
  onBuild = vi.fn(),
  onExit = vi.fn(),
}: {
  items: GlobalCoverageMergeSelectionItem[]
  onBuild?: (recordIds: string[]) => void
  onExit?: () => void
}) {
  const [selectedRecordIds, setSelectedRecordIds] = useState<string[]>([])

  return (
    <GlobalCoverageMergeSelection
      sourceTitle="Merge LLD"
      items={items}
      selectedRecordIds={selectedRecordIds}
      onSelectedRecordIdsChange={setSelectedRecordIds}
      onBuild={onBuild}
      onExit={onExit}
    />
  )
}

describe('GlobalCoverageMergeSelection', () => {
  it('keeps selections across pages and searches without starting a merge', async () => {
    const user = userEvent.setup()
    const onBuild = vi.fn()
    render(<Harness items={Array.from({ length: 1001 }, (_, index) => createItem(index + 1))} onBuild={onBuild} />)
    const list = screen.getByRole('list')
    expect(within(list).getAllByRole('checkbox')).toHaveLength(40)
    await user.click(within(list).getAllByRole('checkbox')[0])
    await user.click(screen.getByRole('button', { name: 'Next', exact: true }))
    await user.click(within(list).getAllByRole('checkbox')[0])
    await user.type(screen.getByRole('searchbox', { name: 'Find analyses' }), 'Section 1001')
    expect(within(list).getAllByRole('checkbox')).toHaveLength(1)
    expect(screen.getByText('2 of 8 selected')).toBeVisible()
    expect(onBuild).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Build global coverage plan' }))
    expect(onBuild).toHaveBeenCalledWith(['record-1', 'record-41'])
  })
  it('uses native Current-only checkboxes with nothing preselected and no per-row action', async () => {
    const user = userEvent.setup()
    const onBuild = vi.fn()
    const items = [
      createItem(1),
      createItem(2),
      createItem(3, 'Stale'),
      createItem(4, 'Not analyzed'),
      createItem(5, 'Failed'),
      createItem(6, 'Analyzing'),
      createItem(7, 'Excluded'),
    ]

    render(<Harness items={items} onBuild={onBuild} />)

    const group = screen.getByRole('group', {
      name: 'Select current section analyses from Merge LLD to merge',
    })
    const checkboxes = within(group).getAllByRole('checkbox')

    expect(checkboxes).toHaveLength(7)
    expect(within(group).queryByRole('radio')).not.toBeInTheDocument()
    expect(checkboxes.every((checkbox) => !checkbox.hasAttribute('checked'))).toBe(
      true,
    )
    expect(checkboxes[0]).toBeEnabled()
    expect(checkboxes[1]).toBeEnabled()
    expect(checkboxes.slice(2).every((checkbox) => checkbox.hasAttribute('disabled'))).toBe(
      true,
    )
    expect(screen.getByText('0 of 8 selected')).toBeVisible()
    expect(screen.getByText(/Re-analyze this section/)).toBeVisible()
    expect(screen.getByText(/excluded from coverage/)).toBeVisible()
    expect(screen.getAllByRole('button')).toHaveLength(2)
    expect(
      screen.getByRole('button', { name: 'Build global coverage plan' }),
    ).toBeDisabled()

    await user.click(checkboxes[0])

    expect(onBuild).not.toHaveBeenCalled()
    expect(screen.getByText('1 of 8 selected')).toBeVisible()
  })

  it('enforces the 2-selection minimum and 8-selection maximum with keyboard operation', async () => {
    const user = userEvent.setup()
    const onBuild = vi.fn()
    const items = Array.from({ length: 9 }, (_, index) => createItem(index + 1))

    render(<Harness items={items} onBuild={onBuild} />)

    const checkboxes = screen.getAllByRole('checkbox')
    checkboxes[0].focus()
    await user.keyboard(' ')
    expect(checkboxes[0]).toHaveFocus()
    expect(checkboxes[0]).toBeChecked()
    expect(
      screen.getByRole('button', { name: 'Build global coverage plan' }),
    ).toBeDisabled()

    await user.click(checkboxes[1])
    const buildButton = screen.getByRole('button', {
      name: 'Build global coverage plan',
    })
    expect(buildButton).toBeEnabled()

    for (const checkbox of checkboxes.slice(2, 8)) {
      await user.click(checkbox)
    }

    expect(screen.getByText('8 of 8 selected')).toBeVisible()
    expect(checkboxes[8]).toBeDisabled()
    await user.click(buildButton)
    expect(onBuild).toHaveBeenCalledTimes(1)
    expect(onBuild).toHaveBeenCalledWith([
      'record-1',
      'record-2',
      'record-3',
      'record-4',
      'record-5',
      'record-6',
      'record-7',
      'record-8',
    ])
  })

  it('clears transient selection before leaving merge mode', async () => {
    const user = userEvent.setup()
    const onExit = vi.fn()

    render(<Harness items={[createItem(1), createItem(2)]} onExit={onExit} />)

    await user.click(screen.getAllByRole('checkbox')[0])
    expect(screen.getByText('1 of 8 selected')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Exit merge selection' }))

    expect(onExit).toHaveBeenCalledTimes(1)
    expect(screen.getByText('0 of 8 selected')).toBeVisible()
  })
})
