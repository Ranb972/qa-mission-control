import { BACKUP_MAX_BYTES, parseWorkspaceBackup, validateWorkspaceBackup } from './workspaceBackup'
import { buildDemoWorkspace } from '../../features/workspace-data/demoWorkspace'
import { exportRequirementHistoryCsv } from '../../features/workspace-data/requirementExport'
import { captureWorkspaceBackup, restoreValidatedWorkspace } from './workspaceBackupRepository'
import { CONFLICT_ERROR, STORAGE_ERROR, openWorkspaceRepository } from './workspaceRepository'
import { object } from './portableSchemas'

self.onmessage = async (event: MessageEvent<{ operation: 'validate' | 'export' | 'demo' | 'requirements_csv' | 'restore' | 'export_current' | 'requirements_csv_current'; value: unknown }>) => {
  try {
    if (event.data.operation === 'demo') { self.postMessage({ ok: true, value: await buildDemoWorkspace() }); return }
    if (event.data.operation === 'restore') {
      const input = object(event.data.value)
      const backup = await validateWorkspaceBackup(input.backup)
      const repository = await openWorkspaceRepository()
      try { await restoreValidatedWorkspace(repository, backup, object(input.expected) as Record<string, number>) }
      finally { repository.close() }
      self.postMessage({ ok: true, value: null }); return
    }
    if (event.data.operation === 'validate') {
      if (typeof event.data.value !== 'string') throw new Error('Choose a supported workspace JSON package.')
      const backup = await parseWorkspaceBackup(event.data.value)
      self.postMessage({ ok: true, value: backup })
    } else {
      let input = event.data.value
      if (['export_current', 'requirements_csv_current'].includes(event.data.operation)) {
        const repository = await openWorkspaceRepository()
        try { input = await captureWorkspaceBackup(repository) } finally { repository.close() }
      }
      const backup = await validateWorkspaceBackup(input)
      const text = ['requirements_csv', 'requirements_csv_current'].includes(event.data.operation) ? exportRequirementHistoryCsv(backup) : JSON.stringify(backup)
      if (new TextEncoder().encode(text).byteLength > BACKUP_MAX_BYTES) throw new Error('This workspace exceeds the 256 MB portable package limit. No saved data was changed.')
      self.postMessage({ ok: true, value: text })
    }
  } catch (reason) {
    const message = reason instanceof Error && [CONFLICT_ERROR, STORAGE_ERROR].includes(reason.message) ? reason.message : 'The workspace package could not be validated within its supported limits. No saved data was changed. Use an unmodified QA Mission Control backup (up to 256 MB).'
    self.postMessage({ ok: false, error: message })
  }
}
