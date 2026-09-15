import {
  TEST_CASE_PRIORITIES,
  TEST_CASE_TYPES,
  type TestCasePriority,
  type TestCaseType,
} from '../test-cases/testCaseTypes'
import type {
  AiSuggestionStatus,
  AiTestCaseSuggestion,
  ParseAiSuggestionResult,
} from './aiSuggestionTypes'

export const AI_SUGGESTION_MAX_COUNT = 8
export const AI_SUGGESTION_TITLE_MAX_LENGTH = 140
export const AI_SUGGESTION_AREA_MAX_LENGTH = 80
export const AI_SUGGESTION_PRECONDITIONS_MAX_LENGTH = 1_000
export const AI_SUGGESTION_STEP_FIELD_MAX_LENGTH = 700
export const AI_SUGGESTION_STEP_MAX_COUNT = 20
export const AI_SUGGESTION_NOTE_MAX_LENGTH = 240
export const AI_SUGGESTION_NOTE_MAX_COUNT = 5

const AI_SUGGESTION_VAGUE_PHRASES = [
  'verify it works',
  'check functionality',
  'system behaves correctly',
  'the system behaves as expected',
  'appropriate message',
  'correct result',
  'the action succeeds',
  'login is not allowed',
  'as expected',
  'works as expected',
] as const

const AI_SUGGESTION_COMPOUND_ONE_STEP_WARNING =
  'One-step suggestion appears to combine multiple actions or outcomes; split it into steps or confirm it is atomic.'

const AI_SUGGESTION_ACTION_RESULT_MISMATCH_WARNING =
  'Step 1 action appears input-only but the expected result describes a system transition; add the missing trigger action or revise the expected result.'

const COMPOUND_STEP_ACTION_VERBS = [
  'add',
  'approve',
  'assign',
  'check',
  'click',
  'complete',
  'confirm',
  'create',
  'delete',
  'enter',
  'log in',
  'log out',
  'navigate',
  'open',
  'refresh',
  'reject',
  'remove',
  'save',
  'select',
  'submit',
  'trigger',
  'update',
  'upload',
  'validate',
  'verify',
] as const

const INPUT_ONLY_ACTION_TERMS = [
  'enter',
  'fill',
  'input',
  'provide',
  'type',
] as const

const EXPLICIT_TRIGGER_ACTION_TERMS = [
  'attempt',
  'click',
  'confirm',
  'log in',
  'log out',
  'press',
  'refresh',
  'save',
  'submit',
  'tap',
  'upload',
] as const

const SYSTEM_TRANSITION_RESULT_TERMS = [
  'access is granted',
  'access remains blocked',
  'account is locked',
  'account remains locked',
  'authenticated session',
  'dashboard',
  'data is saved',
  'is created',
  'is deleted',
  'is persisted',
  'is redirected',
  'is saved',
  'is terminated',
  'is updated',
  'lockout',
  'permission',
  'redirect',
  'session is created',
  'session remains active',
  'state is saved',
  'status changes',
  'status transition',
  'user is redirected',
] as const

type RawSuggestion = Record<string, unknown>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function asString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function isAllowedValue<T extends readonly string[]>(
  allowedValues: T,
  value: string,
): value is T[number] {
  return allowedValues.includes(value)
}

function normalizeComparableText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function containsVaguePhrase(value: string) {
  const comparableValue = normalizeComparableText(value)

  return AI_SUGGESTION_VAGUE_PHRASES.some((phrase) =>
    comparableValue.includes(normalizeComparableText(phrase)),
  )
}

function countCompoundActionVerbs(value: string) {
  const comparableValue = ` ${normalizeComparableText(value)} `

  return COMPOUND_STEP_ACTION_VERBS.reduce((count, verb) => {
    const pattern = new RegExp(`\\b${normalizeComparableText(verb)}\\b`, 'g')
    return count + (comparableValue.match(pattern)?.length ?? 0)
  }, 0)
}

function containsComparableTerm(
  value: string,
  terms: readonly string[],
) {
  const comparableValue = ` ${normalizeComparableText(value)} `

  return terms.some((term) =>
    comparableValue.includes(` ${normalizeComparableText(term)} `),
  )
}

function appearsInputOnlyAction(action: string) {
  return (
    containsComparableTerm(action, INPUT_ONLY_ACTION_TERMS) &&
    !containsComparableTerm(action, EXPLICIT_TRIGGER_ACTION_TERMS)
  )
}

function expectedResultDescribesSystemTransition(expectedResult: string) {
  return containsComparableTerm(expectedResult, SYSTEM_TRANSITION_RESULT_TERMS)
}

function appearsToCompressMultipleActions(action: string) {
  const comparableAction = normalizeComparableText(action)
  const strongActionCount = countCompoundActionVerbs(action)
  const hasListSyntax = /(?:^|\n|\r)\s*(?:\d+\.|[-*])\s+\S/.test(action)
  const hasSemicolon = action.includes(';')
  const commaClauseCount = action.split(',').filter((part) => part.trim()).length
  const hasSequenceWord = /\b(?:then|next|after|before)\b/.test(comparableAction)
  const hasAssertionInAction =
    /\b(?:and|then|next)\s+(?:verify|confirm|check|validate)\b/.test(
      comparableAction,
    )

  return (
    hasListSyntax ||
    (hasAssertionInAction && strongActionCount >= 2) ||
    (strongActionCount >= 3 &&
      (hasSemicolon || commaClauseCount >= 3 || hasSequenceWord))
  )
}

function hasActionExpectedResultMismatch({
  action,
  expectedResult,
}: {
  action: string
  expectedResult: string
}) {
  return (
    appearsInputOnlyAction(action) &&
    expectedResultDescribesSystemTransition(expectedResult)
  )
}

function normalizeLimitedString(
  value: unknown,
  maxLength: number,
  fieldLabel: string,
  warnings: string[],
) {
  const text = asString(value)

  if (text.length <= maxLength) {
    return text
  }

  warnings.push(`${fieldLabel} was longer than the supported limit and was truncated.`)
  return text.slice(0, maxLength).trimEnd()
}

function readStringList(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item) => asString(item))
    .filter(Boolean)
    .slice(0, AI_SUGGESTION_NOTE_MAX_COUNT)
    .map((item) =>
      item.length > AI_SUGGESTION_NOTE_MAX_LENGTH
        ? item.slice(0, AI_SUGGESTION_NOTE_MAX_LENGTH).trimEnd()
        : item,
    )
}

function normalizePriority(value: unknown, warnings: string[]) {
  const priority = asString(value)

  if (isAllowedValue(TEST_CASE_PRIORITIES, priority)) {
    return priority
  }

  warnings.push(
    priority
      ? `Priority "${priority}" is not supported.`
      : 'Priority is missing.',
  )
  return 'Medium'
}

function normalizeType(value: unknown, warnings: string[]) {
  const testCaseType = asString(value)

  if (isAllowedValue(TEST_CASE_TYPES, testCaseType)) {
    return testCaseType
  }

  warnings.push(
    testCaseType
      ? `Type "${testCaseType}" is not supported.`
      : 'Type is missing.',
  )
  return 'Functional'
}

function readStructuredSteps(value: unknown, warnings: string[]) {
  if (!Array.isArray(value)) {
    warnings.push('Structured steps are missing.')
    return []
  }

  if (value.length > AI_SUGGESTION_STEP_MAX_COUNT) {
    warnings.push(
      `Suggestion had too many steps and was limited to the first ${AI_SUGGESTION_STEP_MAX_COUNT} steps.`,
    )
  }

  return value
    .slice(0, AI_SUGGESTION_STEP_MAX_COUNT)
    .map((item, index) => {
      if (!isRecord(item)) {
        warnings.push(`Step ${index + 1} is not in the expected format.`)
        return null
      }

      const action = normalizeLimitedString(
        item.action,
        AI_SUGGESTION_STEP_FIELD_MAX_LENGTH,
        `Step ${index + 1} action`,
        warnings,
      )
      const expectedResult = normalizeLimitedString(
        item.expectedResult,
        AI_SUGGESTION_STEP_FIELD_MAX_LENGTH,
        `Step ${index + 1} expected result`,
        warnings,
      )

      if (!action || !expectedResult) {
        warnings.push(
          `Step ${index + 1} must include both an action and an expected result.`,
        )
      }

      if (action && containsVaguePhrase(action)) {
        warnings.push(`Step ${index + 1} action is too vague for import-ready coverage.`)
      }

      if (expectedResult && containsVaguePhrase(expectedResult)) {
        warnings.push(
          `Step ${index + 1} expected result is too vague for import-ready coverage.`,
        )
      }

      return {
        id: `ai-step-${index + 1}`,
        action,
        expectedResult,
      }
    })
    .filter((step): step is NonNullable<typeof step> => step !== null)
}

function getSuggestionStatus({
  title,
  area,
  structuredSteps,
  evidence,
  assumptions,
  warnings,
}: {
  title: string
  area: string
  structuredSteps: Array<{ action: string; expectedResult: string }>
  evidence: string[]
  assumptions: string[]
  warnings: string[]
}): AiSuggestionStatus {
  if (!title || structuredSteps.length === 0) {
    return 'rejected'
  }

  const hasAnyStepContent = structuredSteps.some(
    (step) => step.action || step.expectedResult,
  )

  if (!hasAnyStepContent) {
    return 'rejected'
  }

  const hasIncompleteStep = structuredSteps.some(
    (step) => !step.action || !step.expectedResult,
  )

  if (
    !area ||
    evidence.length === 0 ||
    assumptions.length > 0 ||
    warnings.length > 0 ||
    hasIncompleteStep
  ) {
    return 'needs_review'
  }

  return 'ready'
}

function createDuplicateKey(suggestion: AiTestCaseSuggestion) {
  const parts = [
    normalizeComparableText(suggestion.title),
    normalizeComparableText(suggestion.area),
    ...suggestion.structuredSteps.flatMap((step) => [
      normalizeComparableText(step.action),
      normalizeComparableText(step.expectedResult),
    ]),
  ].filter(Boolean)

  return parts.length > 0 ? parts.join('|') : ''
}

function markDuplicateSuggestions(suggestions: AiTestCaseSuggestion[]) {
  const seenKeys = new Set<string>()

  return suggestions.map((suggestion) => {
    const duplicateKey = createDuplicateKey(suggestion)

    if (!duplicateKey || !seenKeys.has(duplicateKey)) {
      seenKeys.add(duplicateKey)
      return suggestion
    }

    if (suggestion.status === 'rejected') {
      return suggestion
    }

    return {
      ...suggestion,
      status: 'needs_review' as const,
      warnings: [
        ...suggestion.warnings,
        'Suggestion appears to duplicate an earlier scenario and needs QA review.',
      ],
    }
  })
}

function normalizeSuggestion(
  rawSuggestion: RawSuggestion,
  index: number,
  qaSourceId: string,
) {
  const warnings = readStringList(rawSuggestion.warnings)
  const title = normalizeLimitedString(
    rawSuggestion.title,
    AI_SUGGESTION_TITLE_MAX_LENGTH,
    'Title',
    warnings,
  )
  const area = normalizeLimitedString(
    rawSuggestion.area,
    AI_SUGGESTION_AREA_MAX_LENGTH,
    'Area',
    warnings,
  )
  const priority = normalizePriority(rawSuggestion.priority, warnings)
  const type = normalizeType(rawSuggestion.type, warnings)
  const preconditions = normalizeLimitedString(
    rawSuggestion.preconditions,
    AI_SUGGESTION_PRECONDITIONS_MAX_LENGTH,
    'Preconditions',
    warnings,
  )
  const structuredSteps = readStructuredSteps(
    rawSuggestion.structuredSteps,
    warnings,
  )
  const evidence = readStringList(rawSuggestion.evidence)
  const assumptions = readStringList(rawSuggestion.assumptions)

  if (
    structuredSteps.length === 1 &&
    structuredSteps[0].action &&
    structuredSteps[0].expectedResult &&
    appearsToCompressMultipleActions(structuredSteps[0].action)
  ) {
    warnings.push(AI_SUGGESTION_COMPOUND_ONE_STEP_WARNING)
  }

  if (
    structuredSteps.length === 1 &&
    structuredSteps[0].action &&
    structuredSteps[0].expectedResult &&
    hasActionExpectedResultMismatch(structuredSteps[0])
  ) {
    warnings.push(AI_SUGGESTION_ACTION_RESULT_MISMATCH_WARNING)
  }

  if (evidence.length === 0) {
    warnings.push('Evidence is missing; verify source support before import.')
  }

  if (assumptions.length > 0) {
    warnings.push('Assumptions require QA review before import.')
  }

  const status = getSuggestionStatus({
    title,
    area,
    structuredSteps,
    evidence,
    assumptions,
    warnings,
  })

  return {
    id: `ai-suggestion-${index + 1}`,
    qaSourceId,
    status,
    title,
    area,
    priority: priority as TestCasePriority,
    type: type as TestCaseType,
    preconditions,
    structuredSteps,
    evidence,
    assumptions,
    warnings,
  } satisfies AiTestCaseSuggestion
}

function parseRawResponse(rawResponse: unknown) {
  if (typeof rawResponse !== 'string') {
    return rawResponse
  }

  try {
    return JSON.parse(rawResponse) as unknown
  } catch {
    return null
  }
}

export function parseAiSuggestionResponse(
  rawResponse: unknown,
  options: { qaSourceId: string; maxSuggestions?: number },
): ParseAiSuggestionResult {
  const parsedResponse = parseRawResponse(rawResponse)

  if (!parsedResponse) {
    return {
      ok: false,
      suggestions: [],
      error: 'AI response was not valid JSON.',
      warnings: [],
    }
  }

  if (
    !isRecord(parsedResponse) ||
    !Array.isArray(parsedResponse.suggestions)
  ) {
    return {
      ok: false,
      suggestions: [],
      error: 'AI response must include a suggestions array.',
      warnings: [],
    }
  }

  const maxSuggestions = options.maxSuggestions ?? AI_SUGGESTION_MAX_COUNT
  const rawSuggestions = parsedResponse.suggestions.slice(0, maxSuggestions)
  const responseWarnings = readStringList(parsedResponse.warnings)
  const countWarnings =
    parsedResponse.suggestions.length > maxSuggestions
      ? [`Only the first ${maxSuggestions} suggestions were kept for review.`]
      : []
  const warnings = [...responseWarnings, ...countWarnings]
  const suggestions = markDuplicateSuggestions(
    rawSuggestions
      .filter(isRecord)
      .map((suggestion, index) =>
        normalizeSuggestion(suggestion, index, options.qaSourceId),
      ),
  )

  return {
    ok: true,
    suggestions,
    error: null,
    warnings,
  }
}

export function groupAiSuggestions(suggestions: AiTestCaseSuggestion[]) {
  return {
    ready: suggestions.filter((suggestion) => suggestion.status === 'ready'),
    needsReview: suggestions.filter(
      (suggestion) => suggestion.status === 'needs_review',
    ),
    rejected: suggestions.filter(
      (suggestion) => suggestion.status === 'rejected',
    ),
  }
}
