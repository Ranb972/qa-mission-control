import { EditorDialog } from '../../components/ui/EditorDialog'
import { useState } from 'react'
import { EmptyState } from '../../components/ui/EmptyState'
import { formatDateTime } from '../../lib/formatters'
import type { TestCase } from '../test-cases/testCaseTypes'
import {
  ALL_TEST_SUITE_TYPES,
  filterAndSortTestSuites,
  getUniqueTestCaseIds,
  type TestSuiteTypeFilter,
} from './testSuiteFilters'
import { TestSuiteForm } from './TestSuiteForm'
import {
  TEST_SUITE_TYPES,
  type TestSuite,
  type TestSuiteFormValues,
} from './testSuiteTypes'

type TestSuitesPageProps = {
  testSuites: TestSuite[]
  testCases: TestCase[]
  onChange: (testSuites: TestSuite[]) => void
}

function createTestSuiteId() {
  const randomId = globalThis.crypto?.randomUUID?.()

  if (randomId) {
    return randomId
  }

  return `test-suite-${Date.now()}`
}

function formatTestCaseCount(count: number) {
  return `${count} ${count === 1 ? 'test case' : 'test cases'}`
}

function getSuiteTestCases(suite: TestSuite, testCases: TestCase[]) {
  return getUniqueTestCaseIds(suite.testCaseIds).map((testCaseId) => ({
    testCaseId,
    testCase:
      testCases.find((currentTestCase) => currentTestCase.id === testCaseId) ??
      null,
  }))
}

export function TestSuitesPage({
  testSuites,
  testCases,
  onChange,
}: TestSuitesPageProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [typeFilter, setTypeFilter] =
    useState<TestSuiteTypeFilter>(ALL_TEST_SUITE_TYPES)
  const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)

  const filteredSuites = filterAndSortTestSuites(testSuites, {
    searchTerm,
    typeFilter,
  })
  const editingSuite =
    editingId === null
      ? null
      : testSuites.find((suite) => suite.id === editingId) ?? null
  const hasActiveFilters =
    searchTerm.trim() !== '' || typeFilter !== ALL_TEST_SUITE_TYPES
  const visibleCountLabel =
    filteredSuites.length === testSuites.length
      ? `${filteredSuites.length} total`
      : `${filteredSuites.length} of ${testSuites.length} shown`

  function openCreateForm() {
    setFormMode('create')
    setEditingId(null)
  }

  function openEditForm(suite: TestSuite) {
    setFormMode('edit')
    setEditingId(suite.id)
  }

  function closeForm() {
    setFormMode(null)
    setEditingId(null)
  }

  function clearFilters() {
    setSearchTerm('')
    setTypeFilter(ALL_TEST_SUITE_TYPES)
  }

  function handleSubmit(values: TestSuiteFormValues) {
    const timestamp = new Date().toISOString()

    if (formMode === 'edit' && editingSuite) {
      onChange(
        testSuites.map((suite) =>
          suite.id === editingSuite.id
            ? {
                ...suite,
                ...values,
                updatedAt: timestamp,
              }
            : suite,
        ),
      )
      closeForm()
      return
    }

    const nextSuite: TestSuite = {
      id: createTestSuiteId(),
      createdAt: timestamp,
      updatedAt: timestamp,
      ...values,
    }

    onChange([nextSuite, ...testSuites])
    closeForm()
  }

  function handleDelete(suiteId: string) {
    const target = testSuites.find((suite) => suite.id === suiteId)

    if (!target) {
      return
    }

    const confirmed = window.confirm(`Delete "${target.name}"?`)

    if (!confirmed) {
      return
    }

    onChange(testSuites.filter((suite) => suite.id !== suiteId))

    if (editingId === suiteId) {
      closeForm()
    }
  }

  return (
    <section className="page page--suites">
      <div className="page-heading page-heading--split">
        <div className="page-heading">
          <h2>Test Suites</h2>
          <p>
            Organize existing test cases into QA-focused coverage libraries such
            as smoke, regression, sanity, and feature suites.
          </p>
        </div>

        <div className="button-row">
          <button
            type="button"
            className="button button--primary"
            onClick={openCreateForm}
          >
            New suite
          </button>
        </div>
      </div>

      <section
        className="panel toolbar"
        aria-labelledby="test-suite-filters-heading"
      >
        <div className="panel-heading">
          <div className="panel-heading__content">
            <h3 id="test-suite-filters-heading">Suite Search and Filters</h3>
            <p>Find QA libraries by name or suite type.</p>
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
            <label className="field-label" htmlFor="test-suite-search">
              Search by suite name
            </label>
            <input
              id="test-suite-search"
              className="input"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search test suites"
            />
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="test-suite-type-filter">
              Filter by suite type
            </label>
            <select
              id="test-suite-type-filter"
              className="select"
              value={typeFilter}
              onChange={(event) =>
                setTypeFilter(event.target.value as TestSuiteTypeFilter)
              }
            >
              <option value={ALL_TEST_SUITE_TYPES}>
                {ALL_TEST_SUITE_TYPES}
              </option>
              {TEST_SUITE_TYPES.map((suiteType) => (
                <option key={suiteType} value={suiteType}>
                  {suiteType}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="panel list-panel">
        <div className="panel-heading">
          <div className="panel-heading__content">
            <h3>Saved Test Suites</h3>
            <p>
              Stored locally as coverage groups that reference existing test
              cases by ID.
            </p>
          </div>
          <span className="panel-caption">{visibleCountLabel}</span>
        </div>

        {testSuites.length === 0 ? (
          <EmptyState
            title="No test suites yet"
            description="Create a smoke, regression, sanity, feature, or custom suite to organize coverage."
            actionLabel="Create first suite"
            onAction={openCreateForm}
          />
        ) : filteredSuites.length === 0 ? (
          <EmptyState
            title="No matching test suites"
            description="Try a different suite name or reset the suite type filter."
            actionLabel="Clear filters"
            onAction={clearFilters}
          />
        ) : (
          <div className="test-case-list">
            {filteredSuites.map((suite) => {
              const membership = getSuiteTestCases(suite, testCases)
              const availableTestCases = membership.filter(
                (member) => member.testCase !== null,
              )
              const unavailableCount =
                membership.length - availableTestCases.length

              return (
                <article
                  key={suite.id}
                  className="test-case-card"
                  aria-labelledby={`test-suite-card-heading-${suite.id}`}
                >
                  <div className="test-case-card__header">
                    <div>
                      <p className="meta-kicker">{suite.type}</p>
                      <h3 id={`test-suite-card-heading-${suite.id}`}>
                        {suite.name}
                      </h3>
                    </div>

                    <div className="card-actions">
                      <button
                        type="button"
                        className="button button--secondary"
                        onClick={() => openEditForm(suite)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="button button--danger"
                        onClick={() => handleDelete(suite.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  <div className="badge-row">
                    <span className="badge badge--neutral">{suite.type}</span>
                    <span className="badge badge--outline">
                      {formatTestCaseCount(availableTestCases.length)}
                    </span>
                    {unavailableCount > 0 ? (
                      <span className="badge badge--warning">
                        {unavailableCount} unavailable
                      </span>
                    ) : null}
                  </div>

                  {suite.description ? (
                    <div className="description-block">
                      <span className="field-label">Purpose</span>
                      <p>{suite.description}</p>
                    </div>
                  ) : null}

                  <details className="record-details">
                    <summary>Included Test Cases</summary>
                    {membership.length === 0 ? (
                      <p className="helper-text">
                        No test cases selected for this suite.
                      </p>
                    ) : (
                      <ul className="suite-case-list">
                        {membership.map(({ testCaseId, testCase }) => (
                          <li key={testCaseId}>
                            {testCase ? (
                              <>
                                <strong>{testCase.title}</strong>
                                <span>
                                  {testCase.area} · {testCase.priority} ·{' '}
                                  {testCase.type}
                                </span>
                              </>
                            ) : (
                              <>
                                <strong>Unavailable test case</strong>
                                <span>
                                  This referenced test case no longer exists.
                                </span>
                              </>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </details>

                  <div className="card-footer">
                    <span>Created {formatDateTime(suite.createdAt)}</span>
                    <span>Updated {formatDateTime(suite.updatedAt)}</span>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>

      {formMode ? (
        <EditorDialog labelledBy="test-suite-editor-heading" onClose={closeForm}>
            <TestSuiteForm
              key={
                formMode === 'edit' && editingSuite
                  ? editingSuite.id
                  : 'create-test-suite'
              }
              mode={formMode}
              initialValues={editingSuite}
              testCases={testCases}
              onSubmit={handleSubmit}
              onCancel={closeForm}
              headingId="test-suite-editor-heading"
            />
          </EditorDialog>
      ) : null}
    </section>
  )
}
