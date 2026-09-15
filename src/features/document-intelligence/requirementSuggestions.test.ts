import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildDocumentSnapshot } from './documentSegmentation'
import { materializeRequirements, type UnitIntelligence } from './requirementModel'
import { createAnalysisPreflight } from './analysisJobModel'
import { UNIT_ANALYSIS_VERSION } from './unitAnalysisContract'
import { draftRequirementTests, requirementDraftBlocker, requirementSuggestionContext } from './requirementSuggestions'
import { importRequirementTestDrafts } from '../../lib/workspace/requirementTestImport'
import type { PreparedAnalysis } from '../../lib/workspace/analysisJobRepository'
import type { WorkspaceClient } from '../../lib/workspace/workspaceClient'
import type { QaSource } from '../qa-sources/qaSourceTypes'

const quote = 'Sessions must expire after 30 minutes.'
async function fixture() {
  const source: QaSource = { id: 'spec', title: 'Commerce', content: `# Earlier\n${'Unrelated source material. '.repeat(1200)}\n# Security\n${quote}`, notes: 'Private notes not for AI', sourceType: 'Requirement', status: 'Draft', createdAt: '2026-09-05', updatedAt: '2026-09-05' }
  const snapshot = await buildDocumentSnapshot(source)
  const unit = snapshot.units.at(-1)!
  const requirements = await materializeRequirements(source, snapshot, unit, { version: 1, limitations: [], findings: [{ kind: 'requirement', summary: quote, quote, occurrence: 0, coverage: 'Session security' }] }, '2026-09-05')
  const intelligence: UnitIntelligence = { id: unit.id, sourceId: source.id, sourceCreatedAt: source.createdAt, unitId: unit.id, reuseKey: unit.reuseKey, analysisVersion: UNIT_ANALYSIS_VERSION, requirementIds: requirements.map((item) => item.id), reviewNotes: [], analyzedAt: '2026-09-05' }
  const prepared: PreparedAnalysis = { source, sourceVersion: 1, snapshot, preflight: createAnalysisPreflight(snapshot, [intelligence], requirements), job: null, tasks: [], requirements, currentRequirements: requirements, requirementVersion: 2, intelligenceVersion: 3 }
  return { prepared, requirement: requirements[0], intelligence }
}
const response = (evidence = quote, warnings: string[] = []) => ({ ok: true, warnings, suggestions: [{ title: 'Session expires at the required time', area: 'Security', priority: 'High', type: 'Functional', preconditions: 'A user has an authenticated session.', structuredSteps: [{ action: 'Leave the session inactive for 30 minutes.', expectedResult: 'The session expires.' }, { action: 'Request the protected account page.', expectedResult: 'The sign-in screen is displayed.' }], evidence: [evidence], assumptions: [], warnings: [] }] })
afterEach(() => vi.unstubAllGlobals())
describe('requirement-scoped AI drafting and explicit approval', () => {
  it('sends one current leaf, including a requirement beyond the old prefix, with no notes or automatic import', async () => {
    const { prepared, requirement } = await fixture()
    const fetch = vi.fn().mockResolvedValue(Response.json(response()))
    vi.stubGlobal('fetch', fetch)
    const context = requirementSuggestionContext(prepared, requirement)
    expect(fetch).not.toHaveBeenCalled()
    expect(context.packed.content).toContain(quote)
    expect(context.packed.content).not.toContain('Unrelated source material')
    expect(JSON.stringify(context.packed)).not.toContain('Private notes')
    const drafts = await draftRequirementTests(prepared, requirement, new AbortController().signal)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch.mock.calls[0][1]).toMatchObject({ credentials: 'omit', redirect: 'error' })
    expect(drafts[0]).toMatchObject({ status: 'ready', qaSourceId: 'spec', id: 'ai-suggestion-1' })
    expect(JSON.parse(fetch.mock.calls[0][1].body).content.length).toBeLessThan(8000)
  })
  it('keeps unsupported evidence and provider-wide limitations unimportable', async () => {
    const { prepared, requirement } = await fixture()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json(response('Invented behavior'))).mockResolvedValueOnce(Response.json(response(quote, ['The timeout policy needs clarification.']))))
    for (let count = 0; count < 2; count += 1) {
      const drafts = await draftRequirementTests(prepared, requirement, new AbortController().signal)
      expect(drafts[0].status).toBe('needs_review')
      expect(drafts[0].warnings.length).toBeGreaterThan(0)
    }
  })
  it('blocks ambiguity, limitations, stale provenance and numeric conflicts without a request', async () => {
    const { prepared, requirement, intelligence } = await fixture()
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
    expect(requirementDraftBlocker({ ...prepared, currentRequirements: [] }, requirement)).toMatch(/current/)
    expect(requirementDraftBlocker({ ...prepared, source: { ...prepared.source, content: 'changed' } }, requirement)).toMatch(/evidence/)
    intelligence.reviewNotes.push('Review the diagram')
    expect(requirementDraftBlocker(prepared, requirement)).toMatch(/limitations/)
    intelligence.reviewNotes = []
    prepared.currentRequirements!.push({ ...requirement, id: 'ambiguity', kind: 'ambiguity' })
    await expect(draftRequirementTests(prepared, requirement, new AbortController().signal)).rejects.toThrow(/Clarification/)
    prepared.currentRequirements!.pop()
    prepared.currentRequirements!.push({ ...requirement, id: 'conflict', summary: quote.replace('30', '60') })
    expect(requirementDraftBlocker(prepared, requirement)).toMatch(/conflicting/)
    expect(fetch).not.toHaveBeenCalled()
  })
  it('does not retry failed or oversized responses', async () => {
    const { prepared, requirement } = await fixture()
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ error: 'secret provider detail' }, { status: 429 })).mockResolvedValueOnce(new Response('x'.repeat(270000)))
    vi.stubGlobal('fetch', fetch)
    await expect(draftRequirementTests(prepared, requirement, new AbortController().signal)).rejects.toThrow('Test drafting is unavailable')
    await expect(draftRequirementTests(prepared, requirement, new AbortController().signal)).rejects.toThrow('safely read')
    expect(fetch).toHaveBeenCalledTimes(2)
  })
  it('atomically saves approved app-owned tests and links, guards source/cache versions, and handles post-commit refresh failure', async () => {
    const { prepared, requirement } = await fixture()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(response())))
    const drafts = await draftRequirementTests(prepared, requirement, new AbortController().signal)
    const commit = vi.fn().mockResolvedValue({ testCases: 6 })
    const refresh = vi.fn().mockRejectedValue(new Error('offline'))
    const workspace = { repository: { readCollection: vi.fn().mockResolvedValue({ records: [], version: 5 }), commit }, refresh } as unknown as WorkspaceClient
    const imported = await importRequirementTestDrafts(workspace, prepared, requirement, drafts)
    expect(imported.tests).toHaveLength(1)
    expect(imported.tests[0]).toMatchObject({ status: 'Not Run', qaSourceId: prepared.source.id })
    expect(imported.tests[0].id).not.toBe(drafts[0].id)
    expect(imported.tests[0]).not.toHaveProperty('evidence')
    expect(imported.refreshWarning).toMatch(/saved/)
    expect(commit).toHaveBeenCalledTimes(1)
    const [changes, guards] = commit.mock.calls[0]
    expect(changes.map((change: { collection: string }) => change.collection)).toEqual(['testCases', 'requirementTestLinks'])
    expect(changes[1].put[0].value).toMatchObject({ confirmation: 'qa_confirmed', requirementId: requirement.id, testCaseId: imported.tests[0].id })
    expect(guards).toMatchObject({ recordChecks: [{ collection: 'sources', id: 'spec', version: 1 }], collectionChecks: [{ collection: 'testCases', version: 5 }, { collection: 'requirements', version: 2 }, { collection: 'unitIntelligence', version: 3 }, { collection: 'sourceSets', version: 5 }] })
    await expect(importRequirementTestDrafts(workspace, prepared, requirement, [...drafts, ...drafts])).rejects.toThrow(/distinct/)
    await expect(importRequirementTestDrafts(workspace, prepared, requirement, [{ ...drafts[0], evidence: ['invented'] }])).rejects.toThrow(/exact evidence/)
    expect(commit).toHaveBeenCalledTimes(1)
  })
})
