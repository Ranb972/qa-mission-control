import type { WorkspaceBackup } from './workspaceBackup'

export function processWorkspacePackage(operation: 'validate', value: string, signal?: AbortSignal): Promise<WorkspaceBackup>
export function processWorkspacePackage(operation: 'demo', value: null, signal?: AbortSignal): Promise<WorkspaceBackup>
export function processWorkspacePackage(operation: 'restore', value: { backup: WorkspaceBackup; expected: Record<string, number> }): Promise<null>
export function processWorkspacePackage(operation: 'export_current' | 'requirements_csv_current', value: null, signal?: AbortSignal): Promise<string>
export function processWorkspacePackage(operation: 'export' | 'requirements_csv', value: WorkspaceBackup, signal?: AbortSignal): Promise<string>
export function processWorkspacePackage(operation: 'validate' | 'export' | 'requirements_csv' | 'demo' | 'restore' | 'export_current' | 'requirements_csv_current', value: unknown, signal?: AbortSignal): Promise<WorkspaceBackup | string | null> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./workspaceBackup.worker.ts', import.meta.url), { type: 'module' })
    const finish = () => { worker.terminate(); signal?.removeEventListener('abort', cancel) }
    const cancel = () => { finish(); reject(new Error('Workspace transfer canceled. Saved data is unchanged.')) }
    worker.onmessage = (event) => { finish(); if (event.data.ok) resolve(event.data.value); else reject(new Error(event.data.error)) }
    worker.onerror = () => { finish(); reject(new Error(operation === 'restore' ? 'Restore completion could not be confirmed. Reload to inspect the saved workspace before trying again; replacement is atomic.' : 'Workspace validation could not finish. Saved data is unchanged.')) }
    signal?.addEventListener('abort', cancel, { once: true })
    if (signal?.aborted) cancel()
    else worker.postMessage({ operation, value })
  })
}
