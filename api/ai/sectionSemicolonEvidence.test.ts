import { afterEach, describe, expect, it, vi } from 'vitest'
import { createGroqAiSectionCoveragePlanProvider } from './groqProvider'
import { createQaSource } from '../../src/test/qaSourceFactory'
import { createQaSourceSectionIndex } from '../../src/features/qa-sources/qaSourceSections'
import { resolveAiSectionCoveragePlanContext } from '../../src/features/ai-suggestions/aiSectionCoveragePlanContext'
import { createAiSectionCoveragePlanBackendRequest, handleAiSectionCoveragePlanBackendRequest } from '../../src/features/ai-suggestions/aiSectionCoveragePlanBackendContract'
import { backendAiSectionCoveragePlanProvider } from '../../src/features/ai-suggestions/aiSectionCoveragePlanBackendProvider'
import { parseAiSectionCoveragePlanProviderResponse, parseAiSectionCoveragePlanResponse } from '../../src/features/ai-suggestions/aiSectionCoveragePlanValidation'
import { createPersistedSectionCoveragePlanRecord, parsePersistedRecord } from '../../src/lib/storage/sectionCoveragePlanStorage'
import { calibrationSectionResponse, liveAiCalibrationFixtures } from '../../src/test/fixtures/liveAiCalibration'

const source = 'Audit items:\r\n  - the identity of the user\r\n    who made the change;\r\n  - the nature of the change; and\r\n  - the date and time of the change.'
const behaviors = ['Record user identity.', 'Record nature of change.', 'Record date and time.']
const quotes = ['the identity of the user who made the change;', 'the nature of the change;', 'the date and time of the change.']
const raw = () => ({ ...calibrationSectionResponse(liveAiCalibrationFixtures[1]), coverageAreas: [{ name: 'Audit trail', summary: 'Trace standing-data changes.', behaviors, evidence: quotes,
  behaviorEvidence: behaviors.map((behavior, index) => ({ behavior, evidence: [quotes[index]] })),
}] })
function contextFor(content = source) {
  const qaSource = createQaSource({ content: `# Audit\n${content}` })
  const index = createQaSourceSectionIndex(qaSource)
  const section = index.sections[0]
  const context = resolveAiSectionCoveragePlanContext({ qaSource, sectionIndex: index, selectedSection: { sectionId: section.id, stableKey: section.stableKey } })
  if (!context.ok) throw new Error('Invalid synthetic context')
  return context.context
}
afterEach(() => vi.unstubAllGlobals())

describe('semicolon evidence through all production normalization boundaries', () => {
  it('rejects a clipped predicate through every boundary, keeps the behavior reviewable and restores honestly', async () => {
    const content = 'Controls must ensure changes are\ncompleted promptly.\nAudit details:\n- Record the operator;\n- Record the timestamp.'
    const context = contextFor(content)
    const clipped = 'Controls must ensure changes are'
    const controlBehavior = 'Ensure changes are completed promptly.'
    const operatorBehavior = 'Record the operator.'
    const candidate = { ...raw(), coverageAreas: [{ name: 'Change controls', summary: 'Review change controls.',
      behaviors: [controlBehavior, operatorBehavior], evidence: [clipped, 'Record the operator;'],
      behaviorEvidence: [{ behavior: controlBehavior, evidence: [clipped] }, { behavior: operatorBehavior, evidence: ['Record the operator;'] }],
    }] }
    const fetchImpl = vi.fn().mockResolvedValue(Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(candidate) } }] }))
    const provider = createGroqAiSectionCoveragePlanProvider({ apiKey: 'synthetic-server-key', fetchImpl })
    const response = await handleAiSectionCoveragePlanBackendRequest({ method: 'POST', headers: { 'content-type': 'application/json' }, body: createAiSectionCoveragePlanBackendRequest(context) }, { provider })
    expect(response.status).toBe(200)
    expect(response.body.ok && response.body.analysis.coverageAreas[0].behaviorEvidence?.[0].evidence).toEqual([])
    const browserFetch = vi.fn().mockResolvedValue(Response.json(response.body))
    vi.stubGlobal('fetch', browserFetch)
    const wire = await backendAiSectionCoveragePlanProvider.generateSectionCoveragePlan(context)
    const plan = parseAiSectionCoveragePlanResponse(wire.analysis, { visibleSectionContent: context.visibleSection.content, visibleSectionTruncated: false }).plan!
    expect(plan.coverageAreas[0].behaviors).toEqual([controlBehavior, operatorBehavior])
    expect(plan.coverageAreas[0].behaviorEvidence?.map(item => item.evidence)).toEqual([[], ['Record the operator;']])
    expect(plan.coverageAreas[0].evidence).not.toContain(clipped)
    expect(plan.coverageAreas[0].evidenceSupport).toBe('needs_review')
    expect(plan.warnings.join(' ')).toContain('Not every behavior has validated linked evidence')
    expect(wire.warnings.join(' ')).toContain('unfinished evidence')
    const record = createPersistedSectionCoveragePlanRecord({ context, plan, analyzedAt: '2026-09-07T00:00:00.000Z' })
    expect(parsePersistedRecord(JSON.parse(JSON.stringify(record)))).toEqual(record)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(browserFetch).toHaveBeenCalledTimes(1)
  })
  it('retains complete items through Groq, server contract, browser contract, UI normalization and restore', async () => {
    const context = contextFor()
    const fetchImpl = vi.fn().mockResolvedValue(Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(raw()) } }] }))
    const provider = createGroqAiSectionCoveragePlanProvider({ apiKey: 'synthetic-server-key', fetchImpl })
    const result = await handleAiSectionCoveragePlanBackendRequest({ method: 'POST', headers: { 'content-type': 'application/json' }, body: createAiSectionCoveragePlanBackendRequest(context) }, { provider })
    expect(result.status).toBe(200)
    const browserFetch = vi.fn().mockResolvedValue(Response.json(result.body))
    vi.stubGlobal('fetch', browserFetch)
    const wire = await backendAiSectionCoveragePlanProvider.generateSectionCoveragePlan(context)
    const resultPlan = parseAiSectionCoveragePlanResponse(wire.analysis, { visibleSectionContent: context.visibleSection.content, visibleSectionTruncated: false })
    const plan = resultPlan.plan!
    expect(plan.coverageAreas[0].behaviors).toEqual(behaviors)
    expect(plan.coverageAreas[0].evidenceSupport).toBe('source_backed')
    expect(plan.coverageAreas[0].behaviorEvidence?.map(item => item.evidence[0])).toEqual([
      'the identity of the user\r\n    who made the change;', quotes[1], quotes[2],
    ])
    expect(wire.warnings.join(' ')).not.toContain('unfinished')
    const record = createPersistedSectionCoveragePlanRecord({ context, plan, analyzedAt: '2026-09-06T12:00:00.000Z' })
    expect(parsePersistedRecord(JSON.parse(JSON.stringify(record)))).toEqual(record)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(browserFetch).toHaveBeenCalledTimes(1)
    expect(browserFetch.mock.calls[0][0]).toBe('/api/ai/section-coverage-plan')
    expect(browserFetch.mock.calls[0][1]).toMatchObject({ credentials: 'omit', redirect: 'error' })
    expect(JSON.stringify(browserFetch.mock.calls[0][1].headers)).not.toMatch(/Authorization|synthetic-server-key/)
  })
  it('never accepts a semicolon without source context or repairs a mismatched association', () => {
    const response = raw()
    const noSource = parseAiSectionCoveragePlanProviderResponse(response)
    expect(noSource.ok && noSource.response.coverageAreas[0].behaviorEvidence?.[0].evidence).toEqual([])
    response.coverageAreas[0].behaviorEvidence[0].behavior = ` ${behaviors[0]} `
    const plan = parseAiSectionCoveragePlanResponse(response, { visibleSectionContent: source }).plan!
    expect(plan.coverageAreas[0].behaviorEvidence?.some(item => item.behavior === behaviors[0])).toBe(false)
    expect(plan.coverageAreas[0].evidenceSupport).toBe('needs_review')
  })
})
