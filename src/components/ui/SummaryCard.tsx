type SummaryCardTone = 'neutral' | 'positive' | 'warning' | 'critical'

type SummaryCardProps = {
  label: string
  value: number | string
  description: string
  tone?: SummaryCardTone
}

export function SummaryCard({
  label,
  value,
  description,
  tone = 'neutral',
}: SummaryCardProps) {
  return (
    <section className={`summary-card summary-card--${tone}`} aria-label={label}>
      <p className="summary-card__label">{label}</p>
      <p className="summary-card__value">{value}</p>
      <p className="summary-card__description">{description}</p>
    </section>
  )
}
