import { describe, expect, it } from 'vitest'
import { requirementChangeInventory } from './requirementChanges'
import type { PreparedAnalysis } from '../../lib/workspace/analysisJobRepository'
import type { Requirement } from './requirementModel'

const requirement = (id: string): Requirement => ({ id, sourceId: 'source', sourceCreatedAt: '2026-01-01', fingerprint: id, kind: 'requirement', summary: 'Same heading and evidence', evidence: { quote: 'Same heading and evidence', location: { startOffset: 20 } }, createdAt: '2026-01-01' }) as Requirement
describe('exact requirement change inventory', () => {
  it('preserves current exact identities, exposes retired evidence, and never matches historical text by similarity', () => {
    const unchanged = requirement('unchanged')
    const before = requirement('before')
    const after = requirement('after')
    const prepared = { source: { id: 'source', createdAt: '2026-01-01' }, requirements: [before, unchanged, after, before, { ...before, sourceId: 'foreign' }, { ...before, sourceCreatedAt: 'old-incarnation' }], currentRequirements: [unchanged, after] } as PreparedAnalysis
    const rows = requirementChangeInventory(prepared, [], [])
    expect(rows.map((row) => row.requirement.id)).toEqual(['before'])
    expect(rows[0].hasAffectedArtifacts).toBe(false)
  })
  it('surfaces same-ID meaning changes and prioritizes linked historical artifacts', () => {
    const before = requirement('a')
    const other = requirement('b')
    const prepared = { source: { id: 'source', createdAt: '2026-01-01' }, requirements: [before, other], currentRequirements: [{ ...before, fingerprint: 'new-meaning' }] } as PreparedAnalysis
    const rows = requirementChangeInventory(prepared, [], [{ id: 'link', sourceId: 'source', requirementId: 'b', requirementFingerprint: 'b', coverageAreaId: 'area' }])
    expect(rows.map((row) => row.requirement.id)).toEqual(['b', 'a'])
    expect(rows[0].hasAffectedArtifacts).toBe(true)
  })
})
