import {
  AI_COVERAGE_PLAN_AMBIGUITY_MAX_COUNT,
  AI_COVERAGE_PLAN_AREA_MAX_COUNT,
  AI_COVERAGE_PLAN_EVIDENCE_MAX_LENGTH,
  AI_COVERAGE_PLAN_NEXT_AREA_MAX_COUNT,
  AI_COVERAGE_PLAN_NOTE_MAX_COUNT,
  AI_COVERAGE_PLAN_TEXT_MAX_LENGTH,
} from './aiCoveragePlanValidation'
import { createSourceEvidenceMatcher, isUnfinishedBehavior } from './sourceEvidence'
import { createEvidenceCompletenessCheck, type SectionEvidenceSourceContext } from './sourceEvidenceStructure'
import { createRequirementMetadataContext } from '../document-intelligence/requirementMetadata'
import {
  AI_SECTION_COVERAGE_PLAN_PRIORITIES,
  AI_SECTION_COVERAGE_PLAN_SCHEMA_VERSION,
  type AiSectionCoveragePlanPriority,
  type AiSectionCoveragePlanProviderAmbiguity,
  type AiSectionCoveragePlanProviderArea,
  type AiSectionCoveragePlanProviderNextCoverage,
  type AiSectionCoveragePlanProviderResponse,
  type AiSectionBehaviorEvidence,
  getSectionBehaviorGrounding,
  type ParseAiSectionCoveragePlanResult,
} from './aiSectionCoveragePlanTypes'

export const AI_SECTION_COVERAGE_PLAN_EVIDENCE_MAX_LENGTH =
  AI_COVERAGE_PLAN_EVIDENCE_MAX_LENGTH
export const AI_SECTION_COVERAGE_PLAN_EVIDENCE_MAX_COUNT = 5

const PROVIDER_ROOT_KEYS = [
  'schemaVersion',
  'coverageAreas',
  'actors',
  'states',
  'inputs',
  'failureModes',
  'integrationRisks',
  'permissionsSecurity',
  'dataPersistenceConcerns',
  'ambiguities',
  'nextCoverage',
  'warnings',
] as const

const FORBIDDEN_PROVIDER_KEYS = new Set([
  'id',
  'qasourceid',
  'sourceid',
  'sourceidentity',
  'sectionid',
  'sectionidentity',
  'stablekey',
  'path',
  'line',
  'lines',
  'linerange',
  'startline',
  'endline',
  'fingerprint',
  'sourcefingerprint',
  'contentfingerprint',
  'timestamp',
  'analyzedat',
  'createdat',
  'updatedat',
  'readiness',
  'generationreadiness',
  'evidencesupport',
  'prompt',
  'messages',
  'responseschema',
  'rawresponse',
  'rawproviderresponse',
  'providerpayload',
  'refs',
  'sectionrefs',
  'sourcesectionrefs',
  'approval',
  'approvals',
  'suggestion',
  'suggestions',
  'import',
  'imports',
  'apikey',
  'secret',
  'token',
  'usage',
  'providerusage',
  'model',
])

type ProviderParseResult =
  | {
      ok: true
      response: AiSectionCoveragePlanProviderResponse
      error: null
      validationWarnings: string[]
    }
  | {
      ok: false
      response: null
      error: string
      validationWarnings: string[]
    }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasExactKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
) {
  const keys = Object.keys(value)
  const expected = new Set(expectedKeys)

  return keys.length === expected.size && keys.every((key) => expected.has(key))
}

function normalizeKey(value: string) {
  return value.replace(/[-_\s]/g, '').toLowerCase()
}

function hasForbiddenProviderKey(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(hasForbiddenProviderKey)
  }

  if (!isRecord(value)) {
    return false
  }

  return Object.entries(value).some(
    ([key, nestedValue]) =>
      FORBIDDEN_PROVIDER_KEYS.has(normalizeKey(key)) ||
      hasForbiddenProviderKey(nestedValue),
  )
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

function boundedText(value: unknown, maxLength = AI_COVERAGE_PLAN_TEXT_MAX_LENGTH) {
  if (typeof value !== 'string') {
    return ''
  }

  const text = value.trim()

  return text.length > maxLength ? text.slice(0, maxLength).trimEnd() : text
}

function addWarning(warnings: string[], warning: string) {
  if (
    warnings.length < AI_COVERAGE_PLAN_NOTE_MAX_COUNT &&
    !warnings.includes(warning)
  ) {
    warnings.push(warning.slice(0, AI_COVERAGE_PLAN_TEXT_MAX_LENGTH))
  }
}

function readStringList(
  value: unknown,
  warnings: string[],
  label: string,
  maxCount = AI_COVERAGE_PLAN_NOTE_MAX_COUNT,
) {
  if (!Array.isArray(value)) {
    return null
  }

  const result = value
    .slice(0, maxCount)
    .map((item) => typeof item === 'string' && item.trim().length <= AI_COVERAGE_PLAN_TEXT_MAX_LENGTH ? item.trim() : '')
    .filter(Boolean)

  if (result.length !== value.length) {
    addWarning(warnings, `Some malformed, overlong or excess ${label} were ignored.`)
  }

  return result
}

function readEvidence(value: unknown, warnings: string[], isCompleteEvidence: (quote: string) => boolean) {
  if (!Array.isArray(value)) {
    return null
  }

  const result: string[] = []
  let overlongCount = 0
  let malformedCount = 0

  value.slice(0, AI_SECTION_COVERAGE_PLAN_EVIDENCE_MAX_COUNT).forEach((item) => {
    if (
      typeof item !== 'string' ||
      item.trim().length === 0 ||
      item !== item.trim()
    ) {
      malformedCount += 1
      return
    }

    const evidence = item

    if (evidence.length > AI_SECTION_COVERAGE_PLAN_EVIDENCE_MAX_LENGTH) {
      overlongCount += 1
      return
    }

    if (!isCompleteEvidence(evidence)) {
      addWarning(warnings, 'Some unfinished evidence excerpts were ignored; copy a complete supporting clause.')
      return
    }

    result.push(evidence)
  })

  if (value.length > AI_SECTION_COVERAGE_PLAN_EVIDENCE_MAX_COUNT) {
    malformedCount += value.length - AI_SECTION_COVERAGE_PLAN_EVIDENCE_MAX_COUNT
  }

  if (overlongCount > 0) {
    addWarning(warnings, 'Some overlong evidence excerpts were ignored.')
  }

  if (malformedCount > 0) {
    addWarning(warnings, 'Some malformed or excess evidence excerpts were ignored.')
  }

  return result
}

function isPriority(value: unknown): value is AiSectionCoveragePlanPriority {
  return (
    typeof value === 'string' &&
    AI_SECTION_COVERAGE_PLAN_PRIORITIES.includes(
      value as AiSectionCoveragePlanPriority,
    )
  )
}

function parseProviderArea(
  value: unknown,
  warnings: string[],
  isCompleteEvidence: (quote: string) => boolean,
): AiSectionCoveragePlanProviderArea | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['name', 'summary', 'behaviors', 'evidence', ...(Object.hasOwn(value, 'behaviorEvidence') ? ['behaviorEvidence'] : [])])
  ) {
    return null
  }

  const name = boundedText(value.name, 120)
  const summary = boundedText(value.summary)
  const parsedBehaviors = readStringList(value.behaviors, warnings, 'behaviors')
  const evidence = readEvidence(value.evidence, warnings, isCompleteEvidence)

  if (!name || !summary || !parsedBehaviors || !evidence) {
    return null
  }

  const behaviors = parsedBehaviors.filter((item) => !isUnfinishedBehavior(item))
  if (behaviors.length !== parsedBehaviors.length) addWarning(warnings, 'Some unfinished behaviors were ignored; review the complete source requirement.')
  if (value.behaviorEvidence !== undefined && !Array.isArray(value.behaviorEvidence)) return null
  if (Array.isArray(value.behaviorEvidence) && value.behaviorEvidence.length > AI_COVERAGE_PLAN_NOTE_MAX_COUNT) {
    addWarning(warnings, 'Some excess behavior-evidence associations were ignored.')
  }
  const behaviorEvidence: AiSectionBehaviorEvidence[] = []
  for (const item of (value.behaviorEvidence ?? []).slice(0, AI_COVERAGE_PLAN_NOTE_MAX_COUNT)) {
    if (!isRecord(item) || !hasExactKeys(item, ['behavior', 'evidence']) || typeof item.behavior !== 'string' ||
      !behaviors.includes(item.behavior) || behaviorEvidence.some((entry) => entry.behavior === item.behavior)) {
      addWarning(warnings, 'Some invalid behavior-evidence associations were ignored.'); continue
    }
    const quotes = readEvidence(item.evidence, warnings, isCompleteEvidence)
    if (!quotes) { addWarning(warnings, 'Some invalid behavior-evidence associations were ignored.'); continue }
    behaviorEvidence.push({ behavior: item.behavior, evidence: quotes })
  }
  // If behavior text was discarded, do not claim the remaining area is fully linked.
  return { name, summary, behaviors, evidence, ...(value.behaviorEvidence === undefined ? {} : {
    behaviorEvidence: behaviors.length === (value.behaviors as unknown[]).length ? behaviorEvidence : [],
  }) }
}

function parseProviderAmbiguity(
  value: unknown,
): AiSectionCoveragePlanProviderAmbiguity | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['question', 'whyItMatters', 'severity'])
  ) {
    return null
  }

  const question = boundedText(value.question)
  const whyItMatters = boundedText(value.whyItMatters)

  return question && whyItMatters && isPriority(value.severity)
    ? { question, whyItMatters, severity: value.severity }
    : null
}

function parseProviderNextCoverage(
  value: unknown,
): AiSectionCoveragePlanProviderNextCoverage | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['title', 'rationale', 'priority'])
  ) {
    return null
  }

  const title = boundedText(value.title, 160)
  const rationale = boundedText(value.rationale)

  return title && rationale && isPriority(value.priority)
    ? { title, rationale, priority: value.priority }
    : null
}

export function parseAiSectionCoveragePlanProviderResponse(
  rawResponse: unknown,
  sourceContext?: SectionEvidenceSourceContext,
): ProviderParseResult {
  const parsedResponse = parseRawResponse(rawResponse)

  if (!parsedResponse) {
    return {
      ok: false,
      response: null,
      error: 'Section coverage analysis response was not valid JSON.',
      validationWarnings: [],
    }
  }

  if (hasForbiddenProviderKey(parsedResponse)) {
    return {
      ok: false,
      response: null,
      error: 'Section coverage analysis response contained forbidden control data.',
      validationWarnings: [],
    }
  }

  if (
    !isRecord(parsedResponse) ||
    !hasExactKeys(parsedResponse, PROVIDER_ROOT_KEYS) ||
    parsedResponse.schemaVersion !== AI_SECTION_COVERAGE_PLAN_SCHEMA_VERSION
  ) {
    return {
      ok: false,
      response: null,
      error: 'Section coverage analysis response did not match the expected schema.',
      validationWarnings: [],
    }
  }

  const requiredArrays = PROVIDER_ROOT_KEYS.filter(
    (key) => key !== 'schemaVersion',
  )

  if (!requiredArrays.every((key) => Array.isArray(parsedResponse[key]))) {
    return {
      ok: false,
      response: null,
      error: 'Section coverage analysis response did not match the expected schema.',
      validationWarnings: [],
    }
  }

  const validationWarnings: string[] = []
  const isCompleteEvidence = createEvidenceCompletenessCheck(sourceContext, AI_SECTION_COVERAGE_PLAN_EVIDENCE_MAX_LENGTH)
  const coverageAreas = (parsedResponse.coverageAreas as unknown[])
    .slice(0, AI_COVERAGE_PLAN_AREA_MAX_COUNT)
    .map((value) => parseProviderArea(value, validationWarnings, isCompleteEvidence))
    .filter((value): value is AiSectionCoveragePlanProviderArea => value !== null)

  if (coverageAreas.length !== (parsedResponse.coverageAreas as unknown[]).length) {
    addWarning(validationWarnings, 'Some malformed coverage areas were ignored.')
  }

  const ambiguities = (parsedResponse.ambiguities as unknown[])
    .slice(0, AI_COVERAGE_PLAN_AMBIGUITY_MAX_COUNT)
    .map(parseProviderAmbiguity)
    .filter(
      (value): value is AiSectionCoveragePlanProviderAmbiguity => value !== null,
    )

  if (ambiguities.length !== (parsedResponse.ambiguities as unknown[]).length) {
    addWarning(validationWarnings, 'Some malformed ambiguities were ignored.')
  }

  const nextCoverage = (parsedResponse.nextCoverage as unknown[])
    .slice(0, AI_COVERAGE_PLAN_NEXT_AREA_MAX_COUNT)
    .map(parseProviderNextCoverage)
    .filter(
      (value): value is AiSectionCoveragePlanProviderNextCoverage => value !== null,
    )

  if (nextCoverage.length !== (parsedResponse.nextCoverage as unknown[]).length) {
    addWarning(validationWarnings, 'Some malformed next-coverage items were ignored.')
  }

  const categoryEntries = [
    ['actors', 'actors'],
    ['states', 'states'],
    ['inputs', 'inputs'],
    ['failureModes', 'failure modes'],
    ['integrationRisks', 'integration risks'],
    ['permissionsSecurity', 'permissions and security items'],
    ['dataPersistenceConcerns', 'data and persistence concerns'],
    ['warnings', 'provider warnings'],
  ] as const
  const normalizedLists = new Map<string, string[]>()

  for (const [key, label] of categoryEntries) {
    const list = readStringList(parsedResponse[key], validationWarnings, label)

    if (!list) {
      return {
        ok: false,
        response: null,
        error: 'Section coverage analysis response did not match the expected schema.',
        validationWarnings: [],
      }
    }

    normalizedLists.set(key, list)
  }

  return {
    ok: true,
    error: null,
    validationWarnings,
    response: {
      schemaVersion: AI_SECTION_COVERAGE_PLAN_SCHEMA_VERSION,
      coverageAreas,
      actors: normalizedLists.get('actors') ?? [],
      states: normalizedLists.get('states') ?? [],
      inputs: normalizedLists.get('inputs') ?? [],
      failureModes: normalizedLists.get('failureModes') ?? [],
      integrationRisks: normalizedLists.get('integrationRisks') ?? [],
      permissionsSecurity: normalizedLists.get('permissionsSecurity') ?? [],
      dataPersistenceConcerns:
        normalizedLists.get('dataPersistenceConcerns') ?? [],
      ambiguities,
      nextCoverage,
      warnings: normalizedLists.get('warnings') ?? [],
    },
  }
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

export function parseAiSectionCoveragePlanResponse(
  rawResponse: unknown,
  sourceContext: SectionEvidenceSourceContext,
): ParseAiSectionCoveragePlanResult {
  const { visibleSectionContent } = sourceContext
  const providerResult = parseAiSectionCoveragePlanProviderResponse(rawResponse, sourceContext)

  if (!providerResult.ok) {
    return {
      ok: false,
      plan: null,
      error: providerResult.error,
      validationWarnings: providerResult.validationWarnings,
    }
  }

  const validationWarnings = [...providerResult.validationWarnings]
  const matchEvidence = createSourceEvidenceMatcher(visibleSectionContent)
  const metadata = createRequirementMetadataContext(visibleSectionContent)
  const filterMetadata = (items: string[]) => items.filter((item) => {
    if (!metadata.isMetadataOnlyConcept(item)) return true
    addWarning(validationWarnings, 'Requirement metadata values were excluded from semantic categories and behaviors.')
    return false
  })
  const coverageAreas = providerResult.response.coverageAreas.map(
    (area, index) => {
      const evidence: string[] = []
      let rejectedCount = 0

      const validateEvidence = (quotes: string[]) => {
        const accepted: string[] = []
        quotes.forEach((excerpt) => {
          const original = matchEvidence(excerpt, AI_SECTION_COVERAGE_PLAN_EVIDENCE_MAX_LENGTH)
          if (!original) {
            rejectedCount += 1
            return
          }
          if (original !== excerpt) addWarning(validationWarnings, 'Whitespace-normalized evidence was reconstructed as an exact original source excerpt.')
          if (!accepted.includes(original)) accepted.push(original)
        })
        return accepted
      }
      evidence.push(...validateEvidence(area.evidence))
      const behaviors = filterMetadata(area.behaviors)
      const behaviorEvidence = (area.behaviorEvidence ?? []).filter((item) => behaviors.includes(item.behavior))
        .map((item) => ({ behavior: item.behavior, evidence: validateEvidence(item.evidence) }))
      for (const item of behaviorEvidence) for (const quote of item.evidence) {
        if (evidence.length < AI_SECTION_COVERAGE_PLAN_EVIDENCE_MAX_COUNT && !evidence.includes(quote)) evidence.push(quote)
      }

      if (rejectedCount > 0) {
        addWarning(
          validationWarnings,
          'Some evidence excerpts were ignored because no exact or uniquely whitespace-equivalent span was found in the visible selected section.',
        )
      }

      if (evidence.length === 0) {
        addWarning(
          validationWarnings,
          'A coverage area has no validated evidence and needs review.',
        )
      }

      const support = getSectionBehaviorGrounding({ ...area, behaviors, evidence, behaviorEvidence })
      if (support.status !== 'linked') addWarning(validationWarnings, 'Not every behavior has validated linked evidence. Review the behavior set against the source; area excerpts alone do not establish support.')

      return {
        id: `section-coverage-area-${index + 1}-${slugify(area.name) || 'area'}`,
        name: area.name,
        summary: area.summary,
        behaviors,
        evidence,
        behaviorEvidence,
        evidenceSupport:
          support.status === 'linked' ? ('source_backed' as const) : ('needs_review' as const),
      }
    },
  )
  const categories = {
    actors: filterMetadata(providerResult.response.actors),
    states: filterMetadata(providerResult.response.states),
    inputs: filterMetadata(providerResult.response.inputs),
    failureModes: filterMetadata(providerResult.response.failureModes),
    integrationRisks: filterMetadata(providerResult.response.integrationRisks),
    permissionsSecurity: filterMetadata(providerResult.response.permissionsSecurity),
    dataPersistenceConcerns: filterMetadata(providerResult.response.dataPersistenceConcerns),
  }
  const warnings: string[] = []

  ;[...providerResult.response.warnings, ...validationWarnings].forEach((warning) =>
    addWarning(warnings, warning),
  )

  return {
    ok: true,
    error: null,
    validationWarnings,
    plan: {
      schemaVersion: AI_SECTION_COVERAGE_PLAN_SCHEMA_VERSION,
      coverageAreas,
      ...categories,
      ambiguities: providerResult.response.ambiguities.map((ambiguity, index) => ({
        id: `section-ambiguity-${index + 1}`,
        ...ambiguity,
      })),
      nextCoverage: providerResult.response.nextCoverage.map((item, index) => ({
        id: `section-next-coverage-${index + 1}`,
        ...item,
      })),
      warnings,
    },
  }
}
