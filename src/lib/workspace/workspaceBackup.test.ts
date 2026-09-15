import { describe, expect, it } from 'vitest'
import { buildDocumentSnapshot } from '../../features/document-intelligence/documentSegmentation'
import { materializeRequirements } from '../../features/document-intelligence/requirementModel'
import type { Requirement } from '../../features/document-intelligence/requirementModel'
import { fingerprint } from '../../features/document-intelligence/documentFingerprint'
import { createQaSource } from '../../test/qaSourceFactory'
import { PORTABLE_COLLECTIONS, parseWorkspaceBackup, validateWorkspaceBackup, type WorkspaceBackup } from './workspaceBackup'

async function fixture(): Promise<WorkspaceBackup> {
  const source = createQaSource({ content: '# Access\nSessions must expire after 30 minutes.' })
  const snapshot = await buildDocumentSnapshot(source)
  const unit = snapshot.units[0]
  const requirements = await materializeRequirements(source, snapshot, unit, { version: 1, findings: [{ kind: 'requirement', summary: 'Sessions must expire after 30 minutes.', quote: 'Sessions must expire after 30 minutes.', occurrence: 0, coverage: 'Session' }], limitations: [] }, source.createdAt)
  const collections = Object.fromEntries(PORTABLE_COLLECTIONS.map((name) => [name, []])) as WorkspaceBackup['collections']
  collections.sources = [{ id: source.id, value: source, order: 0 }]
  collections.requirements = requirements.map((value, order) => ({ id: value.id, sourceId: source.id, value, order }))
  return { format: 'qa-mission-control-workspace', version: 1, exportedAt: source.createdAt, collections }
}
describe('portable workspace validation', () => {
  it('round-trips canonical source and requirement identities without transient provider fields', async () => {
    const input = await fixture()
    expect(await parseWorkspaceBackup(JSON.stringify(input))).toEqual(input)
    input.collections.sources[0].value = { ...input.collections.sources[0].value as object, rawPrompt: 'not included in export' }
    const normalized = await validateWorkspaceBackup(input)
    expect(JSON.stringify(normalized)).not.toContain('rawPrompt')
  })
  it('rejects invalid JSON, unknown collections, duplicates, oversized fields and altered app-owned fingerprints', async () => {
    await expect(parseWorkspaceBackup('{')).rejects.toThrow(/malformed/)
    const input = await fixture()
    await expect(validateWorkspaceBackup({ ...input, collections: { ...input.collections, secrets: [] } })).rejects.toThrow()
    await expect(validateWorkspaceBackup({ ...input, collections: { ...input.collections, sources: [...input.collections.sources, ...input.collections.sources] } })).rejects.toThrow()
    const record = input.collections.requirements[0]
    for (const change of [{ summary: 'Changed meaning' }, { summary: 'x'.repeat(601) }, { rawResponse: 'provider bytes' }, { evidence: { quote: 'invented' } }, { id: 'provider-id' }]) {
      await expect(validateWorkspaceBackup({ ...input, collections: { ...input.collections, requirements: [{ ...record, value: { ...record.value as object, ...change } }] } })).rejects.toThrow()
    }
  })
  it('rejects incomplete caches and orphan task authority instead of resuming fabricated work', async () => {
    const input = await fixture()
    const requirement = input.collections.requirements[0].value as { sourceId: string; sourceCreatedAt: string; unitId: string; unitReuseKey: string }
    input.collections.unitIntelligence = [{ id: requirement.unitId, sourceId: requirement.sourceId, order: 0, value: { id: requirement.unitId, sourceId: requirement.sourceId, sourceCreatedAt: requirement.sourceCreatedAt, unitId: requirement.unitId, reuseKey: requirement.unitReuseKey, analysisVersion: 'requirements-unit-v1', requirementIds: ['missing'], reviewNotes: [], analyzedAt: input.exportedAt } }]
    await expect(validateWorkspaceBackup(input)).rejects.toThrow()
  })
  it('rejects a rehashed but invented quote in an otherwise current reusable cache', async () => {
    const input = await fixture()
    const requirement = input.collections.requirements[0].value as Requirement
    requirement.evidence.quote = requirement.evidence.quote.replace('30', '90')
    requirement.fingerprint = await fingerprint(JSON.stringify([requirement.kind, requirement.summary, requirement.evidence.quote, requirement.coverageTopic]))
    input.collections.unitIntelligence = [{ id: requirement.unitId, sourceId: requirement.sourceId, order: 0, value: { id: requirement.unitId, sourceId: requirement.sourceId, sourceCreatedAt: requirement.sourceCreatedAt, unitId: requirement.unitId, reuseKey: requirement.unitReuseKey, analysisVersion: 'requirements-unit-v1', requirementIds: [requirement.id], reviewNotes: [], analyzedAt: input.exportedAt } }]
    await expect(validateWorkspaceBackup(input)).rejects.toThrow()
  })
})
