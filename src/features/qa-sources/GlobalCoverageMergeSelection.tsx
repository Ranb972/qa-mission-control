import { useState } from 'react'
import { CollectionPager } from '../../components/ui/CollectionPager'

export type GlobalCoverageMergeSelectionStatus =
  | 'Current'
  | 'Stale'
  | 'Not analyzed'
  | 'Failed'
  | 'Analyzing'
  | 'Excluded'

export type GlobalCoverageMergeSelectionItem = {
  sectionId: string
  recordId: string | null
  ordinal: number
  title: string
  path: string[]
  startLine: number
  endLine: number
  characterCount: number
  status: GlobalCoverageMergeSelectionStatus
  ineligibilityReason: string | null
}

type GlobalCoverageMergeSelectionProps = {
  sourceTitle: string
  items: GlobalCoverageMergeSelectionItem[]
  selectedRecordIds: string[]
  isBuilding?: boolean
  onSelectedRecordIdsChange: (recordIds: string[]) => void
  onBuild: (recordIds: string[]) => void
  onExit: () => void
}

const MAX_SELECTED_ANALYSES = 8

function formatCharacterCount(count: number) {
  return `${count.toLocaleString()} characters`
}

export function GlobalCoverageMergeSelection({
  sourceTitle,
  items,
  selectedRecordIds,
  isBuilding = false,
  onSelectedRecordIdsChange,
  onBuild,
  onExit,
}: GlobalCoverageMergeSelectionProps) {
  const selectedRecordIdSet = new Set(selectedRecordIds)
  const selectedCount = selectedRecordIds.length
  const [query, setQuery] = useState('')
  const [currentOnly, setCurrentOnly] = useState(false)
  const [page, setPage] = useState(0)
  const filteredItems = items.filter((item) => (!currentOnly || item.status === 'Current') && item.path.join(' / ').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  const currentPage = Math.min(page, Math.max(0, Math.ceil(filteredItems.length / 40) - 1))

  function toggleRecord(recordId: string, checked: boolean) {
    if (checked) {
      if (
        selectedRecordIdSet.has(recordId) ||
        selectedCount >= MAX_SELECTED_ANALYSES
      ) {
        return
      }

      onSelectedRecordIdsChange([...selectedRecordIds, recordId])
      return
    }

    onSelectedRecordIdsChange(
      selectedRecordIds.filter((candidate) => candidate !== recordId),
    )
  }

  function exitMergeSelection() {
    onSelectedRecordIdsChange([])
    onExit()
  }

  return (
    <div className="global-coverage-merge-selection">
      <div className="global-coverage-merge-selection__heading">
        <div>
          <h4>Select analyses to merge</h4>
          <p>
            Select 2–8 Current Section Coverage Plans. Selection is temporary
            and does not send a request.
          </p>
        </div>
        <button
          type="button"
          className="button button--secondary button--compact"
          onClick={exitMergeSelection}
        >
          Exit merge selection
        </button>
      </div>

      <fieldset
        className="source-structure-selection global-coverage-merge-selection__fieldset"
        aria-label={`Select current section analyses from ${sourceTitle} to merge`}
      >
        <legend className="visually-hidden">
          Select current section analyses to merge
        </legend>
        {items.length > 40 ? <div className="structure-search">
          <label>Find analyses<input type="search" className="input" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0) }} /></label>
          <label><input type="checkbox" checked={currentOnly} onChange={(event) => { setCurrentOnly(event.target.checked); setPage(0) }} /> Current analyses only</label>
        </div> : null}
        <CollectionPager label="Merge analysis pages" page={currentPage} pageSize={40} total={filteredItems.length} onPageChange={setPage} />
        <ol className="source-structure-list global-coverage-merge-selection__list">
          {filteredItems.slice(currentPage * 40, (currentPage + 1) * 40).map((item) => {
            const isCurrent = item.status === 'Current' && item.recordId !== null
            const isChecked = Boolean(
              item.recordId && selectedRecordIdSet.has(item.recordId),
            )
            const isAtLimit = selectedCount >= MAX_SELECTED_ANALYSES
            const isDisabled =
              !isCurrent || (!isChecked && isAtLimit) || isBuilding
            const limitReason =
              isCurrent && !isChecked && isAtLimit
                ? 'The 8-analysis maximum is selected.'
                : null

            return (
              <li
                key={item.sectionId}
                className={
                  isCurrent
                    ? 'source-structure-list__item global-coverage-merge-selection__item'
                    : 'source-structure-list__item source-structure-list__item--excluded global-coverage-merge-selection__item'
                }
              >
                <label className="source-structure-option global-coverage-merge-selection__option">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    disabled={isDisabled}
                    onChange={(event) => {
                      if (item.recordId) {
                        toggleRecord(item.recordId, event.target.checked)
                      }
                    }}
                  />
                  <span className="source-structure-option__content">
                    <strong>
                      {item.ordinal}. {item.title}
                    </strong>
                    <span>Path: {item.path.join(' / ')}</span>
                    <span>
                      Lines {item.startLine}-{item.endLine} -{' '}
                      {formatCharacterCount(item.characterCount)}
                    </span>
                    {item.ineligibilityReason || limitReason ? (
                      <span className="global-coverage-merge-selection__reason">
                        {item.ineligibilityReason ?? limitReason}
                      </span>
                    ) : null}
                  </span>
                  <span
                    className={
                      'section-coverage-status section-coverage-status--' +
                      item.status.toLowerCase().replaceAll(' ', '-')
                    }
                  >
                    {item.status}
                  </span>
                </label>
              </li>
            )
          })}
        </ol>
      </fieldset>

      <div className="global-coverage-merge-selection__actions">
        <p
          className="global-coverage-merge-selection__count"
          role="status"
          aria-live="polite"
        >
          {selectedCount} of {MAX_SELECTED_ANALYSES} selected
        </p>
        <button
          type="button"
          className="button button--primary"
          disabled={selectedCount < 2 || selectedCount > 8 || isBuilding}
          onClick={() => onBuild(selectedRecordIds)}
        >
          {isBuilding ? 'Building global coverage plan…' : 'Build global coverage plan'}
        </button>
      </div>
    </div>
  )
}
