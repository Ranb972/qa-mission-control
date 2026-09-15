import type { QaSource } from '../../features/qa-sources/qaSourceTypes'
import type { AnalysisUnit, DocumentBlock, DocumentManifest, DocumentPage, DocumentSection, DocumentSnapshot } from '../../features/document-intelligence/documentTypes'
import type { StoredRecord, WorkspaceRepository } from './workspaceRepository'

const DOCUMENT_COLLECTIONS = ['documentPages', 'documentBlocks', 'documentSections', 'analysisUnits'] as const

export async function loadDocumentSnapshot(repository: WorkspaceRepository, sourceId: string): Promise<DocumentSnapshot | null> {
  const bundle = await repository.readSourceBundle(['documentManifests', ...DOCUMENT_COLLECTIONS], sourceId)
  const manifest = (bundle.documentManifests as StoredRecord<DocumentManifest>[])[0]
  if (!manifest) return null
  return {
    manifest: manifest.value,
    pages: bundle.documentPages.map((record) => record.value as DocumentPage),
    blocks: bundle.documentBlocks.map((record) => record.value as DocumentBlock),
    sections: bundle.documentSections.map((record) => record.value as DocumentSection),
    units: bundle.analysisUnits.map((record) => record.value as AnalysisUnit),
  }
}

/** Manifest + all normalized locations commit together, guarded by the source record's revision. */
export async function saveDocumentSnapshot(repository: WorkspaceRepository, snapshot: DocumentSnapshot, sourceVersion: number) {
  const sourceId = snapshot.manifest.sourceId
  const source = await repository.readRecord<QaSource>('sources', sourceId)
  if (!source || source.version !== sourceVersion || source.value.createdAt !== snapshot.manifest.sourceCreatedAt) {
    throw new Error('The source changed while its structure was being prepared. Rebuild for the current source.')
  }
  const previous = await Promise.all(DOCUMENT_COLLECTIONS.map((name) => repository.readSourceRecords(name, sourceId)))
  const collections = [
    snapshot.pages.map((value) => ({ id: `${sourceId}:page:${value.number}`, value })),
    snapshot.blocks.map((value) => ({ id: value.id, value })),
    snapshot.sections.map((value) => ({ id: value.id, value })),
    snapshot.units.map((value) => ({ id: value.id, value })),
  ]
  await repository.commit([
    { collection: 'documentManifests', put: [{ id: sourceId, sourceId, order: 0, value: snapshot.manifest }] },
    ...DOCUMENT_COLLECTIONS.map((collection, index) => {
      const rows = collections[index]
      const ids = new Set(rows.map((record) => record.id))
      return { collection, remove: previous[index].filter((record) => !ids.has(record.id)).map((record) => record.id),
        put: rows.map((record, order) => ({ ...record, order, sourceId })) }
    }),
  ], { recordChecks: [{ collection: 'sources', id: sourceId, version: sourceVersion }] })
}
