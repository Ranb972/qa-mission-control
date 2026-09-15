import { EditorDialog } from '../../components/ui/EditorDialog'
import { useState } from 'react'
import { CollectionPager } from '../../components/ui/CollectionPager'
import { DocumentIntelligencePanel } from '../document-intelligence/DocumentIntelligencePanel'
import { ProductEvidencePanel } from '../product-evidence/ProductEvidencePanel'
import { SourceSetWorkspace } from '../document-intelligence/SourceSetWorkspace'
import { useWorkspace } from '../../lib/workspace/workspaceContext'
import type {
  AiSectionCoveragePlanProvider,
  PersistedSectionCoveragePlanRecord,
} from '../ai-suggestions/aiSectionCoveragePlanTypes'
import {
  findSectionCoveragePlanForSection,
  getSectionCoveragePlanFreshness,
  type SaveSectionCoveragePlansResult,
} from '../../lib/storage/sectionCoveragePlanStorage'
import {
  SectionCoverageAnalysisPanel,
  type SectionCoverageAnalysisRequestState,
} from './SectionCoverageAnalysisPanel'
import { EmptyState } from '../../components/ui/EmptyState'
import { formatDateTime } from '../../lib/formatters'
import {
  ALL_QA_SOURCE_STATUSES,
  ALL_QA_SOURCE_TYPES,
  filterAndSortQaSources,
  type QaSourceStatusFilter,
  type QaSourceTypeFilter,
} from './qaSourceFilters'
import { QaSourceForm } from './QaSourceForm'
import {
  QA_SOURCE_STATUSES,
  QA_SOURCE_TYPES,
  type QaSource,
  type QaSourceFormValues,
  type QaSourceStatus,
} from './qaSourceTypes'
import {
  createQaSourceSectionIndex,
  type QaSourceSectionIndex,
} from './qaSourceSections'
import {
  GlobalCoverageMergeSelection,
  type GlobalCoverageMergeSelectionItem,
} from './GlobalCoverageMergeSelection'
import { LargeSourceReviewPanel } from './LargeSourceReviewPanel'
import {
  deriveQaSourceReviewProgress,
  filterQaSourceReviewSections,
  type QaSourceReviewFilter,
  type QaSourceReviewSectionItem,
} from './qaSourceReviewProgress'

type QaSourcesPageProps = {
  qaSources: QaSource[]
  sourceSectionIndexes?: QaSourceSectionIndex[]
  sectionCoveragePlanRecords?: PersistedSectionCoveragePlanRecord[]
  sectionCoveragePlanProvider?: AiSectionCoveragePlanProvider
  onUpsertSectionCoveragePlan?: (
    record: PersistedSectionCoveragePlanRecord,
    replacedRecordId?: string,
  ) => SaveSectionCoveragePlansResult | Promise<SaveSectionCoveragePlansResult>
  onChange: (qaSources: QaSource[]) => void
  onSuggestTestCases?: (sourceId: string) => void
  selectedMergeRecords?: PersistedSectionCoveragePlanRecord[]
  onSelectedMergeRecordsChange?: (
    records: PersistedSectionCoveragePlanRecord[],
  ) => void
  onBuildGlobalCoveragePlan?: (
    sourceId: string,
    records: PersistedSectionCoveragePlanRecord[],
  ) => void
  isBuildingGlobalCoveragePlan?: boolean
}

type SelectedSectionIdentity = {
  qaSourceId: string
  sectionId: string
  stableKey: string
}

type SectionCoverageRequestStates = Record<
  string,
  SectionCoverageAnalysisRequestState
>

const INITIAL_SECTION_COVERAGE_ANALYSIS_REQUEST_STATE = {
  status: 'idle',
} as const satisfies SectionCoverageAnalysisRequestState

const UNAVAILABLE_SECTION_COVERAGE_PLAN_PROVIDER: AiSectionCoveragePlanProvider =
  {
    isAvailable: false,
    unavailableReason: 'Section analysis is not configured.',
    generateSectionCoveragePlan: () =>
      Promise.reject(new Error('Section analysis is not configured.')),
  }

const UNAVAILABLE_SECTION_COVERAGE_PLAN_SAVE = () => ({
  ok: false,
  error: 'Section coverage plan storage is not configured.',
})

function createQaSourceId() {
  const randomId = globalThis.crypto?.randomUUID?.()

  if (randomId) {
    return randomId
  }

  return `qa-source-${Date.now()}`
}

function getStatusTone(status: QaSourceStatus) {
  switch (status) {
    case 'Ready for test design':
      return 'positive'
    case 'Reviewed':
      return 'warning'
    case 'Draft':
    default:
      return 'neutral'
  }
}

function createPreview(value: string, maxLength = 260) {
  const normalizedValue = value.replace(/\s+/g, ' ').trim()

  if (normalizedValue.length <= maxLength) {
    return normalizedValue
  }

  return `${normalizedValue.slice(0, maxLength).trim()}...`
}

function isLongContent(value: string, maxLength = 260) {
  return value.replace(/\s+/g, ' ').trim().length > maxLength
}

function formatCharacterCount(count: number) {
  return `${count.toLocaleString()} characters`
}

function formatSectionCount(count: number) {
  return `${count} ${count === 1 ? 'section' : 'sections'}`
}

function getSectionDistributionLabel(sectionIndex: QaSourceSectionIndex) {
  const counts = sectionIndex.sections.map((section) => section.characterCount)
  const smallest = Math.min(...counts)
  const largest = Math.max(...counts)

  if (smallest === largest) {
    return `${formatCharacterCount(largest)} per section`
  }

  return `${formatCharacterCount(smallest)} to ${formatCharacterCount(largest)} per section`
}

function createSectionRequestStateKey(
  source: QaSource,
  sectionIndex: QaSourceSectionIndex,
  section: QaSourceSectionIndex['sections'][number],
) {
  return [
    source.id,
    source.createdAt,
    source.updatedAt,
    sectionIndex.sourceFingerprint,
    sectionIndex.sectionSetFingerprint,
    section.id,
    section.stableKey,
    section.contentFingerprint,
  ].join('\u001f')
}

function getSectionStatus(
  requestState: SectionCoverageAnalysisRequestState,
  savedRecord: PersistedSectionCoveragePlanRecord | null,
  freshness: ReturnType<typeof getSectionCoveragePlanFreshness> | null,
) {
  if (requestState.status === 'analyzing') {
    return 'Analyzing'
  }
  if (requestState.status === 'failed') {
    return 'Failed'
  }
  if (!savedRecord) {
    return 'Not analyzed'
  }
  return freshness?.isFresh ? 'Current' : 'Stale'
}

function getMergeIneligibilityReason(
  status: GlobalCoverageMergeSelectionItem['status'],
) {
  switch (status) {
    case 'Current':
      return null
    case 'Stale':
      return 'Re-analyze this section for the current source revision.'
    case 'Not analyzed':
      return 'Analyze this section before selecting it for a merge.'
    case 'Failed':
      return 'The latest analysis attempt failed; retry it before merging.'
    case 'Analyzing':
      return 'Wait for the current analysis to finish.'
    case 'Excluded':
      return 'This section is excluded from coverage.'
  }
}
function SourceStructurePanel({
  source,
  sectionIndex,
  selectedSection,
  records,
  provider,
  requestStates,
  onSelectSection,
  onRequestStateChange,
  onUpsert,
  mergeMode,
  selectedMergeRecordIds,
  canMerge,
  isBuildingMerge,
  onEnterMergeMode,
  onExitMergeMode,
  onMergeSelectionChange,
  onBuildMerge,
}: {
  source: QaSource
  sectionIndex: QaSourceSectionIndex
  selectedSection: SelectedSectionIdentity | null
  records: PersistedSectionCoveragePlanRecord[]
  provider: AiSectionCoveragePlanProvider
  requestStates: SectionCoverageRequestStates
  onSelectSection: (selection: SelectedSectionIdentity) => void
  onRequestStateChange: (
    requestStateKey: string,
    state: SectionCoverageAnalysisRequestState,
  ) => void
  onUpsert: (
    record: PersistedSectionCoveragePlanRecord,
    replacedRecordId?: string,
  ) => SaveSectionCoveragePlansResult | Promise<SaveSectionCoveragePlansResult>
  mergeMode: boolean
  selectedMergeRecordIds: string[]
  canMerge: boolean
  isBuildingMerge: boolean
  onEnterMergeMode: () => void
  onExitMergeMode: () => void
  onMergeSelectionChange: (recordIds: string[]) => void
  onBuildMerge: (recordIds: string[]) => void
}) {
  const [reviewFilter, setReviewFilter] = useState<QaSourceReviewFilter>('all')
  const [sectionSearch, setSectionSearch] = useState('')
  const [sectionPage, setSectionPage] = useState(0)
  const selectedCanonicalSection =
    selectedSection?.qaSourceId === source.id
      ? sectionIndex.sections.find(
          (section) =>
            section.includedInCoverage &&
            section.id === selectedSection.sectionId &&
            section.stableKey === selectedSection.stableKey,
        ) ?? null
      : null
  const selectedSavedRecord = selectedCanonicalSection
    ? findSectionCoveragePlanForSection(
        records,
        source.id,
        selectedCanonicalSection.id,
        selectedCanonicalSection.stableKey,
      )
    : null
  const selectedFreshness = selectedSavedRecord
    ? getSectionCoveragePlanFreshness(
        selectedSavedRecord,
        source,
        sectionIndex,
      )
    : null
  const selectedRequestStateKey = selectedCanonicalSection
    ? createSectionRequestStateKey(
        source,
        sectionIndex,
        selectedCanonicalSection,
      )
    : null
  const selectedRequestState = selectedRequestStateKey
    ? requestStates[selectedRequestStateKey] ??
      INITIAL_SECTION_COVERAGE_ANALYSIS_REQUEST_STATE
    : INITIAL_SECTION_COVERAGE_ANALYSIS_REQUEST_STATE
  const mergeItems: GlobalCoverageMergeSelectionItem[] = sectionIndex.sections.map(
    (section) => {
      const savedRecord = section.includedInCoverage
        ? findSectionCoveragePlanForSection(
            records,
            source.id,
            section.id,
            section.stableKey,
          )
        : null
      const freshness = savedRecord
        ? getSectionCoveragePlanFreshness(savedRecord, source, sectionIndex)
        : null
      const requestStateKey = createSectionRequestStateKey(
        source,
        sectionIndex,
        section,
      )
      const requestState =
        requestStates[requestStateKey] ??
        INITIAL_SECTION_COVERAGE_ANALYSIS_REQUEST_STATE
      const status: GlobalCoverageMergeSelectionItem['status'] =
        section.includedInCoverage
          ? getSectionStatus(requestState, savedRecord, freshness)
          : 'Excluded'

      return {
        sectionId: section.id,
        recordId: status === 'Current' ? savedRecord?.id ?? null : null,
        ordinal: section.ordinal,
        title: section.title,
        path: [...section.path],
        startLine: section.startLine,
        endLine: section.endLine,
        characterCount: section.characterCount,
        status,
        ineligibilityReason: getMergeIneligibilityReason(status),
      }
    },
  )
  const reviewItems: QaSourceReviewSectionItem[] = mergeItems.map((item) => ({
    sectionId: item.sectionId,
    ordinal: item.ordinal,
    title: item.title,
    characterCount: item.characterCount,
    status: item.status,
  }))
  const reviewProgress = deriveQaSourceReviewProgress({
    sourceCharacterCount: source.content.length,
    items: reviewItems,
  })
  const visibleReviewSectionIds = new Set(
    filterQaSourceReviewSections(reviewItems, reviewFilter).map(
      (item) => item.sectionId,
    ),
  )
  const filteredSections = reviewProgress.isGuidedReviewRecommended
    ? sectionIndex.sections.filter((section) =>
        visibleReviewSectionIds.has(section.id),
      )
    : sectionIndex.sections
  const query = sectionSearch.trim().toLocaleLowerCase()
  const visibleSections = query ? filteredSections.filter((section) =>
    section.path.join(' / ').toLocaleLowerCase().includes(query) ||
    source.content.slice(section.startOffset, section.endOffset).toLocaleLowerCase().includes(query),
  ) : filteredSections
  const currentSectionPage = Math.min(sectionPage, Math.max(0, Math.ceil(visibleSections.length / 40) - 1))
  const displayedSections = visibleSections.slice(currentSectionPage * 40, (currentSectionPage + 1) * 40)

  function selectReviewSection(sectionId: string) {
    const section = sectionIndex.sections.find(
      (candidate) =>
        candidate.includedInCoverage && candidate.id === sectionId,
    )

    if (!section) {
      return
    }

    const index = visibleSections.findIndex((item) => item.id === section.id)
    if (index < 0) setSectionSearch('')
    setSectionPage(Math.floor(Math.max(0, index < 0 ? filteredSections.findIndex((item) => item.id === section.id) : index) / 40))

    onSelectSection({
      qaSourceId: source.id,
      sectionId: section.id,
      stableKey: section.stableKey,
    })
  }

  const selectedAnalysisPanel =
    selectedCanonicalSection && selectedRequestStateKey && selectedSection ? (
      <SectionCoverageAnalysisPanel
        key={selectedRequestStateKey}
        qaSource={source}
        sectionIndex={sectionIndex}
        section={selectedCanonicalSection}
        selectedSection={{
          sectionId: selectedSection.sectionId,
          stableKey: selectedSection.stableKey,
        }}
        savedRecord={selectedSavedRecord}
        freshness={selectedFreshness}
        provider={provider}
        requestState={selectedRequestState}
        onRequestStateChange={(state) =>
          onRequestStateChange(selectedRequestStateKey, state)
        }
        onUpsert={onUpsert}
      />
    ) : null

  return (
    <details className="source-structure-panel">
      <summary>
        <span>Source Structure</span>
        <span>{formatSectionCount(sectionIndex.sections.length)}</span>
      </summary>
      <div className="source-structure-panel__body">
        <p>
          Sections are deterministic source-structure helpers. They organize
          review, but they are not coverage proof or QA approval.
        </p>
        <div className="badge-row">
          <span className="badge badge--neutral">
            {formatCharacterCount(sectionIndex.sourceLength)} source length
          </span>
          <span className="badge badge--outline">
            {getSectionDistributionLabel(sectionIndex)}
          </span>
        </div>
        {sectionIndex.warnings.length > 0 ? (
          <div className="source-structure-panel__warnings" role="status">
            {sectionIndex.warnings.join(' ')}
          </div>
        ) : null}
        {canMerge && !mergeMode ? (
          <div className="global-coverage-merge-selection__entry">
            <button
              type="button"
              className="button button--secondary button--compact"
              onClick={onEnterMergeMode}
            >
              Select analyses to merge
            </button>
          </div>
        ) : null}
        {mergeMode ? (
          <GlobalCoverageMergeSelection
            sourceTitle={source.title}
            items={mergeItems}
            selectedRecordIds={selectedMergeRecordIds}
            isBuilding={isBuildingMerge}
            onSelectedRecordIdsChange={onMergeSelectionChange}
            onBuild={onBuildMerge}
            onExit={onExitMergeMode}
          />
        ) : (
          <>
        <LargeSourceReviewPanel
          sourceTitle={source.title}
          sourceCharacterCount={source.content.length}
          items={reviewItems}
          activeFilter={reviewFilter}
          selectedSectionId={
            selectedSection?.qaSourceId === source.id
              ? selectedSection.sectionId
              : null
          }
          onFilterChange={(filter) => { setReviewFilter(filter); setSectionPage(0) }}
          onSelectNextSection={selectReviewSection}
        />
        <div className="section-workbench">
        <fieldset
          className={`source-structure-selection${
            reviewProgress.isGuidedReviewRecommended
              ? ' source-structure-selection--guided'
              : ''
          }`}
          role="radiogroup"
          aria-label={
            'Select one section from ' + source.title + ' for analysis'
          }
        >
          <legend className="visually-hidden">
            Select one section for analysis
          </legend>
          {sectionIndex.sections.length > 40 ? <label className="structure-search">Find a section or requirement
            <input type="search" className="input" value={sectionSearch} onChange={(event) => { setSectionSearch(event.target.value); setSectionPage(0) }} placeholder="Section title or source keyword" />
          </label> : null}
          <CollectionPager label="Source section pages" page={currentSectionPage} pageSize={40} total={visibleSections.length} onPageChange={setSectionPage} />
          <ol className="source-structure-list">
            {displayedSections.map((section) => {
              const savedRecord = section.includedInCoverage
                ? findSectionCoveragePlanForSection(
                    records,
                    source.id,
                    section.id,
                    section.stableKey,
                  )
                : null
              const freshness = savedRecord
                ? getSectionCoveragePlanFreshness(
                    savedRecord,
                    source,
                    sectionIndex,
                  )
                : null
              const requestStateKey = createSectionRequestStateKey(
                source,
                sectionIndex,
                section,
              )
              const requestState =
                requestStates[requestStateKey] ??
                INITIAL_SECTION_COVERAGE_ANALYSIS_REQUEST_STATE
              const status = getSectionStatus(
                requestState,
                savedRecord,
                freshness,
              )
              const isSelected =
                selectedSection?.qaSourceId === source.id &&
                selectedSection.sectionId === section.id &&
                selectedSection.stableKey === section.stableKey
              return (
                <li
                  key={section.id}
                  className={
                    section.includedInCoverage
                      ? 'source-structure-list__item'
                      : 'source-structure-list__item source-structure-list__item--excluded'
                  }
                >
                  {section.includedInCoverage ? (
                    <label className="source-structure-option">
                      <input
                        type="radio"
                        name={'section-analysis-' + source.id}
                        checked={isSelected}
                        onChange={() =>
                          onSelectSection({
                            qaSourceId: source.id,
                            sectionId: section.id,
                            stableKey: section.stableKey,
                          })
                        }
                      />
                      <span className="source-structure-option__content">
                        <strong>
                          {section.ordinal}. {section.title}
                        </strong>
                        <span>Path: {section.path.join(' / ')}</span>
                        <span>
                          Lines {section.startLine}-{section.endLine} -{' '}
                          {formatCharacterCount(section.characterCount)}
                        </span>
                      </span>
                      <span
                        className={
                          'section-coverage-status section-coverage-status--' +
                          status.toLowerCase().replace(' ', '-')
                        }
                      >
                        {status}
                      </span>
                    </label>
                  ) : (
                    <div className="source-structure-option source-structure-option--excluded">
                      <span className="source-structure-option__content">
                        <strong>
                          {section.ordinal}. {section.title}
                        </strong>
                        <span>Path: {section.path.join(' / ')}</span>
                        <span>
                          Lines {section.startLine}-{section.endLine} -{' '}
                          {formatCharacterCount(section.characterCount)}
                        </span>
                      </span>
                      <span className="source-structure-option__unavailable">
                        Unavailable for section analysis.
                      </span>
                    </div>
                  )}
                </li>
              )
            })}
          </ol>
          {visibleSections.length === 0 ? (
            <p className="empty-filter-message" role="status">
              No sections match this review filter. Choose another filter to
              continue.
            </p>
          ) : null}
        </fieldset>
        <div className="section-workbench__detail">
          {selectedAnalysisPanel ?? <div className="section-workbench__empty"><span className="meta-kicker">Section coverage</span><h4>Choose a section to review</h4><p>Inspect its source evidence and saved analysis. Selecting a section never sends an AI request.</p></div>}
        </div>
        </div>
          </>
        )}
      </div>
    </details>
  )
}

export function QaSourcesPage({
  qaSources,
  sourceSectionIndexes = [],
  sectionCoveragePlanRecords = [],
  sectionCoveragePlanProvider = UNAVAILABLE_SECTION_COVERAGE_PLAN_PROVIDER,
  onUpsertSectionCoveragePlan = UNAVAILABLE_SECTION_COVERAGE_PLAN_SAVE,
  onChange,
  onSuggestTestCases,
  selectedMergeRecords = [],
  onSelectedMergeRecordsChange = () => undefined,
  onBuildGlobalCoveragePlan,
  isBuildingGlobalCoveragePlan = false,
}: QaSourcesPageProps) {
  const workspace = useWorkspace()
  const [showSourceSets, setShowSourceSets] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [sourceTypeFilter, setSourceTypeFilter] =
    useState<QaSourceTypeFilter>(ALL_QA_SOURCE_TYPES)
  const [statusFilter, setStatusFilter] =
    useState<QaSourceStatusFilter>(ALL_QA_SOURCE_STATUSES)
  const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [expandedSourceIds, setExpandedSourceIds] = useState<string[]>([])
  const [activeSourceId, setActiveSourceId] = useState<string | null>(null)
  const [selectedSection, setSelectedSection] =
    useState<SelectedSectionIdentity | null>(null)
  const [mergeSourceId, setMergeSourceId] = useState<string | null>(null)
  const [sectionCoverageRequestStates, setSectionCoverageRequestStates] =
    useState<SectionCoverageRequestStates>({})

  const filteredSources = filterAndSortQaSources(qaSources, {
    searchTerm,
    sourceTypeFilter,
    statusFilter,
  })
  const activeSource = filteredSources.find((source) => source.id === activeSourceId) ?? filteredSources[0]

  function openSource(sourceId: string) {
    setActiveSourceId(sourceId)
    setSelectedSection(null)
    setSectionCoverageRequestStates({})
    setMergeSourceId(null)
    onSelectedMergeRecordsChange([])
  }
  const editingSource =
    editingId === null
      ? null
      : qaSources.find((source) => source.id === editingId) ?? null
  const hasActiveFilters =
    searchTerm.trim() !== '' ||
    sourceTypeFilter !== ALL_QA_SOURCE_TYPES ||
    statusFilter !== ALL_QA_SOURCE_STATUSES
  const visibleCountLabel =
    filteredSources.length === qaSources.length
      ? `${filteredSources.length} total`
      : `${filteredSources.length} of ${qaSources.length} shown`

  function openCreateForm() {
    setFormMode('create')
    setEditingId(null)
  }

  function openEditForm(source: QaSource) {
    setFormMode('edit')
    setEditingId(source.id)
  }

  function closeForm() {
    setFormMode(null)
    setEditingId(null)
  }

  function clearFilters() {
    setSearchTerm('')
    setSourceTypeFilter(ALL_QA_SOURCE_TYPES)
    setStatusFilter(ALL_QA_SOURCE_STATUSES)
  }

  function handleSubmit(values: QaSourceFormValues) {
    const timestamp = new Date().toISOString()

    if (formMode === 'edit' && editingSource) {
      setSectionCoverageRequestStates({})
      if (mergeSourceId === editingSource.id) {
        setMergeSourceId(null)
        onSelectedMergeRecordsChange([])
      }
      onChange(
        qaSources.map((source) =>
          source.id === editingSource.id
            ? {
                ...source,
                ...values,
                updatedAt: timestamp,
              }
            : source,
        ),
      )
      closeForm()
      return
    }

    const nextSource: QaSource = {
      id: createQaSourceId(),
      createdAt: timestamp,
      updatedAt: timestamp,
      ...values,
    }

    onChange([nextSource, ...qaSources])
    setActiveSourceId(nextSource.id)
    closeForm()
  }

  function handleDelete(sourceId: string) {
    const target = qaSources.find((source) => source.id === sourceId)

    if (!target) {
      return
    }

    const confirmed = window.confirm(`Delete "${target.title}"?`)

    if (!confirmed) {
      return
    }

    if (selectedSection?.qaSourceId === sourceId) {
      setSelectedSection(null)
      setSectionCoverageRequestStates({})
    }

    if (mergeSourceId === sourceId) {
      setMergeSourceId(null)
      onSelectedMergeRecordsChange([])
    }

    onChange(qaSources.filter((source) => source.id !== sourceId))

    if (editingId === sourceId) {
      closeForm()
    }
  }

  function toggleExpandedSource(sourceId: string) {
    setExpandedSourceIds((currentIds) =>
      currentIds.includes(sourceId)
        ? currentIds.filter((id) => id !== sourceId)
        : [...currentIds, sourceId],
    )
  }

  function handleSectionSelect(selection: SelectedSectionIdentity) {
    const changed =
      selectedSection?.qaSourceId !== selection.qaSourceId ||
      selectedSection.sectionId !== selection.sectionId ||
      selectedSection.stableKey !== selection.stableKey

    if (changed) {
      setSectionCoverageRequestStates({})
    }

    setSelectedSection(selection)
  }

  function enterMergeMode(sourceId: string) {
    setSelectedSection(null)
    setMergeSourceId(sourceId)
    onSelectedMergeRecordsChange([])
  }

  function exitMergeMode() {
    setMergeSourceId(null)
    onSelectedMergeRecordsChange([])
  }

  function resolveMergeRecords(sourceId: string, recordIds: string[]) {
    const recordsById = new Map(
      sectionCoveragePlanRecords.map((record) => [record.id, record]),
    )

    return recordIds
      .map((recordId) => recordsById.get(recordId))
      .filter(
        (record): record is PersistedSectionCoveragePlanRecord =>
          Boolean(record && record.sourceIdentity.qaSourceId === sourceId),
      )
  }

  function handleMergeSelectionChange(sourceId: string, recordIds: string[]) {
    onSelectedMergeRecordsChange(resolveMergeRecords(sourceId, recordIds))
  }

  function handleBuildMerge(sourceId: string, recordIds: string[]) {
    onBuildGlobalCoveragePlan?.(
      sourceId,
      resolveMergeRecords(sourceId, recordIds),
    )
  }

  function handleSectionRequestStateChange(
    requestStateKey: string,
    state: SectionCoverageAnalysisRequestState,
  ) {
    setSectionCoverageRequestStates((currentStates) => {
      if (state.status === 'idle') {
        const nextStates = { ...currentStates }
        delete nextStates[requestStateKey]
        return nextStates
      }

      return {
        ...currentStates,
        [requestStateKey]: state,
      }
    })
  }

  if (showSourceSets && workspace) return <section className="page page--sources"><header className="page-heading page-heading--split"><h2>QA Sources</h2><button className="button button--secondary" onClick={() => setShowSourceSets(false)}>Back to individual sources</button></header><SourceSetWorkspace sources={qaSources} onOpenSource={(id) => { clearFilters(); openSource(id); setShowSourceSets(false) }} /></section>
  return (
    <section className="page page--sources">
      <div className="page-heading page-heading--split">
        <div className="page-heading">
          <h2>QA Sources</h2>
          <p>
            Store requirements, user stories, PRDs, LLDs, and notes as
            plain-text material for coverage analysis and test design.
          </p>
        </div>

        <div className="button-row">
          {workspace && <button className="button button--secondary" onClick={() => setShowSourceSets(true)}>Source sets</button>}
          <button
            type="button"
            className="button button--primary"
            onClick={openCreateForm}
          >
            New QA Source
          </button>
        </div>
      </div>

      <section
        className="panel toolbar"
        aria-labelledby="qa-source-filters-heading"
      >
        <div className="panel-heading">
          <div className="panel-heading__content">
            <h3 id="qa-source-filters-heading">Source Search and Filters</h3>
            <p>Find source material by title, content, notes, type, or status.</p>
          </div>
          {hasActiveFilters ? (
            <button
              type="button"
              className="button button--secondary"
              onClick={clearFilters}
            >
              Clear filters
            </button>
          ) : null}
        </div>

        <div className="filter-grid">
          <div className="field-group">
            <label className="field-label" htmlFor="qa-source-search">
              Search sources
            </label>
            <input
              id="qa-source-search"
              className="input"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search title, content, or notes"
            />
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="qa-source-type-filter">
              Filter by source type
            </label>
            <select
              id="qa-source-type-filter"
              className="select"
              value={sourceTypeFilter}
              onChange={(event) =>
                setSourceTypeFilter(event.target.value as QaSourceTypeFilter)
              }
            >
              <option value={ALL_QA_SOURCE_TYPES}>
                {ALL_QA_SOURCE_TYPES}
              </option>
              {QA_SOURCE_TYPES.map((sourceType) => (
                <option key={sourceType} value={sourceType}>
                  {sourceType}
                </option>
              ))}
            </select>
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="qa-source-status-filter">
              Filter by status
            </label>
            <select
              id="qa-source-status-filter"
              className="select"
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as QaSourceStatusFilter)
              }
            >
              <option value={ALL_QA_SOURCE_STATUSES}>
                {ALL_QA_SOURCE_STATUSES}
              </option>
              {QA_SOURCE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="panel list-panel">
        <div className="panel-heading">
          <div className="panel-heading__content">
            <h3>Saved QA Sources</h3>
            <p>
              Stored locally as plain-text source material for coverage analysis
              and test design.
            </p>
          </div>
          <span className="panel-caption">{visibleCountLabel}</span>
        </div>

        {qaSources.length === 0 ? (
          <EmptyState
            title="No QA sources yet"
            description="Create a source item for a requirement, user story, PRD, LLD, or notes."
            actionLabel="Create first QA Source"
            onAction={openCreateForm}
          />
        ) : filteredSources.length === 0 ? (
          <EmptyState
            title="No matching QA sources"
            description="Try a different search term or reset the source filters."
            actionLabel="Clear filters"
            onAction={clearFilters}
          />
        ) : (
          <div className="source-workspace">
            <nav className="source-index" aria-label="Source library">
              {filteredSources.map((source) => (
                <button type="button" key={source.id} className={`source-index__item${activeSource?.id === source.id ? ' source-index__item--active' : ''}`} aria-pressed={activeSource?.id === source.id} aria-label={`Open source: ${source.title}`} onClick={() => openSource(source.id)}>
                  <span className="source-index__type">{source.sourceType}</span>
                  <strong>{source.title}</strong>
                  <span className="source-index__metadata"><span>{source.status}</span><span>{(sourceSectionIndexes.find((index) => index.qaSourceId === source.id) ?? createQaSourceSectionIndex(source)).sections.length} sections</span></span>
                </button>
              ))}
            </nav>
            {filteredSources.filter((source) => source.id === activeSource?.id).map((source) => {
              const isExpanded = expandedSourceIds.includes(source.id)
              const hasLongContent = isLongContent(source.content)
              const contentId = `qa-source-content-${source.id}`
              const sectionIndex =
                sourceSectionIndexes.find(
                  (candidate) => candidate.qaSourceId === source.id,
                ) ?? createQaSourceSectionIndex(source)

              return (
                <article
                  key={source.id}
                  className="test-case-card qa-source-card source-workspace__detail"
                  aria-labelledby={`qa-source-card-heading-${source.id}`}
                >
                  <div className="test-case-card__header">
                    <div>
                      <p className="meta-kicker">Source workspace</p>
                      <h3 id={`qa-source-card-heading-${source.id}`}>
                        {source.title}
                      </h3>
                    </div>

                    <div className="card-actions">
                      {onSuggestTestCases ? (
                        <button
                          type="button"
                          className="button button--primary"
                          onClick={() => onSuggestTestCases(source.id)}
                        >
                          Open AI coverage workspace
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="button button--secondary"
                        onClick={() => openEditForm(source)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="button button--danger"
                        onClick={() => handleDelete(source.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  <div className="badge-row">
                    <span className="badge badge--neutral">{source.sourceType}</span>
                    <span className={`badge badge--${getStatusTone(source.status)}`}>
                      {source.status}
                    </span>
                  </div>

                  <div className="description-block">
                    <div className="description-block__heading">
                      <span className="field-label">
                        {isExpanded ? 'Full source content' : 'Source preview'}
                      </span>
                      {hasLongContent ? (
                        <button
                          type="button"
                          className="button button--secondary button--compact"
                          aria-expanded={isExpanded}
                          aria-controls={contentId}
                          onClick={() => toggleExpandedSource(source.id)}
                        >
                          {isExpanded ? 'Collapse source' : 'View full source'}
                        </button>
                      ) : null}
                    </div>
                    <p id={contentId} className="qa-source-preview">
                      {isExpanded ? source.content : createPreview(source.content)}
                    </p>
                  </div>

                  {source.notes ? (
                    <div className="description-block">
                      <span className="field-label">QA notes</span>
                      <p className="qa-source-preview">
                        {createPreview(source.notes, 180)}
                      </p>
                    </div>
                  ) : null}

                  {source.documentImport?.productEvidence && <ProductEvidencePanel key={`evidence:${source.id}:${source.updatedAt}`} source={source} sources={qaSources} />}
                  <DocumentIntelligencePanel key={`${source.id}:${source.updatedAt}`} source={source} />

                  <SourceStructurePanel
                    source={source}
                    sectionIndex={sectionIndex}
                    selectedSection={selectedSection}
                    records={sectionCoveragePlanRecords}
                    provider={sectionCoveragePlanProvider}
                    requestStates={sectionCoverageRequestStates}
                    onSelectSection={handleSectionSelect}
                    onRequestStateChange={handleSectionRequestStateChange}
                    onUpsert={onUpsertSectionCoveragePlan}
                    mergeMode={mergeSourceId === source.id}
                    selectedMergeRecordIds={
                      mergeSourceId === source.id
                        ? selectedMergeRecords
                            .filter(
                              (record) =>
                                record.sourceIdentity.qaSourceId === source.id,
                            )
                            .map((record) => record.id)
                        : []
                    }
                    canMerge={Boolean(onBuildGlobalCoveragePlan)}
                    isBuildingMerge={isBuildingGlobalCoveragePlan}
                    onEnterMergeMode={() => enterMergeMode(source.id)}
                    onExitMergeMode={exitMergeMode}
                    onMergeSelectionChange={(recordIds) =>
                      handleMergeSelectionChange(source.id, recordIds)
                    }
                    onBuildMerge={(recordIds) =>
                      handleBuildMerge(source.id, recordIds)
                    }
                  />

                  <div className="card-footer">
                    <span>Created {formatDateTime(source.createdAt)}</span>
                    <span>Updated {formatDateTime(source.updatedAt)}</span>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>

      {formMode ? (
        <EditorDialog labelledBy="qa-source-editor-heading" onClose={closeForm}>
            <QaSourceForm
              key={
                formMode === 'edit' && editingSource
                  ? editingSource.id
                  : 'create-qa-source'
              }
              mode={formMode}
              initialValues={editingSource}
              onSubmit={handleSubmit}
              onCancel={closeForm}
              headingId="qa-source-editor-heading"
            />
          </EditorDialog>
      ) : null}
    </section>
  )
}
