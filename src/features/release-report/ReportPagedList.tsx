import { useState, type ReactNode } from 'react'
import { CollectionPager } from '../../components/ui/CollectionPager'

/** Screen/print preview is bounded; the complete inventory remains in the Markdown export. */
export function ReportPagedList<T>({ items, label, children }: { items: T[]; label: string; children: (items: T[]) => ReactNode }) {
  const [page, setPage] = useState(0)
  const current = Math.min(page, Math.max(0, Math.ceil(items.length / 40) - 1))
  return <><CollectionPager label={label} page={current} pageSize={40} total={items.length} onPageChange={setPage} />
    {items.length > 40 && <p className="helper-text">Preview: {current * 40 + 1}–{Math.min((current + 1) * 40, items.length)} of {items.length.toLocaleString()}. The Markdown export contains every item.</p>}
    {children(items.slice(current * 40, (current + 1) * 40))}</>
}
