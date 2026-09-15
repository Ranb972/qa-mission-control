import { DecisionStrip } from '../../components/ui/DecisionStrip'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { CollectionPager } from '../../components/ui/CollectionPager'
import { EvidenceQuote } from '../../components/ui/EvidenceQuote'
import { useWorkspace } from '../../lib/workspace/workspaceContext'
import { loadSourceTraceability } from '../../lib/workspace/traceabilityRepository'
import type { QaSource } from '../qa-sources/qaSourceTypes'
import { isTestableRequirement, type Requirement } from './requirementModel'
import { buildRequirementTraceability, type RequirementTrace } from './requirementTraceability'
import { RequirementTraceDetails } from './RequirementTraceDetails'

type Props = {
  requirements: Requirement[]
  source: QaSource
  sectionPaths: Map<string, string>
  running: boolean
  revision: number
  page: number
  onPageChange: (page: number) => void
  onDraft: (requirement: Requirement) => void
  onLink: (requirement: Requirement) => void
  onCoverage: () => void
  onImpact: () => void
}
const PAGE_SIZE = 40
const label = (value: string) => value.replaceAll('_', ' ').replace(/^./, character => character.toUpperCase())
const isMobile = () => window.matchMedia('(max-width: 760px)').matches

/** Browsing is local state; selecting evidence never approves it or invokes AI. */
export function RequirementBrowser({ requirements, source, sectionPaths, running, revision, page, onPageChange, onDraft, onLink, onCoverage, onImpact }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const buttons = useRef(new Map<string, HTMLButtonElement>())
  const heading = useRef<HTMLHeadingElement>(null)
  const selected = requirements.find(item => item.id === selectedId) ?? null
  const activeIndex = selected ? requirements.indexOf(selected) : -1
  const visible = requirements.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const tabStop = visible.some(item => item.id === focusedId) ? focusedId : visible[0]?.id

  function select(item: Requirement) {
    setSelectedId(item.id); setFocusedId(item.id)
    onPageChange(Math.floor(requirements.indexOf(item) / PAGE_SIZE))
    requestAnimationFrame(() => heading.current?.focus())
  }
  function back() {
    setSelectedId(null)
    requestAnimationFrame(() => { if (selected) buttons.current.get(selected.id)?.focus() })
  }
  function browse(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = event.key === 'ArrowDown' ? Math.min(visible.length - 1, index + 1)
      : event.key === 'ArrowUp' ? Math.max(0, index - 1)
        : event.key === 'Home' ? 0 : event.key === 'End' ? visible.length - 1 : null
    if (next === null) return
    event.preventDefault()
    const item = visible[next]
    setFocusedId(item.id)
    // Mobile keeps the collection visible until Enter/click explicitly opens the dossier.
    if (!isMobile()) setSelectedId(item.id)
    buttons.current.get(item.id)?.focus()
  }

  return <div className={`document-requirements requirement-browser${selected ? ' requirement-browser--selected' : ''}`}>
    <nav className="requirement-collection" aria-label="Requirement collection">
      <div className="collection-heading"><strong>Findings</strong><span>{requirements.length.toLocaleString()} matching</span></div>
      <p className="helper-text collection-keyboard-hint">↑ ↓ Browse · Enter to inspect</p>
      <CollectionPager label="Intelligence results pages" page={page} pageSize={PAGE_SIZE} total={requirements.length} onPageChange={next => { setSelectedId(null); setFocusedId(null); onPageChange(next) }} />
      <div className="requirement-collection__rows">
        {visible.map((item, index) => <button key={item.id} ref={element => { if (element) buttons.current.set(item.id, element); else buttons.current.delete(item.id) }}
          type="button" className={`requirement-row${item.id === selected?.id ? ' requirement-row--selected' : ''}`}
          aria-label={`Open requirement: ${item.summary}`} aria-current={item.id === selected?.id ? 'true' : undefined}
          tabIndex={item.id === tabStop ? 0 : -1} onKeyDown={event => browse(event, index)} onClick={() => select(item)}>
          <span className="requirement-row__anchor">L{item.evidence.location.startLine}</span>
          <strong>{item.summary}</strong>
          <span className={`document-kind document-kind--${item.kind}`}>{label(item.kind)}</span>
        </button>)}
      </div>
      {!requirements.length && <p className="helper-text">No findings to show. Adjust the filters or review source accounting before starting analysis.</p>}
    </nav>
    {selected ? <article className="requirement-dossier" aria-labelledby={`requirement-dossier-${source.id}`}>
      <div className="dossier-actions">
        <button type="button" className="button button--secondary" onClick={back}>Back to findings</button>
        <div className="button-row">
          <button type="button" className="button button--secondary" disabled={activeIndex <= 0} onClick={() => select(requirements[activeIndex - 1])}>Previous finding</button>
          <button type="button" className="button button--secondary" disabled={activeIndex >= requirements.length - 1} onClick={() => select(requirements[activeIndex + 1])}>Next finding</button>
        </div>
      </div>
      <div className="requirement-dossier__content">
        <p className="meta-kicker">Finding {activeIndex + 1} / {requirements.length} · {label(selected.kind)}</p>
        <h4 ref={heading} tabIndex={-1} id={`requirement-dossier-${source.id}`}>{selected.summary}</h4>
        <p className="requirement-provenance">{source.title}<br />{sectionPaths.get(selected.sectionId)}{selected.evidence.location.table ? ` · Table ${selected.evidence.location.table}, row ${selected.evidence.location.row}` : ''}</p>
        <EvidenceQuote quote={selected.evidence.quote} location={`${selected.evidence.location.page ? `Page ${selected.evidence.location.page} · ` : ''}Lines ${selected.evidence.location.startLine}–${selected.evidence.location.endLine}`} />
        {selected.evidence.location.filePath && <p className="helper-text product-origin">{selected.evidence.location.filePath}{selected.evidence.location.fileLine ? ` · original line ${selected.evidence.location.fileLine}` : ''}{selected.evidence.location.jsonPointer !== undefined ? ` · #${selected.evidence.location.jsonPointer}` : ''}</p>}
        <div className="requirement-interpretation"><p><strong>Suggested coverage topic:</strong> {selected.coverageTopic || 'Not assigned'}</p><p className="helper-text">Canonical source evidence; its interpretation still requires QA review. A source match never grants approval.</p></div>
        <SelectedRequirementTrace key={`${selected.id}:${revision}`} requirement={selected} />
      </div>
      <div className="requirement-decision-actions">
        {isTestableRequirement(selected) && <><button type="button" className="button button--secondary" disabled={running} onClick={() => onDraft(selected)}>Draft tests</button><button type="button" className="button button--primary" disabled={running} onClick={() => onLink(selected)}>Link reviewed tests</button></>}
        <button type="button" className="button button--secondary" disabled={running} onClick={onCoverage}>View coverage & execution impact</button>
        <button type="button" className="button button--secondary" disabled={running} onClick={onImpact}>Review source changes</button>
      </div>
    </article> : <div className="requirement-browser__empty"><p className="meta-kicker">Source → Evidence → QA decision</p><h4>Select a finding.<br />Follow its evidence.</h4><p>Inspect the canonical quotation, reviewed test links and recorded execution impact.</p><p className="helper-text">Select from the collection. Browsing never approves a finding or calls Live AI.</p></div>}
  </div>
}

function SelectedRequirementTrace({ requirement }: { requirement: Requirement }) {
  const workspace = useWorkspace()
  const changeNumber = workspace?.getChangeNumber()
  const [trace, setTrace] = useState<RequirementTrace | null>(null)
  const [coverageNames, setCoverageNames] = useState<string[]>([])
  const [error, setError] = useState(false)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    if (!workspace) return
    let current = true
    void loadSourceTraceability(workspace.repository, requirement.sourceId).then(async stored => {
      const result = await buildRequirementTraceability({ requirements: [requirement], coverageAreas: stored.areas, coverageLinks: stored.coverageLinks, testLinks: stored.testLinks,
        testCases: workspace.get('testCases').items, executions: workspace.get('executions').items, bugs: workspace.get('bugs').items, suites: workspace.get('testSuites').items })
      if (current) { setTrace(result.rows[0]); setCoverageNames(stored.areas.filter(area => result.rows[0].coverageAreaIds.includes(area.id)).map(area => area.name)); setError(false) }
    }).catch(() => { if (current) setError(true) })
    return () => { current = false }
  }, [requirement, workspace, revision, changeNumber])
  return <section className="requirement-decision" aria-label="Selected requirement traceability"><h5>QA decision & execution</h5>
    {error ? <p role="alert">Traceability could not be read. No saved link or approval was changed.</p> : trace ? <>
      <p className="helper-text"><strong>Saved coverage relationships:</strong> {coverageNames.join(' · ') || 'No current saved coverage relationship'}</p>
      <DecisionStrip className="decision-band" label="Requirement decision signals" items={[
        {label:'QA-confirmed tests',value:trace.confirmedTestIds.length,tone:trace.confirmedTestIds.length?'observed':'review'},
        {label:'Linked recorded failures',value:trace.failedTestIds.length,tone:trace.failedTestIds.length?'critical':'neutral',className:trace.failedTestIds.length?'decision-band__failure':undefined},
        {label:'Unverified results',value:trace.unverifiedExecutionIds.length,tone:trace.unverifiedExecutionIds.length?'review':'neutral'},
      ]} />
      <RequirementTraceDetails trace={trace} onChange={() => setRevision(value => value + 1)} />
    </> : <p role="status" className="helper-text">Reading saved traceability…</p>}
  </section>
}
