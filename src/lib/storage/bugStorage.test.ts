import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createBug } from '../../test/bugFactory'
import { BUG_STORAGE_KEY, loadBugs, saveBugs } from './bugStorage'

describe('bugStorage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    window.localStorage.clear()
  })

  it('saves and loads valid bugs', () => {
    const bug = createBug()

    expect(saveBugs([bug])).toEqual({ ok: true, error: null })
    expect(loadBugs()).toEqual({ bugs: [bug], error: null })
  })

  it('returns a non-destructive error for corrupt JSON', () => {
    window.localStorage.setItem(BUG_STORAGE_KEY, '{not valid json')

    const result = loadBugs()

    expect(result.bugs).toEqual([])
    expect(result.error).toContain('could not be read')
    expect(window.localStorage.getItem(BUG_STORAGE_KEY)).toBe('{not valid json')
  })

  it('returns a non-destructive error for invalid saved data shape', () => {
    window.localStorage.setItem(BUG_STORAGE_KEY, JSON.stringify({ bugs: [] }))

    const result = loadBugs()

    expect(result.bugs).toEqual([])
    expect(result.error).toContain('not in the expected format')
    expect(window.localStorage.getItem(BUG_STORAGE_KEY)).toBe(
      JSON.stringify({ bugs: [] }),
    )
  })

  it('loads valid records and reports invalid records without rewriting storage', () => {
    const validBug = createBug()
    const savedPayload = [validBug, { id: 'missing-fields' }]

    window.localStorage.setItem(BUG_STORAGE_KEY, JSON.stringify(savedPayload))

    const result = loadBugs()

    expect(result.bugs).toEqual([validBug])
    expect(result.error).toContain('Some saved bugs could not be loaded')
    expect(window.localStorage.getItem(BUG_STORAGE_KEY)).toBe(
      JSON.stringify(savedPayload),
    )
  })

  it('rejects blank required fields and invalid dates without rewriting storage', () => {
    const validBug = createBug({ id: 'valid-bug' })
    const savedPayload = [
      validBug,
      createBug({ id: 'blank-title', title: '   ' }),
      createBug({ id: 'invalid-created-at', createdAt: 'not-a-date' }),
      createBug({ id: 'invalid-updated-at', updatedAt: 'not-a-date' }),
    ]

    window.localStorage.setItem(BUG_STORAGE_KEY, JSON.stringify(savedPayload))

    const result = loadBugs()

    expect(result.bugs).toEqual([validBug])
    expect(result.error).toContain('Some saved bugs could not be loaded')
    expect(window.localStorage.getItem(BUG_STORAGE_KEY)).toBe(
      JSON.stringify(savedPayload),
    )
  })

  it('does not throw when localStorage save fails', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new Error('storage blocked')
    })

    let result: ReturnType<typeof saveBugs> | null = null

    expect(() => {
      result = saveBugs([createBug()])
    }).not.toThrow()
    expect(result).toEqual({
      ok: false,
      error:
        'Bug changes are visible in this session, but they could not be saved to browser storage.',
    })
  })
})
