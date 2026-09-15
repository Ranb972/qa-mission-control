import { EvidenceQuote } from '../../components/ui/EvidenceQuote'
import { useEffect, useRef, useState } from 'react'
import { CollectionPager } from '../../components/ui/CollectionPager'
import { useWorkspace } from '../../lib/workspace/workspaceContext'
import type { PreparedAnalysis } from '../../lib/workspace/analysisJobRepository'
import { confirmRequirementTests } from '../../lib/workspace/traceabilityRepository'
import type { Requirement } from './requirementModel'

export function RequirementTestReview({ prepared, requirement, onClose, onSaved }: { prepared: PreparedAnalysis; requirement: Requirement; onClose: () => void; onSaved: () => void }) {
  const workspace = useWorkspace()!
  const dialog = useRef<HTMLDialogElement>(null)
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState(new Set<string>())
  const [confirmed, setConfirmed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inFlight = useRef(false)
  const tests = workspace.get('testCases').items
  const visible = tests.filter((test) => `${test.title} ${test.area}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  const currentPage = Math.min(page, Math.max(0, Math.ceil(visible.length / 40) - 1))
  useEffect(() => {
    const previousFocus = document.activeElement
    const element = dialog.current
    element?.showModal()
    return () => { element?.close(); if (previousFocus instanceof HTMLElement) previousFocus.focus() }
  }, [])
  async function save() {
    if (inFlight.current || !confirmed || !selected.size) return
    inFlight.current = true; setSaving(true); setError(null)
    try {
      await confirmRequirementTests(workspace.repository, prepared, requirement, tests.filter((test) => selected.has(test.id)))
      onSaved()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Traceability could not be saved. Existing links were preserved.') }
    finally { inFlight.current = false; setSaving(false) }
  }
  return <dialog ref={dialog} className="modal-dialog requirement-test-dialog" aria-labelledby="requirement-test-review-title" onCancel={(event) => { event.preventDefault(); if (!saving) onClose() }}>
    <header className="panel-heading"><div><p className="meta-kicker">QA confirmation</p><h3 id="requirement-test-review-title">Link reviewed Test Cases</h3></div><button className="button button--secondary" disabled={saving} onClick={onClose}>Close</button></header>
    <p><strong>{requirement.summary}</strong></p><EvidenceQuote quote={requirement.evidence.quote} location={`Lines ${requirement.evidence.location.startLine}–${requirement.evidence.location.endLine}`} />
    <p className="helper-text">One requirement can use several tests; one test can cover several requirements. This confirms the exact current test design, not its execution result.</p>
    <label className="field-group">Find Test Cases<input className="input" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0) }} placeholder="Title or area" /></label>
    <CollectionPager page={currentPage} pageSize={40} total={visible.length} onPageChange={setPage} label="Test Case link pages" />
    <div className="requirement-test-options">{visible.slice(currentPage * 40, (currentPage + 1) * 40).map((test) => <div key={test.id} className="document-result">
      <label className="requirement-test-option"><input type="checkbox" checked={selected.has(test.id)} disabled={saving || (!selected.has(test.id) && selected.size >= 100)} onChange={() => { setConfirmed(false); setSelected((previous) => { const next = new Set(previous); if (next.has(test.id)) next.delete(test.id); else next.add(test.id); return next }) }} /><strong>{test.title}</strong><span>{test.area}</span></label>
      <details><summary>Review test design</summary><p>{test.preconditions}</p>{test.structuredSteps?.length ? <ol>{test.structuredSteps.map((step) => <li key={step.id}>{step.action}<p><strong>Expected:</strong> {step.expectedResult}</p></li>)}</ol> : <><p>{test.steps}</p><p><strong>Expected:</strong> {test.expectedResult}</p></>}</details>
    </div>)}</div>
    {!visible.length && <p className="document-empty">{tests.length ? 'No Test Cases match this search.' : 'Create or explicitly import reviewed Test Cases in the Test Cases workspace first. Nothing is created automatically here.'}</p>}
    <label className="requirement-test-option qa-approval-gate"><input type="checkbox" checked={confirmed} disabled={saving || selected.size === 0} onChange={(event) => setConfirmed(event.target.checked)} />I reviewed these {selected.size} Test Cases and confirm that their current design addresses this requirement.</label>
    {error && <p role="alert" className="feedback feedback--error">{error}</p>}
    <div className="button-row"><button className="button button--primary" disabled={saving || !confirmed || selected.size === 0} onClick={() => void save()}>{saving ? 'Saving traceability…' : 'Confirm reviewed coverage'}</button><button className="button button--secondary" disabled={saving} onClick={onClose}>Cancel</button></div>
  </dialog>
}
