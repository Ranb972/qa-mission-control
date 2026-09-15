import {
  TEST_CASE_PRIORITIES,
  TEST_CASE_TYPES,
  type TestCasePriority,
  type TestCaseType,
} from '../test-cases/testCaseTypes'
import {
  AI_COVERAGE_AREA_ANALYSIS_SCOPES,
  AI_COVERAGE_AREA_CONFIDENCES,
  AI_COVERAGE_AREA_SUGGESTION_SCHEMA_VERSION,
  AI_COVERAGE_AREA_SUGGESTION_STATUSES,
  AI_COVERAGE_LEVELS,
  type AiCoverageAreaConfidence,
  type AiCoverageAreaSuggestionResult,
  type AiCoverageAreaSuggestionSelectedArea,
  type AiCoverageAreaSuggestionStatus,
  type AiCoverageAreaTestCaseSuggestion,
  type AiCoverageAssessment,
  type AiCoverageLevel,
  type ParseAiCoverageAreaSuggestionResult,
} from './aiCoverageAreaSuggestionTypes'
import {
  AI_COVERAGE_PLAN_READINESSES,
  type AiCoveragePlanReadiness,
} from './aiCoveragePlanTypes'
import {
  AI_SUGGESTION_AREA_MAX_LENGTH,
  AI_SUGGESTION_NOTE_MAX_COUNT,
  AI_SUGGESTION_NOTE_MAX_LENGTH,
  AI_SUGGESTION_PRECONDITIONS_MAX_LENGTH,
  AI_SUGGESTION_STEP_FIELD_MAX_LENGTH,
  AI_SUGGESTION_STEP_MAX_COUNT,
  AI_SUGGESTION_TITLE_MAX_LENGTH,
} from './aiSuggestionValidation'

export const AI_COVERAGE_AREA_SUGGESTION_MAX_COUNT = 8
export const AI_COVERAGE_AREA_ASSESSMENT_ITEM_MAX_COUNT = 20
export const AI_COVERAGE_AREA_ASSESSMENT_TEXT_MAX_LENGTH = 500
export const AI_COVERAGE_AREA_STOP_REASON_MAX_LENGTH = 700

const AREA_SUGGESTION_COMPOUND_ONE_STEP_WARNING =
  'One-step suggestion appears to combine multiple actions or outcomes; split it into steps or confirm it is atomic.'

const AREA_SUGGESTION_ACTION_RESULT_MISMATCH_WARNING =
  'Step 1 action appears input-only but the expected result describes a system transition; add the missing trigger action or revise the expected result.'

const AREA_SUGGESTION_BLOCKED_READINESS_WARNING =
  'Blocked areas cannot produce import-ready suggestions.'

const PROVIDER_BLOCKED_AREA_WARNING =
  'Provider marked the selected area as blocked by ambiguity; blocked areas cannot produce import-ready suggestions.'

const VAGUE_PHRASES = [
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
  return typeof value === 'object' && value !== null && !Array.isArray(value)
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

function readStringList(
  value: unknown,
  maxCount = AI_SUGGESTION_NOTE_MAX_COUNT,
  maxLength = AI_SUGGESTION_NOTE_MAX_LENGTH,
) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item) => asString(item))
    .filter(Boolean)
    .slice(0, maxCount)
    .map((item) =>
      item.length > maxLength ? item.slice(0, maxLength).trimEnd() : item,
    )
}

function containsComparableTerm(value: string, terms: readonly string[]) {
  const comparableValue = ` ${normalizeComparableText(value)} `

  return terms.some((term) =>
    comparableValue.includes(` ${normalizeComparableText(term)} `),
  )
}

function containsVaguePhrase(value: string) {
  const comparableValue = normalizeComparableText(value)

  return VAGUE_PHRASES.some((phrase) =>
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

function appearsInputOnlyAction(action: string) {
  return (
    containsComparableTerm(action, INPUT_ONLY_ACTION_TERMS) &&
    !containsComparableTerm(action, EXPLICIT_TRIGGER_ACTION_TERMS)
  )
}

function expectedResultDescribesSystemTransition(expectedResult: string) {
  return containsComparableTerm(expectedResult, SYSTEM_TRANSITION_RESULT_TERMS)
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

function hasEveryEvidenceItemInSource(evidence: string[], sourceContent: string) {
  return evidence.length > 0 && evidence.every((item) => sourceContent.includes(item))
}

function readStatus(
  value: unknown,
  warnings: string[],
): AiCoverageAreaSuggestionStatus {
  const status = asString(value)

  if (isAllowedValue(AI_COVERAGE_AREA_SUGGESTION_STATUSES, status)) {
    return status
  }

  warnings.push(
    status
      ? `Status "${status}" is not supported.`
      : 'Status is missing.',
  )
  return 'Needs review'
}

function readConfidence(
  value: unknown,
  warnings: string[],
): AiCoverageAreaConfidence {
  const confidence = asString(value)

  if (isAllowedValue(AI_COVERAGE_AREA_CONFIDENCES, confidence)) {
    return confidence
  }

  warnings.push(
    confidence
      ? `Confidence "${confidence}" is not supported.`
      : 'Confidence is missing.',
  )
  return 'Medium'
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
        warnings.push(`Step ${index + 1} action is too vague for Ready coverage.`)
      }

      if (expectedResult && containsVaguePhrase(expectedResult)) {
        warnings.push(
          `Step ${index + 1} expected result is too vague for Ready coverage.`,
        )
      }

      return {
        id: `ai-area-step-${index + 1}`,
        action,
        expectedResult,
      }
    })
    .filter((step): step is NonNullable<typeof step> => step !== null)
}

function getNormalizedStatus({
  providerStatus,
  title,
  area,
  selectedArea,
  structuredSteps,
  evidence,
  assumptions,
  warnings,
  sourceContent,
}: {
  providerStatus: AiCoverageAreaSuggestionStatus
  title: string
  area: string
  selectedArea: AiCoverageAreaSuggestionSelectedArea
  structuredSteps: Array<{ action: string; expectedResult: string }>
  evidence: string[]
  assumptions: string[]
  warnings: string[]
  sourceContent: string
}): AiCoverageAreaSuggestionStatus {
  if (providerStatus === 'Rejected') {
    return 'Rejected'
  }

  if (!title || structuredSteps.length === 0) {
    return 'Rejected'
  }

  const hasAnyStepContent = structuredSteps.some(
    (step) => step.action || step.expectedResult,
  )

  if (!hasAnyStepContent) {
    return 'Rejected'
  }

  const hasIncompleteStep = structuredSteps.some(
    (step) => !step.action || !step.expectedResult,
  )
  const areaMatchesSelectedArea =
    normalizeComparableText(area) === normalizeComparableText(selectedArea.name)
  const hasMatchingEvidence = hasEveryEvidenceItemInSource(evidence, sourceContent)

  if (
    providerStatus === 'Needs review' ||
    selectedArea.generationReadiness !== 'source_backed' ||
    !area ||
    !areaMatchesSelectedArea ||
    !hasMatchingEvidence ||
    assumptions.length > 0 ||
    warnings.length > 0 ||
    hasIncompleteStep
  ) {
    return 'Needs review'
  }

  return 'Ready'
}

function normalizeSuggestion({
  rawSuggestion,
  index,
  qaSourceId,
  selectedArea,
  sourceContent,
}: {
  rawSuggestion: RawSuggestion
  index: number
  qaSourceId: string
  selectedArea: AiCoverageAreaSuggestionSelectedArea
  sourceContent: string
}) {
  const warnings = readStringList(rawSuggestion.warnings)
  const providerStatus = readStatus(rawSuggestion.status, warnings)
  const confidence = readConfidence(rawSuggestion.confidence, warnings)
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
  const areaMatchesSelectedArea =
    normalizeComparableText(area) === normalizeComparableText(selectedArea.name)

  if (!areaMatchesSelectedArea) {
    warnings.push('Suggestion area does not match the selected coverage area.')
  }

  if (
    structuredSteps.length === 1 &&
    structuredSteps[0].action &&
    structuredSteps[0].expectedResult &&
    appearsToCompressMultipleActions(structuredSteps[0].action)
  ) {
    warnings.push(AREA_SUGGESTION_COMPOUND_ONE_STEP_WARNING)
  }

  if (
    structuredSteps.length === 1 &&
    structuredSteps[0].action &&
    structuredSteps[0].expectedResult &&
    hasActionExpectedResultMismatch(structuredSteps[0])
  ) {
    warnings.push(AREA_SUGGESTION_ACTION_RESULT_MISMATCH_WARNING)
  }

  if (evidence.length === 0) {
    warnings.push('Evidence is missing; verify source support before import.')
  } else if (!hasEveryEvidenceItemInSource(evidence, sourceContent)) {
    warnings.push(
      'One or more evidence excerpts were not found in the visible packed source.',
    )
  }

  if (assumptions.length > 0) {
    warnings.push('Assumptions require QA review before import.')
  }

  if (selectedArea.generationReadiness === 'blocked_by_ambiguity') {
    warnings.push(AREA_SUGGESTION_BLOCKED_READINESS_WARNING)
  }

  const status = getNormalizedStatus({
    providerStatus,
    title,
    area,
    selectedArea,
    structuredSteps,
    evidence,
    assumptions,
    warnings,
    sourceContent,
  })

  return {
    id: `ai-area-suggestion-${index + 1}`,
    qaSourceId,
    status,
    confidence,
    title,
    area,
    priority: priority as TestCasePriority,
    type: type as TestCaseType,
    preconditions,
    structuredSteps,
    evidence,
    assumptions,
    warnings,
  } satisfies AiCoverageAreaTestCaseSuggestion
}

function createDuplicateKey(suggestion: AiCoverageAreaTestCaseSuggestion) {
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

function markDuplicateSuggestions(
  suggestions: AiCoverageAreaTestCaseSuggestion[],
) {
  const seenKeys = new Set<string>()

  return suggestions.map((suggestion) => {
    const duplicateKey = createDuplicateKey(suggestion)

    if (!duplicateKey || !seenKeys.has(duplicateKey)) {
      seenKeys.add(duplicateKey)
      return suggestion
    }

    if (suggestion.status === 'Rejected') {
      return suggestion
    }

    return {
      ...suggestion,
      status: 'Needs review' as const,
      warnings: [
        ...suggestion.warnings,
        'Suggestion appears to duplicate an earlier scenario and needs QA review.',
      ],
    }
  })
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

function readCoverageLevel(value: unknown, warnings: string[]): AiCoverageLevel {
  const coverageLevel = asString(value)

  if (isAllowedValue(AI_COVERAGE_LEVELS, coverageLevel)) {
    return coverageLevel
  }

  warnings.push(
    coverageLevel
      ? `Coverage level "${coverageLevel}" is not supported and was downgraded.`
      : 'Coverage level is missing and was downgraded.',
  )
  return 'Partial'
}

function readAnalysisScope(value: unknown, sourceTruncated: boolean) {
  const analysisScope = asString(value)

  if (isAllowedValue(AI_COVERAGE_AREA_ANALYSIS_SCOPES, analysisScope)) {
    return analysisScope
  }

  return sourceTruncated ? 'partial_due_to_truncation' : 'visible_source_only'
}

function readReadiness(value: unknown): AiCoveragePlanReadiness {
  const readiness = asString(value)

  return isAllowedValue(AI_COVERAGE_PLAN_READINESSES, readiness)
    ? readiness
    : 'needs_review'
}

function getMostRestrictiveReadiness(
  selectedReadiness: AiCoveragePlanReadiness,
  providerReadiness: AiCoveragePlanReadiness,
): AiCoveragePlanReadiness {
  if (
    selectedReadiness === 'blocked_by_ambiguity' ||
    providerReadiness === 'blocked_by_ambiguity'
  ) {
    return 'blocked_by_ambiguity'
  }

  if (selectedReadiness === 'needs_review' || providerReadiness === 'needs_review') {
    return 'needs_review'
  }

  return 'source_backed'
}

function hasClearlyOutOfScopeMissingBehavior(value: string) {
  return /out[- ]?of[- ]?scope|follow[- ]?up|not visible|not in (?:the )?source|future|separate area/i.test(
    value,
  )
}

function getDowngradedCoverageLevel({
  requestedCoverageLevel,
  readySuggestionCount,
  selectedArea,
  sourceTruncated,
  assessment,
  hasUnmatchedEvidence,
  warnings,
}: {
  requestedCoverageLevel: AiCoverageLevel
  readySuggestionCount: number
  selectedArea: AiCoverageAreaSuggestionSelectedArea
  sourceTruncated: boolean
  assessment: Omit<AiCoverageAssessment, 'coverageLevel'>
  hasUnmatchedEvidence: boolean
  warnings: string[]
}): AiCoverageLevel {
  const hasBlocker =
    selectedArea.generationReadiness === 'blocked_by_ambiguity' ||
    assessment.blockedAmbiguousItems.length > 0
  const hasMajorAmbiguity =
    selectedArea.generationReadiness !== 'source_backed' ||
    selectedArea.ambiguities.length > 0
  const hasCoreCoverage = assessment.coveredBehaviors.length > 0
  const missingOnlyOutOfScope =
    assessment.missingBehaviors.length === 0 ||
    assessment.missingBehaviors.every(hasClearlyOutOfScopeMissingBehavior)
  const highAllowed =
    readySuggestionCount > 0 &&
    hasCoreCoverage &&
    !hasBlocker &&
    !hasUnmatchedEvidence &&
    !hasMajorAmbiguity &&
    !sourceTruncated &&
    missingOnlyOutOfScope

  if (requestedCoverageLevel === 'High' && highAllowed) {
    return 'High'
  }

  if (requestedCoverageLevel === 'High') {
    warnings.push(
      'Coverage level was downgraded because High requires safe Ready suggestions, represented core behaviors, no blockers, no unmatched evidence, no major ambiguity, and no in-scope missing behavior.',
    )
  }

  if (hasBlocker || readySuggestionCount === 0) {
    return 'Low'
  }

  return requestedCoverageLevel === 'Low' ? 'Low' : 'Partial'
}

function normalizeCoverageAssessment({
  value,
  selectedArea,
  sourceTruncated,
  readySuggestionCount,
  hasUnmatchedEvidence,
  warnings,
}: {
  value: unknown
  selectedArea: AiCoverageAreaSuggestionSelectedArea
  sourceTruncated: boolean
  readySuggestionCount: number
  hasUnmatchedEvidence: boolean
  warnings: string[]
}): AiCoverageAssessment {
  const rawAssessment = isRecord(value) ? value : {}
  const requestedCoverageLevel = readCoverageLevel(
    rawAssessment.coverageLevel,
    warnings,
  )
  const stopReason = normalizeLimitedString(
    rawAssessment.stopReason,
    AI_COVERAGE_AREA_STOP_REASON_MAX_LENGTH,
    'Stop reason',
    warnings,
  )
  const assessmentWithoutLevel = {
    coveredBehaviors: readStringList(
      rawAssessment.coveredBehaviors,
      AI_COVERAGE_AREA_ASSESSMENT_ITEM_MAX_COUNT,
      AI_COVERAGE_AREA_ASSESSMENT_TEXT_MAX_LENGTH,
    ),
    missingBehaviors: readStringList(
      rawAssessment.missingBehaviors,
      AI_COVERAGE_AREA_ASSESSMENT_ITEM_MAX_COUNT,
      AI_COVERAGE_AREA_ASSESSMENT_TEXT_MAX_LENGTH,
    ),
    blockedAmbiguousItems: readStringList(
      rawAssessment.blockedAmbiguousItems,
      AI_COVERAGE_AREA_ASSESSMENT_ITEM_MAX_COUNT,
      AI_COVERAGE_AREA_ASSESSMENT_TEXT_MAX_LENGTH,
    ),
    suggestedFollowUpCoverage: readStringList(
      rawAssessment.suggestedFollowUpCoverage,
      AI_COVERAGE_AREA_ASSESSMENT_ITEM_MAX_COUNT,
      AI_COVERAGE_AREA_ASSESSMENT_TEXT_MAX_LENGTH,
    ),
    stopReason:
      stopReason ||
      `Generated ${readySuggestionCount} Ready suggestions. Stopped because additional cases would be duplicate, speculative, unsupported, or low-value.`,
  }

  if (!stopReason) {
    warnings.push('Stop reason is missing and was replaced with a safe default.')
  }

  return {
    coverageLevel: getDowngradedCoverageLevel({
      requestedCoverageLevel,
      readySuggestionCount,
      selectedArea,
      sourceTruncated,
      assessment: assessmentWithoutLevel,
      hasUnmatchedEvidence,
      warnings,
    }),
    ...assessmentWithoutLevel,
  }
}

function createBlockedAreaResult({
  qaSourceId,
  sourceTruncated,
  selectedArea,
  responseWarnings,
}: {
  qaSourceId: string
  sourceTruncated: boolean
  selectedArea: AiCoverageAreaSuggestionSelectedArea
  responseWarnings: string[]
}): AiCoverageAreaSuggestionResult {
  const blockedItems =
    selectedArea.ambiguities.length > 0
      ? selectedArea.ambiguities
      : ['Selected area is blocked by ambiguity.']

  return {
    schemaVersion: AI_COVERAGE_AREA_SUGGESTION_SCHEMA_VERSION,
    sourceScope: {
      qaSourceId,
      visibleSourceOnly: true as const,
      sourceTruncated,
      analysisScope: sourceTruncated
        ? 'partial_due_to_truncation' as const
        : 'visible_source_only' as const,
    },
    areaScope: {
      name: selectedArea.name,
      summary: selectedArea.summary,
      evidence: selectedArea.evidence,
      generationReadiness: selectedArea.generationReadiness,
    },
    testCaseSuggestions: [],
    coverageAssessment: {
      coverageLevel: 'Low' as const,
      coveredBehaviors: [],
      missingBehaviors: selectedArea.behaviors,
      blockedAmbiguousItems: blockedItems,
      suggestedFollowUpCoverage: [
        'Clarify the blocked ambiguity before generating executable tests.',
      ],
      stopReason:
        'Generated 0 suggestions. Stopped because the selected area is blocked by ambiguity.',
    },
    warnings: [
      ...responseWarnings,
      'Selected area is blocked by ambiguity; no import-ready suggestions were returned.',
    ],
  }
}

export function parseAiCoverageAreaSuggestionResponse(
  rawResponse: unknown,
  options: {
    qaSourceId: string
    sourceContent: string
    sourceTruncated: boolean
    selectedArea: AiCoverageAreaSuggestionSelectedArea
  },
): ParseAiCoverageAreaSuggestionResult {
  const parsedResponse = parseRawResponse(rawResponse)

  if (!parsedResponse) {
    return {
      ok: false,
      areaSuggestionResult: null,
      error: 'AI coverage area suggestion response was not valid JSON.',
      warnings: [],
    }
  }

  if (
    !isRecord(parsedResponse) ||
    parsedResponse.schemaVersion !== AI_COVERAGE_AREA_SUGGESTION_SCHEMA_VERSION ||
    !isRecord(parsedResponse.sourceScope) ||
    !isRecord(parsedResponse.areaScope) ||
    !Array.isArray(parsedResponse.testCaseSuggestions) ||
    !isRecord(parsedResponse.coverageAssessment) ||
    !Array.isArray(parsedResponse.warnings)
  ) {
    return {
      ok: false,
      areaSuggestionResult: null,
      error:
        'AI coverage area suggestion response did not match the expected schema.',
      warnings: [],
    }
  }

  const responseWarnings = readStringList(
    parsedResponse.warnings,
    AI_COVERAGE_AREA_ASSESSMENT_ITEM_MAX_COUNT,
    AI_COVERAGE_AREA_ASSESSMENT_TEXT_MAX_LENGTH,
  )
  const selectedArea = options.selectedArea

  if (selectedArea.generationReadiness === 'blocked_by_ambiguity') {
    const blockedResult = createBlockedAreaResult({
      qaSourceId: options.qaSourceId,
      sourceTruncated: options.sourceTruncated,
      selectedArea,
      responseWarnings,
    })

    return {
      ok: true,
      areaSuggestionResult: blockedResult,
      error: null,
      warnings: blockedResult.warnings,
    }
  }

  const warnings = [...responseWarnings]
  const sourceScope = parsedResponse.sourceScope
  const areaScope = parsedResponse.areaScope
  const providerAreaReadiness = readReadiness(areaScope.generationReadiness)
  const effectiveAreaReadiness = getMostRestrictiveReadiness(
    selectedArea.generationReadiness,
    providerAreaReadiness,
  )
  const effectiveSelectedArea = {
    ...selectedArea,
    generationReadiness: effectiveAreaReadiness,
  }

  if (providerAreaReadiness === 'blocked_by_ambiguity') {
    warnings.push(PROVIDER_BLOCKED_AREA_WARNING)
  }

  const rawSuggestions = parsedResponse.testCaseSuggestions as unknown[]
  const rawSuggestionsForReview = rawSuggestions.slice(
    0,
    AI_COVERAGE_AREA_SUGGESTION_MAX_COUNT,
  )

  if (rawSuggestions.length > AI_COVERAGE_AREA_SUGGESTION_MAX_COUNT) {
    warnings.push(
      `Only the first ${AI_COVERAGE_AREA_SUGGESTION_MAX_COUNT} area suggestions were kept for review.`,
    )
  }

  const suggestions = markDuplicateSuggestions(
    rawSuggestionsForReview
      .filter(isRecord)
      .map((rawSuggestion, index) =>
        normalizeSuggestion({
          rawSuggestion,
          index,
          qaSourceId: options.qaSourceId,
          selectedArea: effectiveSelectedArea,
          sourceContent: options.sourceContent,
        }),
      ),
  )
  const readySuggestionCount = suggestions.filter(
    (suggestion) => suggestion.status === 'Ready',
  ).length
  const hasUnmatchedEvidence = suggestions.some((suggestion) =>
    suggestion.warnings.some((warning) => /evidence excerpts were not found/i.test(warning)),
  )
  const coverageAssessment = normalizeCoverageAssessment({
    value: parsedResponse.coverageAssessment,
    selectedArea: effectiveSelectedArea,
    sourceTruncated: options.sourceTruncated,
    readySuggestionCount,
    hasUnmatchedEvidence,
    warnings,
  })

  return {
    ok: true,
    areaSuggestionResult: {
      schemaVersion: AI_COVERAGE_AREA_SUGGESTION_SCHEMA_VERSION,
      sourceScope: {
        qaSourceId: options.qaSourceId,
        visibleSourceOnly: true,
        sourceTruncated: options.sourceTruncated,
        analysisScope: options.sourceTruncated
          ? 'partial_due_to_truncation'
          : readAnalysisScope(sourceScope.analysisScope, options.sourceTruncated),
      },
      areaScope: {
        name: normalizeLimitedString(
          areaScope.name,
          120,
          'Area scope name',
          warnings,
        ) || selectedArea.name,
        summary: normalizeLimitedString(
          areaScope.summary,
          AI_COVERAGE_AREA_ASSESSMENT_TEXT_MAX_LENGTH,
          'Area scope summary',
          warnings,
        ) || selectedArea.summary,
        evidence: hasEveryEvidenceItemInSource(
          readStringList(areaScope.evidence, 5, AI_SUGGESTION_NOTE_MAX_LENGTH),
          options.sourceContent,
        )
          ? readStringList(areaScope.evidence, 5, AI_SUGGESTION_NOTE_MAX_LENGTH)
          : selectedArea.evidence,
        generationReadiness: effectiveAreaReadiness,
      },
      testCaseSuggestions: suggestions,
      coverageAssessment,
      warnings,
    },
    error: null,
    warnings,
  }
}

export function groupAiCoverageAreaSuggestions(
  suggestions: AiCoverageAreaTestCaseSuggestion[],
) {
  return {
    ready: suggestions.filter((suggestion) => suggestion.status === 'Ready'),
    needsReview: suggestions.filter(
      (suggestion) => suggestion.status === 'Needs review',
    ),
    rejected: suggestions.filter((suggestion) => suggestion.status === 'Rejected'),
  }
}
