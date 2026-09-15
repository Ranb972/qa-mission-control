import type { TestCase, TestCaseStep } from './testCaseTypes'

export type DisplayTestCaseStep = TestCaseStep & {
  source: 'structured' | 'legacy'
}

let fallbackStepId = 0

export function createTestCaseStepId() {
  const randomId = globalThis.crypto?.randomUUID?.()

  if (randomId) {
    return randomId
  }

  fallbackStepId += 1
  return `test-step-${Date.now()}-${fallbackStepId}`
}

export function hasValidStructuredSteps(
  structuredSteps: TestCase['structuredSteps'],
): structuredSteps is TestCaseStep[] {
  return (
    Array.isArray(structuredSteps) &&
    structuredSteps.length > 0 &&
    structuredSteps.every(
      (step) =>
        step.action.trim() !== '' && step.expectedResult.trim() !== '',
    )
  )
}

export function getDisplayPreconditions(testCase: TestCase) {
  return testCase.preconditions?.trim() ?? ''
}

export function getDisplayTestCaseSteps(
  testCase: TestCase,
): DisplayTestCaseStep[] {
  if (hasValidStructuredSteps(testCase.structuredSteps)) {
    return testCase.structuredSteps.map((step) => ({
      id: step.id,
      action: step.action,
      expectedResult: step.expectedResult,
      source: 'structured',
    }))
  }

  return [
    {
      id: `${testCase.id}-legacy-step`,
      action: testCase.steps,
      expectedResult: testCase.expectedResult,
      source: 'legacy',
    },
  ]
}

export function getEditableTestCaseSteps(testCase?: TestCase | null) {
  if (!testCase) {
    return [
      {
        id: createTestCaseStepId(),
        action: '',
        expectedResult: '',
      },
    ]
  }

  if (hasValidStructuredSteps(testCase.structuredSteps)) {
    return testCase.structuredSteps.map((step) => ({
      id: step.id,
      action: step.action,
      expectedResult: step.expectedResult,
    }))
  }

  return [
    {
      id: createTestCaseStepId(),
      action: testCase.steps,
      expectedResult: testCase.expectedResult,
    },
  ]
}

export function normalizeTestCaseSteps(
  structuredSteps: TestCaseStep[],
): TestCaseStep[] {
  return structuredSteps.map((step) => ({
    id: step.id,
    action: step.action.trim(),
    expectedResult: step.expectedResult.trim(),
  }))
}

export function deriveLegacyStepFields(structuredSteps: TestCaseStep[]) {
  return {
    steps: structuredSteps
      .map((step, index) => `${index + 1}. ${step.action}`)
      .join('\n'),
    expectedResult: structuredSteps
      .map((step, index) => `${index + 1}. ${step.expectedResult}`)
      .join('\n'),
  }
}
