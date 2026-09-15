import { BACKUP_COLLECTIONS, PORTABLE_COLLECTIONS, type WorkspaceBackup } from './workspaceBackup'
import { REBUILT_COLLECTIONS } from './portableSchemas'
import type { WorkspaceRepository } from './workspaceRepository'
import type { AnalysisJob, AnalysisTask } from '../../features/document-intelligence/analysisJobModel'
import { LEGACY_MIGRATION_MARKER } from './workspaceMigration'

export async function captureWorkspaceBackup(repository: WorkspaceRepository): Promise<WorkspaceBackup> {
  const snapshot = await repository.readCollectionsSnapshot(PORTABLE_COLLECTIONS)
  return { format: 'qa-mission-control-workspace', version: 1, exportedAt: new Date().toISOString(), collections: Object.fromEntries(PORTABLE_COLLECTIONS.map((name) => [name,
    snapshot[name].records.map(({ id, order, value, sourceId }) => ({ id, order, value, ...(sourceId ? { sourceId } : {}) })),
  ])) }
}
export async function workspaceRestoreVersions(repository: WorkspaceRepository) {
  return Object.fromEntries(await Promise.all(BACKUP_COLLECTIONS.map(async (name) => [name, await repository.readMetadata<number>(`collection:${name}`) ?? 0]))) as Record<string, number>
}
/** Input has passed the dedicated validator worker. Explicit replacement is one atomic CAS transaction. */
export async function restoreValidatedWorkspace(repository: WorkspaceRepository, backup: WorkspaceBackup, expected: Record<string, number>) {
  if (BACKUP_COLLECTIONS.some((name) => !Number.isSafeInteger(expected[name]) || expected[name] < 0)) throw new Error('Refresh the restore preview before replacing the workspace.')
  const collections = { ...backup.collections }
  collections.analysisJobs = collections.analysisJobs.map((record) => {
    const job = record.value as AnalysisJob
    return { ...record, value: { ...job, sourceVersion: expected.sources + 1, status: ['running', 'prepared'].includes(job.status) ? 'paused' : job.status } }
  })
  collections.analysisTasks = collections.analysisTasks.map((record) => {
    const task = record.value as AnalysisTask
    return ['running', 'retrying'].includes(task.status) ? { ...record, value: { ...task, status: 'pending', nextAttemptAt: null } } : record
  })
  await repository.commit([
    ...PORTABLE_COLLECTIONS.map((collection) => ({ collection, replace: true, put: collections[collection] })),
    ...REBUILT_COLLECTIONS.map((collection) => ({ collection, replace: true, put: [] })),
  ], { collectionChecks: BACKUP_COLLECTIONS.map((collection) => ({ collection, version: expected[collection] })),
    metadata: [{ id: LEGACY_MIGRATION_MARKER, value: { version: 1, migratedAt: new Date().toISOString(), warnings: [], counts: Object.fromEntries(PORTABLE_COLLECTIONS.map((name) => [name, collections[name].length])) } }] })
}
