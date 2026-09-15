import { useEffect, useState } from 'react'
import { CollectionPager } from '../../components/ui/CollectionPager'
import { useWorkspace } from '../../lib/workspace/workspaceContext'
import { HISTORY_CATEGORIES, HISTORY_LIMIT, parseActivityLedger, type ActivityLedger } from '../../lib/workspace/workspaceHistory'

const label = (value: string) => value.replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase())
export function WorkspaceHistoryPanel() {
  const workspace = useWorkspace()
  const [ledger, setLedger] = useState<ActivityLedger | null>(null)
  const [error, setError] = useState('')
  const [category, setCategory] = useState('all')
  const [page, setPage] = useState(0)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let current = true
    workspace?.repository.readRecord('workspaceHistory', 'recent').then((record) => {
      const next = record ? parseActivityLedger(record.value) : { id: 'recent' as const, events: [] }
      if (!next) throw new Error('Invalid activity')
      if (current) { setLedger(next); setError('') }
    }).catch(() => { if (current) setError('Local activity could not be read. No saved data was changed.') })
    return () => { current = false }
  }, [workspace, revision])
  const events = ledger?.events.filter((event) => category === 'all' || event.items.some((item) => item.category === category)) ?? []
  const currentPage = Math.min(page, Math.max(0, Math.ceil(events.length / 20) - 1))
  return <section className="panel workspace-history" aria-label="Local workspace activity"><header className="panel-heading"><div><p className="meta-kicker">Workspace record</p><h3>Recent QA activity</h3></div><button className="button button--secondary button--compact" onClick={() => setRevision((value) => value + 1)}>Refresh activity</button></header><p className="helper-text">The latest {HISTORY_LIMIT} saved operations on this browser workspace. Counts describe changed records—not requirements covered or tests passed. No source bodies, prompts or provider responses are recorded. This local history is not a signed compliance audit.</p><label className="field-group">Activity category<select className="select" value={category} onChange={(event) => { setCategory(event.target.value); setPage(0) }}><option value="all">All activity</option>{HISTORY_CATEGORIES.map((value) => <option key={value} value={value}>{label(value)}</option>)}</select></label>{error && <p role="alert" className="feedback feedback--error">{error}</p>}<CollectionPager page={currentPage} pageSize={20} total={events.length} onPageChange={setPage} label="Activity pages" /><ol className="workspace-history__list">{events.slice(currentPage * 20, (currentPage + 1) * 20).map((event) => <li key={event.id}><time dateTime={event.at}>{new Date(event.at).toLocaleString()}</time><span>{event.items.map((item) => `${label(item.category)} ${item.action} · ${item.count.toLocaleString()}`).join(' / ')}</span></li>)}</ol>{!events.length && <p className="document-empty">{ledger ? 'No saved operations match this view. Activity begins with new work; earlier history is not invented.' : 'Reading local activity…'}</p>}</section>
}
