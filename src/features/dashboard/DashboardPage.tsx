import { formatExecutionReadinessReason } from '../executions/executionPresentation'
import { useWorkspace } from '../../lib/workspace/workspaceContext'
import { EmptyState } from '../../components/ui/EmptyState'
import { DemoGuide } from '../workspace-data/DemoGuide'
import { DashboardActivity } from './DashboardActivity'
import { calculateReleaseReadiness } from '../readiness/releaseReadiness'
import type { Execution } from '../executions/executionTypes'
import { SummaryCard } from '../../components/ui/SummaryCard'
import type { Bug } from '../bugs/bugTypes'
import type { Release } from '../releases/releaseTypes'
import type { Risk } from '../risks/riskTypes'
import type { TestCase } from '../test-cases/testCaseTypes'
import type { AppView } from '../../components/layout/AppShell'

type DashboardPageProps = {
  testCases: TestCase[]
  bugs: Bug[]
  risks: Risk[]
  releases: Release[]
  executions?: Execution[]
  onNavigate?: (view: AppView) => void
}

export function DashboardPage({
  testCases,
  bugs,
  risks,
  releases,
  executions = [],
  onNavigate,
}: DashboardPageProps) {
  const workspace = useWorkspace()
  const hasWork = !!(testCases.length || releases.length || bugs.length || risks.length || workspace?.get('sources').items.length)
  const releaseTargets = [...releases].sort((a,b)=>Number(a.status==='Released')-Number(b.status==='Released'))
  const primaryRelease = releaseTargets[0]
  const primaryReadiness = primaryRelease ? calculateReleaseReadiness({releaseId:primaryRelease.id,testCases,executions,bugs,risks}) : null
  const activeBugs = bugs.filter(bug=>bug.status!=='Closed').sort((a,b)=>Number(b.severity==='Critical')-Number(a.severity==='Critical'))
  const totalTestCases = testCases.length
  const passedCount = testCases.filter(
    (testCase) => testCase.status === 'Passed',
  ).length
  const attentionCount = testCases.filter(
    (testCase) =>
      testCase.status === 'Failed' || testCase.status === 'Blocked',
  ).length
  const criticalCount = testCases.filter(
    (testCase) => testCase.priority === 'Critical',
  ).length
  const activeBugCount = bugs.filter((bug) => bug.status !== 'Closed').length
  const openBugCount = bugs.filter((bug) => bug.status === 'Open').length
  const criticalBugCount = bugs.filter(
    (bug) => bug.severity === 'Critical' && bug.status !== 'Closed',
  ).length
  const retestBugCount = bugs.filter((bug) => bug.status === 'Retest').length
  const openRiskCount = risks.filter((risk) => risk.status === 'Open').length
  const criticalRiskCount = risks.filter(
    (risk) => risk.impact === 'Critical' && risk.status !== 'Resolved',
  ).length
  const mitigatingRiskCount = risks.filter(
    (risk) => risk.status === 'Mitigating',
  ).length
  const activeReleaseCount = releases.filter(
    (release) => release.status !== 'Released',
  ).length
  const planningReleaseCount = releases.filter(
    (release) => release.status === 'Planning',
  ).length
  const inTestingReleaseCount = releases.filter(
    (release) => release.status === 'In Testing',
  ).length
  const blockedReleaseCount = releases.filter(
    (release) => release.status === 'Blocked',
  ).length
  const readyReleaseCount = releases.filter(
    (release) => release.status === 'Ready',
  ).length
  const releasedReleaseCount = releases.filter(
    (release) => release.status === 'Released',
  ).length

  const notRunCount = testCases.filter(
    (testCase) => testCase.status === 'Not Run',
  ).length
  const failedCount = testCases.filter(
    (testCase) => testCase.status === 'Failed',
  ).length
  const blockedCount = testCases.filter(
    (testCase) => testCase.status === 'Blocked',
  ).length

  return (
    <section className="page page--dashboard">
      <div className="page-heading">
        <p className="meta-kicker">Workspace / Overview</p>
        <h2>Operational snapshot</h2>
        <p>
          Follow source evidence through reviewed tests, recorded failures
          and release decisions.
        </p>
      </div>

      <div className={hasWork ? 'dashboard-briefing' : 'dashboard-onboarding'}>
        <section className="dashboard-investigation" aria-label="Primary investigation">
          {hasWork && <header className="investigation-heading"><p className="meta-kicker">Primary investigation / release dossier</p><h3>{primaryRelease ? primaryRelease.name + ' ' + primaryRelease.version : 'Start from the evidence.'}</h3>{primaryRelease && primaryReadiness && <div className="investigation-state"><span className={'badge badge--'+(primaryReadiness.status==='Blocked'?'critical':primaryReadiness.status==='At Risk'?'warning':'neutral')}>Calculated: {primaryReadiness.status}</span><span>Saved status: {primaryRelease.status} · Target {primaryRelease.targetDate}</span></div>}</header>}
          <DemoGuide onNavigate={onNavigate} hasWork={hasWork} />

        </section>
        {hasWork && <aside className="dashboard-release-column" aria-label="Release decision and workspace">
          <section className="panel" aria-labelledby="dashboard-active-releases">
            <div className="panel-heading"><h3 id="dashboard-active-releases">Release targets</h3>{onNavigate && <button className="button button--secondary" onClick={() => onNavigate('release-report')}>View release report</button>}</div>
            {releaseTargets.length ? <div className="dashboard-records">{releaseTargets.slice(0,4).map(release=>{
              const readiness=calculateReleaseReadiness({releaseId:release.id,testCases,executions,bugs,risks})
              return <div className="dashboard-record" key={release.id}><div><strong>{release.name} {release.version}</strong><span>Saved status: {release.status} · Target {release.targetDate}</span><p className="helper-text">{readiness.reasons.filter(reason=>reason.code!=='ready').slice(0,2).map(formatExecutionReadinessReason).join(' · ') || 'Inspect source coverage before sign-off.'}</p></div><span className={'badge badge--'+(readiness.status==='Blocked'?'critical':readiness.status==='At Risk'?'warning':'neutral')}>{readiness.status==='Ready'?'Execution checks clear':readiness.status}</span></div>
            })}</div> : <p className="helper-text">Create a release target to organize execution and reporting.</p>}
            <p className="helper-text">Calculated execution, bug and risk signals. Source coverage and final sign-off require separate review.</p>
            {onNavigate && <button className="button button--secondary" onClick={()=>onNavigate('executions')}>Open executions</button>}
          </section>
          <section className="dashboard-workspace-register" aria-label="Workspace register"><p className="meta-kicker">Workspace register / current records</p><div className="dashboard-ledger">
        <SummaryCard
          label="Test Cases"
          value={totalTestCases}
          description="Structured, executable coverage in this workspace."
        />
        <SummaryCard
          label="Library needs attention"
          value={attentionCount}
          description="Failed or blocked library statuses requiring QA review. Release outcomes live in Executions."
          tone={attentionCount > 0 ? 'warning' : 'positive'}
        />
        <SummaryCard
          label="Active Bugs"
          value={activeBugCount}
          description="Open, in-progress, or retest defects."
          tone={activeBugCount > 0 ? 'warning' : 'positive'}
        />
        <SummaryCard
          label="Active Releases"
          value={activeReleaseCount}
          description="Release targets still moving toward handoff."
          tone={blockedReleaseCount > 0 ? 'critical' : 'neutral'}
        />
      </div></section>
        </aside>}
      </div>
      {hasWork && <div className="dashboard-operations">
        <section className="panel" aria-labelledby="dashboard-attention">
          <div className="panel-heading"><h3 id="dashboard-attention">Defects needing attention</h3>{onNavigate && <button className="button button--secondary" onClick={()=>onNavigate('bugs')}>View bugs</button>}</div>
          {activeBugs.length ? <div className="dashboard-records">{activeBugs.slice(0,3).map(bug=><div className="dashboard-record" key={bug.id}><div><strong>{bug.title}</strong><span>{bug.status}</span></div><span className={'badge badge--'+(bug.severity==='Critical'?'critical':'warning')}>{bug.severity}</span></div>)}</div> : <p className="helper-text">No active defects. Continue reviewing execution results and risk signals.</p>}
        </section>
        <DashboardActivity onNavigate={onNavigate} />
      </div>}

      <div className="dashboard-detail-register">
        <section className="panel" aria-labelledby="dashboard-test-status-heading">
          <div className="panel-heading">
            <div className="panel-heading__content">
              <h3 id="dashboard-test-status-heading">Test Case library status</h3>
              <p>
                Saved Test Case status and priority. Release-specific outcomes
                live in Executions.
              </p>
            </div>
          </div>

          {totalTestCases === 0 ? (
            <EmptyState
              title="No test case status data yet"
              description="Create your first Test Case to populate this library snapshot."
            />
          ) : (
            <dl className="definition-list">
              <div className="definition-list__row">
                <dt>Not Run</dt>
                <dd>{notRunCount}</dd>
              </div>
              <div className="definition-list__row">
                <dt>Passed</dt>
                <dd>{passedCount}</dd>
              </div>
              <div className="definition-list__row">
                <dt>Failed</dt>
                <dd>{failedCount}</dd>
              </div>
              <div className="definition-list__row">
                <dt>Blocked</dt>
                <dd>{blockedCount}</dd>
              </div>
              <div className="definition-list__row">
                <dt>Critical priority</dt>
                <dd>{criticalCount}</dd>
              </div>
            </dl>
          )}
        </section>

        <section className="panel" aria-labelledby="dashboard-pressure-heading">
          <div className="panel-heading">
            <div className="panel-heading__content">
              <h3 id="dashboard-pressure-heading">Defect and risk pressure</h3>
              <p>Signals that can block release confidence.</p>
            </div>
          </div>

          <dl className="definition-list">
            <div className="definition-list__row">
              <dt>Open bugs</dt>
              <dd>{openBugCount}</dd>
            </div>
            <div className="definition-list__row">
              <dt>Critical bugs</dt>
              <dd>{criticalBugCount}</dd>
            </div>
            <div className="definition-list__row">
              <dt>Ready for retest</dt>
              <dd>{retestBugCount}</dd>
            </div>
            <div className="definition-list__row">
              <dt>Open risks</dt>
              <dd>{openRiskCount}</dd>
            </div>
            <div className="definition-list__row">
              <dt>Critical risks</dt>
              <dd>{criticalRiskCount}</dd>
            </div>
            <div className="definition-list__row">
              <dt>Mitigating risks</dt>
              <dd>{mitigatingRiskCount}</dd>
            </div>
          </dl>
        </section>

        <section className="panel" aria-labelledby="dashboard-release-heading">
          <div className="panel-heading">
            <div className="panel-heading__content">
              <h3 id="dashboard-release-heading">Release status</h3>
              <p>Saved release targets across the delivery lifecycle.</p>
            </div>
          </div>

          {releases.length === 0 ? (
            <EmptyState
              title="No release status yet"
              description="Create a release when the team is ready to track execution and readiness."
            />
          ) : (
            <dl className="definition-list">
              <div className="definition-list__row">
                <dt>Planning</dt>
                <dd>{planningReleaseCount}</dd>
              </div>
              <div className="definition-list__row">
                <dt>In Testing</dt>
                <dd>{inTestingReleaseCount}</dd>
              </div>
              <div className="definition-list__row">
                <dt>Blocked</dt>
                <dd>{blockedReleaseCount}</dd>
              </div>
              <div className="definition-list__row">
                <dt>Ready</dt>
                <dd>{readyReleaseCount}</dd>
              </div>
              <div className="definition-list__row">
                <dt>Released</dt>
                <dd>{releasedReleaseCount}</dd>
              </div>
            </dl>
          )}
        </section>

        <section className="panel" aria-labelledby="dashboard-workflow-heading">
          <div className="panel-heading">
            <div className="panel-heading__content">
              <h3 id="dashboard-workflow-heading">
                From source to release confidence
              </h3>
              <p>One human-controlled QA workflow, end to end.</p>
            </div>
          </div>

          <ol className="product-workflow" aria-label="QA Mission Control workflow">
            {[
              [
                'Local structure',
                'Capture or import a QA Source, then review its deterministic sections. Opening and organizing the source sends no AI request.',
              ],
              [
                'Explicit AI request',
                'Choose Analyze or Generate to send only the bounded source context shown in the workspace.',
              ],
              [
                'Human approval',
                'Review source evidence, resolve ambiguity, and approve only Ready suggestions.',
              ],
              [
                'Test Case library',
                'Explicit import creates reusable, QA-owned Test Cases.',
              ],
              ['Suites', 'Organize coverage for focused execution.'],
              [
                'Recorded execution',
                'Run Test Cases for a selected release. Release-specific results stay separate from library status.',
              ],
              ['Report', 'Share the current QA decision with stakeholders.'],
            ].map(([title, description]) => (
              <li key={title}>
                <strong>{title}</strong>
                <span>{description}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </section>
  )
}
