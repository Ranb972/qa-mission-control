import type { QaSource } from '../../features/qa-sources/qaSourceTypes'
import { parseSourceSet, type SourceSet } from '../../features/document-intelligence/sourceSetModel'
import type { StoredRecord, WorkspaceRepository } from './workspaceRepository'

export async function loadSourceSets(repository: WorkspaceRepository) {
  const loaded = await repository.readCollection<SourceSet>('sourceSets')
  const records = loaded.records.map((record) => {
    const value = parseSourceSet(record.value)
    if (!value || value.id !== record.id) throw new Error('A saved source set could not be validated. Existing data was preserved; restore a validated backup before modifying this set.')
    return { ...record, value }
  })
  return { ...loaded, records }
}
export async function saveSourceSet(repository: WorkspaceRepository, input: SourceSet, previous: StoredRecord<SourceSet> | null) {
  const value = parseSourceSet(input)
  if (!value || (previous && (value.id !== previous.id || value.createdAt !== previous.value.createdAt))) throw new Error('Choose a name and 1–100 distinct related sources before saving.')
  const sources = await Promise.all(value.members.map(async (member) => {
    const record = await repository.readRecord<QaSource>('sources', member.sourceId)
    if (!record || record.value.createdAt !== member.sourceCreatedAt) throw new Error('A selected source was removed or replaced. Review the current source list before saving this set.')
    return record
  }))
  await repository.commit([{ collection: 'sourceSets', put: [{ id: value.id, order: previous?.order ?? Date.now(), value }] }], {
    recordChecks: [{ collection: 'sourceSets', id: value.id, version: previous?.version ?? null }, ...sources.map((source) => ({ collection: 'sources', id: source.id, version: source.version }))],
  })
  return value
}
export async function deleteSourceSet(repository: WorkspaceRepository, record: StoredRecord<SourceSet>) {
  await repository.commit([{ collection: 'sourceSets', remove: [record.id] }], { recordChecks: [{ collection: 'sourceSets', id: record.id, version: record.version }] })
}
