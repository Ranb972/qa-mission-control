import { CORE_COLLECTIONS, coreRecordId, readLegacyWorkspace, validateCoreCollection } from './workspaceSchema'
import { CONFLICT_ERROR, type WorkspaceRepository } from './workspaceRepository'

export const LEGACY_MIGRATION_MARKER = 'migration:v1-localStorage'
export type MigrationReceipt = { version: 1; migratedAt: string; warnings: string[]; counts: Record<string, number> }

export async function migrateLegacyWorkspace(repository: WorkspaceRepository): Promise<MigrationReceipt> {
  const completed = await repository.readMetadata<MigrationReceipt>(LEGACY_MIGRATION_MARKER)
  if (completed) return completed
  const legacy = readLegacyWorkspace()
  const counts: Record<string, number> = {}
  const changes = CORE_COLLECTIONS.map((collection) => {
    const records = validateCoreCollection(collection, legacy.data[collection])
    counts[collection] = records.length
    return { collection, put: records.map((value, order) => ({ id: coreRecordId(collection, value), value, order })) }
  })
  const receipt: MigrationReceipt = { version: 1, migratedAt: new Date().toISOString(), warnings: legacy.warnings, counts }
  try {
    await repository.commit(changes, {
      collectionChecks: CORE_COLLECTIONS.map((collection) => ({ collection, version: 0 })),
      metadata: [{ id: LEGACY_MIGRATION_MARKER, value: receipt }],
    })
  } catch (error) {
    // Two tabs may bootstrap together; only the transaction winner imports legacy data.
    if (error instanceof Error && error.message === CONFLICT_ERROR) {
      const winner = await repository.readMetadata<MigrationReceipt>(LEGACY_MIGRATION_MARKER)
      if (winner) return winner
    }
    throw error
  }
  return receipt
}
