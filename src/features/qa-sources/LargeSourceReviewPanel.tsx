import { useId } from 'react'
import {
  deriveQaSourceReviewProgress,
  filterQaSourceReviewSections,
  findNextQaSourceReviewSection,
  type QaSourceReviewFilter,
  type QaSourceReviewSectionItem,
} from './qaSourceReviewProgress'

export type LargeSourceReviewPanelProps = {
  sourceTitle: string
  sourceCharacterCount: number
  items: readonly QaSourceReviewSectionItem[]
  activeFilter: QaSourceReviewFilter
  selectedSectionId?: string | null
  onFilterChange: (filter: QaSourceReviewFilter) => void
  onSelectNextSection: (sectionId: string) => void
}

const FILTER_OPTIONS: ReadonlyArray<{
  value: QaSourceReviewFilter
  label: string
}> = [
  { value: 'all', label: 'All' },
  { value: 'needs_analysis', label: 'Needs analysis' },
  { value: 'current', label: 'Current' },
  { value: 'not_analyzed', label: 'Not analyzed' },
  { value: 'stale', label: 'Stale' },
  { value: 'failed', label: 'Failed' },
  { value: 'oversized', label: 'Oversized' },
]

export function LargeSourceReviewPanel({
  sourceTitle,
  sourceCharacterCount,
  items,
  activeFilter,
  selectedSectionId = null,
  onFilterChange,
  onSelectNextSection,
}: LargeSourceReviewPanelProps) {
  const headingId = useId()
  const progress = deriveQaSourceReviewProgress({
    sourceCharacterCount,
    items,
  })
  const nextSection = findNextQaSourceReviewSection({
    items,
    filter: activeFilter,
    selectedSectionId,
  })
  const filteredItems = filterQaSourceReviewSections(items, activeFilter)

  if (!progress.isGuidedReviewRecommended) {
    return null
  }

  const { statusCounts } = progress

  return (
    <section
      className="source-structure-panel__guided-review"
      aria-labelledby={headingId}
    >
      <div className="panel-heading">
        <div className="panel-heading__content">
          <h4 id={headingId}>Large source — guided review</h4>
          <p>
            Review “{sourceTitle}” one section at a time. This map is not
            coverage proof, a coverage percentage, or QA approval.
          </p>
        </div>
      </div>

      <p>
        Analyze Entire Specification processes all {sourceCharacterCount.toLocaleString()} characters
        as bounded regions. Use the section tools here for optional focused review;
        you do not need to manually split this source.
      </p>

      <dl aria-label="Section analysis status counts">
        <div>
          <dt>Current</dt>
          <dd>{statusCounts.current}</dd>
        </div>
        <div>
          <dt>Not analyzed</dt>
          <dd>{statusCounts.notAnalyzed}</dd>
        </div>
        <div>
          <dt>Stale</dt>
          <dd>{statusCounts.stale}</dd>
        </div>
        <div>
          <dt>Failed</dt>
          <dd>{statusCounts.failed}</dd>
        </div>
        <div>
          <dt>Analyzing</dt>
          <dd>{statusCounts.analyzing}</dd>
        </div>
      </dl>

      {progress.oversizedSectionCount > 0 ? (
        <p role="status">
          {progress.oversizedSectionCount}{' '}
          {progress.oversizedSectionCount === 1 ? 'section exceeds' : 'sections exceed'}{' '}
          a single-request boundary. Whole-specification analysis recursively
          handles these sections without omitting their later content.
        </p>
      ) : null}

      <fieldset>
        <legend>Filter source sections</legend>
        <div className="badge-row">
          {FILTER_OPTIONS.map((option) => (
            <label key={option.value}>
              <input
                type="radio"
                name={`${headingId}-filter`}
                value={option.value}
                checked={activeFilter === option.value}
                onChange={() => onFilterChange(option.value)}
              />{' '}
              {option.label}
            </label>
          ))}
        </div>
        <p className="helper-text">
          Showing {filteredItems.length} of {items.length} sections.
        </p>
      </fieldset>

      <div>
        <button
          type="button"
          className="button button--secondary button--compact"
          disabled={!nextSection}
          onClick={() => {
            if (nextSection) {
              onSelectNextSection(nextSection.sectionId)
            }
          }}
        >
          Select next section
        </button>
        <p>
          Selecting a section does not contact AI. Analysis starts only when
          you explicitly choose Analyze section.
        </p>
      </div>
    </section>
  )
}
