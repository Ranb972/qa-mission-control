import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createQaSource } from '../../test/qaSourceFactory'
import {
  QA_SOURCE_STORAGE_KEY,
  loadQaSources,
  saveQaSources,
} from './qaSourceStorage'

describe('qaSourceStorage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    window.localStorage.clear()
  })

  it('saves and loads valid QA sources', () => {
    const qaSource = createQaSource()

    expect(saveQaSources([qaSource])).toEqual({ ok: true, error: null })
    expect(loadQaSources()).toEqual({ qaSources: [qaSource], error: null })
  })

  it('returns a non-destructive error for corrupt JSON', () => {
    window.localStorage.setItem(QA_SOURCE_STORAGE_KEY, '{not valid json')

    const result = loadQaSources()

    expect(result.qaSources).toEqual([])
    expect(result.error).toContain('could not be read')
    expect(window.localStorage.getItem(QA_SOURCE_STORAGE_KEY)).toBe(
      '{not valid json',
    )
  })

  it('returns a non-destructive error for invalid saved data shape', () => {
    window.localStorage.setItem(
      QA_SOURCE_STORAGE_KEY,
      JSON.stringify({ qaSources: [] }),
    )

    const result = loadQaSources()

    expect(result.qaSources).toEqual([])
    expect(result.error).toContain('not in the expected format')
    expect(window.localStorage.getItem(QA_SOURCE_STORAGE_KEY)).toBe(
      JSON.stringify({ qaSources: [] }),
    )
  })

  it('loads valid records and reports invalid records without rewriting storage', () => {
    const validSource = createQaSource({ id: 'valid-source' })
    const savedPayload = [validSource, { id: 'missing-fields' }]

    window.localStorage.setItem(
      QA_SOURCE_STORAGE_KEY,
      JSON.stringify(savedPayload),
    )

    const result = loadQaSources()

    expect(result.qaSources).toEqual([validSource])
    expect(result.error).toContain('Some saved QA sources could not be loaded')
    expect(result.error).toContain('future edits may replace the saved browser data')
    expect(window.localStorage.getItem(QA_SOURCE_STORAGE_KEY)).toBe(
      JSON.stringify(savedPayload),
    )
  })

  it('rejects invalid required fields and timestamps without rewriting storage', () => {
    const validSource = createQaSource({ id: 'valid-source' })
    const savedPayload = [
      validSource,
      createQaSource({ id: 'blank-title', title: '   ' }),
      createQaSource({ id: 'blank-content', content: '   ' }),
      { ...createQaSource({ id: 'invalid-type' }), sourceType: 'Design Doc' },
      { ...createQaSource({ id: 'invalid-status' }), status: 'Analyzed' },
      createQaSource({ id: 'invalid-created-at', createdAt: 'not-a-date' }),
      createQaSource({ id: 'invalid-updated-at', updatedAt: 'not-a-date' }),
      createQaSource({ id: 'date-only-created-at', createdAt: '2026-05-12' }),
      createQaSource({
        id: 'natural-language-updated-at',
        updatedAt: 'May 12, 2026',
      }),
      createQaSource({
        id: 'impossible-date-created-at',
        createdAt: '2026-02-31T08:00:00.000Z',
      }),
    ]

    window.localStorage.setItem(
      QA_SOURCE_STORAGE_KEY,
      JSON.stringify(savedPayload),
    )

    const result = loadQaSources()

    expect(result.qaSources).toEqual([validSource])
    expect(result.error).toContain('Some saved QA sources could not be loaded')
    expect(window.localStorage.getItem(QA_SOURCE_STORAGE_KEY)).toBe(
      JSON.stringify(savedPayload),
    )
  })

  it('accepts valid ISO timestamps', () => {
    const validSource = createQaSource({
      createdAt: '2026-05-12T08:00:00.000Z',
      updatedAt: '2026-05-12T08:30:15.123Z',
    })

    window.localStorage.setItem(
      QA_SOURCE_STORAGE_KEY,
      JSON.stringify([validSource]),
    )

    expect(loadQaSources()).toEqual({
      qaSources: [validSource],
      error: null,
    })
  })

  it('defaults missing notes to an empty string', () => {
    const source = createQaSource()
    const sourceWithoutNotes: Partial<typeof source> = { ...source }
    delete sourceWithoutNotes.notes

    window.localStorage.setItem(
      QA_SOURCE_STORAGE_KEY,
      JSON.stringify([sourceWithoutNotes]),
    )

    const result = loadQaSources()

    expect(result.qaSources).toEqual([
      {
        ...source,
        notes: '',
      },
    ])
    expect(result.error).toBeNull()
  })

  it('does not throw when localStorage save fails', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new Error('storage blocked')
    })

    let result: ReturnType<typeof saveQaSources> | null = null

    expect(() => {
      result = saveQaSources([createQaSource()])
    }).not.toThrow()
    expect(result).toEqual({
      ok: false,
      error:
        'QA source changes are visible in this session, but they could not be saved to browser storage.',
    })
  })
})
