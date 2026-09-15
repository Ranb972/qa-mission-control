import { useEffect, useState, type ReactNode } from 'react'
import { openWorkspaceRepository, type WorkspaceRepository } from './workspaceRepository'
import { initializeWorkspaceClient, type WorkspaceClient } from './workspaceClient'
import { WorkspaceContext } from './workspaceContext'

export function WorkspaceBootstrap({ children }: { children: ReactNode }) {
  const [client, setClient] = useState<WorkspaceClient | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let canceled = false
    let repository: WorkspaceRepository | undefined
    void (async () => {
      try {
        repository = await openWorkspaceRepository()
        if (canceled) { repository.close(); return }
        const loaded = await initializeWorkspaceClient(repository)
        if (canceled) repository.close()
        else setClient(loaded)
      } catch {
        repository?.close()
        if (!canceled) setError('Your workspace could not be opened safely. Existing browser data has not been deleted or replaced. Close other QA Mission Control tabs and retry. Do not clear browser storage.')
      }
    })()
    return () => { canceled = true; repository?.close() }
  }, [])
  if (error) return <main className="workspace-bootstrap"><h1>Workspace needs attention</h1><p role="alert">{error}</p><button type="button" onClick={() => window.location.reload()}>Retry opening workspace</button></main>
  if (!client) return <main className="workspace-bootstrap"><h1>QA Mission Control</h1><p role="status">Opening your local workspace…</p><p>Existing v1 data is preserved during the storage upgrade.</p></main>
  return <WorkspaceContext value={client}>{children}</WorkspaceContext>
}
