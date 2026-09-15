type Props = { label: string; page: number; pageSize: number; total: number; onPageChange: (page: number) => void }

export function CollectionPager({ label, page, pageSize, total, onPageChange }: Props) {
  if (total <= pageSize) return null
  const lastPage = Math.max(0, Math.ceil(total / pageSize) - 1)
  const current = Math.min(page, lastPage)
  return <nav className="collection-pager" aria-label={label}>
    <span>{current * pageSize + 1}–{Math.min((current + 1) * pageSize, total)} of {total.toLocaleString()}</span>
    <div className="button-row">
      <button type="button" className="button button--secondary button--compact" disabled={current === 0} onClick={() => onPageChange(current - 1)}>Previous</button>
      <button type="button" className="button button--secondary button--compact" disabled={current === lastPage} onClick={() => onPageChange(current + 1)}>Next</button>
    </div>
  </nav>
}
