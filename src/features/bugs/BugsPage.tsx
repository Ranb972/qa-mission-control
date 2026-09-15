import { useState } from 'react'
import { EmptyState } from '../../components/ui/EmptyState'
import { formatDateTime } from '../../lib/formatters'
import type { TestCase } from '../test-cases/testCaseTypes'
import { BugForm } from './BugForm'
import {
  ALL_BUG_SEVERITIES,
  ALL_BUG_STATUSES,
  filterAndSortBugs,
  type BugSeverityFilter,
  type BugStatusFilter,
} from './bugFilters'
import {
  BUG_SEVERITIES,
  BUG_STATUSES,
  type Bug,
  type BugFormValues,
  type BugSeverity,
  type BugStatus,
} from './bugTypes'

type BugsPageProps = {
  bugs: Bug[]
  testCases: TestCase[]
  onChange: (bugs: Bug[]) => void
}

function createBugId() {
  const randomId = globalThis.crypto?.randomUUID?.()

  if (randomId) {
    return randomId
  }

  return `bug-${Date.now()}`
}

function getStatusTone(status: BugStatus) {
  switch (status) {
    case 'Fixed':
    case 'Closed':
      return 'positive'
    case 'Open':
    case 'Retest':
      return 'warning'
    case 'In Progress':
    default:
      return 'neutral'
  }
}

function getSeverityTone(severity: BugSeverity) {
  switch (severity) {
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

function getLinkedTestCaseLabel(bug: Bug, testCases: TestCase[]) {
  if (!bug.testCaseId) {
    return null
  }

  const linkedTestCase = testCases.find(
    (testCase) => testCase.id === bug.testCaseId,
  )

  if (!linkedTestCase) {
    return 'Linked test case unavailable'
  }

  return `Linked: ${linkedTestCase.title}`
}

export function BugsPage({ bugs, testCases, onChange }: BugsPageProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] =
    useState<BugStatusFilter>(ALL_BUG_STATUSES)
  const [severityFilter, setSeverityFilter] =
    useState<BugSeverityFilter>(ALL_BUG_SEVERITIES)
  const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)

  const filteredBugs = filterAndSortBugs(bugs, {
    searchTerm,
    statusFilter,
    severityFilter,
  })
  const editingBug =
    editingId === null ? null : bugs.find((bug) => bug.id === editingId) ?? null
  const hasActiveFilters =
    searchTerm.trim() !== '' ||
    statusFilter !== ALL_BUG_STATUSES ||
    severityFilter !== ALL_BUG_SEVERITIES
  const visibleCountLabel =
    filteredBugs.length === bugs.length
      ? `${filteredBugs.length} total`
      : `${filteredBugs.length} of ${bugs.length} shown`

  function openCreateForm() {
    setFormMode('create')
    setEditingId(null)
  }

  function openEditForm(bug: Bug) {
    setFormMode('edit')
    setEditingId(bug.id)
  }

  function closeForm() {
    setFormMode(null)
    setEditingId(null)
  }

  function clearFilters() {
    setSearchTerm('')
    setStatusFilter(ALL_BUG_STATUSES)
    setSeverityFilter(ALL_BUG_SEVERITIES)
  }

  function handleSubmit(values: BugFormValues) {
    const timestamp = new Date().toISOString()

    if (formMode === 'edit' && editingBug) {
      onChange(
        bugs.map((bug) =>
          bug.id === editingBug.id
            ? {
                ...bug,
                ...values,
                updatedAt: timestamp,
              }
            : bug,
        ),
      )
      closeForm()
      return
    }

    const nextBug: Bug = {
      id: createBugId(),
      createdAt: timestamp,
      updatedAt: timestamp,
      ...values,
    }

    onChange([nextBug, ...bugs])
    closeForm()
  }

  function handleDelete(bugId: string) {
    const target = bugs.find((bug) => bug.id === bugId)

    if (!target) {
      return
    }

    const confirmed = window.confirm(`Delete "${target.title}"?`)

    if (!confirmed) {
      return
    }

    onChange(bugs.filter((bug) => bug.id !== bugId))

    if (editingId === bugId) {
      closeForm()
    }
  }

  return (
    <section className="page page--records">
      <div className="page-heading page-heading--split">
        <div className="page-heading">
          <h2>Bugs</h2>
          <p>
            Track defects, triage status, severity, and optional links back to
            test coverage.
          </p>
        </div>

        <div className="button-row">
          <button
            type="button"
            className="button button--primary"
            onClick={openCreateForm}
          >
            New bug
          </button>
        </div>
      </div>

      <section className="panel toolbar">
        <div className="panel-heading">
          <div className="panel-heading__content">
            <h3>Search and Filters</h3>
            <p>Find defects quickly by title, status, or severity.</p>
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
            <label className="field-label" htmlFor="bug-search">
              Search by title
            </label>
            <input
              id="bug-search"
              className="input"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search bugs"
            />
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="bug-status-filter">
              Status
            </label>
            <select
              id="bug-status-filter"
              className="select"
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as BugStatusFilter)
              }
            >
              <option value={ALL_BUG_STATUSES}>{ALL_BUG_STATUSES}</option>
              {BUG_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="bug-severity-filter">
              Severity
            </label>
            <select
              id="bug-severity-filter"
              className="select"
              value={severityFilter}
              onChange={(event) =>
                setSeverityFilter(event.target.value as BugSeverityFilter)
              }
            >
              <option value={ALL_BUG_SEVERITIES}>{ALL_BUG_SEVERITIES}</option>
              {BUG_SEVERITIES.map((severity) => (
                <option key={severity} value={severity}>
                  {severity}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <div className={`test-cases-layout${formMode ? ' record-layout--editing' : ' record-layout'}`}>
        <section className="panel list-panel">
          <div className="panel-heading">
            <div className="panel-heading__content">
              <h3>Saved Bugs</h3>
              <p>Saved automatically in this browser.</p>
            </div>
            <span className="panel-caption">{visibleCountLabel}</span>
          </div>

          {bugs.length === 0 ? (
            <EmptyState
              title="No bugs yet"
              description="Create the first bug when a defect needs tracking."
              actionLabel="Create first bug"
              onAction={openCreateForm}
            />
          ) : filteredBugs.length === 0 ? (
            <EmptyState
              title="No matching bugs"
              description="Try a different title search or reset the filters to see more defects."
              actionLabel="Clear filters"
              onAction={clearFilters}
            />
          ) : (
            <div className="test-case-list">
              {filteredBugs.map((bug) => {
                const linkedTestCaseLabel = getLinkedTestCaseLabel(bug, testCases)

                return (
                  <article key={bug.id} className="test-case-card">
                    <div className="test-case-card__header">
                      <div>
                        <p className="meta-kicker">{bug.status}</p>
                        <h3>{bug.title}</h3>
                      </div>

                      <div className="card-actions">
                        <button
                          type="button"
                          className="button button--secondary"
                          onClick={() => openEditForm(bug)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="button button--danger"
                          onClick={() => handleDelete(bug.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>

                    <div className="badge-row">
                      <span className={`badge badge--${getStatusTone(bug.status)}`}>
                        {bug.status}
                      </span>
                      <span
                        className={`badge badge--${getSeverityTone(bug.severity)}`}
                      >
                        {bug.severity}
                      </span>
                      {linkedTestCaseLabel ? (
                        <span className="badge badge--outline">
                          {linkedTestCaseLabel}
                        </span>
                      ) : null}
                    </div>

                    <details className="record-details"><summary>Defect details & reproduction</summary>
                    <div className="description-block">
                      <span className="field-label">Description</span>
                      <p>{bug.description}</p>
                    </div>

                    <div className="description-grid">
                      <div className="description-block">
                        <span className="field-label">Steps To Reproduce</span>
                        <p>{bug.stepsToReproduce}</p>
                      </div>
                      <div className="description-block">
                        <span className="field-label">Expected Behavior</span>
                        <p>{bug.expectedBehavior}</p>
                      </div>
                      <div className="description-block">
                        <span className="field-label">Actual Behavior</span>
                        <p>{bug.actualBehavior}</p>
                      </div>
                    </div>

                    <div className="card-footer">
                      <span>Created {formatDateTime(bug.createdAt)}</span>
                      <span>Updated {formatDateTime(bug.updatedAt)}</span>
                    </div>
                    </details>
                  </article>
                )
              })}
            </div>
          )}
        </section>

        {formMode ? (
          <BugForm
            key={formMode === 'edit' && editingBug ? editingBug.id : 'create-bug'}
            mode={formMode}
            initialValues={editingBug}
            testCases={testCases}
            onSubmit={handleSubmit}
            onCancel={closeForm}
          />
        ) : null}
      </div>
    </section>
  )
}
