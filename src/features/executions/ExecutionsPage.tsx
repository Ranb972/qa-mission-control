import { EvidenceTrace } from '../../components/ui/EvidenceTrace'
import type { AppView } from '../../components/layout/AppShell'
import { formatExecutionResult, formatExecutionReadinessReason } from './executionPresentation'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FocusEvent } from 'react'
import { useWorkspace } from '../../lib/workspace/workspaceContext'
import { testDesignFingerprint } from '../document-intelligence/requirementTraceability'
import { EmptyState } from '../../components/ui/EmptyState'
import { SummaryCard } from '../../components/ui/SummaryCard'
import { CollectionPager } from '../../components/ui/CollectionPager'
import { formatDateTime } from '../../lib/formatters'
import type { Bug } from '../bugs/bugTypes'
import {
  calculateReleaseReadiness,
  type ReleaseReadinessStatus,
} from '../readiness/releaseReadiness'
import type { Release } from '../releases/releaseTypes'
import type { Risk } from '../risks/riskTypes'
import { TestCaseContentDisplay } from '../test-cases/TestCaseContentDisplay'
import type { TestCase } from '../test-cases/testCaseTypes'
import type { TestSuite } from '../test-suites/testSuiteTypes'
import {
  findExecution,
  getExecutionDisplayValues,
  getReleaseExecutionSummary,
  indexReleaseExecutions,
  upsertExecution,
} from './executionSelectors'
import {
  EXECUTION_RESULTS,
  type Execution,
  type ExecutionResult,
} from './executionTypes'
import {
  ALL_EXECUTION_STATUS_FILTER,
  ALL_TEST_CASES_SUITE_FILTER,
  filterExecutionQueue,
  getExecutionQueueNavigation,
  getSuiteScopedTestCases,
  resolveSelectedTestCaseId,
  type ExecutionStatusFilter,
} from './executionWorkspace'

type ExecutionsPageProps = {
  initialReleaseId?: string
  initialStatusFilter?: ExecutionStatusFilter
  onNavigate?: (view: AppView) => void
  releases: Release[]
  testCases: TestCase[]
  testSuites: TestSuite[]
  executions: Execution[]
  bugs: Bug[]
  risks: Risk[]
  onChange: (executions: Execution[]) => void | Promise<unknown>
}

const EXECUTION_STATUS_FILTERS: ExecutionStatusFilter[] = [
  ALL_EXECUTION_STATUS_FILTER,
  ...EXECUTION_RESULTS,
]

function createExecutionId() {
  const randomId = globalThis.crypto?.randomUUID?.()

  if (randomId) {
    return randomId
  }

  return `execution-${Date.now()}`
}

function getResultTone(result: ExecutionResult) {
  switch (result) {
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

function getReadinessTone(status: ReleaseReadinessStatus) {
  switch (status) {
    case 'Ready':
      return 'positive'
    case 'Blocked':
      return 'critical'
    case 'At Risk':
    default:
      return 'warning'
  }
}

function formatQueueCount(visibleCount: number, scopedCount: number) {
  if (visibleCount === scopedCount) {
    return `${visibleCount} shown`
  }

  return `${visibleCount} of ${scopedCount} shown`
}

export function ExecutionsPage({
  initialReleaseId,
  initialStatusFilter,
  onNavigate,
  releases,
  testCases,
  testSuites,
  executions,
  bugs,
  risks,
  onChange,
}: ExecutionsPageProps) {
  const workspace = useWorkspace()
  const latest = useRef({ executions, testCases, releases })
  const writes = useRef(Promise.resolve())
  const failedNotes = useRef(new Set<string>())
  useLayoutEffect(() => { latest.current = { executions, testCases, releases } }, [executions, testCases, releases])
  const [savingResult, setSavingResult] = useState(false)
  const [queueQuery, setQueueQuery] = useState('')
  const [mobileDetail, setMobileDetail] = useState(false)
  const [resultError, setResultError] = useState<string | null>(null)
  const [design, setDesign] = useState<{ test: TestCase; fingerprint: string } | null>(null)
  const resultBusy = useRef(false)
  const [selectedReleaseId, setSelectedReleaseId] = useState(
    initialReleaseId ?? releases[0]?.id ?? '',
  )
  const [statusFilter, setStatusFilter] = useState<ExecutionStatusFilter>(
    initialStatusFilter ?? ALL_EXECUTION_STATUS_FILTER,
  )
  const [suiteFilterId, setSuiteFilterId] = useState<string>(
    ALL_TEST_CASES_SUITE_FILTER,
  )
  const [selectedTestCaseId, setSelectedTestCaseId] = useState(
    testCases[0]?.id ?? '',
  )
  const selectedRelease =
    releases.find((release) => release.id === selectedReleaseId) ??
    releases[0] ??
    null
  const releaseId = selectedRelease?.id ?? ''
  const executionIndex = useMemo(() => indexReleaseExecutions(executions, releaseId), [executions, releaseId])
  const summary = getReleaseExecutionSummary(testCases, executions, releaseId)
  const readiness = calculateReleaseReadiness({
    releaseId,
    testCases,
    executions,
    bugs,
    risks,
  })
  const suiteScopedTestCases = useMemo(
    () => getSuiteScopedTestCases(testCases, testSuites, suiteFilterId),
    [suiteFilterId, testCases, testSuites],
  )
  const executionQueue = useMemo(
    () =>
      filterExecutionQueue({
        testCases,
        testSuites,
        executions,
        releaseId,
        statusFilter,
        suiteFilterId,
        query: queueQuery,
      }),
    [testCases, testSuites, executions, releaseId, statusFilter, suiteFilterId, queueQuery],
  )
  const activeTestCaseId = resolveSelectedTestCaseId(
    executionQueue,
    selectedTestCaseId,
  )
  const selectedTestCase =
    executionQueue.find((testCase) => testCase.id === activeTestCaseId) ?? null
  const selectedExecution = selectedTestCase
    ? findExecution(executions, releaseId, selectedTestCase.id)
    : null
  useEffect(() => {
    let current = true
    if (selectedTestCase) void testDesignFingerprint(selectedTestCase).then((fingerprint) => { if (current) setDesign({ test: selectedTestCase, fingerprint }) }).catch(() => { if (current) setResultError('Test design could not be verified. No execution result was changed.') })
    return () => { current = false }
  }, [selectedTestCase])
  const executionDesignCurrent = selectedExecution?.testDesignFingerprint && design?.test === selectedTestCase && selectedExecution.testDesignFingerprint === design.fingerprint
  const selectedDisplayValues = selectedTestCase
    ? getExecutionDisplayValues(executions, releaseId, selectedTestCase.id)
    : null
  const queueNavigation = getExecutionQueueNavigation(
    executionQueue,
    activeTestCaseId,
  )
  const queuePage = Math.max(0, Math.floor(queueNavigation.currentIndex / 40))
  const selectedSuite =
    suiteFilterId === ALL_TEST_CASES_SUITE_FILTER
      ? null
      : testSuites.find((suite) => suite.id === suiteFilterId) ?? null
  const queueCountLabel = formatQueueCount(
    executionQueue.length,
    suiteScopedTestCases.length,
  )
  const hasSuiteEmptyState =
    suiteFilterId !== ALL_TEST_CASES_SUITE_FILTER &&
    suiteScopedTestCases.length === 0

  function persistChange(testCaseId: string, change: { result: ExecutionResult } | { notes: string }) {
    const test = testCases.find((item) => item.id === testCaseId)
    const release = selectedRelease
    if (!release || !test) return Promise.reject(new Error('Select a current test and release.'))
    const task = writes.current.then(async () => {
      if ('result' in change && failedNotes.current.has(`${release.id}:${test.id}`)) throw new Error('Save the edited notes before recording a result.')
      const currentTest = latest.current.testCases.find((item) => item.id === test.id)
      const currentRelease = latest.current.releases.find((item) => item.id === release.id)
      if (currentTest !== test || currentRelease?.createdAt !== release.createdAt) throw new Error('Execution context changed.')
      const checks = []
      if (workspace) {
        const [testRecord, releaseRecord] = await Promise.all([workspace.repository.readRecord<TestCase>('testCases', test.id), workspace.repository.readRecord<Release>('releases', release.id)])
        if (!testRecord || !releaseRecord || testRecord.value.createdAt !== test.createdAt || releaseRecord.value.createdAt !== release.createdAt || 'result' in change && await testDesignFingerprint(testRecord.value) !== await testDesignFingerprint(test)) throw new Error('Execution context changed.')
        checks.push({ collection: 'testCases', id: test.id, version: testRecord.version }, { collection: 'releases', id: release.id, version: releaseRecord.version })
      }
      const fingerprint = 'result' in change && change.result !== 'Not Run' ? await testDesignFingerprint(test) : undefined
      const current = workspace?.get('executions').items ?? latest.current.executions
      const existing = findExecution(current, release.id, test.id)
      if ('notes' in change && ((!existing && !change.notes.trim()) || existing?.notes === change.notes)) return
      const next = upsertExecution(current, { releaseId: release.id, testCaseId: test.id, result: 'result' in change ? change.result : existing?.result ?? 'Not Run', notes: 'notes' in change ? change.notes : existing?.notes ?? '', now: new Date().toISOString(), createId: createExecutionId, ...('result' in change ? { testDesignFingerprint: fingerprint } : {}) })
      const saved = workspace ? await workspace.save('executions', next, { recordChecks: checks }) : await onChange(next)
      if (saved && typeof saved === 'object' && 'ok' in saved && saved.ok === false) throw new Error('Execution storage failed.')
      latest.current = { ...latest.current, executions: workspace?.get('executions').items ?? next }
    })
    writes.current = task
    // A failed notes save also stops an already queued result. A later explicit retry can start fresh.
    void task.finally(() => { if (writes.current === task) writes.current = Promise.resolve() }).catch(() => undefined)
    return task
  }
  async function handleResultChange(testCaseId: string, result: ExecutionResult) {
    if (resultBusy.current) return
    resultBusy.current = true; setSavingResult(true); setResultError(null)
    try { await persistChange(testCaseId, { result }) }
    catch { setResultError('Execution could not be saved safely. Notes or test/release evidence may have changed. Review the saved state before trying again.') }
    finally { resultBusy.current = false; setSavingResult(false) }
  }

  function handleNotesBlur(
    testCaseId: string,
    event: FocusEvent<HTMLTextAreaElement>,
  ) {
    if (!selectedRelease) {
      return
    }

    const notes = event.target.value
    const key = `${selectedRelease.id}:${testCaseId}`
    void persistChange(testCaseId, { notes }).then(() => { failedNotes.current.delete(key); setResultError(null) }).catch(() => { failedNotes.current.add(key); setResultError('Execution notes could not be saved. Keep this text and retry by leaving the notes field again. Result recording is stopped until these notes save.') })
  }

  if (releases.length === 0) {
    return (
      <section className="page">
        <div className="page-heading">
          <h2>Executions</h2>
          <p>Track test case results against a selected release.</p>
        </div>

        <section className="panel">
          <EmptyState
            title="No releases available"
            description="Create a release first before tracking execution results."
          />
          {onNavigate && <button className="button button--primary" onClick={() => onNavigate('releases')}>Go to Releases</button>}
        </section>
      </section>
    )
  }

  if (testCases.length === 0) {
    return (
      <section className="page">
        <div className="page-heading">
          <h2>Executions</h2>
          <p>Track test case results against a selected release.</p>
        </div>

        <section className="panel">
          <EmptyState
            title="No test cases available"
            description="Create test cases first before tracking execution results."
          />
          {onNavigate && <button className="button button--primary" onClick={() => onNavigate('test-cases')}>Go to Test Cases</button>}
        </section>
      </section>
    )
  }

  return (
    <section className="page page--executions">
      <div className="page-heading">
        <h2>Executions</h2>
        <p>
          Choose a release, run the selected test design, then record what happened.
        </p>
      </div>

      <div className="execution-controls">
      <section
        className="panel toolbar"
        aria-labelledby="execution-release-heading"
      >
        <div className="panel-heading">
          <div className="panel-heading__content">
            <h3 id="execution-release-heading">Release Execution Scope</h3>
            <p>Choose the release whose test execution status you want to update.</p>
          </div>
        </div>

        <div className="filter-grid">
          <label className="field-group">Find a Test Case<input className="input" value={queueQuery} onChange={(event) => setQueueQuery(event.target.value)} placeholder="Search title or area" /></label>
          <div className="field-group">
            <label className="field-label" htmlFor="execution-release">
              Select release
            </label>
            <select
              id="execution-release"
              className="select"
              value={releaseId}
              onChange={(event) => setSelectedReleaseId(event.target.value)}
            >
              {releases.map((release) => (
                <option key={release.id} value={release.id}>
                  {release.name} ({release.version})
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section
        className="panel toolbar"
        aria-labelledby="execution-workspace-filters-heading"
      >
        <div className="panel-heading">
          <div className="panel-heading__content">
            <h3 id="execution-workspace-filters-heading">
              Execution Workspace Filters
            </h3>
            <p>
              Narrow the queue without changing release-wide progress or
              readiness.
            </p>
          </div>
        </div>

        <div className="filter-grid">
          <div className="field-group">
            <label className="field-label" htmlFor="execution-status-filter">
              Filter by execution status
            </label>
            <select
              id="execution-status-filter"
              className="select"
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as ExecutionStatusFilter)
              }
            >
              {EXECUTION_STATUS_FILTERS.map((filterValue) => (
                <option key={filterValue} value={filterValue}>
                  {filterValue === ALL_EXECUTION_STATUS_FILTER ? 'All results' : formatExecutionResult(filterValue)}
                </option>
              ))}
            </select>
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="execution-suite-filter">
              Filter by test suite
            </label>
            <select
              id="execution-suite-filter"
              className="select"
              value={suiteFilterId}
              onChange={(event) => setSuiteFilterId(event.target.value)}
            >
              <option value={ALL_TEST_CASES_SUITE_FILTER}>
                All test cases
              </option>
              {testSuites.map((suite) => (
                <option key={suite.id} value={suite.id}>
                  {suite.name} ({suite.type})
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      </div>

      <div className="summary-grid" aria-label="Release-wide execution summary">
        <SummaryCard
          label="Total"
          value={summary.total}
          description="Current test cases available for this release."
        />
        <SummaryCard
          label="Awaiting run"
          value={summary.notRun}
          description="No result recorded for this release."
        />
        <SummaryCard
          label="Passed"
          value={summary.passed}
          description="Cases marked as passing for this release."
          tone="positive"
        />
        <SummaryCard
          label="Failed"
          value={summary.failed}
          description="Cases marked as failing for this release."
          tone="critical"
        />
        <SummaryCard
          label="Blocked"
          value={summary.blocked}
          description="Cases blocked during this release execution."
          tone="warning"
        />
      </div>

      <div className="execution-progress" role="group" aria-label="Execution progress">
        <div className="execution-progress__caption"><strong>{summary.total - summary.notRun} of {summary.total} results recorded</strong><span>Release-wide · filters do not change progress</span></div>
        <div className="execution-progress__track" aria-hidden="true">
          <span className="execution-progress__passed" style={{ flex: summary.passed }} />
          <span className="execution-progress__failed" style={{ flex: summary.failed }} />
          <span className="execution-progress__blocked" style={{ flex: summary.blocked }} />
          <span className="execution-progress__pending" style={{ flex: summary.notRun }} />
        </div>
      </div>

      <section className="panel execution-readiness" aria-labelledby="release-readiness-heading">
        <div className="panel-heading">
          <div className="panel-heading__content">
            <h3 id="release-readiness-heading">Release Readiness</h3>
            <p>
              Calculated for {selectedRelease?.name}. Bugs and risks are global
              product-level signals.
            </p>
          </div>
          <span
            className={`badge badge--${getReadinessTone(readiness.status)}`}
          >
            {readiness.status}
          </span>
        </div>

        <div className="execution-readiness__actions">
          <details><summary>View {readiness.reasons.length} readiness signals</summary>
        <ul className="roadmap-list">
          {readiness.reasons.map((reason) => (
                <li key={reason.code}>{formatExecutionReadinessReason(reason)}</li>
          ))}
        </ul>
          </details>
          {summary.failed > 0 ? <button type="button" className="button button--secondary" onClick={() => setStatusFilter('Failed')}>Show failed tests</button> : null}
          {summary.notRun > 0 ? <button type="button" className="button button--secondary" onClick={() => setStatusFilter('Not Run')}>Show tests awaiting run</button> : null}
        </div>
      </section>

      <section className="panel list-panel">
        <div className="panel-heading">
          <div className="panel-heading__content">
            <h3>Focused Execution Workspace</h3>
            <p>
              Use the queue to choose what to run, then execute one test case in
              the focused runner.
            </p>
          </div>
          <span className="panel-caption">{queueCountLabel}</span>
        </div>

        <div className={`execution-workspace${mobileDetail && selectedTestCase ? ' execution-workspace--detail' : ''}`}>
          <section
            className="execution-queue-panel"
            aria-labelledby="execution-queue-heading"
          >
            <div className="panel-heading">
              <div className="panel-heading__content">
                <h4 id="execution-queue-heading">Execution Queue</h4>
                <p>
                  {selectedSuite
                    ? `Showing ${selectedSuite.name} as a view-only filter.`
                    : 'Showing current test cases for the selected release.'}
                </p>
              </div>
            </div>

            <CollectionPager page={queuePage} pageSize={40} total={executionQueue.length} label="Execution queue pages" onPageChange={(next) => setSelectedTestCaseId(executionQueue[next * 40]?.id ?? '')} />
            {executionQueue.length === 0 ? (
              <EmptyState
                title={
                  hasSuiteEmptyState
                    ? 'No available test cases in this suite'
                    : 'No matching test cases'
                }
                description={
                  hasSuiteEmptyState
                    ? 'This suite has no current test cases, or it only references unavailable test cases.'
                    : 'Try changing the status filter or suite filter.'
                }
              />
            ) : (
              <div className="execution-queue-list">
                {executionQueue.slice(queuePage * 40, (queuePage + 1) * 40).map((testCase) => {
                  const displayValues = { result: executionIndex.get(testCase.id)?.result ?? 'Not Run' }
                  const isSelected = testCase.id === activeTestCaseId

                  return (
                    <button
                      key={testCase.id}
                      type="button"
                      className={`execution-queue-item${
                        isSelected ? ' execution-queue-item--selected' : ''
                      }`}
                      aria-pressed={isSelected}
                      onClick={() => {
                        setSelectedTestCaseId(testCase.id); setMobileDetail(true)
                        requestAnimationFrame(() => document.getElementById(`execution-runner-card-${releaseId}-${testCase.id}`)?.focus())
                      }}
                    >
                      <span className="execution-queue-item__content">
                        <strong>{testCase.title}</strong>
                        <span>
                          {testCase.area} · {testCase.priority} ·{' '}
                          {testCase.type}
                        </span>
                      </span>
                      <span
                        className={`badge badge--${getResultTone(
                          displayValues.result,
                        )}`}
                      >
                        {formatExecutionResult(displayValues.result)}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </section>

          <section
            className="execution-runner-panel"
            aria-labelledby="execution-runner-heading"
          >
            <button type="button" className="button button--secondary execution-runner-back" onClick={() => {
              setMobileDetail(false)
              requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('.execution-queue-item[aria-pressed="true"]')?.focus())
            }}>Back to execution queue</button>
            <div className="panel-heading">
              <div className="panel-heading__content">
                <h4 id="execution-runner-heading">Focused Test Case Runner</h4>
                <p>
                  Read preconditions first, follow the steps, then record the
                  release-specific result.
                </p>
              </div>
              {selectedTestCase ? (
                <span className="panel-caption">
                  {queueNavigation.currentIndex + 1} of {executionQueue.length}
                </span>
              ) : null}
            </div>

            {!selectedTestCase || !selectedDisplayValues ? (
              <EmptyState
                title="No test case selected"
                description="Choose a test case from the queue to start execution."
              />
            ) : (
              <article
                className="test-case-card execution-runner-card"
                aria-labelledby={`execution-runner-card-${releaseId}-${selectedTestCase.id}`}
              >
                <div className="test-case-card__header">
                  <div>
                    <p className="meta-kicker">{selectedTestCase.area}</p>
                    <h3
                      id={`execution-runner-card-${releaseId}-${selectedTestCase.id}`}
                      tabIndex={-1}
                    >
                      {selectedTestCase.title}
                    </h3>
                  </div>
                  <span
                    className={`badge badge--${getResultTone(
                      selectedDisplayValues.result,
                    )}`}
                  >
                    {formatExecutionResult(selectedDisplayValues.result)}
                  </span>
                </div>

                <div className="badge-row">
                  <span className="badge badge--outline">
                    Priority: {selectedTestCase.priority}
                  </span>
                  <span className="badge badge--outline">
                    Type: {selectedTestCase.type}
                  </span>
                  {selectedExecution?.executedAt ? (
                    <span className="badge badge--outline">
                      Executed {formatDateTime(selectedExecution.executedAt)}
                    </span>
                  ) : null}
                </div>

                <EvidenceTrace label="Test to release trace" steps={[
                  {label:'Test design',detail:'Current saved steps'},
                  {label:'Execution observed',detail:selectedExecution && selectedExecution.result!=='Not Run' ? selectedExecution.result + (executionDesignCurrent ? ' · design verified' : ' · design unverified') : 'Awaiting run · no recorded result'},
                  {label:'Release context',detail:(selectedRelease?.name ?? 'Selected release') + ' · ' + (selectedRelease?.status ?? 'No saved status')},
                ]} />
                <TestCaseContentDisplay testCase={selectedTestCase} />
                {selectedExecution && selectedExecution.result !== 'Not Run' && !executionDesignCurrent && <p className="feedback feedback--warning">This recorded result has no verified match to the current test design. Re-run the displayed steps before recording a current result.</p>}
                {resultError && <p role="alert" className="feedback feedback--error">{resultError}</p>}

                <div className="form-grid">
                  <div className="field-group">
                    <label
                      className="field-label"
                      htmlFor={`execution-result-${releaseId}-${selectedTestCase.id}`}
                    >
                      Execution result
                    </label>
                    <select
                      id={`execution-result-${releaseId}-${selectedTestCase.id}`}
                      className="select"
                      value={selectedDisplayValues.result}
                      disabled={savingResult}
                      onChange={(event) =>
                        handleResultChange(
                          selectedTestCase.id,
                          event.target.value as ExecutionResult,
                        )
                      }
                    >
                      {EXECUTION_RESULTS.map((result) => (
                        <option key={result} value={result}>
                          {formatExecutionResult(result)}
                        </option>
                      ))}
                    </select>
                    <p className="helper-text">Record a result after running the displayed steps. Choosing Awaiting run clears the result and execution date.</p>
                    {selectedDisplayValues.result !== 'Not Run' && <button className="button button--secondary button--compact" disabled={savingResult} onClick={() => void handleResultChange(selectedTestCase.id, selectedDisplayValues.result)}>Record this result after re-run</button>}
                  </div>

                  <div className="field-group field-group--full">
                    <label
                      className="field-label"
                      htmlFor={`execution-notes-${releaseId}-${selectedTestCase.id}`}
                    >
                      Execution notes
                    </label>
                    <textarea
                      key={`notes-${releaseId}-${selectedTestCase.id}-${selectedExecution?.id ?? 'new'}`}
                      id={`execution-notes-${releaseId}-${selectedTestCase.id}`}
                      className="textarea"
                      disabled={savingResult}
                      defaultValue={selectedDisplayValues.notes}
                      onBlur={(event) =>
                        handleNotesBlur(selectedTestCase.id, event)
                      }
                    />
                    <p className="helper-text">
                      Notes save on blur and are preserved when switching test
                      cases.
                    </p>
                  </div>
                </div>

                <div className="button-row execution-runner-nav">
                  <button
                    type="button"
                    className="button button--secondary"
                    disabled={!queueNavigation.previousId}
                    onClick={() => {
                      if (queueNavigation.previousId) {
                        setSelectedTestCaseId(queueNavigation.previousId)
                        requestAnimationFrame(() => document.getElementById(`execution-runner-card-${releaseId}-${queueNavigation.previousId}`)?.focus())
                      }
                    }}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    className="button button--secondary"
                    disabled={!queueNavigation.nextId}
                    onClick={() => {
                      if (queueNavigation.nextId) {
                        setSelectedTestCaseId(queueNavigation.nextId)
                        requestAnimationFrame(() => document.getElementById(`execution-runner-card-${releaseId}-${queueNavigation.nextId}`)?.focus())
                      }
                    }}
                  >
                    Next
                  </button>
                </div>
              </article>
            )}
          </section>
        </div>
      </section>
    </section>
  )
}
