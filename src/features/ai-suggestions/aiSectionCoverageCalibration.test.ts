import { describe, expect, it } from 'vitest'
import { liveAiCalibrationFixtures, calibrationSectionResponse } from '../../test/fixtures/liveAiCalibration'
import { parseAiSectionCoveragePlanResponse } from './aiSectionCoveragePlanValidation'
import { parseUnitAnalysis } from '../document-intelligence/unitAnalysisContract'

describe('Live-AI calibration regressions through production validators', () => {
  it.each(liveAiCalibrationFixtures)('retains coherent, individually evidenced behaviors for $anchor', (fixture) => {
    const result = parseAiSectionCoveragePlanResponse(calibrationSectionResponse(fixture), { visibleSectionContent: fixture.source })
    expect(result.ok).toBe(true)
    expect(result.plan?.coverageAreas).toHaveLength(1)
    const area = result.plan!.coverageAreas[0]
    expect(area.behaviors).toEqual(fixture.behaviors.map(([behavior]) => behavior))
    expect(area.evidenceSupport).toBe('source_backed')
    expect(area).toHaveProperty('behaviorEvidence', fixture.behaviors.map(([behavior, quote]) => ({ behavior,
      evidence: [fixture.anchor === '7.8' ? quote.replace('user, the nature', 'user,\n  the nature') : quote],
    })))
    for (const quote of area.evidence) expect(fixture.source.includes(quote)).toBe(true)
  })

  it('does not upgrade an area-level quote to evidence for every behavior', () => {
    const fixture = liveAiCalibrationFixtures[4]
    const raw = calibrationSectionResponse(fixture)
    const legacy = { ...raw, coverageAreas: raw.coverageAreas.map(({ name, summary, behaviors, evidence }) => ({ name, summary, behaviors, evidence })) }
    expect(parseAiSectionCoveragePlanResponse(legacy, { visibleSectionContent: fixture.source }).plan?.coverageAreas[0].evidenceSupport).toBe('needs_review')
  })

  it('removes metadata-only M and other field values, not functional content', () => {
    const fixture = liveAiCalibrationFixtures[2]
    const raw = { ...calibrationSectionResponse(fixture), states: ['M'], actors: ['Manual & Automatic'], inputs: ['As Necessary'] }
    raw.coverageAreas[0].behaviors.push('M', 'Status: M', 'Manual & Automatic', 'As Necessary')
    const plan = parseAiSectionCoveragePlanResponse(raw, { visibleSectionContent: fixture.source }).plan!
    expect(plan.states).toEqual([])
    expect(plan.actors).toEqual([])
    expect(plan.inputs).toEqual([])
    expect(plan.coverageAreas[0].behaviors).toEqual(fixture.behaviors.map(([behavior]) => behavior))
  })

  it('does not globally blacklist M or metadata vocabulary used as real system concepts', () => {
    const fixture = liveAiCalibrationFixtures[2]
    const source = `${fixture.source}\nThe system enters state M during maintenance. Frequency is a configurable signal input.`
    const plan = parseAiSectionCoveragePlanResponse({ ...calibrationSectionResponse(fixture), states: ['M'], inputs: ['Frequency'] }, { visibleSectionContent: source }).plan!
    expect(plan.states).toEqual(['M'])
    expect(plan.inputs).toEqual(['Frequency'])
  })

  it('rejects unfinished or overlong behaviors without turning them into shorter claims', () => {
    const fixture = liveAiCalibrationFixtures[4]
    const raw = calibrationSectionResponse(fixture)
    raw.coverageAreas[0].behaviors = ['provide facilities e.g. (backup,', 'x'.repeat(501)]
    raw.coverageAreas[0].behaviorEvidence = []
    const plan = parseAiSectionCoveragePlanResponse(raw, { visibleSectionContent: fixture.source }).plan!
    expect(plan.coverageAreas[0].behaviors).toEqual([])
    expect(plan.coverageAreas[0].evidenceSupport).toBe('needs_review')
    expect(plan.warnings.join(' ')).toMatch(/unfinished|overlong/i)
  })

  it('keeps literal metadata evidence as context, not a first-class actionable requirement', () => {
    const fixture = liveAiCalibrationFixtures[2]
    const value = { version: 1, findings: [
      { kind: 'requirement', summary: 'State M', quote: 'Status: M', occurrence: 0, coverage: 'States' },
      { kind: 'requirement', summary: 'Capture and validate reference data', quote: fixture.behaviors.map(([, quote]) => quote).join(' '), occurrence: 0, coverage: 'Reference data' },
    ], limitations: [] }
    const result = parseUnitAnalysis(value, fixture.source)!
    expect(result.findings.map((item) => item.kind)).toEqual(['context', 'requirement'])
    expect(result.findings[0].coverage).toBe('')
    expect(result.findings[1].quote).toBe(value.findings[1].quote)
  })

  it('still rejects paraphrased evidence and malformed unit output', () => {
    const source = liveAiCalibrationFixtures[4].source
    expect(parseUnitAnalysis({ version: 1, findings: [{ kind: 'requirement', summary: 'Recover', quote: 'Recover after any disaster.', occurrence: 0, coverage: 'Recovery' }], limitations: [] }, source)).toBeNull()
    expect(parseUnitAnalysis({ version: 1, findings: [], limitations: [], approval: true }, source)).toBeNull()
  })

  it('does not ground a complete behavior with only an unfinished source prefix', () => {
    const fixture = liveAiCalibrationFixtures[4]
    const raw = calibrationSectionResponse(fixture)
    raw.coverageAreas[0].evidence = []
    raw.coverageAreas[0].behaviorEvidence = raw.coverageAreas[0].behaviors.map((behavior) => ({ behavior, evidence: ['provide facilities e.g. (backup,'] }))
    const area = parseAiSectionCoveragePlanResponse(raw, { visibleSectionContent: fixture.source }).plan!.coverageAreas[0]
    expect(area.behaviors).toHaveLength(4)
    expect(area.evidenceSupport).toBe('needs_review')
    expect(area.behaviorEvidence?.every((item) => item.evidence.length === 0)).toBe(true)
  })

  it('never accepts paraphrased, cross-passage or control-bearing behavior evidence', () => {
    const fixture = liveAiCalibrationFixtures[4]
    for (const evidence of ['The application recovers from disasters.', 'backup, restart jobs']) {
      const raw = calibrationSectionResponse(fixture)
      raw.coverageAreas[0].behaviorEvidence = raw.coverageAreas[0].behaviors.map((behavior) => ({ behavior, evidence: [evidence] }))
      const area = parseAiSectionCoveragePlanResponse(raw, { visibleSectionContent: fixture.source }).plan!.coverageAreas[0]
      expect(area.behaviors).toHaveLength(4)
      expect(area.evidenceSupport).toBe('needs_review')
      expect(area.behaviorEvidence?.every((item) => item.evidence.length === 0)).toBe(true)
    }
    const raw = calibrationSectionResponse(fixture)
    const controlled = { ...raw, coverageAreas: [{ ...raw.coverageAreas[0], behaviorEvidence: [{ ...raw.coverageAreas[0].behaviorEvidence[0], approval: true }] }] }
    expect(parseAiSectionCoveragePlanResponse(controlled, { visibleSectionContent: fixture.source }).ok).toBe(false)
    const unknown = { ...raw, coverageAreas: [{ ...raw.coverageAreas[0], untrustedExtra: true }] }
    expect(parseAiSectionCoveragePlanResponse(unknown, { visibleSectionContent: fixture.source }).plan?.coverageAreas).toEqual([])
  })
})
