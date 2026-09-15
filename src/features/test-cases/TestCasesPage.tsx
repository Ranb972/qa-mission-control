import { EditorDialog } from '../../components/ui/EditorDialog'
import { useEffect, useMemo, useRef, useState } from 'react'
import { CollectionPager } from '../../components/ui/CollectionPager'
import { EmptyState } from '../../components/ui/EmptyState'
import { formatDateTime } from '../../lib/formatters'
import { TestCaseContentDisplay } from './TestCaseContentDisplay'
import { TestCaseForm } from './TestCaseForm'
import {
  getDisplayPreconditions,
  getDisplayTestCaseSteps,
} from './testCaseContent'
import {
  ALL_PRIORITIES,
  ALL_STATUSES,
  filterAndSortTestCases,
  type PriorityFilter,
  type StatusFilter,
} from './testCaseFilters'
import {
  TEST_CASE_PRIORITIES,
  TEST_CASE_STATUSES,
  type TestCase,
  type TestCaseFormValues,
  type TestCasePriority,
  type TestCaseStatus,
} from './testCaseTypes'

type TestCasesPageProps = {
  testCases: TestCase[]
  onChange: (testCases: TestCase[]) => void
}

function createTestCaseId() {
  const randomId = globalThis.crypto?.randomUUID?.()

  if (randomId) {
    return randomId
  }

  return `test-case-${Date.now()}`
}

function getStatusTone(status: TestCaseStatus) {
  switch (status) {
    case 'Passed':
      return 'positive'
    case 'Failed':
      return 'critical'
    case 'Blocked':
      return 'warning'
    case 'Not Run':
    default:
      return 'neutral'
  }
}

function getPriorityTone(priority: TestCasePriority) {
  switch (priority) {
    case 'Critical':
      return 'critical'
    case 'High':
      return 'warning'
    case 'Medium':
      return 'neutral'
    case 'Low':
    default:
      return 'positive'
  }
}

function formatStepCount(stepCount: number) {
  return `${stepCount} ${stepCount === 1 ? 'step' : 'steps'}`
}

export function TestCasesPage({
  testCases,
  onChange,
}: TestCasesPageProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [page, setPage] = useState(0)
  const [sort, setSort] = useState('updated')
  const focusTestId = useRef<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(ALL_STATUSES)
  const [priorityFilter, setPriorityFilter] =
    useState<PriorityFilter>(ALL_PRIORITIES)
  const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [expandedTestCaseIds, setExpandedTestCaseIds] = useState<string[]>([])

  const filteredTestCases = useMemo(() => filterAndSortTestCases(testCases, {
    searchTerm,
    statusFilter,
    priorityFilter,
  }).sort((left, right) => sort === 'title' ? left.title.localeCompare(right.title) : sort === 'priority' ? TEST_CASE_PRIORITIES.indexOf(right.priority) - TEST_CASE_PRIORITIES.indexOf(left.priority) : 0), [testCases, searchTerm, statusFilter, priorityFilter, sort])
  useEffect(() => {
    if (focusTestId.current) document.getElementById(`test-case-card-heading-${focusTestId.current}`)?.focus()
    focusTestId.current = null
  }, [expandedTestCaseIds])
  const currentPage = Math.min(page, Math.max(0, Math.ceil(filteredTestCases.length / 40) - 1))
  const editingTestCase =
    editingId === null
      ? null
      : testCases.find((testCase) => testCase.id === editingId) ?? null
  const hasActiveFilters =
    searchTerm.trim() !== '' ||
    statusFilter !== ALL_STATUSES ||
    priorityFilter !== ALL_PRIORITIES
  const visibleCountLabel =
    filteredTestCases.length === testCases.length
      ? `${filteredTestCases.length} total`
      : `${filteredTestCases.length} of ${testCases.length} shown`

  function openCreateForm() {
    setFormMode('create')
    setEditingId(null)
  }

  function openEditForm(testCase: TestCase) {
    setFormMode('edit')
    setEditingId(testCase.id)
  }

  function closeForm() {
    setFormMode(null)
    setEditingId(null)
  }

  function toggleExpanded(testCaseId: string) {
    if (!expandedTestCaseIds.includes(testCaseId)) focusTestId.current = testCaseId
    setExpandedTestCaseIds((currentIds) =>
      currentIds.includes(testCaseId)
        ? currentIds.filter((id) => id !== testCaseId)
        : [testCaseId],
    )
  }

  function inspectAdjacent(testCaseId: string, direction: number) {
    const index = filteredTestCases.findIndex(testCase => testCase.id === testCaseId)
    const next = filteredTestCases[index + direction]
    if (!next) return
    focusTestId.current = next.id
    setPage(Math.floor((index + direction) / 40))
    setExpandedTestCaseIds([next.id])
  }

  function clearFilters() {
    setPage(0)
    setSearchTerm('')
    setStatusFilter(ALL_STATUSES)
    setPriorityFilter(ALL_PRIORITIES)
    setSort('updated')
  }

  function handleSubmit(values: TestCaseFormValues) {
    const timestamp = new Date().toISOString()

    if (formMode === 'edit' && editingTestCase) {
      onChange(
        testCases.map((testCase) =>
          testCase.id === editingTestCase.id
            ? {
                ...testCase,
                ...values,
                updatedAt: timestamp,
              }
            : testCase,
        ),
      )
      closeForm()
      return
    }

    const nextTestCase: TestCase = {
      id: createTestCaseId(),
      createdAt: timestamp,
      updatedAt: timestamp,
      ...values,
    }

    onChange([nextTestCase, ...testCases])
    closeForm()
  }

  function handleDelete(testCaseId: string) {
    const target = testCases.find((testCase) => testCase.id === testCaseId)

    if (!target) {
      return
    }

    const confirmed = window.confirm(`Delete "${target.title}"?`)

    if (!confirmed) {
      return
    }

    onChange(testCases.filter((testCase) => testCase.id !== testCaseId))

    if (editingId === testCaseId) {
      closeForm()
    }
  }

  return (
    <section className={`page page--test-library${filteredTestCases.slice(currentPage * 40, (currentPage + 1) * 40).some(testCase => expandedTestCaseIds.includes(testCase.id)) ? ' page--test-selected' : ''}`}>
      <div className="page-heading page-heading--split">
        <div className="page-heading">
          <h2>Test Cases</h2>
          <p>
            Build and maintain reusable test coverage. Library status is manual
            metadata; record release-specific outcomes in Executions.
          </p>
        </div>

        <div className="button-row">
          <button
            type="button"
            className="button button--primary"
            onClick={openCreateForm}
          >
            New test case
          </button>
        </div>
      </div>

      <section className="panel toolbar">
        <div className="panel-heading">
          <div className="panel-heading__content">
            <h3>Search and Filters</h3>
            <p>Find coverage quickly by title, status, or priority.</p>
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

        <div className="filter-grid test-library-filters">
          <div className="field-group">
            <label className="field-label" htmlFor="search">
              Search by title
            </label>
            <input
              id="search"
              className="input"
              value={searchTerm}
              onChange={(event) => { setSearchTerm(event.target.value); setPage(0) }}
              placeholder="Search test cases"
            />
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="statusFilter">
              Library status
            </label>
            <select
              id="statusFilter"
              className="select"
              value={statusFilter}
              onChange={(event) => { setStatusFilter(event.target.value as StatusFilter); setPage(0) }}
            >
              <option value={ALL_STATUSES}>{ALL_STATUSES}</option>
              {TEST_CASE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="priorityFilter">
              Priority
            </label>
            <select
              id="priorityFilter"
              className="select"
              value={priorityFilter}
              onChange={(event) => { setPriorityFilter(event.target.value as PriorityFilter); setPage(0) }}
            >
              <option value={ALL_PRIORITIES}>{ALL_PRIORITIES}</option>
              {TEST_CASE_PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {priority}
                </option>
              ))}
            </select>
          </div>
          <label className="field-group"><span className="field-label">Sort Test Cases</span><select className="select" value={sort} onChange={event => { setSort(event.target.value); setPage(0) }}><option value="updated">Recently updated</option><option value="title">Title A–Z</option><option value="priority">Priority</option></select></label>
        </div>
      </section>

      <section className="panel list-panel">
        <div className="panel-heading">
          <div className="panel-heading__content">
            <h3>Saved Test Cases</h3>
            <p>
              Stored locally in your browser. Library status is separate from
              release-specific outcomes recorded in Executions.
            </p>
          </div>
          <span className="panel-caption">{visibleCountLabel}</span>
        </div>

        <CollectionPager page={currentPage} pageSize={40} total={filteredTestCases.length} onPageChange={next => { setPage(next); setExpandedTestCaseIds([]) }} label="Test Case library pages" />
        {testCases.length === 0 ? (
          <EmptyState
            title="No test cases yet"
            description="Create the first test case to start building coverage for this project."
            actionLabel="Create first test case"
            onAction={openCreateForm}
          />
        ) : filteredTestCases.length === 0 ? (
          <EmptyState
            title="No matching test cases"
            description="Try a different title search or reset the filters to see more coverage."
            actionLabel="Clear filters"
            onAction={clearFilters}
          />
        ) : (
          <div className="test-case-list test-library">
            <div className="test-library__columns" aria-hidden="true"><span>Test case / area</span><span>Library status</span><span>Priority</span><span>Type</span><span>Actions</span></div>
            {filteredTestCases.slice(currentPage * 40, (currentPage + 1) * 40).map((testCase) => (
              <article
                key={testCase.id}
                className={`test-case-card test-library__row${expandedTestCaseIds.includes(testCase.id) ? ' test-library__row--selected' : ''}`}
                aria-labelledby={`test-case-card-heading-${testCase.id}`}
              >
                <div className="test-case-card__header">
                  <div>
                    <h3 tabIndex={-1} id={`test-case-card-heading-${testCase.id}`}>
                      {testCase.title}
                    </h3>
                    <p className="test-library__meta" title={getDisplayPreconditions(testCase) ? 'Preconditions defined' : 'No preconditions'}><span>{testCase.area}</span><span aria-hidden="true">·</span><span>{formatStepCount(getDisplayTestCaseSteps(testCase).length)}</span></p>
                  </div>

                  <div className="card-actions">
                    <button
                      type="button"
                      id={`test-case-toggle-${testCase.id}`}
                      className="button button--secondary"
                      aria-expanded={expandedTestCaseIds.includes(testCase.id)}
                      aria-controls={`test-case-details-${testCase.id}`}
                      onClick={() => toggleExpanded(testCase.id)}
                    >
                      {expandedTestCaseIds.includes(testCase.id)
                        ? 'Collapse'
                        : 'Expand'}
                    </button>
                    <button
                      type="button"
                      className="button button--secondary"
                      onClick={() => openEditForm(testCase)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="button button--danger"
                      onClick={() => handleDelete(testCase.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>

                <div className="badge-row">
                  <span className={`badge badge--${getStatusTone(testCase.status)}`} aria-label={`Library status: ${testCase.status}`}>
                    <span className="visually-hidden">Library status: </span>{testCase.status}
                  </span>
                  <span
                    className={`badge badge--${getPriorityTone(testCase.priority)}`}
                  >
                    {testCase.priority}
                  </span>
                  <span className="badge badge--outline">{testCase.type}</span>
                </div>

                {expandedTestCaseIds.includes(testCase.id) ? (
                  <div
                    id={`test-case-details-${testCase.id}`}
                    className="test-case-card__details"
                  >
                    <div className="test-design-tools"><strong>Test design</strong><div className="button-row"><button type="button" className="button button--secondary" disabled={filteredTestCases[0]?.id === testCase.id} onClick={() => inspectAdjacent(testCase.id, -1)}>Previous test</button><button type="button" className="button button--secondary" disabled={filteredTestCases.at(-1)?.id === testCase.id} onClick={() => inspectAdjacent(testCase.id, 1)}>Next test</button><button type="button" className="button button--secondary" onClick={() => { setExpandedTestCaseIds([]); document.getElementById(`test-case-toggle-${testCase.id}`)?.focus() }}>Back to tests</button></div></div>
                    <TestCaseContentDisplay testCase={testCase} />
                    <div className="card-footer">
                      <span>{getDisplayPreconditions(testCase) ? 'Preconditions defined' : 'No preconditions'}</span>
                      <span>Created {formatDateTime(testCase.createdAt)}</span>
                      <span>Updated {formatDateTime(testCase.updatedAt)}</span>
                    </div>
                  </div>
                ) : null}

              </article>
            ))}
          </div>
        )}
      </section>

      {formMode ? (
        <EditorDialog labelledBy="test-case-editor-heading" onClose={closeForm}>
            <TestCaseForm
              key={
                formMode === 'edit' && editingTestCase
                  ? editingTestCase.id
                  : 'create-test-case'
              }
              mode={formMode}
              initialValues={editingTestCase}
              onSubmit={handleSubmit}
              onCancel={closeForm}
              headingId="test-case-editor-heading"
            />
          </EditorDialog>
      ) : null}
    </section>
  )
}
