import { EvidenceQuote } from '../../components/ui/EvidenceQuote'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useWorkspace } from '../../lib/workspace/workspaceContext'
import type { PreparedAnalysis } from '../../lib/workspace/analysisJobRepository'
import { importRequirementTestDrafts } from '../../lib/workspace/requirementTestImport'
import { requirementSourceSetContext } from '../../lib/workspace/requirementSourceSetContext'
import type { Requirement } from './requirementModel'
import { draftRequirementTests, requirementDraftBlocker, requirementSuggestionContext } from './requirementSuggestions'
import type { AiTestCaseSuggestion } from '../ai-suggestions/aiSuggestionTypes'

export function RequirementDraftReview({ prepared, requirement, onClose, onImported }: { prepared: PreparedAnalysis; requirement: Requirement; onClose: () => void; onImported: () => void }) {
  const workspace = useWorkspace()!
  const dialog = useRef<HTMLDialogElement>(null)
  const request = useRef<AbortController | null>(null)
  const alive = useRef(true)
  const busy = useRef(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [suggestions, setSuggestions] = useState<AiTestCaseSuggestion[]>([])
  const [selected, setSelected] = useState(new Set<string>())
  const [error, setError] = useState<string | null>(null)
  const [imported, setImported] = useState(0)
  const { blocker, context } = useMemo(() => {
    const blocker = requirementDraftBlocker(prepared, requirement)
    return { blocker, context: blocker ? null : requirementSuggestionContext(prepared, requirement) }
  }, [prepared, requirement])
  useEffect(() => {
    alive.current = true
    const previousFocus = document.activeElement
    const element = dialog.current
    element?.showModal()
    return () => { alive.current = false; request.current?.abort(); element?.close(); if (previousFocus instanceof HTMLElement) previousFocus.focus() }
  }, [])
  async function generate() {
    if (busy.current || blocker || imported) return
    busy.current = true; setLoading(true); setError(null); setSelected(new Set()); setSuggestions([])
    const controller = new AbortController()
    request.current = controller
    const timeout = setTimeout(() => controller.abort(), 70_000)
    try {
      const related = await requirementSourceSetContext(workspace.repository, prepared, requirement)
      if (related.blocker) throw new Error(related.blocker)
      if (controller.signal.aborted || !alive.current) return
      const drafts = await draftRequirementTests(prepared, requirement, controller.signal)
      const currentSource = await workspace.repository.readRecord('sources', prepared.source.id)
      const requirementVersion = await workspace.repository.readMetadata<number>('collection:requirements')
      const intelligenceVersion = await workspace.repository.readMetadata<number>('collection:unitIntelligence')
      if (currentSource?.version !== prepared.sourceVersion || requirementVersion !== prepared.requirementVersion || intelligenceVersion !== prepared.intelligenceVersion) throw new Error('Source requirements changed during drafting. Close this review and reopen the current requirement.')
      if (alive.current && !controller.signal.aborted) setSuggestions(drafts)
    } catch (reason) { if (alive.current) setError(reason instanceof Error ? reason.message : 'Draft generation failed safely. No tests were created.') }
    finally { clearTimeout(timeout); busy.current = false; if (alive.current) setLoading(false) }
  }
  async function approveAndImport() {
    if (busy.current || !selected.size || imported) return
    busy.current = true; setSaving(true); setError(null)
    try {
      const result = await importRequirementTestDrafts(workspace, prepared, requirement, suggestions.filter((item) => selected.has(item.id)))
      if (alive.current) { setImported(result.tests.length); setSelected(new Set()); setError(result.refreshWarning); onImported() }
    } catch (reason) { if (alive.current) setError(reason instanceof Error ? reason.message : 'Import failed. Previously saved Test Cases and links were preserved.') }
    finally { busy.current = false; if (alive.current) setSaving(false) }
  }
  return <dialog ref={dialog} className="modal-dialog requirement-test-dialog" aria-labelledby="requirement-draft-title" onCancel={(event) => { event.preventDefault(); if (!saving) onClose() }}>
    <header className="panel-heading"><div><p className="meta-kicker">AI suggests · QA approves</p><h3 id="requirement-draft-title">Draft tests for one requirement</h3></div><button className="button button--secondary" disabled={saving} onClick={onClose}>Close</button></header>
    <p><strong>{requirement.summary}</strong></p><EvidenceQuote quote={requirement.evidence.quote} location={`Lines ${requirement.evidence.location.startLine}–${requirement.evidence.location.endLine}`} />
    {blocker ? <p role="status" className="feedback feedback--warning">{blocker}</p> : <>
      <p className="helper-text">One explicit request sends this requirement and its {context!.region.length.toLocaleString()}-character source region. It does not send the specification prefix or the rest of the document. Drafts and selections disappear when this review closes.</p>
      <details><summary>Inspect exactly what will be sent</summary><pre className="requirement-draft-context" dir="auto">{context!.packed.content}</pre></details>
      <button className="button button--primary" disabled={loading || saving || imported > 0} onClick={() => void generate()}>{loading ? 'Generating drafts…' : suggestions.length ? 'Discard and regenerate drafts' : 'Generate test drafts'}</button>
    </>}
    {error && <p role="alert" className="feedback feedback--error">{error}</p>}
    {imported > 0 && <p role="status" className="feedback feedback--success">{imported} QA-approved Test Cases and their requirement links were saved. Their execution status is Not Run.</p>}
    <div className="requirement-draft-list">{suggestions.map((draft) => <article className="requirement-draft" key={draft.id}>
      <header><label className="requirement-test-option"><input type="checkbox" checked={selected.has(draft.id)} disabled={draft.status !== 'ready' || saving || imported > 0} onChange={() => setSelected((previous) => { const next = new Set(previous); if (next.has(draft.id)) next.delete(draft.id); else next.add(draft.id); return next })} /><strong>{draft.title}</strong></label><span className="helper-text">{draft.status === 'ready' ? 'Ready for QA review' : 'Needs clarification — import blocked'}</span></header>
      <p>{draft.preconditions}</p><ol>{draft.structuredSteps.map((step) => <li key={step.id}>{step.action}<p><strong>Expected:</strong> {step.expectedResult}</p></li>)}</ol>
      <details><summary>Evidence and limitations</summary>{draft.evidence.map((text, index) => <blockquote dir="auto" key={index}>{text}</blockquote>)}{[...draft.assumptions, ...draft.warnings].map((text, index) => <p key={index}>{text}</p>)}</details>
    </article>)}</div>
    {suggestions.length > 0 && !imported && <div><p className="helper-text">Approving confirms that the selected current test designs address this requirement. They are added to the library only when you choose the action below.</p><button className="button button--primary" disabled={saving || !selected.size} onClick={() => void approveAndImport()}>{saving ? 'Saving tests and traceability…' : `Approve and import ${selected.size} selected`}</button></div>}
  </dialog>
}
