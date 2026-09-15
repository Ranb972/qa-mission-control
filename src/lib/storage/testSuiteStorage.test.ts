import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestSuite } from '../../test/testSuiteFactory'
import {
  TEST_SUITE_STORAGE_KEY,
  loadTestSuites,
  saveTestSuites,
} from './testSuiteStorage'

describe('testSuiteStorage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    window.localStorage.clear()
  })

  it('saves and loads valid test suites', () => {
    const suite = createTestSuite()

    expect(saveTestSuites([suite])).toEqual({ ok: true, error: null })
    expect(loadTestSuites()).toEqual({ testSuites: [suite], error: null })
  })

  it('returns a non-destructive error for corrupt JSON', () => {
    window.localStorage.setItem(TEST_SUITE_STORAGE_KEY, '{not valid json')

    const result = loadTestSuites()

    expect(result.testSuites).toEqual([])
    expect(result.error).toContain('could not be read')
    expect(window.localStorage.getItem(TEST_SUITE_STORAGE_KEY)).toBe(
      '{not valid json',
    )
  })

  it('returns a non-destructive error for invalid saved data shape', () => {
    window.localStorage.setItem(
      TEST_SUITE_STORAGE_KEY,
      JSON.stringify({ testSuites: [] }),
    )

    const result = loadTestSuites()

    expect(result.testSuites).toEqual([])
    expect(result.error).toContain('not in the expected format')
    expect(window.localStorage.getItem(TEST_SUITE_STORAGE_KEY)).toBe(
      JSON.stringify({ testSuites: [] }),
    )
  })

  it('loads valid records and reports invalid records without rewriting storage', () => {
    const validSuite = createTestSuite({ id: 'valid-suite' })
    const savedPayload = [validSuite, { id: 'missing-fields' }]

    window.localStorage.setItem(
      TEST_SUITE_STORAGE_KEY,
      JSON.stringify(savedPayload),
    )

    const result = loadTestSuites()

    expect(result.testSuites).toEqual([validSuite])
    expect(result.error).toContain('Some saved test suites could not be loaded')
    expect(window.localStorage.getItem(TEST_SUITE_STORAGE_KEY)).toBe(
      JSON.stringify(savedPayload),
    )
  })

  it('rejects invalid required fields and timestamps without rewriting storage', () => {
    const validSuite = createTestSuite({ id: 'valid-suite' })
    const savedPayload = [
      validSuite,
      createTestSuite({ id: 'blank-name', name: '   ' }),
      { ...createTestSuite({ id: 'invalid-type' }), type: 'Exploratory' },
      createTestSuite({ id: 'invalid-created-at', createdAt: 'not-a-date' }),
      createTestSuite({ id: 'invalid-updated-at', updatedAt: 'not-a-date' }),
    ]

    window.localStorage.setItem(
      TEST_SUITE_STORAGE_KEY,
      JSON.stringify(savedPayload),
    )

    const result = loadTestSuites()

    expect(result.testSuites).toEqual([validSuite])
    expect(result.error).toContain('Some saved test suites could not be loaded')
    expect(window.localStorage.getItem(TEST_SUITE_STORAGE_KEY)).toBe(
      JSON.stringify(savedPayload),
    )
  })

  it('rejects invalid test case ids without rewriting storage', () => {
    const validSuite = createTestSuite({ id: 'valid-suite' })
    const savedPayload = [
      validSuite,
      createTestSuite({
        id: 'invalid-test-case-ids',
        testCaseIds: ['test-case-1', ''],
      }),
      { ...createTestSuite({ id: 'not-array' }), testCaseIds: 'test-case-1' },
    ]

    window.localStorage.setItem(
      TEST_SUITE_STORAGE_KEY,
      JSON.stringify(savedPayload),
    )

    const result = loadTestSuites()

    expect(result.testSuites).toEqual([validSuite])
    expect(result.error).toContain('Some saved test suites could not be loaded')
    expect(window.localStorage.getItem(TEST_SUITE_STORAGE_KEY)).toBe(
      JSON.stringify(savedPayload),
    )
  })

  it('defaults missing descriptions to an empty string', () => {
    const suite = createTestSuite()
    const suiteWithoutDescription: Partial<typeof suite> = { ...suite }
    delete suiteWithoutDescription.description

    window.localStorage.setItem(
      TEST_SUITE_STORAGE_KEY,
      JSON.stringify([suiteWithoutDescription]),
    )

    const result = loadTestSuites()

    expect(result.testSuites).toEqual([
      {
        ...suite,
        description: '',
      },
    ])
    expect(result.error).toBeNull()
  })

  it('does not throw when localStorage save fails', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new Error('storage blocked')
    })

    let result: ReturnType<typeof saveTestSuites> | null = null

    expect(() => {
      result = saveTestSuites([createTestSuite()])
    }).not.toThrow()
    expect(result).toEqual({
      ok: false,
      error:
        'Test suite changes are visible in this session, but they could not be saved to browser storage.',
    })
  })
})
