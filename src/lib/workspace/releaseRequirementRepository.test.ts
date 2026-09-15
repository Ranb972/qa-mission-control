import { describe, expect, it, vi } from 'vitest'
import { createRelease } from '../../test/releaseFactory'
import type { SourceSetReview } from '../../features/document-intelligence/sourceSetIntelligence'
import { makeReleaseRequirementBaseline } from '../../features/release-report/releaseRequirements'
import { loadReleaseRequirementBaseline, saveReleaseRequirementBaseline } from './releaseRequirementRepository'
import type { WorkspaceRepository } from './workspaceRepository'

const release = createRelease({ id: 'release', createdAt: '2026-01-02' })
const review = { set: { id: 'set', createdAt: '2026-01-01', members: [{ sourceId: 'source', sourceCreatedAt: '2026-01-01' }] }, requirements: [], guards: {
  recordChecks: [{ collection: 'sources', id: 'source', version: 5 }], collectionChecks: [{ collection: 'requirements', version: 3 }],
} } as unknown as SourceSetReview
const previous = { collection: 'releaseRequirementBaselines', id: release.id, order: 0, version: 7, value: makeReleaseRequirementBaseline(release, review) }
const mock = (saved: unknown = previous) => ({ commit: vi.fn().mockResolvedValue({}), readRecord: vi.fn().mockImplementation((name) => Promise.resolve(name === 'releases' ? { value: release, version: 2 } : saved)) })

describe('release baseline transactional persistence', () => {
  it('preserves source, analysis, release and previous baseline guards in one baseline-only write', async () => {
    const repository = mock()
    await saveReleaseRequirementBaseline(repository as unknown as WorkspaceRepository, release, review, previous)
    expect(repository.commit).toHaveBeenCalledTimes(1)
    expect(repository.commit.mock.calls[0][0].map((change: { collection: string }) => change.collection)).toEqual(['releaseRequirementBaselines'])
    expect(repository.commit.mock.calls[0][1]).toEqual({ collectionChecks: review.guards.collectionChecks, recordChecks: [...review.guards.recordChecks!, { collection: 'releases', id: release.id, version: 2 }, { collection: 'releaseRequirementBaselines', id: release.id, version: 7 }] })
    repository.commit.mockRejectedValueOnce(new Error('Atomic save failed; previous data preserved.'))
    await expect(saveReleaseRequirementBaseline(repository as unknown as WorkspaceRepository, release, review, previous)).rejects.toThrow(/preserved/)
    expect(repository.commit).toHaveBeenCalledTimes(2)
  })
  it('does not inherit a reincarnated release baseline, but permits a guarded explicit new capture', async () => {
    const orphan = { ...previous, value: { ...previous.value, releaseCreatedAt: '2026-01-01' } }
    const repository = mock(orphan)
    expect(await loadReleaseRequirementBaseline(repository as unknown as WorkspaceRepository, release)).toBeNull()
    await saveReleaseRequirementBaseline(repository as unknown as WorkspaceRepository, release, review, null)
    expect(repository.commit.mock.calls[0][1].recordChecks.at(-1)).toEqual({ collection: 'releaseRequirementBaselines', id: release.id, version: 7 })
  })
  it('rejects unseen concurrent baselines, corrupt data and removed releases without writes', async () => {
    const repository = mock()
    await expect(saveReleaseRequirementBaseline(repository as unknown as WorkspaceRepository, release, review, null)).rejects.toThrow(/changed/)
    repository.readRecord.mockResolvedValueOnce({ ...previous, value: {} })
    await expect(loadReleaseRequirementBaseline(repository as unknown as WorkspaceRepository, release)).rejects.toThrow(/validated/)
    repository.readRecord.mockResolvedValueOnce(null)
    await expect(saveReleaseRequirementBaseline(repository as unknown as WorkspaceRepository, release, review, previous)).rejects.toThrow(/removed/)
    expect(repository.commit).not.toHaveBeenCalled()
  })
})
