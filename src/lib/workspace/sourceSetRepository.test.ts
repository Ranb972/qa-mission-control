import { describe, expect, it, vi } from 'vitest'
import { deleteSourceSet, loadSourceSets, saveSourceSet } from './sourceSetRepository'
import type { StoredRecord, WorkspaceRepository } from './workspaceRepository'
import type { SourceSet } from '../../features/document-intelligence/sourceSetModel'
const value: SourceSet = { schemaVersion: 1, id: 'set', name: 'Commerce', description: '', members: [{ sourceId: 'a', sourceCreatedAt: '2026-01-01' }, { sourceId: 'b', sourceCreatedAt: '2026-01-01' }], createdAt: '2026-01-01', updatedAt: '2026-01-01' }
const record: StoredRecord<SourceSet> = { collection: 'sourceSets', id: 'set', order: 0, version: 7, value }
describe('guarded source-set persistence', () => {
  it('saves only explicit membership with source and set compare-and-swap checks', async () => {
    const commit = vi.fn().mockResolvedValue({})
    const repository = { commit, readRecord: vi.fn().mockImplementation((_name, id) => Promise.resolve({ id, version: 3, value: { createdAt: '2026-01-01' } })) } as unknown as WorkspaceRepository
    await saveSourceSet(repository, value, record)
    expect(commit.mock.calls[0][0]).toEqual([{ collection: 'sourceSets', put: [{ id: 'set', order: 0, value }] }])
    expect(commit.mock.calls[0][1].recordChecks).toEqual([{ collection: 'sourceSets', id: 'set', version: 7 }, { collection: 'sources', id: 'a', version: 3 }, { collection: 'sources', id: 'b', version: 3 }])
    await deleteSourceSet(repository, record)
    expect(commit.mock.calls[1][0]).toEqual([{ collection: 'sourceSets', remove: ['set'] }])
  })
  it('rejects missing or reincarnated members and corrupt saved sets without touching previous data', async () => {
    const commit = vi.fn()
    const repository = { commit, readRecord: vi.fn().mockResolvedValue({ value: { createdAt: 'another incarnation' } }), readCollection: vi.fn().mockResolvedValue({ version: 1, records: [{ ...record, value: { ...value, members: [] } }] }) } as unknown as WorkspaceRepository
    await expect(saveSourceSet(repository, value, record)).rejects.toThrow(/removed or replaced/)
    await expect(loadSourceSets(repository)).rejects.toThrow(/validated/)
    expect(commit).not.toHaveBeenCalled()
  })
  it('propagates atomic storage failure and does not retry or change source data', async () => {
    const commit = vi.fn().mockRejectedValue(new Error('Previously saved data was preserved.'))
    const repository = { commit, readRecord: vi.fn().mockImplementation((_name, id) => Promise.resolve({ id, version: 3, value: { createdAt: '2026-01-01' } })) } as unknown as WorkspaceRepository
    await expect(saveSourceSet(repository, value, record)).rejects.toThrow(/preserved/)
    expect(commit).toHaveBeenCalledTimes(1)
    expect(commit.mock.calls[0][0].map((change: { collection: string }) => change.collection)).toEqual(['sourceSets'])
  })
})
