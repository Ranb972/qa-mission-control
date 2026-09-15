import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LargeSourceReviewPanel } from './LargeSourceReviewPanel'
import type {
  QaSourceReviewFilter,
  QaSourceReviewSectionItem,
} from './qaSourceReviewProgress'

function createItems(): QaSourceReviewSectionItem[] {
  return [
    {
      sectionId: 'section-1',
      ordinal: 1,
      title: 'Authentication',
      characterCount: 8_000,
      status: 'Current',
    },
    {
      sectionId: 'section-2',
      ordinal: 2,
      title: 'Billing',
      characterCount: 12_000,
      status: 'Not analyzed',
    },
    {
      sectionId: 'section-3',
      ordinal: 3,
      title: 'Recovery',
      characterCount: 24_001,
      status: 'Stale',
    },
    {
      sectionId: 'section-4',
      ordinal: 4,
      title: 'Notifications',
      characterCount: 4_000,
      status: 'Failed',
    },
  ]
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('LargeSourceReviewPanel', () => {
  it('renders bounded visibility, review counts, and explicit trust limits', () => {
    render(
      <LargeSourceReviewPanel
        sourceTitle="Enterprise PRD"
        sourceCharacterCount={80_000}
        items={createItems()}
        activeFilter="all"
        onFilterChange={vi.fn()}
        onSelectNextSection={vi.fn()}
      />,
    )

    const region = screen.getByRole('region', {
      name: 'Large source — guided review',
    })

    expect(region).toHaveTextContent(
      'Analyze Entire Specification processes all 80,000 characters',
    )
    expect(region).toHaveTextContent(
      'not coverage proof, a coverage percentage, or QA approval',
    )
    expect(screen.getAllByRole('definition')).toHaveLength(5)
    expect(region).toHaveTextContent('Current1')
    expect(region).toHaveTextContent('Not analyzed1')
    expect(region).toHaveTextContent('Stale1')
    expect(region).toHaveTextContent('Failed1')
    expect(region).toHaveTextContent('Analyzing0')
    expect(region).toHaveTextContent('Showing 4 of 4 sections')
    expect(region).toHaveTextContent('1 section exceeds a single-request boundary')
    expect(region).toHaveTextContent('Selecting a section does not contact AI')
  })

  it('exposes controlled filters without performing selection or network work', async () => {
    const user = userEvent.setup()
    const onFilterChange = vi.fn<(filter: QaSourceReviewFilter) => void>()
    const onSelectNextSection = vi.fn()
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    render(
      <LargeSourceReviewPanel
        sourceTitle="Enterprise PRD"
        sourceCharacterCount={80_000}
        items={createItems()}
        activeFilter="all"
        onFilterChange={onFilterChange}
        onSelectNextSection={onSelectNextSection}
      />,
    )

    await user.click(screen.getByRole('radio', { name: 'Stale' }))

    expect(onFilterChange).toHaveBeenCalledTimes(1)
    expect(onFilterChange).toHaveBeenCalledWith('stale')
    expect(onSelectNextSection).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('selects only the next derived section and never starts provider work', async () => {
    const user = userEvent.setup()
    const onSelectNextSection = vi.fn()
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    render(
      <LargeSourceReviewPanel
        sourceTitle="Enterprise PRD"
        sourceCharacterCount={80_000}
        items={createItems()}
        activeFilter="needs_analysis"
        selectedSectionId="section-2"
        onFilterChange={vi.fn()}
        onSelectNextSection={onSelectNextSection}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Select next section' }))

    expect(onSelectNextSection).toHaveBeenCalledTimes(1)
    expect(onSelectNextSection).toHaveBeenCalledWith('section-3')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('does not render for a source that fits all review limits', () => {
    const { container } = render(
      <LargeSourceReviewPanel
        sourceTitle="Small requirement"
        sourceCharacterCount={10_000}
        items={[
          {
            sectionId: 'section-1',
            ordinal: 1,
            title: 'Requirement',
            characterCount: 10_000,
            status: 'Not analyzed',
          },
        ]}
        activeFilter="all"
        onFilterChange={vi.fn()}
        onSelectNextSection={vi.fn()}
      />,
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('disables next selection when the active filter has no later section', () => {
    render(
      <LargeSourceReviewPanel
        sourceTitle="Enterprise PRD"
        sourceCharacterCount={80_000}
        items={createItems()}
        activeFilter="failed"
        selectedSectionId="section-4"
        onFilterChange={vi.fn()}
        onSelectNextSection={vi.fn()}
      />,
    )

    expect(
      screen.getByRole('button', { name: 'Select next section' }),
    ).toBeDisabled()
  })
})
