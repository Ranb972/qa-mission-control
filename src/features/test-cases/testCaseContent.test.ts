import { describe, expect, it } from 'vitest'
import { createTestCase } from '../../test/testCaseFactory'
import {
  deriveLegacyStepFields,
  getDisplayTestCaseSteps,
  getEditableTestCaseSteps,
  hasValidStructuredSteps,
  normalizeTestCaseSteps,
} from './testCaseContent'

describe('testCaseContent', () => {
  it('prefers structured steps when present', () => {
    const testCase = createTestCase({
      steps: 'Legacy action should not display.',
      expectedResult: 'Legacy expected result should not display.',
      structuredSteps: [
        {
          id: 'step-1',
          action: 'Open login.',
          expectedResult: 'Login opens.',
        },
      ],
    })

    expect(getDisplayTestCaseSteps(testCase)).toEqual([
      {
        id: 'step-1',
        action: 'Open login.',
        expectedResult: 'Login opens.',
        source: 'structured',
      },
    ])
  })

  it('falls back to legacy steps when structured steps are missing', () => {
    const testCase = createTestCase({
      id: 'legacy-test-case',
      steps: 'Open checkout.',
      expectedResult: 'Checkout opens.',
    })

    expect(getDisplayTestCaseSteps(testCase)).toEqual([
      {
        id: 'legacy-test-case-legacy-step',
        action: 'Open checkout.',
        expectedResult: 'Checkout opens.',
        source: 'legacy',
      },
    ])
  })

  it('initializes editing old flat test cases as one structured step', () => {
    const testCase = createTestCase({
      steps: 'Submit payment.',
      expectedResult: 'Payment succeeds.',
    })

    expect(getEditableTestCaseSteps(testCase)).toEqual([
      expect.objectContaining({
        action: 'Submit payment.',
        expectedResult: 'Payment succeeds.',
      }),
    ])
  })

  it('validates structured steps and derives compatibility fields', () => {
    const structuredSteps = normalizeTestCaseSteps([
      {
        id: 'step-1',
        action: ' Open profile. ',
        expectedResult: ' Profile opens. ',
      },
      {
        id: 'step-2',
        action: ' Save changes. ',
        expectedResult: ' Changes persist. ',
      },
    ])

    expect(hasValidStructuredSteps(structuredSteps)).toBe(true)
    expect(deriveLegacyStepFields(structuredSteps)).toEqual({
      steps: '1. Open profile.\n2. Save changes.',
      expectedResult: '1. Profile opens.\n2. Changes persist.',
    })
  })
})
