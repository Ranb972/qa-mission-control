import { DecisionStrip } from '../../components/ui/DecisionStrip'
import { useEffect, useState, type ReactNode } from 'react'
import { CollectionPager } from '../../components/ui/CollectionPager'
import { useWorkspace } from '../../lib/workspace/workspaceContext'
import type { PreparedAnalysis } from '../../lib/workspace/analysisJobRepository'
import { loadSourceTraceability, saveSourceCoveragePlan, type SourceTraceability } from '../../lib/workspace/traceabilityRepository'
import { buildCoverageIntelligence, type CoverageIntelligence } from './coverageIntelligence'
import { buildRequirementTraceability, type RequirementTrace, type RequirementTraceability } from './requirementTraceability'
import { isTestableRequirement, type Requirement } from './requirementModel'
import { RequirementTraceDetails } from './RequirementTraceDetails'

export function SourceCoveragePanel({ prepared, onLinkTests, onDraftTests }: { prepared: PreparedAnalysis; onLinkTests: (requirement: Requirement) => void; onDraftTests: (requirement: Requirement) => void }) {
  const workspace = useWorkspace()!
  const [candidate, setCandidate] = useState<CoverageIntelligence | null>(null)
  const [saved, setSaved] = useState<SourceTraceability | null>(null)
  const [trace, setTrace] = useState<RequirementTraceability | null>(null)
  const [query, setQuery] = useState('')
  const [attention, setAttention] = useState('all')
  const [page, setPage] = useState(0)
  const [hierarchyPage, setHierarchyPage] = useState(0)
  const [relationPage, setRelationPage] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let current = true
    const load = async () => {
      const [plan, stored] = await Promise.all([
        buildCoverageIntelligence(prepared.snapshot, prepared.currentRequirements ?? [], new Set(prepared.preflight.reuse.keys())),
        loadSourceTraceability(workspace.repository, prepared.source.id),
      ])
      const graph = await buildRequirementTraceability({ requirements: prepared.currentRequirements ?? [], coverageAreas: stored.areas, coverageLinks: stored.coverageLinks, testLinks: stored.testLinks,
        testCases: workspace.get('testCases').items, executions: workspace.get('executions').items, bugs: workspace.get('bugs').items, suites: workspace.get('testSuites').items })
      if (current) { setCandidate(plan); setSaved(stored); setTrace(graph) }
    }
    void load().catch(() => { if (current) setError('Coverage could not be prepared. Existing saved plans and traceability were preserved.') })
    return () => { current = false }
  }, [prepared, revision, workspace])
  async function save() {
    if (!saved || saving) return
    if (!window.confirm(saved.plan ? 'Replace the saved requirement-backed coverage plan with this candidate? Test links and previous evidence remain available.' : 'Save this requirement-backed coverage plan? This does not approve requirements or create tests.')) return
    setSaving(true); setError(null)
    try { await saveSourceCoveragePlan(workspace.repository, prepared, saved); setRevision((value) => value + 1) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Coverage could not be saved. The previous plan is unchanged.') }
    finally { setSaving(false) }
  }
  if (!candidate || !saved || !trace) return error ? <div role="alert"><p>{error}</p><button className="button button--secondary" onClick={() => { setError(null); setRevision((value) => value + 1) }}>Retry local preparation</button></div> : <p role="status">Preparing local coverage and traceability… No provider requests.</p>
  const isSaved = saved.plan?.value.sourceRevision === candidate.sourceRevision && saved.plan.value.requirementSetFingerprint === candidate.requirementSetFingerprint
  const requirements = new Map((prepared.currentRequirements ?? []).map((item) => [item.id, item]))
  const traceByRequirement = new Map(trace.rows.map((row) => [row.requirement.id, row]))
  const evidenceProps = { onLinkTests, onDraftTests, traceByRequirement, onTraceChange: () => setRevision((value) => value + 1) }
  const linksByArea = new Map<string, string[]>()
  for (const link of candidate.links) { const ids = linksByArea.get(link.coverageAreaId) ?? []; ids.push(link.requirementId); linksByArea.set(link.coverageAreaId, ids) }
  const areaSignals = new Map(candidate.areas.map(area => {
    const rows = (linksByArea.get(area.id) ?? []).map(id => traceByRequirement.get(id)).filter((row): row is RequirementTrace => !!row && isTestableRequirement(row.requirement))
    return [area.id, { confirmed: rows.filter(row => row.confirmedTestIds.length > 0).length, gaps: rows.filter(row => row.confirmedTestIds.length === 0).length, failed: rows.filter(row => row.failedTestIds.length > 0).length, review: rows.some(row => row.gaps.length > 0) || area.readiness === 'blocked_by_ambiguity' }]
  }))
  const visible = candidate.areas.filter((area) => area.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()) && (attention === 'all' || (attention === 'gaps' && areaSignals.get(area.id)!.gaps > 0) || (attention === 'failures' && areaSignals.get(area.id)!.failed > 0) || (attention === 'ambiguity' && area.readiness === 'blocked_by_ambiguity') || (attention === 'review' && areaSignals.get(area.id)!.review)))
  const currentPage = Math.min(page, Math.max(0, Math.ceil(visible.length / 40) - 1))
  const gaps = trace.rows.filter((row) => row.gaps.length > 0)
  return <section className="source-coverage-intelligence" aria-label="Requirement-backed global coverage">
    <header className="document-intelligence__heading"><div><h4>Global Coverage Plan</h4><p className="helper-text">{isSaved ? 'Saved requirement-backed plan' : saved.plan ? 'Unsaved replacement candidate · saved plan needs review' : 'Unsaved requirement-backed candidate'}</p></div>
      <button className="button button--primary" disabled={saving || isSaved || candidate.testableRequirements === 0} onClick={() => void save()}>{saving ? 'Saving plan…' : saved.plan ? 'Replace saved requirement plan' : 'Save requirement coverage'}</button></header>
    {error && <p role="alert" className="feedback feedback--error">{error}</p>}
    <p className="helper-text">Reduced locally from every analyzed region, with original evidence retained. Existing section-merge plans are unchanged. Coverage topics are suggestions, not coverage proof or QA approval.</p>
    <DecisionStrip className="document-metrics" label="Coverage decision signals" items={[
      {label:'Current requirements',value:trace.testableTotal},
      {label:'Saved coverage links',value:trace.withCoverageArea+' / '+trace.testableTotal},
      {label:'QA-confirmed test traceability',value:trace.withConfirmedTest+' / '+trace.testableTotal,tone:'observed'},
      {label:'No confirmed test',value:trace.withoutConfirmedTest,tone:trace.withoutConfirmedTest?'review':'neutral'},
    ]} />
    <label className="field-group">Find coverage topics<input className="input" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0) }} /></label>
    <label className="field-group">Coverage attention<select className="select" value={attention} onChange={event => { setAttention(event.target.value); setPage(0) }}><option value="all">All topics</option><option value="gaps">Missing QA-confirmed tests</option><option value="failures">Linked recorded failures</option><option value="ambiguity">Clarification required</option><option value="review">Link gaps or review required</option></select></label>
    <p className="helper-text coverage-count-boundary">Topic counts describe testable requirements with current QA links, missing confirmed tests, or linked recorded failures. They are not a coverage percentage or a sign-off.</p>
    <CollectionPager page={currentPage} pageSize={40} total={visible.length} onPageChange={setPage} label="Coverage topic pages" />
    {visible.slice(currentPage * 40, (currentPage + 1) * 40).map((area) => <CoverageDisclosure key={area.id}
      summary={<><span className={`document-kind ${area.readiness === 'blocked_by_ambiguity' ? 'document-kind--ambiguity' : 'document-kind--review'}`}>{area.readiness === 'blocked_by_ambiguity' ? 'Clarification required' : 'QA review needed'}</span><strong>{area.name}</strong><span className="coverage-topic-signals">{linksByArea.get(area.id)?.length ?? 0} findings<span>{areaSignals.get(area.id)!.confirmed} QA-linked · {areaSignals.get(area.id)!.gaps} no confirmed test</span><span className={areaSignals.get(area.id)!.failed ? 'coverage-topic-signals--failure' : ''}>{areaSignals.get(area.id)!.failed} findings with failures</span></span></>}>
      <CoverageEvidenceList requirements={(linksByArea.get(area.id) ?? []).map((id) => requirements.get(id)!).filter(Boolean)} {...evidenceProps} />
    </CoverageDisclosure>)}
    {!visible.length && <p className="document-empty">{candidate.areas.length ? 'No topics match these filters. Try another topic or attention filter.' : 'Analyze source requirements to build coverage topics. Nothing is inferred from unprocessed regions.'}</p>}
    <details className="document-secondary"><summary>Section → chapter → source accounting</summary>
      <CollectionPager page={hierarchyPage} pageSize={40} total={candidate.nodes.length} onPageChange={setHierarchyPage} label="Coverage hierarchy pages" />
      {candidate.nodes.slice(hierarchyPage * 40, (hierarchyPage + 1) * 40).map((node) => <div className="coverage-hierarchy-row" key={node.id} style={{ paddingInlineStart: `${Math.min(node.depth, 5) * 12}px` }}><strong>{node.title}</strong><span>{node.totalRequirements} requirements · {node.currentUnits}/{node.totalUnits} regions analyzed · {node.ambiguities} ambiguities</span></div>)}
    </details>
    <details className="document-secondary"><summary>Duplicates, overlaps & conflicts · {candidate.relations.length} groups</summary>
      <p className="helper-text">Exact groups retain every evidence location. Numeric-policy differences and lexical overlaps are only review candidates; no statement is silently chosen or merged.</p>
      <CollectionPager page={relationPage} pageSize={40} total={candidate.relations.length} onPageChange={setRelationPage} label="Relation review pages" />
      {candidate.relations.slice(relationPage * 40, (relationPage + 1) * 40).map((group) => <CoverageDisclosure key={group.id} summary={<><span className="document-kind">{group.kind.replaceAll('_', ' ')}</span><strong>{requirements.get(group.requirementIds[0])?.summary}</strong><span>{group.requirementIds.length} locations</span></>}><CoverageEvidenceList requirements={group.requirementIds.map((id) => requirements.get(id)!).filter(Boolean)} {...evidenceProps} /></CoverageDisclosure>)}
      {!candidate.relations.length && <p className="helper-text">No deterministic duplicate or potential relation groups were found. This is not proof that no semantic conflicts exist.</p>}
    </details>
    <CoverageDisclosure className="document-secondary" summary={<>Requirements needing attention · {gaps.length}</>}><CoverageEvidenceList requirements={gaps.map((row) => row.requirement)} {...evidenceProps} /></CoverageDisclosure>
  </section>
}

function CoverageDisclosure({ summary, children, className = 'document-result' }: { summary: ReactNode; children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false)
  return <details className={className} onToggle={(event) => setOpen(event.currentTarget.open)}><summary>{summary}</summary>{open && children}</details>
}

function CoverageEvidenceList({ requirements, onLinkTests, onDraftTests, traceByRequirement, onTraceChange }: { requirements: Requirement[]; onLinkTests: (requirement: Requirement) => void; onDraftTests: (requirement: Requirement) => void; traceByRequirement: Map<string, RequirementTrace>; onTraceChange: () => void }) {
  const [page, setPage] = useState(0)
  const currentPage = Math.min(page, Math.max(0, Math.ceil(requirements.length / 40) - 1))
  return <div className="coverage-evidence-list"><CollectionPager page={currentPage} pageSize={40} total={requirements.length} onPageChange={setPage} label="Coverage evidence pages" />
    {requirements.slice(currentPage * 40, (currentPage + 1) * 40).map((item) => <div className="coverage-evidence-row" key={item.id}><div><strong>{item.summary}</strong><p dir="auto">{item.evidence.quote}</p><span className="helper-text">{item.evidence.location.page ? `Page ${item.evidence.location.page} · ` : ''}Lines {item.evidence.location.startLine}–{item.evidence.location.endLine}</span>{traceByRequirement.has(item.id) && <RequirementTraceDetails trace={traceByRequirement.get(item.id)!} onChange={onTraceChange} />}</div>
      {['requirement', 'business_rule', 'constraint'].includes(item.kind) && <div className="coverage-evidence-actions"><button className="button button--secondary button--compact" onClick={() => onDraftTests(item)}>Draft tests</button><button className="button button--secondary button--compact" onClick={() => onLinkTests(item)}>Link reviewed tests</button></div>}</div>)}
  </div>
}
