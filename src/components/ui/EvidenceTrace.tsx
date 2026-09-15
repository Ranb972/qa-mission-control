type TraceStep = { label: string; detail: string; onSelect?: () => void }

/** Relationship navigation, not a progress bar or an assertion of approval. */
export function EvidenceTrace({ steps, label = 'Evidence trace' }: { steps: TraceStep[]; label?: string }) {
  return <ol className="qa-trace" aria-label={label}>
    {steps.map((step, index) => <li key={step.label}>
      <span className="qa-trace__anchor" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
      <div>{step.onSelect ? <button type="button" onClick={step.onSelect}>{step.label}</button> : <strong>{step.label}</strong>}<p>{step.detail}</p></div>
    </li>)}
  </ol>
}
