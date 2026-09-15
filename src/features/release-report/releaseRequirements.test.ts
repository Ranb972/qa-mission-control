import { describe, expect, it } from 'vitest'
import { createRelease } from '../../test/releaseFactory'
import { buildRequirementTraceability, createRequirementTestLink, testDesignFingerprint } from '../document-intelligence/requirementTraceability'
import type { Requirement } from '../document-intelligence/requirementModel'
import type { SourceSetReview } from '../document-intelligence/sourceSetIntelligence'
import { createTestCase } from '../../test/testCaseFactory'
import { UNIT_ANALYSIS_VERSION } from '../document-intelligence/unitAnalysisContract'
import { compareReleaseRequirementBaseline, formatReleaseRequirementMarkdown, makeReleaseRequirementBaseline, parseReleaseRequirementBaseline, summarizeReleaseRequirements } from './releaseRequirements'

const requirement = (id: string): Requirement => ({ id, sourceId: 'source', sourceCreatedAt: '2026-01-01', sourceRevision: 'revision', unitId: id, unitReuseKey: id, sectionId: 'section', kind: 'requirement', summary: `Require ${id}`, coverageTopic: 'Access', fingerprint: id.padEnd(64, 'a'), analysisVersion: UNIT_ANALYSIS_VERSION, createdAt: '2026-01-01',
  evidence: { quote: `Require ${id}`, relativeStart: 0, relativeEnd: 9, location: { startOffset: 0, endOffset: 9, startLine: 1, endLine: 1 }, blockIds: ['block'] } })
async function fixture(): Promise<SourceSetReview> {
  const requirements = [requirement('a'), requirement('b')]
  const test = createTestCase({ id: 'test' })
  const link = await createRequirementTestLink(requirements[0], test, '2026-01-02')
  const traceability = await buildRequirementTraceability({ requirements, testCases: [test], testLinks: [link], coverageAreas: [], coverageLinks: [], bugs: [], suites: [], releaseId: 'release',
    executions: [{ id: 'run', releaseId: 'release', testCaseId: 'test', result: 'Passed', executedAt: '2026-01-03', notes: '', createdAt: '2026-01-03', updatedAt: '2026-01-03', testDesignFingerprint: await testDesignFingerprint(test) },
      { id: 'other', releaseId: 'other-release', testCaseId: 'test', result: 'Failed', executedAt: '2026-01-03', notes: '', createdAt: '2026-01-03', updatedAt: '2026-01-03' }] })
  return { set: { schemaVersion: 1, id: 'set', name: 'Commerce', description: '', members: [{ sourceId: 'source', sourceCreatedAt: '2026-01-01' }], createdAt: '2026-01-01', updatedAt: '2026-01-01' },
    sources: [{ id: 'source', title: 'Business <spec>', current: 2, total: 3, findings: 2, visual: 1, failed: 0, missing: false }], requirements, relations: [], traceability, guards: {} }
}
describe('release requirement baselines and reporting', () => {
  it('supports a single large specification and stores only bounded app-owned identity snapshots', async () => {
    const review = await fixture()
    const baseline = makeReleaseRequirementBaseline(createRelease(), review)
    expect(parseReleaseRequirementBaseline({ ...baseline, rawResponse: 'not retained' })).toEqual(baseline)
    expect(JSON.stringify(baseline)).not.toContain('Require a')
    expect(parseReleaseRequirementBaseline({ ...baseline, requirements: [...baseline.requirements, baseline.requirements[0]] })).toBeNull()
    expect(parseReleaseRequirementBaseline({ ...baseline, members: [] })).toBeNull()
    expect(parseReleaseRequirementBaseline({ ...baseline, requirements: [{ id: 'a', fingerprint: 'provider-controlled' }] })).toBeNull()
  })
  it('compares exact requirement identities without fuzzy reattachment and flags changed scope', async () => {
    const review = await fixture()
    const baseline = makeReleaseRequirementBaseline(createRelease(), review)
    const changed = { ...review, set: { ...review.set, members: [...review.set.members, { sourceId: 'another', sourceCreatedAt: '2026-01-01' }] }, requirements: [review.requirements[0], { ...requirement('c'), summary: review.requirements[1].summary, evidence: review.requirements[1].evidence }] }
    const comparison = compareReleaseRequirementBaseline(baseline, changed)
    expect(comparison.changed.map((item) => item.id)).toEqual(['b'])
    expect(comparison.added.map((item) => item.id)).toEqual(['c'])
    expect(comparison.unchanged).toBe(1)
    expect(comparison.membershipChanged).toBe(true)
  })
  it('uses real denominators and release-isolated verified execution without concealing pending or visual regions', async () => {
    const review = await fixture()
    const baseline = makeReleaseRequirementBaseline(createRelease(), review)
    const summary = summarizeReleaseRequirements(baseline, review)
    expect(summary).toMatchObject({ total: 2, withTests: 1, pendingRegions: 1, visualBlocks: 1 })
    expect(summary.failures).toHaveLength(0)
    expect(summary.noVerifiedRun).toHaveLength(1)
    const markdown = formatReleaseRequirementMarkdown(baseline, review)
    expect(markdown).toContain('QA-confirmed test traceability: 1 / 2')
    expect(markdown).toContain('Pending / failed / review regions: 1')
    expect(markdown).toContain('Business \\<spec\\>')
    expect(markdown).toContain('Require b')
    expect(markdown).not.toContain('other-release')
  })
})
