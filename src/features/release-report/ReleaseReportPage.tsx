import { useCallback, useMemo, useRef, useState } from 'react'
import type { AppView } from '../../components/layout/AppShell'
import type { ExecutionStatusFilter } from '../executions/executionWorkspace'
import { formatExecutionResult, formatExecutionReadinessReason } from '../executions/executionPresentation'
import { useWorkspace } from '../../lib/workspace/workspaceContext'
import { ReleaseRequirementPanel } from './ReleaseRequirementPanel'
import { ReportPagedList } from './ReportPagedList'
import { EmptyState } from '../../components/ui/EmptyState'
import { SummaryCard } from '../../components/ui/SummaryCard'
import { formatDateTime } from '../../lib/formatters'
import type { Bug } from '../bugs/bugTypes'
import type { Execution } from '../executions/executionTypes'
import type { Release } from '../releases/releaseTypes'
import type { Risk } from '../risks/riskTypes'
import type { TestCase } from '../test-cases/testCaseTypes'
import {
  GLOBAL_QUALITY_SIGNAL_NOTE,
  buildReleaseReportModel,
  formatReleaseReportMarkdown,
  type ReleaseReportSignal,
  type ReleaseReportTestItem,
} from './releaseReport'

type ReleaseReportPageProps = {
  onNavigate?: (view: AppView) => void
  onReviewExecutions?: (releaseId: string, status: ExecutionStatusFilter) => void
  releases: Release[]
  testCases: TestCase[]
  executions: Execution[]
  bugs: Bug[]
  risks: Risk[]
}

function formatExecutedAt(value?: string) {
  if (!value) {
    return null
  }

  return `Executed ${formatDateTime(value)}`
}

function ReportTestList({
  items,
  emptyMessage,
}: {
  items: ReleaseReportTestItem[]
  emptyMessage: string
}) {
  if (items.length === 0) {
    return <p className="helper-text">{emptyMessage}</p>
  }

  return (
    <ReportPagedList items={items} label="Reported test pages">{(visible) => <ul className="report-list">
      {visible.map((item) => (
        <li key={item.testCaseId}>
          <strong>{item.title}</strong>
          <span>
            {item.area} · {item.priority}
            {formatExecutedAt(item.executedAt)
              ? ` · ${formatExecutedAt(item.executedAt)}`
              : ''}
          </span>
          {item.notes.trim() ? <p>{item.notes}</p> : null}
        </li>
      ))}
    </ul>}</ReportPagedList>
  )
}

function SignalList({
  items,
  emptyMessage,
}: {
  items: ReleaseReportSignal[]
  emptyMessage: string
}) {
  if (items.length === 0) {
    return <p className="helper-text">{emptyMessage}</p>
  }

  return (
    <ReportPagedList items={items} label="Reported quality signal pages">{(visible) => <ul className="report-list">
      {visible.map((item) => (
        <li key={item.id}>
          <strong>
            {item.level}: {item.title}
          </strong>
          <span>{item.detail}</span>
        </li>
      ))}
    </ul>}</ReportPagedList>
  )
}

export function ReleaseReportPage({
  onNavigate,
  onReviewExecutions,
  releases,
  testCases,
  executions,
  bugs,
  risks,
}: ReleaseReportPageProps) {
  const workspace = useWorkspace()
  const evidenceRef = useRef<HTMLDivElement>(null)
  const [requirementReport, setRequirementReport] = useState<{ releaseId: string; markdown: string } | null>(null)
  const receiveRequirementReport = useCallback((releaseId: string, markdown: string) => setRequirementReport({ releaseId, markdown }), [])
  const [selectedReleaseId, setSelectedReleaseId] = useState(
    releases[0]?.id ?? '',
  )
  const [copyMessage, setCopyMessage] = useState<string | null>(null)
  const selectedRelease =
    releases.find((release) => release.id === selectedReleaseId) ??
    releases[0] ??
    null
  const reportModel = useMemo(
    () =>
      selectedRelease
        ? buildReleaseReportModel({
            release: selectedRelease,
            testCases,
            executions,
            bugs,
            risks,
          })
        : null,
    [selectedRelease, testCases, executions, bugs, risks],
  )
  const markdown = useMemo(
    () => (reportModel ? `${formatReleaseReportMarkdown(reportModel)}${workspace ? `\n\n${requirementReport?.releaseId === reportModel.release.id ? requirementReport.markdown : '## Source and requirement traceability\n\nCurrent requirement assessment is loading or unavailable.\n'}` : ''}` : ''),
    [reportModel, requirementReport, workspace],
  )

  async function handleCopyMarkdown() {
    setCopyMessage(null)

    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard is unavailable')
      }

      await navigator.clipboard.writeText(markdown)
      setCopyMessage('Markdown report copied.')
    } catch {
      setCopyMessage('Markdown report could not be copied.')
    }
  }

  if (releases.length === 0 || !reportModel) {
    return (
      <section className="page">
        <div className="page-heading">
          <h2>Release Report</h2>
          <p>Create a stakeholder-ready QA status report from release execution data.</p>
        </div>

        <section className="panel">
          <EmptyState
            title="No releases available"
            description="Create a release before generating a QA release report."
          />
          {onNavigate && <button className="button button--primary" onClick={() => onNavigate('releases')}>Go to Releases</button>}
        </section>
      </section>
    )
  }

  return (
    <section className="page page--report">
      <div className="page-heading">
        <h2>Release Report</h2>
        <p>
          Review the release decision, resolve open signals and share the supporting evidence.
        </p>
      </div>

      <section
        className="panel toolbar"
        aria-labelledby="release-report-scope-heading"
      >
        <div className="panel-heading">
          <div className="panel-heading__content">
            <h3 id="release-report-scope-heading">Release under review</h3>
            <p>Select a release. Reviewing or sharing this report does not change its status.</p>
          </div>
        </div>

        <div className="report-toolbar-actions">
          <button
            type="button"
            className="button button--primary"
            onClick={handleCopyMarkdown}
          >
            Copy Markdown report
          </button>
          <button type="button" className="button button--secondary" onClick={() => window.print()}>Print report</button>
        </div>
        <div className="filter-grid">
          <div className="field-group">
            <label className="field-label" htmlFor="release-report-release">
              Select release
            </label>
            <select
              id="release-report-release"
              className="select"
              value={reportModel.release.id}
              onChange={(event) => {
                setSelectedReleaseId(event.target.value)
                setCopyMessage(null)
              }}
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

      {copyMessage ? (
        <p className="helper-text" role="status">{copyMessage}</p>
      ) : null}

      <section className="panel report-document" aria-labelledby="report-preview-heading">
        <div className="report-masthead">
          <p className="meta-kicker">QA Mission Control / Release assessment</p>
          <h3 id="report-preview-heading" className="visually-hidden">Report Preview</h3>
          <h4>{reportModel.release.name} <span>{reportModel.release.version}</span></h4>
          <p>Target {reportModel.release.targetDate} <span aria-hidden="true">·</span> Release status: {reportModel.release.status}</p>
        </div>
      <div className="report-decision">
        <section className="report-decision__verdict" aria-label="Calculated Readiness" data-readiness={reportModel.readiness.status}>
          <p className="meta-kicker">Execution assessment / {reportModel.readiness.status}</p>
          <h4>{reportModel.readiness.status === 'Blocked' ? 'Resolve blockers before handoff.' : reportModel.readiness.status === 'At Risk' ? 'Complete the outstanding QA review.' : 'Execution checks clear. Review source evidence.'}</h4>
          <p className="helper-text">Calculated from this release’s recorded results and global open bugs and risks. This is not final release approval.</p>
          <ul className="report-decision__signals">{reportModel.readiness.reasons.slice(0, 3).map(reason => <li key={reason.code}>{formatExecutionReadinessReason(reason)}</li>)}</ul>
          {reportModel.readiness.reasons.length > 3 && <details><summary>{reportModel.readiness.reasons.length - 3} more signals</summary><ul className="roadmap-list">{reportModel.readiness.reasons.slice(3).map(reason => <li key={reason.code}>{formatExecutionReadinessReason(reason)}</li>)}</ul></details>}
        </section>
        <section className="report-decision__next" aria-label="Recommended next actions"><p className="meta-kicker">Next action</p><h4>{reportModel.failedTests.length ? 'Investigate the failed tests.' : reportModel.blockedTests.length ? 'Clear the execution blockers.' : reportModel.notRunTests.length ? 'Run the remaining tests.' : !reportModel.summary.total ? 'Define the tests to execute.' : reportModel.globalBugs.length ? 'Review the open defects.' : reportModel.globalRisks.length ? 'Review the open risks.' : 'Review evidence before sign-off.'}</h4>
          <p>{reportModel.recommendedActions[0] ?? 'Review the test scope and source evidence before making a release decision.'}</p>
          <div className="button-row">
            {reportModel.summary.total > 0 && (reportModel.failedTests.length || reportModel.blockedTests.length || reportModel.notRunTests.length) && onReviewExecutions ? <button className="button button--primary" onClick={() => onReviewExecutions(reportModel.release.id, reportModel.failedTests.length ? 'Failed' : reportModel.blockedTests.length ? 'Blocked' : 'Not Run')}>Review executions</button> : onNavigate && !reportModel.summary.total ? <button className="button button--primary" onClick={() => onNavigate('test-cases')}>Go to Test Cases</button> : onNavigate && reportModel.globalBugs.length ? <button className="button button--primary" onClick={() => onNavigate('bugs')}>Review bugs</button> : onNavigate && reportModel.globalRisks.length ? <button className="button button--primary" onClick={() => onNavigate('risks')}>Review risks</button> : null}
            {workspace && <button className="button button--secondary" onClick={() => { evidenceRef.current?.focus(); evidenceRef.current?.scrollIntoView({ block: 'start' }) }}>Review source evidence</button>}
          </div>
          <p className="helper-text">Source coverage, historical results and unresolved requirements need separate review. The final sign-off belongs to QA and release stakeholders.</p>
          {reportModel.recommendedActions.length > 1 && <details><summary>Remaining actions ({reportModel.recommendedActions.length - 1})</summary><ul className="roadmap-list">{reportModel.recommendedActions.slice(1).map(action => <li key={action}>{action}</li>)}</ul></details>}
        </section>
      </div>
      <div className="summary-grid report-execution-summary" aria-label="Release execution results">
        <SummaryCard
          label="Total Tests"
          value={reportModel.summary.total}
          description="Current test cases included in this release report."
        />
        <SummaryCard
          label="Passed"
          value={reportModel.summary.passed}
          description="Passed execution results for the selected release."
          tone="positive"
        />
        <SummaryCard
          label="Failed"
          value={reportModel.summary.failed}
          description="Failed execution results for the selected release."
          tone="critical"
        />
        <SummaryCard
          label="Blocked"
          value={reportModel.summary.blocked}
          description="Blocked execution results for the selected release."
          tone="warning"
        />
        <SummaryCard
          label="Awaiting run"
          value={reportModel.summary.notRun}
          description="Current test cases not yet executed for this release."
        />
      </div>
      {workspace && selectedRelease && <div ref={evidenceRef} tabIndex={-1} className="report-evidence-anchor" aria-label="Source evidence review"><ReleaseRequirementPanel key={selectedRelease.id} release={selectedRelease} onReportChange={receiveRequirementReport} /></div>}

        <div className="report-section-grid">
          <section className="description-block report-section report-section--overview">
            <h4>Release Overview</h4>
            <p>
              {reportModel.release.name} {reportModel.release.version} targets{' '}
              {reportModel.release.targetDate}. Editable release status:{' '}
              {reportModel.release.status}.
            </p>
            {reportModel.release.notes ? <p>{reportModel.release.notes}</p> : null}
          </section>

          <section className="description-block report-section report-section--failed">
            <h4>Failed Tests</h4>
            <ReportTestList
              items={reportModel.failedTests}
              emptyMessage="No failed tests for the selected release."
            />
          </section>

          <section className="description-block report-section report-section--blocked">
            <h4>Blocked Tests</h4>
            <ReportTestList
              items={reportModel.blockedTests}
              emptyMessage="No blocked tests for the selected release."
            />
          </section>

          <section className="description-block report-section report-section--notrun">
            <h4>Tests awaiting run</h4>
            <ReportTestList
              items={reportModel.notRunTests}
              emptyMessage="Every test has a recorded result for this release."
            />
          </section>

          <details className="report-section report-section--notes">
            <summary>Execution Notes ({reportModel.executionNotes.length})</summary>
            {reportModel.executionNotes.length === 0 ? (
              <p className="helper-text">No execution notes captured yet.</p>
            ) : (
              <ReportPagedList items={reportModel.executionNotes} label="Reported execution note pages">{(visible) => <ul className="report-list">
                {visible.map((note) => (
                  <li key={note.testCaseId}>
                    <strong>
                      {note.title} ({formatExecutionResult(note.result)})
                    </strong>
                    <span>{note.notes}</span>
                  </li>
                ))}
              </ul>}</ReportPagedList>
            )}
          </details>

          <section className="description-block report-section report-section--bugs">
            <h4>Bugs Summary</h4>
            <p>{GLOBAL_QUALITY_SIGNAL_NOTE}</p>
            <SignalList
              items={reportModel.globalBugs}
              emptyMessage="No open High or Critical global bugs."
            />
          </section>

          <section className="description-block report-section report-section--risks">
            <h4>Risks Summary</h4>
            <p>{GLOBAL_QUALITY_SIGNAL_NOTE}</p>
            <SignalList
              items={reportModel.globalRisks}
              emptyMessage="No open High or Critical global risks."
            />
          </section>

        </div>
      </section>

      <details className="panel report-export"><summary>Markdown Export</summary>
        <div className="panel-heading">
          <div className="panel-heading__content">
            <h3 id="markdown-export-heading">Markdown Export</h3>
            <p>Copy a plain Markdown report for chat, docs, or stakeholder updates.</p>
          </div>

        </div>

        <textarea
          className="textarea report-markdown-preview"
          readOnly
          value={markdown}
          aria-label="Markdown report preview"
        />
      </details>
    </section>
  )
}
