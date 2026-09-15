import { describe, expect, it, vi } from 'vitest'
import { createQaSource } from '../../test/qaSourceFactory'
import { buildDocumentSnapshot } from '../document-intelligence/documentSegmentation'
import { materializeRequirements } from '../document-intelligence/requirementModel'
import { importRepositoryEvidence } from './repositoryImport'
import { projectionDocumentImport } from './productProjection'
import { evidenceReviewId, parseEvidenceReview, reviewIsCurrent, saveEvidenceReview, type EvidenceReview } from './evidenceReview'
import type { PreparedAnalysis } from '../../lib/workspace/analysisJobRepository'
import type { WorkspaceRepository } from '../../lib/workspace/workspaceRepository'
import { PORTABLE_COLLECTIONS, validateWorkspaceBackup } from '../../lib/workspace/workspaceBackup'

async function fixture() {
  const source = createQaSource({ content: '# Session\nSessions timeout after 30 minutes.' })
  const snapshot = await buildDocumentSnapshot(source)
  const [requirement] = await materializeRequirements(source, snapshot, snapshot.units[0], { version: 1, findings: [{ kind: 'requirement', summary: 'Session timeout', quote: 'Sessions timeout after 30 minutes.', occurrence: 0, coverage: 'Sessions' }], limitations: [] }, source.createdAt)
  const projection = await importRepositoryEvidence([{ name: 'session.ts', text: 'export const SESSION_TIMEOUT_MINUTES = 90;' }])
  const evidence = createQaSource({ id: 'repo', content: projection.content, documentImport: await projectionDocumentImport(projection) })
  const prepared = { source, sourceVersion: 7, currentRequirements: [requirement], requirementVersion: 4, intelligenceVersion: 5 } as PreparedAnalysis
  const record = { collection: 'sources', id: evidence.id, order: 0, version: 3, value: evidence }
  return { source, requirement, evidence, prepared, record, projection }
}
describe('QA-owned product evidence decisions', () => {
  it('binds explicit review to both source incarnations, exact requirement and current storage versions', async () => {
    const f = await fixture(); const commit = vi.fn().mockResolvedValue({ productEvidenceReviews: 1 })
    const review = await saveEvidenceReview({ commit } as unknown as WorkspaceRepository, f.prepared, f.record, f.requirement, [f.projection.manifest.clues[0].id], 'potential_difference', 'Verify deployment timeout.', null)
    expect(reviewIsCurrent(review, f.evidence, f.requirement)).toBe(true)
    expect(reviewIsCurrent(review, { ...f.evidence, createdAt: '2030-01-01' }, f.requirement)).toBe(false)
    expect(reviewIsCurrent(review, f.evidence, { ...f.requirement, fingerprint: '0'.repeat(64) })).toBe(false)
    expect(commit.mock.calls[0][1]).toEqual({ recordChecks: [{ collection: 'sources', id: 'repo', version: 3 }, { collection: 'sources', id: f.source.id, version: 7 }, { collection: 'productEvidenceReviews', id: review.id, version: null }], collectionChecks: [{ collection: 'requirements', version: 4 }, { collection: 'unitIntelligence', version: 5 }] })
    expect(JSON.stringify(review)).not.toMatch(/approval|rawResponse|SESSION_TIMEOUT_MINUTES/)
    await expect(saveEvidenceReview({ commit } as unknown as WorkspaceRepository, f.prepared, f.record, f.requirement, ['provider-clue'], 'related_evidence', '', null)).rejects.toThrow()
    expect(commit).toHaveBeenCalledTimes(1)
  })
  it('validates projection provenance and review identities across backup, while accepting pre-extension backups', async () => {
    const f = await fixture()
    const commit = vi.fn().mockResolvedValue({})
    const review = await saveEvidenceReview({ commit } as unknown as WorkspaceRepository, f.prepared, f.record, f.requirement, [], 'dismissed', '', null)
    const collections = Object.fromEntries(PORTABLE_COLLECTIONS.map((name) => [name, []])) as Record<string, { id: string; order: number; sourceId?: string; value: unknown }[]>
    collections.sources = [f.source, f.evidence].map((value, order) => ({ id: value.id, order, value }))
    collections.requirements = [{ id: f.requirement.id, order: 0, sourceId: f.source.id, value: f.requirement }]
    collections.productEvidenceReviews = [{ id: review.id, order: 0, sourceId: f.evidence.id, value: review }]
    const backup = { format: 'qa-mission-control-workspace', version: 1, exportedAt: f.source.createdAt, collections }
    expect((await validateWorkspaceBackup(backup)).collections.productEvidenceReviews).toHaveLength(1)
    expect(review.id).toBe(await evidenceReviewId(review))
    expect(parseEvidenceReview({ ...review, approval: true })).toBeNull()
    expect(parseEvidenceReview({ ...review, note: 'x'.repeat(601) })).toBeNull()
    ;(collections.productEvidenceReviews[0].value as EvidenceReview).id = 'provider-review'
    await expect(validateWorkspaceBackup(backup)).rejects.toThrow()
    delete collections.productEvidenceReviews
    expect((await validateWorkspaceBackup(backup)).collections.productEvidenceReviews).toEqual([])
    const clue = f.evidence.documentImport!.productEvidence!.clues[0]
    clue.origin.line = 2
    await expect(validateWorkspaceBackup(backup)).rejects.toThrow()
  })
})
