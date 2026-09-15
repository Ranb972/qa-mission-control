import { DecisionStrip } from '../../components/ui/DecisionStrip'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { CollectionPager } from '../../components/ui/CollectionPager'
import { useWorkspace } from '../../lib/workspace/workspaceContext'
import { loadSourceSets } from '../../lib/workspace/sourceSetRepository'
import { loadReleaseRequirementBaseline, saveReleaseRequirementBaseline } from '../../lib/workspace/releaseRequirementRepository'
import type { StoredRecord } from '../../lib/workspace/workspaceRepository'
import type { Release } from '../releases/releaseTypes'
import type { SourceSet } from '../document-intelligence/sourceSetModel'
import { reviewSourceSet, type SourceSetReview } from '../document-intelligence/sourceSetIntelligence'
import { isTestableRequirement, type Requirement } from '../document-intelligence/requirementModel'
import { RequirementTraceDetails } from '../document-intelligence/RequirementTraceDetails'
import { formatReleaseRequirementMarkdown, summarizeReleaseRequirements, type ReleaseRequirementBaseline } from './releaseRequirements'

export function ReleaseRequirementPanel({ release, onReportChange }: { release: Release; onReportChange: (releaseId: string, markdown: string) => void }) {
  const workspace = useWorkspace()!
  const change = useSyncExternalStore(workspace.subscribe, workspace.getChangeNumber)
  const [sets, setSets] = useState<StoredRecord<SourceSet>[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [baseline, setBaseline] = useState<StoredRecord<ReleaseRequirementBaseline> | null>(null)
  const [review, setReview] = useState<SourceSetReview | null>(null)
  const [historical, setHistorical] = useState<Requirement[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [revision, setRevision] = useState(0)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('attention')
  const [page, setPage] = useState(0)
  const [changesPage, setChangesPage] = useState(0)
  const busy = useRef(false)
  useEffect(() => {
    const controller = new AbortController()
    const load = async () => {
      onReportChange(release.id, '## Source and requirement traceability\n\nRequirement evidence is being refreshed; no current assessment is available yet.\n')
      const [available, saved] = await Promise.all([loadSourceSets(workspace.repository), loadReleaseRequirementBaseline(workspace.repository, release)])
      if (controller.signal.aborted) return
      setSets(available.records); setBaseline(saved); setSelectedId(saved?.value.sourceSetId ?? '')
      if (!saved) {
        setReview(null); setLoading(false)
        onReportChange(release.id, '## Source and requirement traceability\n\nNo explicit source baseline is linked to this release. Requirement completeness has not been assessed.\n')
        return
      }
      const sourceSet = available.records.find((record) => record.id === saved.value.sourceSetId && record.value.createdAt === saved.value.sourceSetCreatedAt)
      if (!sourceSet) throw new Error('The release source set was removed or replaced. The historical baseline is preserved; current requirement readiness is unknown. Select a current set and explicitly replace the baseline.')
      const current = await reviewSourceSet(workspace, sourceSet.value, controller.signal, release.id)
      const summary = summarizeReleaseRequirements(saved.value, current)
      const earlier: Requirement[] = []
      for (let start = 0; start < summary.comparison.changed.length; start += 40) {
        if (controller.signal.aborted) return
        const records = await Promise.all(summary.comparison.changed.slice(start, start + 40).map((item) => workspace.repository.readRecord<Requirement>('requirements', item.id)))
        earlier.push(...records.flatMap((record) => record ? [record.value] : []))
      }
      if (controller.signal.aborted) return
      setReview(current); setHistorical(earlier); setLoading(false); setError(null)
      onReportChange(release.id, formatReleaseRequirementMarkdown(saved.value, current, earlier))
    }
    void load().catch((reason) => {
      if (!controller.signal.aborted) {
        const message = reason instanceof Error ? reason.message : 'Requirement traceability could not be read safely.'
        setError(message); setLoading(false); setReview(null)
        onReportChange(release.id, `## Source and requirement traceability\n\nCurrent requirement readiness is unknown: ${message}\n`)
      }
    })
    return () => controller.abort()
  }, [workspace, release, revision, change, onReportChange])
  async function capture() {
    const selected = sets.find((record) => record.id === selectedId)
    if (!selected || busy.current) return
    if (!window.confirm(baseline ? 'Replace the release source baseline? Change comparisons will start from the currently analyzed requirements. Source issues, tests and execution history are unchanged.' : 'Link this explicit source set and capture its current requirement baseline for this release? This does not approve requirements, run AI, or create tests.')) return
    busy.current = true; setSaving(true)
    try {
      const current = await reviewSourceSet(workspace, selected.value, undefined, release.id)
      await saveReleaseRequirementBaseline(workspace.repository, release, current, baseline)
      setError(null); setLoading(true); setRevision((value) => value + 1)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The release baseline could not be saved. Its previous snapshot was preserved.') }
    finally { busy.current = false; setSaving(false) }
  }
  const summary = baseline && review ? summarizeReleaseRequirements(baseline.value, review) : null
  const openIssues = summary ? [
    !summary.total && 'No current testable requirements',
    summary.failures.length > 0 && `${summary.failures.length} requirements linked to recorded failures`,
    summary.blocked.length > 0 && `${summary.blocked.length} requirements linked to blocked tests`,
    summary.noVerifiedRun.length > 0 && `${summary.noVerifiedRun.length} without verified execution`,
    summary.uncovered.length > 0 && `${summary.uncovered.length} without confirmed tests`,
    summary.withCoverage < summary.total && `${summary.total - summary.withCoverage} without saved coverage`,
    summary.unverified.length > 0 && `${summary.unverified.length} with historical execution needing verification`,
    summary.pendingRegions > 0 && `${summary.pendingRegions} unverified source regions`,
    summary.missingSources > 0 && `${summary.missingSources} missing sources`,
    summary.visualBlocks > 0 && `${summary.visualBlocks} visual-review blocks`,
    summary.ambiguities.length > 0 && `${summary.ambiguities.length} ambiguities`,
    summary.conflicts.length > 0 && `${summary.conflicts.length} potential conflicts`,
    summary.comparison.changed.length > 0 && `${summary.comparison.changed.length} changed/retired requirements`,
    summary.comparison.membershipChanged && 'Source-set membership changed',
  ].filter(Boolean) : []
  const before = new Map(historical.map((item) => [item.id, item]))
  const sourceNames = new Map(review?.sources.map((source) => [source.id, source.title]) ?? [])
  const rows = review?.traceability.rows.filter((row) => (filter === 'all' || filter === 'attention' && (row.gaps.length > 0 || row.failedTestIds.length > 0 || row.blockedTestIds.length > 0 || isTestableRequirement(row.requirement) && (!row.confirmedTestIds.length || row.unrunTestIds.length > 0)) || filter === 'failed' && row.failedTestIds.length > 0 || filter === 'uncovered' && !row.confirmedTestIds.length) && `${row.requirement.summary} ${sourceNames.get(row.requirement.sourceId)}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())) ?? []
  const currentPage = Math.min(page, Math.max(0, Math.ceil(rows.length / 40) - 1))
  return <section className="report-requirements" aria-label="Release requirement traceability">
    <header className="document-intelligence__heading"><div><p className="meta-kicker">Requirements → release evidence</p><h4>Source and requirement assessment</h4><p className="helper-text">Requirements use an explicitly linked source set. The execution summary elsewhere in this report covers the current test library; it does not establish specification completeness.</p></div></header>
    <details className="document-secondary report-requirement-scope"><summary>{baseline ? 'Review or replace the release source baseline' : 'Link sources to this release'}</summary>
      <label className="field-group">Release source set<select aria-label="Release source set" className="select" value={selectedId} disabled={loading || saving} onChange={(event) => setSelectedId(event.target.value)}><option value="">Choose an explicit source set</option>{sets.map((record) => <option key={record.id} value={record.id}>{record.value.name}</option>)}</select></label>
      <p className="helper-text">Create a source set in QA Sources first. One large specification can form a set by itself. Capturing a baseline records current requirement identities, not QA approval.</p>
      <button className="button button--secondary" disabled={loading || saving || !selectedId} onClick={() => void capture()}>{saving ? 'Saving baseline…' : baseline ? 'Replace release requirement baseline' : 'Capture release requirement baseline'}</button>
    </details>
    {loading && <p role="status">Preparing release-scoped requirement evidence locally…</p>}
    {error && <p role="alert" className="feedback feedback--error">{error}</p>}
    {!loading && <button className="button button--secondary button--compact report-requirement-refresh" onClick={() => { setLoading(true); setRevision((value) => value + 1) }}>Refresh requirement assessment</button>}
    {!baseline && !loading && <p className="feedback feedback--warning">No source baseline is linked. Requirement completeness has not been assessed for this release.</p>}
    {baseline && review && summary && <>
      <p><strong>{review.set.name}</strong> · baseline {baseline.value.capturedAt.slice(0, 10)}</p>
      {openIssues.length > 0 && <p className="feedback feedback--warning">Requirement review remains open: {openIssues.join(' · ')}. This assessment cannot establish release readiness.</p>}
      <DecisionStrip className="document-metrics" label="Release requirement decision signals" items={[
        {label:'Current requirements',value:summary.total},
        {label:'Saved coverage links',value:summary.withCoverage+' / '+summary.total},
        {label:'QA-confirmed tests',value:summary.withTests+' / '+summary.total,tone:'observed'},
        {label:'Linked recorded failures',value:summary.failures.length,tone:summary.failures.length?'critical':'neutral'},
        {label:'No verified execution',value:summary.noVerifiedRun.length,tone:summary.noVerifiedRun.length?'review':'neutral'},
      ]} />
      <details className="document-secondary"><summary>Source accounting · {review.sources.length} members</summary>{review.sources.map((source) => <div className="coverage-hierarchy-row" key={source.id}><strong>{source.title}</strong><span>{source.missing ? 'Missing; not substituted' : `${source.current}/${source.total} analyzed regions · ${source.failed} failed · ${source.visual} visual blocks`}</span></div>)}</details>
      <details className="document-secondary"><summary>Changed requirements · {summary.comparison.changed.length} historical / {summary.comparison.added.length} added</summary><p className="helper-text">Changed regions and retired interpretations are not automatically mapped to a current replacement. Review detailed artifact impact in the source workspace.</p><CollectionPager page={changesPage} pageSize={40} total={summary.comparison.changed.length} onPageChange={setChangesPage} label="Release changed requirement pages" />{summary.comparison.changed.slice(changesPage * 40, (changesPage + 1) * 40).map((item) => <div className="coverage-evidence-row" key={item.id}>{before.get(item.id)?.fingerprint === item.fingerprint ? <div><strong>{before.get(item.id)!.summary}</strong><blockquote dir="auto">{before.get(item.id)!.evidence.quote}</blockquote><p className="helper-text">Historical evidence; not a current source location.</p></div> : <p>Historical requirement identity retained; exact earlier evidence unavailable.</p>}</div>)}</details>
      <div className="document-review-controls"><label className="field-group">Find release requirements<input className="input" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0) }} /></label><label className="field-group">Requirement report filter<select aria-label="Requirement report filter" className="select" value={filter} onChange={(event) => { setFilter(event.target.value); setPage(0) }}><option value="attention">Needs attention</option><option value="all">All findings</option><option value="failed">Recorded failure links</option><option value="uncovered">No confirmed tests</option></select></label></div>
      <CollectionPager page={currentPage} pageSize={40} total={rows.length} onPageChange={setPage} label="Release requirement pages" />
      {rows.length > 40 && <p className="helper-text">Requirement preview: {currentPage * 40 + 1}–{Math.min((currentPage + 1) * 40, rows.length)} of {rows.length.toLocaleString()} matching findings. Full evidence is in the Markdown export.</p>}
      {rows.slice(currentPage * 40, (currentPage + 1) * 40).map((row) => <div className="coverage-evidence-row" key={row.requirement.id}><div><strong>{row.requirement.summary}</strong><p className="helper-text">{sourceNames.get(row.requirement.sourceId)} · {row.requirement.evidence.location.page ? `page ${row.requirement.evidence.location.page} · ` : ''}lines {row.requirement.evidence.location.startLine}–{row.requirement.evidence.location.endLine}</p><RequirementTraceDetails readOnly trace={row} onChange={() => setRevision((value) => value + 1)} /></div></div>)}
      {!rows.length && <p className="helper-text">No current findings match this filter. Unprocessed source regions remain in accounting.</p>}
    </>}
  </section>
}
