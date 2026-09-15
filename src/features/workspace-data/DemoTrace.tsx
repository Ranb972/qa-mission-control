/** Orientation only: these stages do not represent a completed approval. */
export function DemoTrace() {
  return <ol className="demo-trace" aria-label="Traceable QA workflow">
    {['Source', 'Evidence', 'QA review', 'Release'].map((stage, index) => <li key={stage}><span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>{stage}</li>)}
  </ol>
}
