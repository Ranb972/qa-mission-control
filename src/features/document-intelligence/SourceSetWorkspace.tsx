import { useEffect, useRef, useState } from 'react'
import { CollectionPager } from '../../components/ui/CollectionPager'
import { useWorkspace } from '../../lib/workspace/workspaceContext'
import { deleteSourceSet, loadSourceSets, saveSourceSet } from '../../lib/workspace/sourceSetRepository'
import type { StoredRecord } from '../../lib/workspace/workspaceRepository'
import type { QaSource } from '../qa-sources/qaSourceTypes'
import { SOURCE_SET_MAX_MEMBERS, sourceSetMembers, type SourceSet } from './sourceSetModel'
import { reviewSourceSet, type SourceSetReview } from './sourceSetIntelligence'
import { RequirementTraceDetails } from './RequirementTraceDetails'

export function SourceSetWorkspace({ sources, onOpenSource }: { sources: QaSource[]; onOpenSource: (id: string) => void }) {
  const workspace = useWorkspace()!
  const [records, setRecords] = useState<StoredRecord<SourceSet>[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editing, setEditing] = useState<StoredRecord<SourceSet> | 'new' | null>(null)
  const [revision, setRevision] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  useEffect(() => {
    let active = true
    void loadSourceSets(workspace.repository).then((loaded) => { if (active) { setRecords(loaded.records); setLoading(false) } }).catch(() => { if (active) { setError('Source sets could not be read safely. Existing sources and evidence are unchanged.'); setLoading(false) } })
    return () => { active = false }
  }, [workspace, revision])
  const selected = records.find((record) => record.id === selectedId) ?? records[0]
  const filtered = records.filter((record) => `${record.value.name} ${record.value.description}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
  const currentPage = Math.min(page, Math.max(0, Math.ceil(filtered.length / 40) - 1))
  async function remove(record: StoredRecord<SourceSet>) {
    if (!window.confirm(`Delete source set “${record.value.name}”? Sources, requirements, plans, tests and execution history will not be deleted.`)) return
    try { await deleteSourceSet(workspace.repository, record); setRevision((value) => value + 1) }
    catch { setError('This source set changed or could not be deleted. Reload its current saved state before trying again.') }
  }
  return <section className="source-set-workspace" aria-label="Related source sets">
    <div className="page-heading page-heading--split"><div><h3>Related source sets</h3><p>Choose which specifications belong together. Review shared requirements and potential contradictions locally; opening a set never starts AI.</p></div><button className="button button--primary" disabled={!sources.length || loading || !!error} onClick={() => setEditing('new')}>Create source set</button></div>
    {!sources.length && <p className="helper-text">Add a saved QA Source to start a project context. More related sources can be added later.</p>}
    {error && <p role="alert" className="feedback feedback--error">{error} <button className="button button--secondary" onClick={() => { setError(null); setRevision((value) => value + 1) }}>Reload source sets</button></p>}
    {loading ? <p role="status">Loading saved source sets…</p> : <>
      <label className="field-group">Find source sets<input className="input" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0) }} /></label>
      <CollectionPager page={currentPage} pageSize={40} total={filtered.length} onPageChange={setPage} label="Source set pages" />
      <div className="source-set-layout"><nav aria-label="Source sets" className="source-set-index">{filtered.slice(currentPage * 40, (currentPage + 1) * 40).map((record) => <button className="source-index__item" key={record.id} aria-pressed={selected?.id === record.id} onClick={() => setSelectedId(record.id)}><strong>{record.value.name}</strong><span>{record.value.members.length} sources</span></button>)}{!filtered.length && <p className="helper-text">{records.length ? 'No matching source sets.' : 'No source sets yet. Individual sources remain separate until you select their relationship.'}</p>}</nav>
      {selected && <div className="source-set-detail"><header className="document-intelligence__heading"><div><p className="meta-kicker">Explicit project context</p><h3>{selected.value.name}</h3>{selected.value.description && <p>{selected.value.description}</p>}</div><div className="button-row"><button className="button button--secondary" onClick={() => setEditing(selected)}>Edit source set</button><button className="button button--danger" onClick={() => void remove(selected)}>Delete source set</button></div></header><SourceSetReviewPanel key={`${selected.id}:${selected.version}:${revision}`} set={selected.value} onOpenSource={onOpenSource} /></div>}</div>
    </>}
    {editing && <SourceSetEditor record={editing === 'new' ? null : editing} sources={sources} onClose={() => setEditing(null)} onSaved={(id) => { setEditing(null); setSelectedId(id); setRevision((value) => value + 1) }} />}
  </section>
}
function SourceSetEditor({ record, sources, onClose, onSaved }: { record: StoredRecord<SourceSet> | null; sources: QaSource[]; onClose: () => void; onSaved: (id: string) => void }) {
  const workspace = useWorkspace()!
  const dialog = useRef<HTMLDialogElement>(null)
  const busy = useRef(false)
  const [name, setName] = useState(record?.value.name ?? '')
  const [description, setDescription] = useState(record?.value.description ?? '')
  const [selected, setSelected] = useState(new Set(record ? sourceSetMembers(record.value, sources).filter((item) => item.source).map((item) => item.member.sourceId) : []))
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    const previous = document.activeElement
    const element = dialog.current; element?.showModal()
    return () => { element?.close(); if (previous instanceof HTMLElement) previous.focus() }
  }, [])
  const visible = sources.filter((source) => source.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
  const currentPage = Math.min(page, Math.max(0, Math.ceil(visible.length / 40) - 1))
  const missing = record ? sourceSetMembers(record.value, sources).filter((item) => !item.source).length : 0
  async function save() {
    if (busy.current || !selected.size || !name.trim()) return
    busy.current = true; setSaving(true); setError(null)
    const timestamp = new Date().toISOString()
    const value: SourceSet = { schemaVersion: 1, id: record?.id ?? crypto.randomUUID(), name: name.trim(), description: description.trim(),
      members: sources.filter((source) => selected.has(source.id)).map((source) => ({ sourceId: source.id, sourceCreatedAt: source.createdAt })), createdAt: record?.value.createdAt ?? timestamp, updatedAt: timestamp }
    try { await saveSourceSet(workspace.repository, value, record); onSaved(value.id) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'The set could not be saved. Existing membership was preserved.') }
    finally { busy.current = false; setSaving(false) }
  }
  return <dialog ref={dialog} className="modal-dialog requirement-test-dialog" aria-labelledby="source-set-editor-title" onCancel={(event) => { event.preventDefault(); if (!saving) onClose() }}><form onSubmit={(event) => { event.preventDefault(); void save() }}>
    <header className="panel-heading"><h3 id="source-set-editor-title">{record ? 'Edit related source set' : 'Create related source set'}</h3><button type="button" className="button button--secondary" disabled={saving} onClick={onClose}>Close</button></header>
    <label className="field-group">Source set name<input className="input" value={name} maxLength={120} required onChange={(event) => setName(event.target.value)} /></label>
    <label className="field-group">Project context<textarea className="textarea" value={description} maxLength={1000} onChange={(event) => setDescription(event.target.value)} /></label>
    <p className="helper-text">Choose 1–100 related sources. A single specification can start a project context. Selection and saving send no AI requests and do not create tests or merge saved plans.</p>
    {missing > 0 && <p role="status" className="feedback feedback--warning">{missing} removed/replaced members are unavailable. Saving this edited set explicitly replaces its membership with your current selection.</p>}
    <label className="field-group">Find member sources<input className="input" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0) }} /></label>
    <CollectionPager page={currentPage} pageSize={40} total={visible.length} onPageChange={setPage} label="Source set member pages" />
    <div className="source-set-options">{visible.slice(currentPage * 40, (currentPage + 1) * 40).map((source) => <label className="requirement-test-option" key={source.id}><input type="checkbox" checked={selected.has(source.id)} disabled={saving || (!selected.has(source.id) && selected.size >= SOURCE_SET_MAX_MEMBERS)} onChange={() => setSelected((previous) => { const next = new Set(previous); if (next.has(source.id)) next.delete(source.id); else next.add(source.id); return next })} /><strong>{source.title}</strong><span>{source.sourceType}</span></label>)}</div>
    {error && <p role="alert" className="feedback feedback--error">{error}</p>}
    <div className="button-row"><button type="submit" className="button button--primary" disabled={saving || !selected.size || !name.trim()}>{saving ? 'Saving source set…' : `Save ${selected.size} related sources`}</button><button type="button" className="button button--secondary" disabled={saving} onClick={onClose}>Cancel</button></div>
  </form></dialog>
}
function SourceSetReviewPanel({ set, onOpenSource }: { set: SourceSet; onOpenSource: (id: string) => void }) {
  const workspace = useWorkspace()!
  const [review, setReview] = useState<SourceSetReview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const [query, setQuery] = useState('')
  const [onlyGaps, setOnlyGaps] = useState(false)
  const [page, setPage] = useState(0)
  const [relationPage, setRelationPage] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    void reviewSourceSet(workspace, set, controller.signal).then((value) => { if (!controller.signal.aborted) setReview(value) }).catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Review could not be prepared safely.') })
    return () => controller.abort()
  }, [workspace, set, revision])
  if (error) return <div role="alert"><p>{error}</p><button className="button button--secondary" onClick={() => { setError(null); setReview(null); setRevision((value) => value + 1) }}>Refresh set review</button></div>
  if (!review) return <p role="status">Preparing local source-set accounting… No provider requests.</p>
  const byId = new Map(review.requirements.map((item) => [item.id, item]))
  const sourceNames = new Map(review.sources.map((source) => [source.id, source.title]))
  const conflicts = review.relations.filter((group) => group.kind === 'potential_conflict')
  const rows = review.traceability.rows.filter((row) => (!onlyGaps || row.gaps.length > 0) && `${row.requirement.summary} ${row.requirement.evidence.quote} ${sourceNames.get(row.requirement.sourceId)}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
  const currentPage = Math.min(page, Math.max(0, Math.ceil(rows.length / 40) - 1))
  return <section aria-label="Source set intelligence">
    <dl className="document-metrics"><div><dt>Analyzed regions</dt><dd>{review.sources.reduce((sum, source) => sum + source.current, 0)} / {review.sources.reduce((sum, source) => sum + source.total, 0)}</dd></div><div><dt>Current requirements</dt><dd>{review.traceability.testableTotal}</dd></div><div><dt>QA-confirmed test links</dt><dd>{review.traceability.withConfirmedTest} / {review.traceability.testableTotal}</dd></div><div><dt>Potential conflicts</dt><dd>{conflicts.length}</dd></div></dl>
    <p className="helper-text">These are source-accounting and traceability counts, not approval or proof of tested behavior. Unanalyzed, visual and missing sources remain outside the current requirement denominator.</p>
    <div className="source-set-accounting">{review.sources.map((source) => <div className="coverage-hierarchy-row" key={source.id}><div><strong>{source.title}</strong><p className="helper-text">{source.missing ? 'Missing member — no replacement inferred' : `${source.current}/${source.total} analyzed regions · ${source.findings} findings · ${source.visual} visual review blocks · ${source.failed} failed regions`}</p></div>{!source.missing && <button className="button button--secondary button--compact" onClick={() => onOpenSource(source.id)}>Review source</button>}</div>)}</div>
    <h4>Cross-source review</h4><p className="helper-text">Both claims remain separate. Potential conflicts require clarification; deterministic comparison does not establish which source is correct or prove the absence of other semantic contradictions.</p>
    <CollectionPager page={relationPage} pageSize={40} total={review.relations.length} onPageChange={setRelationPage} label="Cross-source relation pages" />
    {review.relations.slice(relationPage * 40, (relationPage + 1) * 40).map((group) => <CrossSourceGroup key={group.id} label={group.kind === 'potential_conflict' ? 'Potential requirement conflict · clarification required' : group.kind === 'exact_duplicate' ? 'Exact repeated requirement · all evidence retained' : 'Possible overlap · QA review required'} ids={group.requirementIds} requirements={byId} sourceNames={sourceNames} onOpenSource={onOpenSource} />)}
    {!review.relations.length && <p className="document-empty">No deterministic cross-source relation candidates were found in the current findings.</p>}
    <h4>Combined requirement inventory</h4><div className="document-review-controls"><label className="field-group">Find set requirements<input className="input" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0) }} /></label><label className="checkbox-label"><input type="checkbox" checked={onlyGaps} onChange={(event) => { setOnlyGaps(event.target.checked); setPage(0) }} />Only requirements needing attention</label></div>
    <CollectionPager page={currentPage} pageSize={40} total={rows.length} onPageChange={setPage} label="Source set requirement pages" />
    {rows.slice(currentPage * 40, (currentPage + 1) * 40).map((row) => <div className="coverage-evidence-row" key={row.requirement.id}><div><strong>{row.requirement.summary}</strong><p className="helper-text">{sourceNames.get(row.requirement.sourceId)} · {row.requirement.kind.replaceAll('_', ' ')} · {row.requirement.evidence.location.page ? `page ${row.requirement.evidence.location.page} · ` : ''}line {row.requirement.evidence.location.startLine}</p><RequirementTraceDetails trace={row} onChange={() => setRevision((value) => value + 1)} /></div><button className="button button--secondary button--compact" onClick={() => onOpenSource(row.requirement.sourceId)}>Review source</button></div>)}
  </section>
}
function CrossSourceGroup({ label, ids, requirements, sourceNames, onOpenSource }: { label: string; ids: string[]; requirements: Map<string, SourceSetReview['requirements'][number]>; sourceNames: Map<string, string>; onOpenSource: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const [page, setPage] = useState(0)
  return <details className="document-secondary" onToggle={(event) => setOpen(event.currentTarget.open)}><summary>{label} · {ids.length} findings</summary>{open && <><CollectionPager page={page} pageSize={40} total={ids.length} onPageChange={setPage} label="Cross-source evidence pages" />{ids.slice(page * 40, (page + 1) * 40).map((id) => {
    const item = requirements.get(id)!
    return <div className="coverage-evidence-row" key={id}><div><strong>{sourceNames.get(item.sourceId)}</strong><blockquote dir="auto">{item.evidence.quote}</blockquote><p className="helper-text">{item.evidence.location.page ? `Page ${item.evidence.location.page} · ` : ''}Lines {item.evidence.location.startLine}–{item.evidence.location.endLine}</p></div><button className="button button--secondary button--compact" onClick={() => onOpenSource(item.sourceId)}>Review source</button></div>
  })}</>}</details>
}
