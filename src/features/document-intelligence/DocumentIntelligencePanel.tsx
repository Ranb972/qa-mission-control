import { RequirementBrowser } from './RequirementBrowser'
import { useEffect, useMemo, useRef, useState } from 'react'
import { CollectionPager } from '../../components/ui/CollectionPager'
import { useWorkspace } from '../../lib/workspace/workspaceContext'
import { AnalysisJobRepository, type PreparedAnalysis } from '../../lib/workspace/analysisJobRepository'
import type { StoredRecord } from '../../lib/workspace/workspaceRepository'
import type { QaSource } from '../qa-sources/qaSourceTypes'
import { jobCounts, type AnalysisTask } from './analysisJobModel'
import { runAnalysisJob, withAnalysisLock } from './analysisJobRunner'
import { documentAccounting } from './documentAccounting'
import type { AccountingStatus } from './documentTypes'
import { FINDING_KINDS, unitFailure } from './unitAnalysisContract'
import { isTestableRequirement, type Requirement } from './requirementModel'
import { SourceCoveragePanel } from './SourceCoveragePanel'
import { RequirementTestReview } from './RequirementTestReview'
import { RequirementDraftReview } from './RequirementDraftReview'
import { RequirementImpactPanel } from './RequirementImpactPanel'

const PAGE_SIZE = 40
const statusLabel = (value: string) => value.replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase())

export function DocumentIntelligencePanel({ source, initialView = 'requirements' }: { source: QaSource; initialView?: 'requirements' | 'coverage' | 'impact' }) {
  const workspace = useWorkspace()
  const projection = source.documentImport?.productEvidence
  const store = useMemo(() => workspace ? new AnalysisJobRepository(workspace.repository) : null, [workspace])
  const [prepared, setPrepared] = useState<PreparedAnalysis | null>(null)
  const [tasks, setTasks] = useState<StoredRecord<AnalysisTask>[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [confirmation, setConfirmation] = useState(false)
  const [view, setView] = useState<'requirements' | 'regions' | 'coverage' | 'impact'>(initialView)
  const [linkRequirement, setLinkRequirement] = useState<Requirement | null>(null)
  const [draftRequirement, setDraftRequirement] = useState<Requirement | null>(null)
  const [traceRevision, setTraceRevision] = useState(0)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [page, setPage] = useState(0)
  const operation = useRef<AbortController | null>(null)
  const alive = useRef(true)
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const busy = useRef(false)

  useEffect(() => {
    alive.current = true
    let current = true
    if (store) {
      store.prepare(source.id).then((value) => {
        if (!current) return
        setPrepared(value); setTasks(value.tasks); setLoading(false)
      }).catch(() => { if (current) { setError('This source could not be prepared safely. Saved data is unchanged. Reload to try again.'); setLoading(false) } })
    }
    return () => {
      current = false; alive.current = false; operation.current?.abort()
      if (refreshTimer.current) clearTimeout(refreshTimer.current)
    }
  }, [store, source.id, source.updatedAt, source.content])

  if (!store) return null
  const sameRevision = prepared?.job?.value.sourceRevision === prepared?.snapshot.manifest.sourceRevision && prepared?.job?.value.sourceVersion === prepared?.sourceVersion
  const curatedDemo = prepared?.job?.value.id.startsWith('demo-northstar-job-') && sameRevision
  const currentTasks = sameRevision ? tasks.filter((task) => task.value.jobId === prepared?.job?.value.id) : []
  const taskByUnit = new Map(currentTasks.map((task) => [task.value.unitId, task.value]))
  const states = new Map<string, AccountingStatus>(currentTasks.map((task) => [task.value.unitId,
    task.value.status === 'completed' ? 'current' : ['running', 'retrying'].includes(task.value.status) ? 'pending' : task.value.status as AccountingStatus]))
  if (prepared) for (const unitId of prepared.preflight.reuse.keys()) {
    if (!states.has(unitId)) states.set(unitId, prepared.preflight.reuse.get(unitId)!.intelligence.reviewNotes.length ? 'needs_visual_review' : 'current')
  }
  const accounting = prepared ? documentAccounting(prepared.snapshot, states) : null
  const counts = jobCounts(currentTasks.map((record) => record.value))
  const requirements = prepared?.currentRequirements ?? []
  const testable = requirements.filter(isTestableRequirement)
  const normalizedQuery = query.toLocaleLowerCase().trim()
  const sections = new Map(prepared?.snapshot.sections.map((section) => [section.id, section]) ?? [])
  const visibleRequirements = requirements.filter((item) => (filter === 'all' || item.kind === filter) &&
    `${item.summary} ${item.evidence.quote} ${item.coverageTopic} ${item.evidence.location.page ?? ''}`.toLocaleLowerCase().includes(normalizedQuery))
  const visibleUnits = view === 'regions' ? (prepared?.snapshot.units ?? []).filter((unit) => (filter === 'all' || (states.get(unit.id) ?? unit.status) === filter) &&
    (!normalizedQuery || `${sections.get(unit.sectionId)?.path.join(' / ')} ${unit.location.page ?? ''} ${unit.ordinal}`.toLocaleLowerCase().includes(normalizedQuery) ||
      source.content.slice(unit.location.startOffset, unit.location.endOffset).toLocaleLowerCase().includes(normalizedQuery))) : []
  const rowCount = view === 'requirements' ? visibleRequirements.length : visibleUnits.length
  const currentPage = Math.min(page, Math.max(0, Math.ceil(rowCount / PAGE_SIZE) - 1))

  async function refresh() {
    const [job, rows] = await Promise.all([store!.job(source.id), store!.tasks(source.id)])
    if (alive.current) { setTasks(rows); setPrepared((value) => value ? { ...value, job } : value) }
  }
  function scheduleRefresh() {
    if (refreshTimer.current) return
    refreshTimer.current = setTimeout(() => {
      refreshTimer.current = null
      void refresh().catch(() => { if (alive.current) setError('Progress could not be read. Pause and reload before continuing.') })
    }, 250)
  }
  async function start(mode: 'new' | 'resume' | 'retry_failed') {
    if (busy.current || !prepared) return
    busy.current = true
    const controller = new AbortController()
    operation.current = controller
    setRunning(true); setError(null); setConfirmation(false)
    try {
      await withAnalysisLock(source.id, async () => {
        if (mode === 'new') await store!.create(prepared)
        await runAnalysisJob({ prepared, store: store!, signal: controller.signal, mode: mode === 'retry_failed' ? 'retry_failed' : 'resume', onChange: scheduleRefresh })
      })
    } catch (reason) {
      if (alive.current) setError(reason instanceof Error ? reason.message.slice(0, 400) : 'Analysis paused safely. Saved work was preserved.')
    } finally {
      busy.current = false
      if (alive.current) {
        setRunning(false)
        try { const next = await store!.prepare(source.id); if (alive.current) { setPrepared(next); setTasks(next.tasks) } }
        catch { if (alive.current) setError('Saved progress could not be refreshed. Reload before continuing.') }
      }
    }
  }
  async function stop(status: 'paused' | 'canceled') {
    if (status === 'canceled' && !window.confirm('Cancel remaining analysis? Completed requirements will be kept. You can resume later.')) return
    operation.current?.abort()
    try {
      const job = await store!.job(source.id)
      if (job) await store!.changeJob(job, status)
      await refresh()
    } catch { setError('The job changed while stopping. Reload to inspect its saved state; no completed work was deleted.') }
  }

  return <section className="document-intelligence" data-intelligence-view={view} aria-labelledby={`document-intelligence-${source.id}`}>
    <header className="document-intelligence__heading">
      <div><p className="meta-kicker">Requirements intelligence</p><h3 id={`document-intelligence-${source.id}`}>{projection ? 'Analyze the selected evidence projection' : 'Understand the entire specification'}</h3></div>
      <button className="button button--primary" disabled={loading || running || !prepared} onClick={() => setConfirmation(true)}>{projection ? 'Analyze Evidence Projection' : 'Analyze Entire Specification'}</button>
    </header>
    <div className="intelligence-layout">
    <aside className="intelligence-context" aria-label="Analysis context and review boundary">
    <p className="meta-kicker">Evidence & judgment</p>
    <p className="helper-text intelligence-boundary">{curatedDemo ? 'Curated synthetic findings mapped to the complete Northstar source. No Live AI was used. Numbered findings include unresolved ambiguities; saved coverage links are not proof of tested behavior. New analysis is optional and requires an explicit request.' : 'Live AI is optional and experimental: it suggests requirements and can miss or misinterpret meaning. The application owns source evidence; an exact match does not prove the interpretation. Review incomplete or ambiguous findings before using them. Import never starts AI or creates tests.'}</p>
    {projection && <p className="feedback feedback--warning">Scope is the imported clues only—not the complete original API contract, repository or running product. Findings and coverage derived here must retain that limitation.</p>}
    {loading && <p role="status">Preparing source structure locally… No AI requests.</p>}
    {error && <p className="feedback feedback--error" role="alert">{error}</p>}
    {prepared && accounting && <>
      <dl className="document-metrics">
        <div><dt>{prepared.snapshot.manifest.pageCount === null ? 'Page map' : 'Pages'}</dt><dd>{prepared.snapshot.manifest.pageCount?.toLocaleString() ?? '—'}</dd></div>
        <div><dt>Sections</dt><dd>{prepared.snapshot.sections.length.toLocaleString()}</dd></div>
        <div><dt>Analysis progress</dt><dd>{accounting.units.current.toLocaleString()} / {accounting.units.total.toLocaleString()}</dd></div>
        <div><dt>Requirements & rules</dt><dd>{testable.length.toLocaleString()}</dd></div>
        <div><dt>Ambiguous findings</dt><dd>{requirements.filter(item => item.kind === 'ambiguity').length.toLocaleString()}</dd></div>
        <div><dt>Visual blocks needing review</dt><dd>{accounting.blocks.needs_visual_review.toLocaleString()}</dd></div>
      </dl>
      {prepared.snapshot.manifest.format === 'pdf' && accounting.blocks.needs_visual_review > 0 && <p className="helper-text">Scanned or visual PDF pages need human review. Edit this source to open page review, attach the exact original PDF if requested, and use local OCR or manual transcription. Text analysis alone does not clear these items.</p>}
      {confirmation && <section className="document-preflight" aria-label="Analysis confirmation">
        <h4>Confirm analysis scope</h4>
        <p>Analyze all {prepared.snapshot.units.length.toLocaleString()} {projection ? 'regions in this evidence projection. Omitted original material is not analyzed.' : 'source regions. No source prefix is substituted for the whole document.'}</p>
        <dl className="document-metrics">
          <div><dt>AI tasks</dt><dd>{prepared.preflight.providerTasks.toLocaleString()}</dd></div>
          <div><dt>Reused locally</dt><dd>{prepared.preflight.reusedTasks.toLocaleString()}</dd></div>
          <div><dt>Human review / excluded</dt><dd>{prepared.preflight.localReviewTasks.toLocaleString()}</dd></div>
        </dl>
        <p className="helper-text">At most 2 simultaneous requests. Temporary failures retry at most twice, with a delay. Worst case: {prepared.preflight.providerTasks * 3} attempts. Only the source region and its heading context are sent. Visual material still requires human review.</p>
        <div className="button-row"><button className="button button--primary" onClick={() => void start('new')}>Confirm and analyze</button><button className="button button--secondary" onClick={() => setConfirmation(false)}>Keep reviewing</button></div>
      </section>}
      {prepared.job && <div className="document-job" role="status">
        <div><strong>{!sameRevision ? 'Source changed — prepare a new analysis' : running ? 'Analysis running' : curatedDemo ? 'Curated synthetic source review' : prepared.job.value.status === 'running' ? 'Interrupted — ready to resume' : `Analysis ${prepared.job.value.status}`}</strong>
          <p className="helper-text">{sameRevision ? `${counts.completed} current · ${counts.pending + counts.running + counts.retrying} pending · ${counts.failed} failed · ${counts.needs_visual_review} need review · ${counts.excluded} excluded` : 'Unchanged regions can be reused exactly. Older in-flight responses cannot update this revision.'}</p></div>
        <div className="button-row">
          {running ? <button className="button button--secondary" onClick={() => void stop('paused')}>Pause analysis</button> : sameRevision && counts.pending + counts.running + counts.retrying > 0 ? <button className="button button--primary" onClick={() => void start('resume')}>Resume analysis</button> : null}
          {!running && sameRevision && currentTasks.some((task) => task.value.status === 'failed' && task.value.errorCode) && <button className="button button--secondary" onClick={() => void start('retry_failed')}>Retry failed tasks</button>}
          {sameRevision && (running || counts.pending + counts.running + counts.retrying > 0) && <button className="button button--danger" onClick={() => void stop('canceled')}>Cancel analysis</button>}
        </div>
      </div>}
    </>}
    </aside>
    <div className="intelligence-review">
    {prepared && accounting && <>
      <div className="document-review-controls">
        <div className="button-row" aria-label="Intelligence views">
          <button className="button button--secondary" aria-pressed={view === 'requirements'} onClick={() => { setView('requirements'); setFilter('all'); setPage(0) }}>Requirements & findings</button>
          <button className="button button--secondary" aria-pressed={view === 'regions'} onClick={() => { setView('regions'); setFilter('all'); setPage(0) }}>Source accounting</button>
          <button className="button button--secondary" disabled={running} aria-pressed={view === 'coverage'} onClick={() => { setView('coverage'); setFilter('all'); setPage(0) }}>Coverage & traceability</button>
          <button className="button button--secondary" disabled={running} aria-pressed={view === 'impact'} onClick={() => { setView('impact'); setPage(0) }}>Change impact</button>
        </div>
        {(view === 'requirements' || view === 'regions') && <>
        <label className="field-group">Find evidence<input className="input" placeholder="Requirement, keyword, or page" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0) }} /></label>
        <label className="field-group">{view === 'requirements' ? 'Finding kind' : 'Region status'}<select className="select" value={filter} onChange={(event) => { setFilter(event.target.value); setPage(0) }}><option value="all">All</option>{(view === 'requirements' ? FINDING_KINDS : ['current', 'pending', 'failed', 'excluded', 'needs_visual_review', 'stale']).map((item) => <option key={item} value={item}>{statusLabel(item)}</option>)}</select></label>
        </>}
      </div>
      {view === 'regions' && <CollectionPager page={currentPage} pageSize={PAGE_SIZE} total={rowCount} onPageChange={setPage} label="Intelligence results pages" />}
      {view === 'impact' ? <RequirementImpactPanel prepared={prepared} /> : view === 'coverage' ? <SourceCoveragePanel key={traceRevision} prepared={prepared} onLinkTests={setLinkRequirement} onDraftTests={setDraftRequirement} /> : view === 'requirements' ? <RequirementBrowser key={`${query}:${filter}`} requirements={visibleRequirements} source={source} sectionPaths={new Map([...sections].map(([id, section]) => [id, section.path.join(' / ')]))} running={running} revision={traceRevision} page={currentPage} onPageChange={setPage} onDraft={setDraftRequirement} onLink={setLinkRequirement} onCoverage={() => setView('coverage')} onImpact={() => setView('impact')} /> : <div className="document-regions">
        {visibleUnits.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE).map((unit) => <details className="document-result" key={unit.id}>
          <summary><span className="document-kind">{statusLabel(states.get(unit.id) ?? unit.status)}</span><strong>{unit.ordinal}. {sections.get(unit.sectionId)?.title}</strong><span>{unit.location.page ? `p. ${unit.location.page}` : `L${unit.location.startLine}–${unit.location.endLine}`}</span></summary>
          <div className="document-result__body">{taskByUnit.get(unit.id)?.errorCode && <p role="alert">{unitFailure(taskByUnit.get(unit.id)!.errorCode!).error.message}</p>}<blockquote dir="auto">{source.content.slice(unit.location.startOffset, unit.location.endOffset)}</blockquote></div>
        </details>)}
        {!visibleUnits.length && <p className="document-empty">No source regions match these filters.</p>}
      </div>}
      <p className="helper-text">Analysis progress is source accounting, not test coverage or QA approval. Ambiguities, failures and visual review remain separate from analyzed requirements.</p>
      {linkRequirement && <RequirementTestReview prepared={prepared} requirement={linkRequirement} onClose={() => setLinkRequirement(null)} onSaved={() => { setLinkRequirement(null); setTraceRevision((value) => value + 1); setView('coverage') }} />}
      {draftRequirement && <RequirementDraftReview prepared={prepared} requirement={draftRequirement} onClose={() => setDraftRequirement(null)} onImported={() => setTraceRevision((value) => value + 1)} />}
    </>}
    </div>
    </div>
  </section>
}
