import type { ReactNode } from 'react'

type EvidenceQuoteProps = {
  quote: string
  location?: ReactNode
  historical?: boolean
}

/** A source quotation is a document, never an approval or a model confidence score. */
export function EvidenceQuote({ quote, location, historical = false }: EvidenceQuoteProps) {
  return <figure className={`evidence-quote${historical ? ' evidence-quote--historical' : ''}`}>
    <figcaption>
      <span><svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M14 3H5v18h14V8z M14 3v5h5 M8 12h8 M8 16h6" /></svg>{historical ? 'Historical source evidence' : 'Canonical source evidence'}</span>
      {location && <span className="evidence-quote__location">{location}</span>}
    </figcaption>
    <blockquote dir="auto">{quote}</blockquote>
  </figure>
}
