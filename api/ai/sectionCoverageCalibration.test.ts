import { describe, expect, it, vi } from 'vitest'
import { createGroqAiSectionCoveragePlanProvider } from './groqProvider'
import { createAiSectionCoveragePlanBackendRequest, handleAiSectionCoveragePlanBackendRequest, parseAiSectionCoveragePlanBackendResponse } from '../../src/features/ai-suggestions/aiSectionCoveragePlanBackendContract'
import { resolveAiSectionCoveragePlanContext } from '../../src/features/ai-suggestions/aiSectionCoveragePlanContext'
import { parseAiSectionCoveragePlanResponse } from '../../src/features/ai-suggestions/aiSectionCoveragePlanValidation'
import { createAiCoveragePlanMergePlanFingerprint } from '../../src/features/ai-suggestions/aiCoveragePlanMergeEligibility'
import { createPersistedSectionCoveragePlanRecord, parsePersistedRecord } from '../../src/lib/storage/sectionCoveragePlanStorage'
import { createQaSourceSectionIndex } from '../../src/features/qa-sources/qaSourceSections'
import { createQaSource } from '../../src/test/qaSourceFactory'
import { calibrationSectionResponse, liveAiCalibrationFixtures } from '../../src/test/fixtures/liveAiCalibration'

function contextFor(source: string) {
  const qaSource = createQaSource({ content: `# Selected anchor\n${source}\n# Neighbor\nUNSELECTED_PRIVATE_SENTINEL` })
  const sectionIndex = createQaSourceSectionIndex(qaSource)
  const section = sectionIndex.sections[0]
  const result = resolveAiSectionCoveragePlanContext({ qaSource, sectionIndex, selectedSection: { sectionId: section.id, stableKey: section.stableKey } })
  if (!result.ok) throw new Error('Invalid test context')
  return result.context
}

describe('section calibration across production provider, wire and storage contracts', () => {
  it.each(liveAiCalibrationFixtures)('grounds and restores the $anchor behavior associations', async (fixture) => {
    const context = contextFor(fixture.source)
    const fetchImpl = vi.fn().mockResolvedValue(Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(calibrationSectionResponse(fixture)) } }] }))
    const provider = createGroqAiSectionCoveragePlanProvider({ apiKey: 'server-test-key', model: 'configured-model', fetchImpl })
    const result = await handleAiSectionCoveragePlanBackendRequest({ method: 'POST', headers: { 'content-type': 'application/json' }, body: createAiSectionCoveragePlanBackendRequest(context) }, { provider })
    const wire = parseAiSectionCoveragePlanBackendResponse(result.body)
    expect(result.status).toBe(200)
    if (!wire?.ok) throw new Error('Expected valid wire response')
    const plan = parseAiSectionCoveragePlanResponse(wire.analysis, { visibleSectionContent: context.visibleSection.content }).plan!
    expect(plan.coverageAreas[0].evidenceSupport).toBe('source_backed')
    const record = createPersistedSectionCoveragePlanRecord({ context, plan, analyzedAt: '2026-09-06T12:00:00.000Z' })
    expect(parsePersistedRecord(JSON.parse(JSON.stringify(record)))).toEqual(record)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const outbound = JSON.parse(fetchImpl.mock.calls[0][1].body)
    expect(outbound.model).toBe('configured-model')
    expect(outbound.messages[0].content).toContain('behaviorEvidence')
    expect(outbound.messages[0].content).toContain('240 characters')
    expect(outbound.messages[0].content).toContain('backup/restore/restart/recovery')
    expect(outbound.messages[0].content).toContain('Status: M alone')
    expect(outbound.messages[1].content).not.toContain('UNSELECTED_PRIVATE_SENTINEL')
    expect(JSON.stringify(record)).not.toContain('server-test-key')
    expect(record.plan.coverageAreas[0].behaviorEvidence).toHaveLength(fixture.behaviors.length)
    const changed = structuredClone(plan)
    changed.coverageAreas[0].behaviorEvidence![0].evidence = []
    expect(createAiCoveragePlanMergePlanFingerprint(changed)).not.toBe(createAiCoveragePlanMergePlanFingerprint(plan))
    // A stale/forged support flag cannot survive restoration after losing a link.
    expect(parsePersistedRecord({ ...record, plan: changed })).toBeNull()
  })

  it.each(['length', 'content_filter', undefined])('rejects incomplete provider completion %s without retries', async (finishReason) => {
    const fixture = liveAiCalibrationFixtures[4]
    const fetchImpl = vi.fn().mockResolvedValue(Response.json({ choices: [{ finish_reason: finishReason, message: { content: JSON.stringify(calibrationSectionResponse(fixture)) } }] }))
    const result = await createGroqAiSectionCoveragePlanProvider({ apiKey: 'synthetic', fetchImpl })
      .generateSectionCoveragePlan(createAiSectionCoveragePlanBackendRequest(contextFor(fixture.source)))
    expect(result).toMatchObject({ ok: false, error: { code: 'invalid_provider_response' } })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})
