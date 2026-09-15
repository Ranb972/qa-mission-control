import type { Release } from '../../features/releases/releaseTypes'
import { makeReleaseRequirementBaseline, parseReleaseRequirementBaseline, type ReleaseRequirementBaseline } from '../../features/release-report/releaseRequirements'
import type { SourceSetReview } from '../../features/document-intelligence/sourceSetIntelligence'
import type { StoredRecord, WorkspaceRepository } from './workspaceRepository'
export async function loadReleaseRequirementBaseline(repository: WorkspaceRepository, release: Release): Promise<StoredRecord<ReleaseRequirementBaseline> | null> {
  const record = await repository.readRecord<ReleaseRequirementBaseline>('releaseRequirementBaselines', release.id)
  if (!record) return null
  const value = parseReleaseRequirementBaseline(record.value)
  if (!value || value.id !== release.id) throw new Error('The saved requirement baseline could not be validated. Existing release data is preserved.')
  if (value.releaseCreatedAt !== release.createdAt) return null
  return { ...record, value }
}
export async function saveReleaseRequirementBaseline(repository: WorkspaceRepository, release: Release, review: SourceSetReview, previous: StoredRecord<ReleaseRequirementBaseline> | null) {
  const record = await repository.readRecord<Release>('releases', release.id)
  if (!record || record.value.createdAt !== release.createdAt) throw new Error('The release was removed or replaced. Reopen the current release before setting its source baseline.')
  // A reused release ID must not inherit an earlier release's authority. Its
  // explicit first capture may replace that orphan, guarded by its exact version.
  const existing = previous ?? await repository.readRecord<ReleaseRequirementBaseline>('releaseRequirementBaselines', release.id)
  if (!previous && existing) {
    const earlier = parseReleaseRequirementBaseline(existing.value)
    if (!earlier || earlier.releaseCreatedAt === release.createdAt) throw new Error('The release baseline changed. Refresh the report before explicitly replacing it.')
  }
  const value = parseReleaseRequirementBaseline(makeReleaseRequirementBaseline(release, review))
  if (!value) throw new Error('This source baseline exceeded the validated limits. Existing release data is unchanged.')
  await repository.commit([{ collection: 'releaseRequirementBaselines', put: [{ id: value.id, order: 0, value }] }], {
    ...review.guards, recordChecks: [...review.guards.recordChecks ?? [], { collection: 'releases', id: release.id, version: record.version },
      { collection: 'releaseRequirementBaselines', id: release.id, version: existing?.version ?? null }],
  })
  return value
}
