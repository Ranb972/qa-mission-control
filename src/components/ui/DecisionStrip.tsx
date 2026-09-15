import type { ReactNode } from 'react'

type DecisionSignal = {
  label: string
  value: ReactNode
  tone?: 'neutral' | 'review' | 'observed' | 'critical' | 'historical'
  className?: string
}

/** Named, independent observations. A signal never implies the next stage is approved. */
export function DecisionStrip({ items, label, className = '' }: { items: DecisionSignal[]; label: string; className?: string }) {
  return <dl className={`qa-decision-strip ${className}`} aria-label={label}>
    {items.map(item => <div key={item.label} data-tone={item.tone ?? 'neutral'} className={item.className}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}
  </dl>
}
