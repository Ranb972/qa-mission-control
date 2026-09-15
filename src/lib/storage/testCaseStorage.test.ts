import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestCase } from '../../test/testCaseFactory'
import {
  TEST_CASE_STORAGE_KEY,
  loadTestCases,
  saveTestCases,
} from './testCaseStorage'

describe('testCaseStorage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    window.localStorage.clear()
  })

  it('saves and loads valid test cases', () => {
    const testCase = createTestCase()

    expect(saveTestCases([testCase])).toEqual({ ok: true, error: null })
    expect(loadTestCases()).toEqual({ testCases: [testCase], error: null })
  })

  it('saves and loads test cases with preconditions and structured steps', () => {
    const testCase = createTestCase({
      preconditions: 'User exists and feature flag is enabled.',
      structuredSteps: [
        {
          id: 'step-1',
          action: 'Open the login page.',
          expectedResult: 'The login page is visible.',
        },
        {
          id: 'step-2',
          action: 'Submit valid credentials.',
          expectedResult: 'The dashboard opens.',
        },
      ],
    })

    expect(saveTestCases([testCase])).toEqual({ ok: true, error: null })
    expect(loadTestCases()).toEqual({ testCases: [testCase], error: null })
  })

  it('saves and loads optional QA source provenance', () => {
    const testCase = createTestCase({
      qaSourceId: 'qa-source-1',
    })

    expect(saveTestCases([testCase])).toEqual({ ok: true, error: null })
    expect(loadTestCases()).toEqual({ testCases: [testCase], error: null })
  })

  it('returns a non-destructive error for corrupt JSON', () => {
    window.localStorage.setItem(TEST_CASE_STORAGE_KEY, '{not valid json')

    const result = loadTestCases()

    expect(result.testCases).toEqual([])
    expect(result.error).toContain('could not be read')
    expect(window.localStorage.getItem(TEST_CASE_STORAGE_KEY)).toBe(
      '{not valid json',
    )
  })

  it('returns a non-destructive error for invalid saved data shape', () => {
    window.localStorage.setItem(
      TEST_CASE_STORAGE_KEY,
      JSON.stringify({ testCases: [] }),
    )

    const result = loadTestCases()

    expect(result.testCases).toEqual([])
    expect(result.error).toContain('not in the expected format')
    expect(window.localStorage.getItem(TEST_CASE_STORAGE_KEY)).toBe(
      JSON.stringify({ testCases: [] }),
    )
  })

  it('loads valid records and reports invalid records without rewriting storage', () => {
    const validTestCase = createTestCase()
    const savedPayload = [validTestCase, { id: 'missing-fields' }]

    window.localStorage.setItem(TEST_CASE_STORAGE_KEY, JSON.stringify(savedPayload))

    const result = loadTestCases()

    expect(result.testCases).toEqual([validTestCase])
    expect(result.error).toContain('Some saved test cases could not be loaded')
    expect(window.localStorage.getItem(TEST_CASE_STORAGE_KEY)).toBe(
      JSON.stringify(savedPayload),
    )
  })

  it('loads old flat records without new structured fields', () => {
    const oldTestCase = {
      id: 'legacy-test-case',
      title: 'Legacy checkout works',
      area: 'Checkout',
      priority: 'Medium',
      status: 'Not Run',
      type: 'Functional',
      steps: 'Pay for an order.',
      expectedResult: 'The order is confirmed.',
      createdAt: '2026-05-07T08:00:00.000Z',
      updatedAt: '2026-05-07T08:00:00.000Z',
    }

    window.localStorage.setItem(
      TEST_CASE_STORAGE_KEY,
      JSON.stringify([oldTestCase]),
    )

    expect(loadTestCases()).toEqual({
      testCases: [oldTestCase],
      error: null,
    })
  })

  it('does not crash when saved structured steps are invalid', () => {
    const savedPayload = [
      {
        ...createTestCase({
          id: 'structured-test-case',
          preconditions: 'Account exists.',
        }),
        structuredSteps: [
          {
            id: 'valid-step',
            action: 'Open profile.',
            expectedResult: 'Profile opens.',
          },
          {
            id: 'invalid-step',
            action: '',
            expectedResult: 'This should be ignored.',
          },
        ],
      },
    ]

    window.localStorage.setItem(TEST_CASE_STORAGE_KEY, JSON.stringify(savedPayload))

    const result = loadTestCases()

    expect(result.testCases).toEqual([
      expect.objectContaining({
        id: 'structured-test-case',
        structuredSteps: [
          {
            id: 'valid-step',
            action: 'Open profile.',
            expectedResult: 'Profile opens.',
          },
        ],
      }),
    ])
    expect(result.error).toContain('Some saved test cases could not be loaded')
  })

  it('does not throw when localStorage save fails', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new Error('storage blocked')
    })

    let result: ReturnType<typeof saveTestCases> | null = null

    expect(() => {
      result = saveTestCases([createTestCase()])
    }).not.toThrow()
    expect(result).toEqual({
      ok: false,
      error:
        'Changes are visible in this session, but they could not be saved to browser storage.',
    })
  })
})
