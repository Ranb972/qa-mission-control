import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRelease } from '../../test/releaseFactory'
import {
  RELEASE_STORAGE_KEY,
  loadReleases,
  saveReleases,
} from './releaseStorage'

describe('releaseStorage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    window.localStorage.clear()
  })

  it('saves and loads valid releases', () => {
    const release = createRelease()

    expect(saveReleases([release])).toEqual({ ok: true, error: null })
    expect(loadReleases()).toEqual({ releases: [release], error: null })
  })

  it('returns a non-destructive error for corrupt JSON', () => {
    window.localStorage.setItem(RELEASE_STORAGE_KEY, '{not valid json')

    const result = loadReleases()

    expect(result.releases).toEqual([])
    expect(result.error).toContain('could not be read')
    expect(window.localStorage.getItem(RELEASE_STORAGE_KEY)).toBe(
      '{not valid json',
    )
  })

  it('returns a non-destructive error for invalid saved data shape', () => {
    window.localStorage.setItem(
      RELEASE_STORAGE_KEY,
      JSON.stringify({ releases: [] }),
    )

    const result = loadReleases()

    expect(result.releases).toEqual([])
    expect(result.error).toContain('not in the expected format')
    expect(window.localStorage.getItem(RELEASE_STORAGE_KEY)).toBe(
      JSON.stringify({ releases: [] }),
    )
  })

  it('loads valid records and reports invalid records without rewriting storage', () => {
    const validRelease = createRelease()
    const savedPayload = [validRelease, { id: 'missing-fields' }]

    window.localStorage.setItem(RELEASE_STORAGE_KEY, JSON.stringify(savedPayload))

    const result = loadReleases()

    expect(result.releases).toEqual([validRelease])
    expect(result.error).toContain('Some saved releases could not be loaded')
    expect(window.localStorage.getItem(RELEASE_STORAGE_KEY)).toBe(
      JSON.stringify(savedPayload),
    )
  })

  it('rejects blank required fields and invalid dates without rewriting storage', () => {
    const validRelease = createRelease({ id: 'valid-release' })
    const savedPayload = [
      validRelease,
      createRelease({ id: 'blank-name', name: '   ' }),
      createRelease({ id: 'blank-version', version: '   ' }),
      createRelease({ id: 'invalid-target-date', targetDate: '2026-02-31' }),
      createRelease({ id: 'invalid-created-at', createdAt: 'not-a-date' }),
      createRelease({ id: 'invalid-updated-at', updatedAt: 'not-a-date' }),
    ]

    window.localStorage.setItem(RELEASE_STORAGE_KEY, JSON.stringify(savedPayload))

    const result = loadReleases()

    expect(result.releases).toEqual([validRelease])
    expect(result.error).toContain('Some saved releases could not be loaded')
    expect(window.localStorage.getItem(RELEASE_STORAGE_KEY)).toBe(
      JSON.stringify(savedPayload),
    )
  })

  it('rejects invalid status and notes values without rewriting storage', () => {
    const validRelease = createRelease({ id: 'valid-release' })
    const savedPayload = [
      validRelease,
      { ...createRelease({ id: 'invalid-status' }), status: 'Paused' },
      { ...createRelease({ id: 'invalid-notes' }), notes: 123 },
    ]

    window.localStorage.setItem(RELEASE_STORAGE_KEY, JSON.stringify(savedPayload))

    const result = loadReleases()

    expect(result.releases).toEqual([validRelease])
    expect(result.error).toContain('Some saved releases could not be loaded')
    expect(window.localStorage.getItem(RELEASE_STORAGE_KEY)).toBe(
      JSON.stringify(savedPayload),
    )
  })

  it('defaults missing notes to an empty string', () => {
    const release = createRelease()
    const releaseWithoutNotes: Partial<typeof release> = { ...release }
    delete releaseWithoutNotes.notes

    window.localStorage.setItem(
      RELEASE_STORAGE_KEY,
      JSON.stringify([releaseWithoutNotes]),
    )

    const result = loadReleases()

    expect(result.releases).toEqual([
      {
        ...release,
        notes: '',
      },
    ])
    expect(result.error).toBeNull()
  })

  it('does not throw when localStorage save fails', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new Error('storage blocked')
    })

    let result: ReturnType<typeof saveReleases> | null = null

    expect(() => {
      result = saveReleases([createRelease()])
    }).not.toThrow()
    expect(result).toEqual({
      ok: false,
      error:
        'Release changes are visible in this session, but they could not be saved to browser storage.',
    })
  })
})
