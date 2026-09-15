import { DecisionStrip } from '../../components/ui/DecisionStrip'
import { EvidenceQuote } from '../../components/ui/EvidenceQuote'
import { useEffect, useMemo, useState } from 'react'
import { CollectionPager } from '../../components/ui/CollectionPager'
import { useWorkspace } from '../../lib/workspace/workspaceContext'
import type { WorkspaceClient } from '../../lib/workspace/workspaceClient'
import type { PreparedAnalysis } from '../../lib/workspace/analysisJobRepository'
import { loadSourceTraceability, type SourceTraceability } from '../../lib/workspace/traceabilityRepository'
import { requirementChangeInventory } from './requirementChanges'
import { requirementImpact } from './requirementTraceability'
import type { Requirement } from './requirementModel'
import { SourceConflictImpact } from './SourceConflictImpact'

export function RequirementImpactPanel({ prepared }: { prepared: PreparedAnalysis }) {
  const workspace = useWorkspace()!
  const [graph, setGraph] = useState<SourceTraceability | null>(null)
  const [error, setError] = useState(false)
  const [retry, setRetry] = useState(0)
  const [query, setQuery] = useState('')
  const [onlyLinked, setOnlyLinked] = useState(false)
  const [page, setPage] = useState(0)
  useEffect(() => {
    let active = true
    void loadSourceTraceability(workspace.repository, prepared.source.id).then((value) => { if (active) setGraph(value) }).catch(() => { if (active) setError(true) })
    return () => { active = false }
  }, [workspace, prepared, retry])
  const changed = useMemo(() => graph ? requirementChangeInventory(prepared, graph.testLinks, graph.coverageLinks) : [], [prepared, graph])
  if (error) return <div role="alert"><p>Change impact could not be read. Saved evidence and QA artifacts were preserved.</p><button className="button button--secondary" onClick={() => { setError(false); setRetry((value) => value + 1) }}>Retry change review</button></div>
  if (!graph) return <p role="status">Reading historical evidence and affected artifacts… No AI requests.</p>
  const affected = changed.filter((item) => item.hasAffectedArtifacts).length
  const visible = changed.filter(({ requirement, hasAffectedArtifacts }) => (!onlyLinked || hasAffectedArtifacts) && `${requirement.summary} ${requirement.evidence.quote} ${requirement.coverageTopic}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
  const currentPage = Math.min(page, Math.max(0, Math.ceil(visible.length / 40) - 1))
  return <section className="requirement-impact" aria-label="Requirement change impact">
    <SourceConflictImpact sourceId={prepared.source.id} />
    <header><h4>Change impact</h4><p className="helper-text">Changed regions and retired analysis findings lose current authority. Exact unchanged regions keep their reviewed test links. Historical evidence is not a current source location.</p></header>
    <DecisionStrip className="document-metrics" label="Source change decision signals" items={[
      {label:'Historical requirements needing review',value:changed.length,tone:'historical'},
      {label:'With linked QA artifacts',value:affected,tone:affected?'review':'neutral'},
      {label:'Current findings preserved',value:prepared.currentRequirements?.length ?? 0},
    ]} />
    <div className="document-review-controls"><label className="field-group">Find changed evidence<input className="input" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0) }} /></label><label className="checkbox-label"><input type="checkbox" checked={onlyLinked} onChange={(event) => { setOnlyLinked(event.target.checked); setPage(0) }} />Only findings with linked artifacts</label></div>
    <CollectionPager page={currentPage} pageSize={40} total={visible.length} onPageChange={setPage} label="Changed requirement pages" />
    {visible.slice(currentPage * 40, (currentPage + 1) * 40).map(({ requirement, hasAffectedArtifacts }) => <ImpactRow key={requirement.id} requirement={requirement} hasArtifacts={hasAffectedArtifacts} prepared={prepared} graph={graph} workspace={workspace} />)}
    {!visible.length && <div className="document-empty"><strong>{changed.length ? 'No changes match this filter' : 'No historical requirement changes to review'}</strong><p>When source evidence changes, affected tests and release work appear here. New and unprocessed regions remain in Source accounting.</p></div>}
  </section>
}
function ImpactRow({ requirement, hasArtifacts, ...props }: { requirement: Requirement; hasArtifacts: boolean; prepared: PreparedAnalysis; graph: SourceTraceability; workspace: WorkspaceClient }) {
  const [open, setOpen] = useState(false)
  return <details className="document-result" onToggle={(event) => setOpen(event.currentTarget.open)}><summary><span className="document-kind document-kind--ambiguity">Historical</span><strong>{requirement.summary}</strong><span>{hasArtifacts ? 'Review linked artifacts' : 'No saved links'}</span></summary>{open && <ImpactBody requirement={requirement} {...props} />}</details>
}
function ImpactBody({ requirement, prepared, graph, workspace }: { requirement: Requirement; prepared: PreparedAnalysis; graph: SourceTraceability; workspace: WorkspaceClient }) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Requirement | null>(null)
  const impact = useMemo(() => requirementImpact(requirement, graph.testLinks, graph.coverageLinks, workspace.get('testSuites').items, workspace.get('executions').items, workspace.get('bugs').items), [requirement, graph, workspace])
  const matches = query.trim() ? (prepared.currentRequirements ?? []).filter((item) => `${item.summary} ${item.evidence.quote}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())) : []
  const after = selected && prepared.currentRequirements?.find((item) => item.id === selected.id && item.fingerprint === selected.fingerprint)
  const testNames = new Map(workspace.get('testCases').items.map((item) => [item.id, item.title]))
  const groups = [
    { label: 'Coverage areas', ids: impact.coverageAreaIds, names: new Map(graph.areas.map((item) => [item.id, item.name])) },
    { label: 'Test Cases', ids: impact.testCaseIds, names: testNames },
    { label: 'Suites', ids: impact.suiteIds, names: new Map(workspace.get('testSuites').items.map((item) => [item.id, item.name])) },
    { label: 'Executions', ids: impact.executionIds, names: new Map(workspace.get('executions').items.map((item) => [item.id, `${testNames.get(item.testCaseId) ?? 'Removed test'} · ${item.result}`])) },
    { label: 'Releases', ids: impact.releaseIds, names: new Map(workspace.get('releases').items.map((item) => [item.id, `${item.name} ${item.version}`])) },
    { label: 'Bugs', ids: impact.bugIds, names: new Map(workspace.get('bugs').items.map((item) => [item.id, item.title])) },
  ]
  return <div className="document-result__body">
    <div className="requirement-comparison"><div><p className="meta-kicker">Before · historical evidence</p><EvidenceQuote historical quote={requirement.evidence.quote} /><p className="helper-text">{requirement.evidence.location.page ? `Historical page ${requirement.evidence.location.page} · ` : ''}Historical lines {requirement.evidence.location.startLine}–{requirement.evidence.location.endLine}. Original analysis: {requirement.createdAt.slice(0, 10)}.</p></div>
      <div><p className="meta-kicker">After · reviewer-selected comparison</p>{after ? <><EvidenceQuote quote={after.evidence.quote} /><p className="helper-text">Current {after.evidence.location.page ? `page ${after.evidence.location.page} · ` : ''}lines {after.evidence.location.startLine}–{after.evidence.location.endLine}. Comparison only; not confirmed lineage or transferred approval.</p><button className="button button--secondary button--compact" onClick={() => setSelected(null)}>Clear comparison</button></> : <p className="helper-text">No replacement is assumed. The requirement may have changed, been removed, or need re-analysis. Choose current evidence below to compare; nothing is re-linked automatically.</p>}</div></div>
    <details className="document-secondary"><summary>Choose current evidence for comparison</summary><label className="field-group">Search current findings<input className="input" value={query} onChange={(event) => setQuery(event.target.value)} /></label>{matches.slice(0, 20).map((item) => <button className="requirement-compare-option" key={item.id} onClick={() => { setSelected(item); setQuery('') }}>{item.summary}</button>)}{matches.length > 20 && <p className="helper-text">Showing 20 matches. Refine the search to locate the exact finding.</p>}{query && !matches.length && <p>No current findings match.</p>}</details>
    <h5>Affected QA artifacts</h5><p className="helper-text">Existing artifacts and execution history are retained. Review and explicitly confirm a current requirement's test design before treating its traceability as current.</p>
    <div className="requirement-impact-artifacts">{groups.map((group) => <ImpactArtifacts key={group.label} {...group} />)}</div>
  </div>
}
function ImpactArtifacts({ label, ids, names }: { label: string; ids: string[]; names: Map<string, string> }) {
  const [open, setOpen] = useState(false)
  const [page, setPage] = useState(0)
  return <details onToggle={(event) => setOpen(event.currentTarget.open)}><summary>{label} · {ids.length}</summary>{open && <><CollectionPager page={page} pageSize={40} total={ids.length} onPageChange={setPage} label={`Affected ${label} pages`} />{ids.slice(page * 40, (page + 1) * 40).map((id) => <p key={id}>{names.get(id) ?? 'Removed artifact — historical link retained'}</p>)}{!ids.length && <p className="helper-text">No saved links.</p>}</>}</details>
}
