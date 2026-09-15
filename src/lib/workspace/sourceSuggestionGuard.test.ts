import { afterEach, describe, expect, it, vi } from 'vitest'
import { createQaSource } from '../../test/qaSourceFactory'
import type { Requirement } from '../../features/document-intelligence/requirementModel'
import { AnalysisJobRepository, type PreparedAnalysis } from './analysisJobRepository'
import { sourceSuggestionGuard, SOURCE_SUGGESTION_BLOCKER } from './sourceSuggestionGuard'
import { CONFLICT_ERROR, type WorkspaceRepository } from './workspaceRepository'

afterEach(() => vi.restoreAllMocks())
const source = createQaSource({ id: 'a', content: 'Refund within 14 days.' })
function fixture(related = true) {
  const b = { ...source, id: 'b', content: 'Refund within 30 days.' }
  const sources = new Map([['a', source], ['b', b]])
  const findings = new Map([...sources].map(([id, value]) => [id, [{ id: `req-${id}`, sourceId: id, kind: 'requirement', summary: value.content, coverageTopic: 'Refund', evidence: { quote: value.content } } as Requirement]]))
  const prepare = vi.spyOn(AnalysisJobRepository.prototype, 'prepare').mockImplementation(async (id) => ({ source: sources.get(id), sourceVersion: 3, currentRequirements: findings.get(id) }) as PreparedAnalysis)
  const repository = { readRecord: vi.fn(async (_collection, id) => sources.has(id) ? { id, value: sources.get(id), version: 3 } : null), readMetadata: vi.fn(async () => 7), readSourceRecords: vi.fn(async () => [{}]), readCollection: vi.fn(async () => ({ version: 7, records: related ? [{ id: 'set', version: 7, order: 0, collection: 'sourceSets', value: { schemaVersion: 1, id: 'set', name: 'Related', description: '', members: [...sources].map(([id, value]) => ({ sourceId: id, sourceCreatedAt: value.createdAt })), createdAt: source.createdAt, updatedAt: source.updatedAt } }] : [] })) } as unknown as WorkspaceRepository
  return { repository, findings, prepare, sources }
}
describe('broad source suggestion safeguards', () => {
  it('blocks known related numeric conflicts without choosing a winning claim', async () => {
    const { repository } = fixture()
    await expect(sourceSuggestionGuard(repository, source)).rejects.toThrow(SOURCE_SUGGESTION_BLOCKER)
  })
  it('does not mix unrelated sources and returns atomic checks for approval', async () => {
    const { repository, prepare } = fixture(false)
    const checks = await sourceSuggestionGuard(repository, source)
    expect(prepare).toHaveBeenCalledTimes(1)
    expect(checks.recordChecks).toEqual([{ collection: 'sources', id: 'a', version: 3 }])
    expect(checks.collectionChecks).toHaveLength(3)
  })
  it('blocks a related ambiguity with the same coverage topic', async () => {
    const { repository, findings } = fixture()
    findings.get('b')![0].kind = 'ambiguity'
    await expect(sourceSuggestionGuard(repository, source)).rejects.toThrow(SOURCE_SUGGESTION_BLOCKER)
  })
  it('rejects source and analysis races instead of making the newer state authoritative', async () => {
    const { repository } = fixture(false)
    await expect(sourceSuggestionGuard(repository, { ...source, content: 'old text' })).rejects.toThrow(CONFLICT_ERROR)
    vi.mocked(repository.readMetadata).mockResolvedValueOnce(7).mockResolvedValueOnce(7).mockResolvedValue(8)
    await expect(sourceSuggestionGuard(repository, source)).rejects.toThrow(CONFLICT_ERROR)
  })
  it('does not substitute a recreated related source', async () => {
    const { repository, sources, findings } = fixture()
    const previousRead = repository.readCollection.bind(repository)
    const sets = await previousRead('sourceSets')
    vi.mocked(repository.readCollection).mockResolvedValue(sets)
    sources.set('b', { ...sources.get('b')!, createdAt: '2026-09-06T10:00:00Z' })
    findings.get('b')![0].kind = 'ambiguity'
    await expect(sourceSuggestionGuard(repository, source)).resolves.toMatchObject({ recordChecks: [{ collection: 'sources', id: 'a', version: 3 }, { collection: 'sources', id: 'b', version: 3 }] })
  })
})
