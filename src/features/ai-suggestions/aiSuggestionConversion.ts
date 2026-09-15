import {
  TEST_CASE_PRIORITIES,
  TEST_CASE_TYPES,
  type TestCase,
} from '../test-cases/testCaseTypes'
import {
  deriveLegacyStepFields,
  normalizeTestCaseSteps,
} from '../test-cases/testCaseContent'
import type { AiTestCaseSuggestion } from './aiSuggestionTypes'
import { AI_SUGGESTION_STEP_MAX_COUNT } from './aiSuggestionValidation'

type ConvertSuggestionOptions = {
  now: string
  createId: () => string
}

function isAllowedValue<T extends readonly string[]>(
  allowedValues: T,
  value: string,
): value is T[number] {
  return allowedValues.includes(value)
}

function isReadySuggestion(suggestion: AiTestCaseSuggestion) {
  return (
    suggestion.status === 'ready' &&
    suggestion.qaSourceId.trim() !== '' &&
    suggestion.title.trim() !== '' &&
    suggestion.area.trim() !== '' &&
    isAllowedValue(TEST_CASE_PRIORITIES, suggestion.priority) &&
    isAllowedValue(TEST_CASE_TYPES, suggestion.type) &&
    suggestion.evidence.length > 0 &&
    suggestion.assumptions.length === 0 &&
    suggestion.warnings.length === 0 &&
    suggestion.structuredSteps.length > 0 &&
    suggestion.structuredSteps.length <= AI_SUGGESTION_STEP_MAX_COUNT &&
    suggestion.structuredSteps.every(
      (step) =>
        step.action.trim() !== '' && step.expectedResult.trim() !== '',
    )
  )
}

export function convertAiSuggestionToTestCase(
  suggestion: AiTestCaseSuggestion,
  { now, createId }: ConvertSuggestionOptions,
): TestCase | null {
  if (!isReadySuggestion(suggestion)) {
    return null
  }

  const structuredSteps = normalizeTestCaseSteps(suggestion.structuredSteps)
  const legacyFields = deriveLegacyStepFields(structuredSteps)

  return {
    id: createId(),
    title: suggestion.title.trim(),
    area: suggestion.area.trim(),
    priority: suggestion.priority,
    status: 'Not Run',
    type: suggestion.type,
    preconditions: suggestion.preconditions.trim(),
    structuredSteps,
    qaSourceId: suggestion.qaSourceId,
    ...legacyFields,
    createdAt: now,
    updatedAt: now,
  }
}

export function convertReadyAiSuggestionsToTestCases(
  suggestions: AiTestCaseSuggestion[],
  options: ConvertSuggestionOptions,
) {
  return suggestions
    .map((suggestion) => convertAiSuggestionToTestCase(suggestion, options))
    .filter((testCase): testCase is TestCase => testCase !== null)
}
