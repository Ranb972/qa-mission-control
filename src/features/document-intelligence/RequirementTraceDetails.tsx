import { useState } from 'react'
import { CollectionPager } from '../../components/ui/CollectionPager'
import { useWorkspace } from '../../lib/workspace/workspaceContext'
import { removeRequirementTestLink } from '../../lib/workspace/traceabilityRepository'
import type { RequirementTrace } from './requirementTraceability'
import { formatExecutionResult } from '../executions/executionPresentation'

const gapLabels = { no_coverage_area: 'No saved coverage area', no_confirmed_test: 'No QA-confirmed test design', stale_test_links: 'Previously linked test design changed or was removed', unresolved_ambiguity: 'Clarification remains unresolved', unverified_execution: 'Recorded execution has an older or unverified test design — re-run required' }
export function RequirementTraceDetails({ trace, onChange, readOnly = false }: { trace: RequirementTrace; onChange: () => void; readOnly?: boolean }) {
  const [open, setOpen] = useState(false)
  const issues = [trace.failedTestIds.length && `${trace.failedTestIds.length} failed`, trace.blockedTestIds.length && `${trace.blockedTestIds.length} blocked`, trace.unrunTestIds.length && `${trace.unrunTestIds.length} awaiting run`, trace.gaps.length && `${trace.gaps.length} link gaps`].filter(Boolean)
  return <details className="requirement-trace-details" onToggle={(event) => setOpen(event.currentTarget.open)}><summary>Traceability · {trace.confirmedTestIds.length} confirmed tests{issues.length > 0 ? ` · ${issues.join(' · ')}` : ''}</summary>
    {open && <TraceBody trace={trace} onChange={onChange} readOnly={readOnly} />}
  </details>
}
function TraceBody({ trace, onChange, readOnly }: { trace: RequirementTrace; onChange: () => void; readOnly: boolean }) {
  const workspace = useWorkspace()!
  const [page, setPage] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const testIds = [...new Set([...trace.confirmedTestIds, ...trace.staleTestIds])]
  const tests = new Map(workspace.get('testCases').items.map((item) => [item.id, item]))
  const releases = new Map(workspace.get('releases').items.map((item) => [item.id, item]))
  const bugs = workspace.get('bugs').items.filter((item) => trace.bugIds.includes(item.id))
  const suites = workspace.get('testSuites').items.filter((item) => trace.suiteIds.includes(item.id))
  const executions = workspace.get('executions').items.filter((item) => trace.executionIds.includes(item.id))
  async function remove(testId: string) {
    if (saving || !window.confirm('Remove this requirement-to-test link? The requirement, Test Case and execution history will remain unchanged.')) return
    setSaving(true)
    try { await removeRequirementTestLink(workspace.repository, trace.requirement.sourceId, trace.requirement.id, testId); onChange() }
    catch { setError('The link could not be removed. Refresh the saved state before trying again.') }
    finally { setSaving(false) }
  }
  return <div>
    {trace.gaps.length > 0 && <ul className="helper-text">{trace.gaps.map((gap) => <li key={gap}>{gapLabels[gap]}</li>)}</ul>}
    <CollectionPager page={page} pageSize={40} total={testIds.length} onPageChange={setPage} label="Requirement traceability pages" />
    {testIds.slice(page * 40, (page + 1) * 40).map((id) => <div className="requirement-trace-row" key={id}><div><strong>{tests.get(id)?.title ?? 'Deleted Test Case'}</strong>
      <p className="helper-text">{trace.staleTestIds.includes(id) ? 'Design changed — re-review required' : 'Current QA-confirmed design link'}</p>
      {executions.filter((item) => item.testCaseId === id).map((item) => <p key={item.id}><strong>{formatExecutionResult(item.result)}</strong> · {releases.get(item.releaseId)?.name ?? 'Historical release'} {releases.get(item.releaseId)?.version ?? ''}<span className="helper-text"> · {trace.unverifiedExecutionIds.includes(item.id) ? 'Historical result; current design not verified' : item.result === 'Not Run' ? 'No result recorded' : 'Recorded against the current test design'}</span></p>)}
      {!executions.some((item) => item.testCaseId === id) && <p className="helper-text">No release execution recorded for this current design link.</p>}</div>
      {!readOnly && <button className="button button--danger button--compact" disabled={saving} onClick={() => void remove(id)}>Remove link</button>}</div>)}
    {suites.length > 0 && <p><strong>Suites:</strong> {suites.map((item) => item.name).join(', ')}</p>}
    {bugs.length > 0 && <p><strong>Linked bugs:</strong> {bugs.map((item) => `${item.title} (${item.status})`).join('; ')}</p>}
    {error && <p role="alert">{error}</p>}
  </div>
}
