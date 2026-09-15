import type { AppView } from '../../components/layout/AppShell'
import { EvidenceTrace } from '../../components/ui/EvidenceTrace'

export function CoverageWorkflow() {
  return <EvidenceTrace label="Source to test workflow" steps={[
    { label: 'Source', detail: 'Save a specification or user story. Review its text and scope.' },
    { label: 'Evidence', detail: 'Check what the source actually says. Keep ambiguity visible.' },
    { label: 'Coverage', detail: 'Review proposed test areas and the evidence behind them.' },
    { label: 'Test Cases', detail: 'Approve useful designs before adding executable tests.' },
  ]} />
}

export function CoverageStart({ onNavigate }: { onNavigate?: (view: AppView) => void }) {
  return <section className="page page--coverage-start">
    <div className="page-heading"><p className="meta-kicker">Plan & design / AI Coverage</p><h2>AI Coverage Workspace</h2><p>Turn source evidence into a test plan you can review and defend.</p></div>
    <section className="coverage-start" aria-labelledby="coverage-start-heading">
      <div className="coverage-start__lead"><p className="meta-kicker">Start with the specification</p><h3 id="coverage-start-heading">Every test needs a reason.<br />Begin with the evidence.</h3><p>AI Coverage suggests test areas, exposes questions and drafts Test Cases from your saved QA Sources. You decide what belongs in the test library.</p>
        {onNavigate && <div className="button-row"><button className="button button--primary" onClick={() => onNavigate('qa-sources')}>Go to Sources</button><button className="button button--secondary" onClick={() => onNavigate('dashboard')}>Explore the demo</button></div>}
        <p className="helper-text">The synthetic demo includes sources, evidence and reviewed tests. Load it from Dashboard after confirming workspace replacement. No API key is needed.</p>
      </div>
      <aside className="coverage-start__preparation" aria-label="Prepare a QA Source"><p className="meta-kicker">Before analysis</p><h4>Give coverage a reliable reference.</h4><ol><li><strong>Save your source.</strong> Paste a requirement or import a specification in Sources.</li><li><strong>Review the text.</strong> Correct extraction gaps and check that the intended scope is present.</li><li><strong>Choose it here.</strong> A saved revision keeps suggested coverage tied to the source you reviewed.</li></ol><p className="helper-text">Review is your judgment; a saved source or an AI suggestion is not QA approval.</p></aside>
      <div className="coverage-start__workflow"><CoverageWorkflow /><p className="helper-text">Browsing and reviewing saved evidence sends nothing to AI. Only an explicit Analyze or Generate action contacts a configured provider.</p></div>
    </section>
  </section>
}
