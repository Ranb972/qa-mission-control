import { describe, expect, it } from 'vitest'
import { buildDocumentSnapshot } from './documentSegmentation'
import { materializeRequirements } from './requirementModel'
import { buildCoverageIntelligence, groupRequirementRelations } from './coverageIntelligence'
import type { QaSource } from '../qa-sources/qaSourceTypes'

const source: QaSource = { id: 'source', title: 'Payments', sourceType: 'Requirement', status: 'Draft', notes: '', createdAt: '2026-01-01', updatedAt: '2026-01-01',
  content: '# Payments\n## Refunds\nRefund within 14 days.\nRefund within 30 days.\n## Receipts\nSend one receipt.\n# Access\nRequire authorization.' }
async function fixture() {
  const snapshot = await buildDocumentSnapshot(source)
  const requirements = (await Promise.all(snapshot.units.map(async (unit) => {
    const text = source.content.slice(unit.location.startOffset, unit.location.endOffset)
    const lines = text.split('\n').filter((line) => line && !line.startsWith('#'))
    return materializeRequirements(source, snapshot, unit, { version: 1, limitations: [], findings: lines.map((quote) => ({ kind: 'requirement', summary: quote, quote, occurrence: 0, coverage: quote.startsWith('Refund') ? 'Refunds' : quote.startsWith('Send') ? 'Receipts' : '' })) }, '2026-01-02')
  }))).flat()
  return { snapshot, requirements }
}
describe('hierarchical source coverage intelligence', () => {
  it('accounts for every leaf through section/chapter/source without promoting interpretation to approval', async () => {
    const { snapshot, requirements } = await fixture()
    const plan = await buildCoverageIntelligence(snapshot, requirements, new Set(snapshot.units.map((unit) => unit.id)))
    expect(plan.nodes[0]).toMatchObject({ totalRequirements: 4, totalUnits: 4, currentUnits: 4 })
    expect(plan.nodes.find((node) => node.title === 'Payments')).toMatchObject({ totalRequirements: 3, ownRequirements: 0 })
    expect(plan.areas).toHaveLength(2)
    expect(plan.links).toHaveLength(3)
    expect(plan.uncoveredRequirements).toEqual([requirements[3].id])
    expect(plan.areas.find((area) => area.name === 'Refunds')?.readiness).toBe('blocked_by_ambiguity')
    expect(plan.areas.find((area) => area.name === 'Receipts')?.readiness).toBe('needs_review')
  })
  it('keeps both sides of conflicts and keeps exact duplicates as inspectable evidence groups', async () => {
    const { requirements } = await fixture()
    const duplicate = { ...requirements[2], id: 'another-evidence-location' }
    const groups = groupRequirementRelations([...requirements, duplicate])
    expect(groups.find((group) => group.kind === 'potential_conflict')?.requirementIds).toEqual([requirements[0].id, requirements[1].id].sort())
    expect(groups.find((group) => group.kind === 'exact_duplicate')?.requirementIds).toEqual([requirements[2].id, duplicate.id].sort())
    expect(requirements).toHaveLength(4)
  })
  it('does not count stale or foreign requirements in the denominator', async () => {
    const { snapshot, requirements } = await fixture()
    const plan = await buildCoverageIntelligence(snapshot, [...requirements, { ...requirements[0], sourceId: 'foreign' }, { ...requirements[0], unitReuseKey: 'changed' }], new Set([snapshot.units[1].id]))
    expect(plan.testableRequirements).toBe(4)
    expect(plan.nodes[0].currentUnits).toBe(1)
  })
  it('keeps a nonnumeric cross-source ambiguity local to its explicitly shared topic', async () => {
    const { requirements } = await fixture()
    const policy = { ...requirements[0], id: 'current-policy', summary: 'Seller policy defines return eligibility.', coverageTopic: 'Marketplace fallback' }
    const proposal = { ...requirements[1], id: 'future-proposal', sourceId: 'companion', kind: 'ambiguity' as const, summary: 'A future release proposes a fallback; applicability needs review.', coverageTopic: 'Marketplace fallback' }
    const unrelated = { ...requirements[2], id: 'unrelated-checkout', coverageTopic: 'Checkout integrity' }
    const groups = groupRequirementRelations([policy, proposal, unrelated])
    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({ kind: 'potential_conflict', requiresReview: true, requirementIds: ['current-policy', 'future-proposal'] })
    expect(groupRequirementRelations([policy, { ...proposal, kind: 'requirement' }])).toEqual([])
  })
  it('groups 10,000 findings with bounded bucket comparisons instead of pairwise fanout', async () => {
    const { requirements } = await fixture()
    const large = Array.from({ length: 10000 }, (_, index) => ({ ...requirements[0], id: `req-${index}`, summary: `Refund within ${index % 2 ? 14 : 30} days.` }))
    const groups = groupRequirementRelations(large)
    expect(groups.find((group) => group.kind === 'potential_conflict')?.requirementIds).toHaveLength(10000)
    expect(groups.length).toBeLessThan(20)
  })
})
