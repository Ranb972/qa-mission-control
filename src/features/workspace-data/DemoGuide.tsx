import type { AppView } from '../../components/layout/AppShell'
import { useWorkspace } from '../../lib/workspace/workspaceContext'
import { WorkspaceDataPanel } from './WorkspaceDataPanel'
import { EvidenceQuote } from '../../components/ui/EvidenceQuote'
import { EvidenceTrace } from '../../components/ui/EvidenceTrace'

export function DemoGuide({ onNavigate, hasWork = false }: { onNavigate?: (view: AppView) => void; hasWork?: boolean }) {
  const workspace = useWorkspace()
  if (!workspace || !onNavigate) return null
  const sources = workspace.get('sources').items
  const hasDemo = sources.some(source => source.id.startsWith('demo-northstar-source-'))
  if (!hasWork && !sources.length) return <WorkspaceDataPanel demoOnly />
  const source = sources.find(item => item.id.startsWith('demo-northstar-source-') && item.content.includes('Duplicate confirmation')) ?? sources[0]
  const lines = source?.content.split('\n') ?? []
  const line = hasDemo ? lines.findIndex(value => value.startsWith('**Requirement:** Duplicate confirmation')) : lines.findIndex(value => value.trim() && !value.startsWith('#'))
  const quote = (lines[line] ?? '').replace(/^\*\*Requirement:\*\* /, '')
  const excerpt = quote.length > 400
  return <section className="demo-guide" aria-label="Investigation route">
    <p className="meta-kicker">{hasDemo ? 'Northstar · NCP-CHK-005 · synthetic showcase' : 'Source evidence / start the investigation'}</p>
    {source && line >= 0 ? <div className="demo-guide__evidence"><EvidenceQuote quote={quote.slice(0, 400)} location={`${excerpt ? 'Excerpt · ' : ''}Line ${line + 1}`} /><p className="helper-text">{source.title} · Source text, not an approval.{!hasDemo && ' Verify its scope before linking it to a release.'}</p></div> : <p className="investigation-empty">Begin with a source. Its evidence gives every QA decision a reference.</p>}
    <div className="investigation-next"><button className="button button--primary" onClick={() => onNavigate('qa-sources')}>{source ? 'Inspect the evidence' : 'Review QA sources'}</button><p className="helper-text">AI suggests. QA approves. Browsing sends no AI request.</p></div>
    <EvidenceTrace steps={[
      { label: 'Source', detail: 'Inspect the canonical evidence.', onSelect: () => onNavigate('qa-sources') },
      { label: 'QA review', detail: 'Review the linked test design.', onSelect: () => onNavigate('test-cases') },
      { label: 'Execution', detail: 'Investigate recorded outcomes.', onSelect: () => onNavigate('executions') },
      { label: 'Release', detail: 'Review gaps before sign-off.', onSelect: () => onNavigate('release-report') },
    ]} />

    {!hasDemo && <details className="dashboard-demo-option"><summary>Explore a synthetic example</summary><WorkspaceDataPanel demoOnly /></details>}
  </section>
}
