import { useEffect, useMemo, useRef, useState } from 'react'
import { CollectionPager } from '../../components/ui/CollectionPager'
import { useWorkspace } from '../../lib/workspace/workspaceContext'
import { AnalysisJobRepository, type PreparedAnalysis } from '../../lib/workspace/analysisJobRepository'
import type { StoredRecord } from '../../lib/workspace/workspaceRepository'
import { CONFLICT_ERROR, STORAGE_ERROR } from '../../lib/workspace/workspaceRepository'
import type { QaSource } from '../qa-sources/qaSourceTypes'
import { compareProductEvidence, type EvidenceComparison } from './evidenceComparison'
import { CLUE_KINDS, type ProductClue, type ProductEvidence } from './productEvidence'
import { EVIDENCE_DECISIONS, reviewIsCurrent, saveEvidenceReview, type EvidenceReview } from './evidenceReview'

const label = (value: string) => value.replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase())
const outcome = { numeric_difference: 'Possible numeric discrepancy', related_clue: 'Related clue — verify behavior', no_matching_clue: 'No matching clue in selected scope' }
function Clue({ clue, evidence }: { clue: ProductClue; evidence: ProductEvidence }) {
  return <div className="product-clue"><p className="helper-text product-origin">{evidence.files[clue.origin.fileIndex].path}{clue.origin.line ? ` · line ${clue.origin.line}` : ''}{clue.origin.pointer !== undefined ? ` · #${clue.origin.pointer}` : ''}</p><blockquote dir="auto">{clue.summary}</blockquote></div>
}
type ComparisonState = { prepared: PreparedAnalysis; evidence: StoredRecord<QaSource>; reviews: StoredRecord<EvidenceReview>[] }
export function ProductEvidencePanel({ source, sources }: { source: QaSource; sources: QaSource[] }) {
  const workspace = useWorkspace()
  const evidence = source.documentImport!.productEvidence!
  const [view, setView] = useState<'clues' | 'comparison'>('clues')
  const [selected, setSelected] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [page, setPage] = useState(0)
  const [storedState, setState] = useState<ComparisonState | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const request = useRef(0)
  const lock = useRef(false)
  const comparisonSource = sources.find((item) => item.id === selected)
  useEffect(() => { const operation = request; return () => { operation.current++ } }, [])
  const state = storedState && storedState.prepared.source.createdAt === comparisonSource?.createdAt && storedState.prepared.source.content === comparisonSource?.content && storedState.evidence.value.createdAt === source.createdAt && storedState.evidence.value.content === source.content ? storedState : null
  const rows = useMemo(() => state ? compareProductEvidence(state.prepared.currentRequirements ?? [], evidence) : [], [state, evidence])
  const reviewed = useMemo(() => new Map(state?.reviews.map((record) => [record.value.requirementId, record]) ?? []), [state])
  const words = query.trim().toLocaleLowerCase()
  const clues = evidence.clues.filter((clue) => (filter === 'all' || clue.kind === filter) && `${clue.summary} ${evidence.files[clue.origin.fileIndex].path} ${clue.origin.pointer ?? ''}`.toLocaleLowerCase().includes(words))
  const comparisons = rows.filter((row) => (filter === 'all' || row.kind === filter) && `${row.requirement.summary} ${row.requirement.evidence.quote} ${row.clues.map((clue) => clue.summary).join(' ')}`.toLocaleLowerCase().includes(words))
  const total = view === 'clues' ? clues.length : comparisons.length
  const currentPage = Math.min(page, Math.max(0, Math.ceil(total / 40) - 1))
  async function compare() {
    if (!workspace || !selected || lock.current) return
    const sequence = ++request.current; lock.current = true; setBusy(true); setError(''); setState(null)
    try {
      const [prepared, savedSource, reviews] = await Promise.all([new AnalysisJobRepository(workspace.repository).prepare(selected), workspace.repository.readRecord<QaSource>('sources', source.id), workspace.repository.readSourceRecords<EvidenceReview>('productEvidenceReviews', source.id)])
      if (!savedSource?.value.documentImport?.productEvidence || savedSource.value.createdAt !== source.createdAt || savedSource.value.content !== source.content || prepared.source.createdAt !== comparisonSource?.createdAt || prepared.source.content !== comparisonSource?.content) throw new Error('Sources changed.')
      if (request.current !== sequence) return
      setState({ prepared, evidence: savedSource, reviews }); setView('comparison'); setFilter('all'); setPage(0)
    } catch { if (request.current === sequence) setError('Current evidence could not be compared safely. Saved sources and reviews are unchanged. Reopen the sources and try again.') }
    finally { if (request.current === sequence) { lock.current = false; setBusy(false) } }
  }
  return <section className="product-evidence document-intelligence" aria-label="Product evidence workspace">
    <header className="document-intelligence__heading"><div><p className="meta-kicker">Product-aware review</p><h3>Connect specification and product evidence</h3></div><span className="helper-text">{label(evidence.kind)}</span></header>
    <p className="helper-text">{evidence.clues.length.toLocaleString()} clues from {evidence.files.length} explicitly selected files. A declaration, test name or API contract is not execution evidence.</p>
    <details className="product-scope"><summary>Selected files & interpretation limits</summary><ul>{evidence.files.map((file) => <li className="product-origin" key={file.path}>{file.path} · {file.lineCount.toLocaleString()} lines in selected input</li>)}</ul><ul className="helper-text">{evidence.limitations.map((item) => <li key={item}>{item}</li>)}</ul></details>
    <div className="document-review-controls"><label className="field-group">Compare with specification<select className="select" value={selected} disabled={busy} onChange={(event) => { setSelected(event.target.value); setState(null) }}><option value="">Choose an analyzed source</option>{sources.filter((item) => item.id !== source.id && !item.documentImport?.productEvidence).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><button className="button button--secondary" disabled={!selected || busy || !workspace} onClick={() => void compare()}>{busy ? 'Comparing current evidence…' : 'Compare selected sources locally'}</button></div>
    <p className="helper-text">Up to three lexical candidates per requirement, not semantic equivalence. Numbers may use different units or contexts. No match means no match in these excerpts—not a missing implementation. No AI request or Test Case creation.</p>
    {error && <p role="alert" className="feedback feedback--error">{error}</p>}
    <div className="document-review-controls"><div className="button-row"><button className="button button--secondary" aria-pressed={view === 'clues'} onClick={() => { setView('clues'); setFilter('all'); setPage(0) }}>Imported clues</button><button className="button button--secondary" disabled={!state} aria-pressed={view === 'comparison'} onClick={() => { setView('comparison'); setFilter('all'); setPage(0) }}>Potential discrepancies</button></div><label className="field-group">Find product evidence<input className="input" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0) }} /></label><label className="field-group">Evidence filter<select className="select" value={filter} onChange={(event) => { setFilter(event.target.value); setPage(0) }}><option value="all">All</option>{(view === 'clues' ? CLUE_KINDS : Object.keys(outcome)).map((kind) => <option key={kind} value={kind}>{view === 'clues' ? label(kind) : outcome[kind as keyof typeof outcome]}</option>)}</select></label></div>
    {view === 'comparison' && state && <p className="helper-text">{rows.length} current requirements / rules / ambiguities from {state.prepared.source.title}. {state.prepared.preflight.providerTasks} regions still need analysis; {state.prepared.preflight.localReviewTasks} need human review or are excluded. Unanalyzed regions are not compared. {evidence.clues.length - new Set(rows.flatMap((row) => row.clues.map((clue) => clue.id))).size} clues have no candidate relationship; review them in Imported clues. Decisions do not approve requirements, tests or coverage.</p>}
    <CollectionPager page={currentPage} pageSize={40} total={total} onPageChange={setPage} label="Product evidence pages" />
    {view === 'clues' ? clues.slice(currentPage * 40, (currentPage + 1) * 40).map((clue) => <details className="document-result" key={clue.id}><summary><span className="document-kind">{label(clue.kind)}</span><strong>{clue.summary}</strong></summary><div className="document-result__body"><Clue clue={clue} evidence={evidence} /></div></details>) : comparisons.slice(currentPage * 40, (currentPage + 1) * 40).map((row) => <ComparisonRow key={`${row.requirement.id}:${state!.evidence.version}`} source={source} evidence={evidence} row={row} state={state!} previous={reviewed.get(row.requirement.id) ?? null} onSaved={async () => { const reviews = await workspace!.repository.readSourceRecords<EvidenceReview>('productEvidenceReviews', source.id); setState((current) => current ? { ...current, reviews } : null) }} />)}
    {!total && <p className="document-empty">{view === 'comparison' && !rows.length ? 'No current analyzed requirements are available. Analyze and review the specification first; historical findings are not substituted.' : 'No evidence matches these filters.'}</p>}
  </section>
}
function ComparisonRow({ source, evidence, row, state, previous, onSaved }: { source: QaSource; evidence: ProductEvidence; row: EvidenceComparison; state: ComparisonState; previous: StoredRecord<EvidenceReview> | null; onSaved: () => Promise<void> }) {
  const workspace = useWorkspace()!
  const [decision, setDecision] = useState<EvidenceReview['decision']>('potential_difference')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const lock = useRef(false)
  const current = previous && reviewIsCurrent(previous.value, source, row.requirement)
  async function save() {
    if (lock.current) return
    lock.current = true; setSaving(true); setError('')
    try { await saveEvidenceReview(workspace.repository, state.prepared, state.evidence, row.requirement, row.clues.map((clue) => clue.id), decision, note, previous); await onSaved() }
    catch (reason) { const message = reason instanceof Error && [CONFLICT_ERROR, STORAGE_ERROR, 'Refresh both sources before recording this review.', 'The review is invalid. Existing decisions were preserved.'].includes(reason.message) ? reason.message : 'Review could not be saved, or its evidence changed.'; setError(message + ' Existing decisions are preserved. Compare the sources again before retrying.') }
    finally { lock.current = false; setSaving(false) }
  }
  return <details className="document-result product-comparison"><summary><span className="document-kind">{outcome[row.kind]}</span><strong>{row.requirement.summary}</strong><span>{current ? 'QA reviewed' : previous ? 'Review outdated' : 'Needs review'}</span></summary><div className="document-result__body"><div className="product-comparison__claims"><div><h4>Specification evidence</h4><p className="helper-text">{state.prepared.source.title} · {row.requirement.evidence.location.page ? `page ${row.requirement.evidence.location.page} · ` : ''}line {row.requirement.evidence.location.startLine}</p><blockquote dir="auto">{row.requirement.evidence.quote}</blockquote></div><div><h4>Selected product evidence</h4>{row.clues.map((clue) => <Clue key={clue.id} clue={clue} evidence={evidence} />)}{!row.clues.length && <p>No lexical candidate. Inspect the selected scope before drawing a conclusion.</p>}</div></div>
    {previous && <p className="helper-text">{current ? 'Saved QA decision' : 'Historical decision — evidence changed'}: {label(previous.value.decision)} · {new Date(previous.value.reviewedAt).toLocaleString()}{previous.value.note ? ` · ${previous.value.note}` : ''}</p>}
    <details><summary>{previous ? 'Record an updated QA decision' : 'Record a QA review decision'}</summary><label className="field-group">QA disposition<select className="select" value={decision} disabled={saving} onChange={(event) => setDecision(event.target.value as EvidenceReview['decision'])}>{EVIDENCE_DECISIONS.map((value) => <option key={value} value={value} disabled={value === 'related_evidence' && !row.clues.length}>{label(value)}</option>)}</select></label><label className="field-group">Review rationale<textarea className="textarea" value={note} maxLength={600} disabled={saving} onChange={(event) => setNote(event.target.value)} placeholder="What should be clarified or verified? Do not include secrets." /></label><p className="helper-text">Your assessment of these exact sources does not mark implementation correct or create approved test coverage.</p><button className="button button--secondary" disabled={saving} onClick={() => void save()}>{saving ? 'Saving review…' : 'Save QA evidence decision'}</button></details>
    {error && <p role="alert" className="feedback feedback--error">{error}</p>}
  </div></details>
}
