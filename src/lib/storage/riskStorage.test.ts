import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRisk } from '../../test/riskFactory'
import { RISK_STORAGE_KEY, loadRisks, saveRisks } from './riskStorage'

describe('riskStorage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    window.localStorage.clear()
  })

  it('saves and loads valid risks', () => {
    const risk = createRisk()

    expect(saveRisks([risk])).toEqual({ ok: true, error: null })
    expect(loadRisks()).toEqual({ risks: [risk], error: null })
  })

  it('returns a non-destructive error for corrupt JSON', () => {
    window.localStorage.setItem(RISK_STORAGE_KEY, '{not valid json')

    const result = loadRisks()

    expect(result.risks).toEqual([])
    expect(result.error).toContain('could not be read')
    expect(window.localStorage.getItem(RISK_STORAGE_KEY)).toBe('{not valid json')
  })

  it('returns a non-destructive error for invalid saved data shape', () => {
    window.localStorage.setItem(RISK_STORAGE_KEY, JSON.stringify({ risks: [] }))

    const result = loadRisks()

    expect(result.risks).toEqual([])
    expect(result.error).toContain('not in the expected format')
    expect(window.localStorage.getItem(RISK_STORAGE_KEY)).toBe(
      JSON.stringify({ risks: [] }),
    )
  })

  it('loads valid records and reports invalid records without rewriting storage', () => {
    const validRisk = createRisk()
    const savedPayload = [validRisk, { id: 'missing-fields' }]

    window.localStorage.setItem(RISK_STORAGE_KEY, JSON.stringify(savedPayload))

    const result = loadRisks()

    expect(result.risks).toEqual([validRisk])
    expect(result.error).toContain('Some saved risks could not be loaded')
    expect(window.localStorage.getItem(RISK_STORAGE_KEY)).toBe(
      JSON.stringify(savedPayload),
    )
  })

  it('rejects blank required fields and invalid dates without rewriting storage', () => {
    const validRisk = createRisk({ id: 'valid-risk' })
    const savedPayload = [
      validRisk,
      createRisk({ id: 'blank-title', title: '   ' }),
      createRisk({ id: 'blank-description', description: '   ' }),
      createRisk({ id: 'blank-mitigation', mitigationPlan: '   ' }),
      createRisk({ id: 'invalid-created-at', createdAt: 'not-a-date' }),
      createRisk({ id: 'invalid-updated-at', updatedAt: 'not-a-date' }),
    ]

    window.localStorage.setItem(RISK_STORAGE_KEY, JSON.stringify(savedPayload))

    const result = loadRisks()

    expect(result.risks).toEqual([validRisk])
    expect(result.error).toContain('Some saved risks could not be loaded')
    expect(window.localStorage.getItem(RISK_STORAGE_KEY)).toBe(
      JSON.stringify(savedPayload),
    )
  })

  it('rejects invalid enum values without rewriting storage', () => {
    const validRisk = createRisk({ id: 'valid-risk' })
    const savedPayload = [
      validRisk,
      { ...createRisk({ id: 'invalid-impact' }), impact: 'Severe' },
      { ...createRisk({ id: 'invalid-likelihood' }), likelihood: 'Certain' },
      { ...createRisk({ id: 'invalid-status' }), status: 'Watching' },
    ]

    window.localStorage.setItem(RISK_STORAGE_KEY, JSON.stringify(savedPayload))

    const result = loadRisks()

    expect(result.risks).toEqual([validRisk])
    expect(result.error).toContain('Some saved risks could not be loaded')
    expect(window.localStorage.getItem(RISK_STORAGE_KEY)).toBe(
      JSON.stringify(savedPayload),
    )
  })

  it('does not throw when localStorage save fails', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new Error('storage blocked')
    })

    let result: ReturnType<typeof saveRisks> | null = null

    expect(() => {
      result = saveRisks([createRisk()])
    }).not.toThrow()
    expect(result).toEqual({
      ok: false,
      error:
        'Risk changes are visible in this session, but they could not be saved to browser storage.',
    })
  })
})
