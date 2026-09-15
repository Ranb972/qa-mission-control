import { useState } from 'react'
import type { QaSource } from '../qa-sources/qaSourceTypes'
import { DocumentIntelligencePanel } from '../document-intelligence/DocumentIntelligencePanel'
import type { AppView } from '../../components/layout/AppShell'

/** Reads canonical saved requirements and real QA links; no second or simulated AI plan. */
export function SavedCoverageWorkspace({ sources, onNavigate, onOpenPlanner }: { sources: QaSource[]; onNavigate?: (view: AppView) => void; onOpenPlanner: () => void }) {
  const [selectedId, setSelectedId] = useState(sources[0]?.id)
  const selected = sources.find(source => source.id === selectedId) ?? sources[0]
  return <section className="page page--ai-coverage page--saved-coverage">
    <div className="page-heading"><p className="meta-kicker">Northstar / synthetic saved coverage</p><h2>AI Coverage Workspace</h2><p>Inspect source-backed coverage, reviewed tests, gaps and recorded failures. This deterministic Demo is curated synthetic data; no provider result is being simulated.</p></div>
    <div className="coverage-evidence-entry"><div><p className="meta-kicker">Start with NCP-CHK-005</p><p>Open Checkout integrity to follow four reviewed scenarios and the duplicate-order failure. Topic links describe planned scope; most requirements still have no confirmed test.</p></div>{onNavigate && <button className="button button--secondary" onClick={() => onNavigate('qa-sources')}>Review source evidence</button>}</div>
    <label className="field-group">Coverage source<select className="select" value={selected.id} onChange={event => setSelectedId(event.target.value)}>{sources.map(source => <option key={source.id} value={source.id}>{source.title}</option>)}</select></label>
    <DocumentIntelligencePanel key={`${selected.id}:${selected.updatedAt}`} source={selected} initialView="coverage" />
    <div className="panel"><h3>Optional AI planning</h3><p>New AI suggestions require a configured provider and explicit review. Browsing the saved Demo above makes no provider requests.</p><button className="button button--secondary" onClick={onOpenPlanner}>Open optional AI planner</button></div>
  </section>
}
