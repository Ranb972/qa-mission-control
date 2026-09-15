import { useEffect, useState } from 'react'
import { useWorkspace } from '../../lib/workspace/workspaceContext'
import { parseActivityLedger, type ActivityLedger } from '../../lib/workspace/workspaceHistory'
import type { AppView } from '../../components/layout/AppShell'

/** Read existing saved activity only. Demo imports do not invent an event history. */
export function DashboardActivity({ onNavigate }: { onNavigate?: (view: AppView) => void }) {
  const workspace = useWorkspace()
  const changeNumber = workspace?.getChangeNumber()
  const [ledger, setLedger] = useState<ActivityLedger | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    let current = true
    workspace?.repository.readRecord('workspaceHistory', 'recent').then(record => {
      const value = record ? parseActivityLedger(record.value) : { id: 'recent' as const, events: [] }
      if (!value) throw Error('Invalid history')
      if (current) setLedger(value)
    }).catch(() => { if (current) setError(true) })
    return () => { current = false }
  }, [workspace, changeNumber])
  if (!workspace) return null
  return <section className="dashboard-activity" aria-label="Recent workspace changes"><div><h3>What changed</h3><p className="helper-text">Saved local operations · counts are changed records, not approved coverage.</p></div>
    {error ? <p role="alert">Recent activity could not be read. Saved work is unchanged.</p> : ledger?.events.length ? <ol>{ledger.events.slice(0, 3).map(event => <li key={event.id}><time dateTime={event.at}>{new Date(event.at).toLocaleString()}</time><span>{event.items.map(item => `${item.category.replaceAll('_', ' ')} ${item.action} · ${item.count}`).join(' / ')}</span></li>)}</ol> : <p className="helper-text">{ledger ? 'No new operations recorded. Earlier activity is not reconstructed.' : 'Reading local activity…'}</p>}
    {onNavigate && <button className="button button--secondary" onClick={() => onNavigate('import')}>Inspect local activity</button>}
  </section>
}
