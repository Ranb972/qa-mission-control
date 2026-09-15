import {
  AI_COVERAGE_PLAN_PRIORITIES,
  AI_COVERAGE_PLAN_READINESSES,
  AI_COVERAGE_PLAN_SCHEMA_VERSION,
  type AiCoverageAmbiguity,
  type AiCoverageArea,
  type AiCoveragePlanPriority,
  type AiCoveragePlanReadiness,
  type AiCoveragePlanSectionCatalog,
  type AiCoveragePlanSectionContext,
  type AiCoverageSourceSectionRef,
  type AiNextGenerationArea,
  type ParseAiCoveragePlanResult,
} from './aiCoveragePlanTypes'
import {
  createAiCoveragePlanSectionRefPairKey,
  getAiCoveragePlanSectionCatalogRuntimeContext,
} from './aiCoveragePlanSectionContext'
import type { QaSourceSectionIndex } from '../qa-sources/qaSourceSections'

export const AI_COVERAGE_PLAN_AREA_MAX_COUNT = 12
export const AI_COVERAGE_PLAN_NOTE_MAX_COUNT = 20
export const AI_COVERAGE_PLAN_AMBIGUITY_MAX_COUNT = 20
export const AI_COVERAGE_PLAN_NEXT_AREA_MAX_COUNT = 8
export const AI_COVERAGE_PLAN_TEXT_MAX_LENGTH = 500
export const AI_COVERAGE_PLAN_EVIDENCE_MAX_LENGTH = 240
export const AI_COVERAGE_PLAN_SUGGESTED_TEST_MAX_COUNT = 25

type RawCoverageArea = Record<string, unknown>

type SectionRefNormalizationContext = {
  hasSectionContext: boolean
  refByPairKey: ReadonlyMap<string, AiCoverageSourceSectionRef>
  sectionContext: AiCoveragePlanSectionContext | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasExactKeys(value: Record<string, unknown>, allowedKeys: string[]) {
  const keys = Object.keys(value)
  const allowed = new Set(allowedKeys)

  return keys.length === allowed.size && keys.every((key) => allowed.has(key))
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

function normalizeLimitedString(value: unknown, maxLength: number) {
  const text = asString(value)

  return text.length > maxLength ? text.slice(0, maxLength).trimEnd() : text
}

function readStringList(
  value: unknown,
  maxCount = AI_COVERAGE_PLAN_NOTE_MAX_COUNT,
  maxLength = AI_COVERAGE_PLAN_TEXT_MAX_LENGTH,
) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item) => normalizeLimitedString(item, maxLength))
    .filter(Boolean)
    .slice(0, maxCount)
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

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

function createInternalAreaId(name: string, index: number) {
  return `coverage-area-${index + 1}-${slugify(name) || 'area'}`
}

function createInternalId(prefix: string, index: number) {
  return `${prefix}-${index + 1}`
}

function readReadiness(value: unknown): AiCoveragePlanReadiness {
  const readiness = asString(value)

  return isAllowedValue(AI_COVERAGE_PLAN_READINESSES, readiness)
    ? readiness
    : 'needs_review'
}

function readPriority(value: unknown): AiCoveragePlanPriority {
  const priority = asString(value)

  return isAllowedValue(AI_COVERAGE_PLAN_PRIORITIES, priority)
    ? priority
    : 'Medium'
}

function createSectionRefNormalizationContext({
  sourceSectionIndex,
  sourceSectionCatalog,
}: {
  sourceSectionIndex?: QaSourceSectionIndex | null
  sourceSectionCatalog?: AiCoveragePlanSectionCatalog | null
}): SectionRefNormalizationContext {
  const runtimeContext = getAiCoveragePlanSectionCatalogRuntimeContext(
    sourceSectionCatalog,
  )

  if (!sourceSectionIndex || !runtimeContext) {
    return {
      hasSectionContext: false,
      refByPairKey: new Map(),
      sectionContext: null,
    }
  }

  const runtimeSectionContext = runtimeContext.sectionContext
  const matchesCurrentIndex =
    runtimeSectionContext.sectionSchemaVersion === sourceSectionIndex.schemaVersion &&
    runtimeSectionContext.sectionerVersion === sourceSectionIndex.sectionerVersion &&
    runtimeSectionContext.sectionSetFingerprint ===
      sourceSectionIndex.sectionSetFingerprint &&
    runtimeSectionContext.totalSectionCount === sourceSectionIndex.sections.length

  if (!matchesCurrentIndex) {
    return {
      hasSectionContext: false,
      refByPairKey: new Map(),
      sectionContext: null,
    }
  }

  return {
    hasSectionContext:
      runtimeContext.canonicalRefByProviderPairKey.size > 0,
    refByPairKey: runtimeContext.canonicalRefByProviderPairKey,
    sectionContext: { ...runtimeSectionContext },
  }
}

function normalizeSourceSectionRefs(
  value: unknown,
  context: SectionRefNormalizationContext,
  validationWarnings: string[],
) {
  if (!Array.isArray(value) || value.length === 0) {
    return []
  }

  let ignoredRefCount = 0
  const refs = value
    .map((item) => {
      if (
        !isRecord(item) ||
        !hasExactKeys(item, ['sectionId', 'stableKey'])
      ) {
        ignoredRefCount += 1
        return null
      }

      const sectionId = asString(item.sectionId)
      const stableKey = asString(item.stableKey)
      const ref = context.refByPairKey.get(
        createAiCoveragePlanSectionRefPairKey(sectionId, stableKey),
      )

      if (!context.hasSectionContext || !ref) {
        ignoredRefCount += 1
        return null
      }

      return { ...ref, path: [...ref.path] }
    })
    .filter((ref): ref is AiCoverageSourceSectionRef => ref !== null)

  if (ignoredRefCount > 0) {
    validationWarnings.push(
      'Some section references were ignored because they were not exact visible catalog matches.',
    )
  }

  return Array.from(
    new Map(refs.map((ref) => [ref.sectionId, ref])).values(),
  ).sort((left, right) => left.ordinal - right.ordinal)
}

function normalizeEvidence(
  value: unknown,
  sourceContent: string,
  validationWarnings: string[],
) {
  const suppliedEvidence = readStringList(
    value,
    5,
    AI_COVERAGE_PLAN_EVIDENCE_MAX_LENGTH,
  )
  const evidence = suppliedEvidence.filter((item) => sourceContent.includes(item))
  const rejectedCount = suppliedEvidence.length - evidence.length

  if (suppliedEvidence.length === 0) {
    validationWarnings.push(
      'Evidence is missing; QA must verify source support before generation.',
    )
  }

  if (rejectedCount > 0) {
    validationWarnings.push(
      'Some evidence excerpts were ignored because they were not found in the visible packed source.',
    )
  }

  return {
    evidence,
    rejectedCount,
  }
}

function normalizeCoverageArea({
  rawArea,
  index,
  sourceContent,
  sectionContext,
  validationWarnings,
}: {
  rawArea: RawCoverageArea
  index: number
  sourceContent: string
  sectionContext: SectionRefNormalizationContext
  validationWarnings: string[]
}): AiCoverageArea | null {
  const name = normalizeLimitedString(rawArea.name, 120)
  const summary = normalizeLimitedString(
    rawArea.summary,
    AI_COVERAGE_PLAN_TEXT_MAX_LENGTH,
  )

  if (!name || !summary) {
    return null
  }

  const { evidence, rejectedCount } = normalizeEvidence(
    rawArea.evidence,
    sourceContent,
    validationWarnings,
  )
  const ambiguities = readStringList(rawArea.ambiguities, 8)
  const providerReadiness = readReadiness(rawArea.generationReadiness)
  let generationReadiness = providerReadiness

  if (
    providerReadiness === 'source_backed' &&
    (evidence.length === 0 || rejectedCount > 0 || ambiguities.length > 0)
  ) {
    generationReadiness = 'needs_review'
  }

  return {
    id: createInternalAreaId(name, index),
    name,
    summary,
    behaviors: readStringList(rawArea.behaviors),
    risks: readStringList(rawArea.risks),
    evidence,
    ambiguities,
    generationReadiness,
    sourceSectionRefs: normalizeSourceSectionRefs(
      rawArea.sourceSectionRefs,
      sectionContext,
      validationWarnings,
    ),
  }
}

function normalizeAmbiguity(
  rawAmbiguity: unknown,
  index: number,
  sectionContext: SectionRefNormalizationContext,
  validationWarnings: string[],
): AiCoverageAmbiguity | null {
  if (!isRecord(rawAmbiguity)) {
    return null
  }

  const question = normalizeLimitedString(
    rawAmbiguity.question,
    AI_COVERAGE_PLAN_TEXT_MAX_LENGTH,
  )
  const whyItMatters = normalizeLimitedString(
    rawAmbiguity.whyItMatters,
    AI_COVERAGE_PLAN_TEXT_MAX_LENGTH,
  )

  if (!question || !whyItMatters) {
    return null
  }

  return {
    id: createInternalId('ambiguity', index),
    question,
    whyItMatters,
    severity: readPriority(rawAmbiguity.severity),
    sourceSectionRefs: normalizeSourceSectionRefs(
      rawAmbiguity.sourceSectionRefs,
      sectionContext,
      validationWarnings,
    ),
  }
}

function normalizeNextGenerationArea(
  rawArea: unknown,
  index: number,
  areaNameToId: Map<string, string>,
  sectionContext: SectionRefNormalizationContext,
  validationWarnings: string[],
): AiNextGenerationArea | null {
  if (!isRecord(rawArea)) {
    return null
  }

  const title = normalizeLimitedString(rawArea.title, 160)
  const rationale = normalizeLimitedString(
    rawArea.rationale,
    AI_COVERAGE_PLAN_TEXT_MAX_LENGTH,
  )

  if (!title || !rationale) {
    return null
  }

  const relatedAreaNames = readStringList(rawArea.relatedAreaNames)
    .map((areaName) => areaNameToId.get(areaName))
    .filter((areaId): areaId is string => Boolean(areaId))
  const suggestedTestCount =
    typeof rawArea.suggestedTestCount === 'number' &&
    Number.isInteger(rawArea.suggestedTestCount)
      ? Math.max(
          0,
          Math.min(
            rawArea.suggestedTestCount,
            AI_COVERAGE_PLAN_SUGGESTED_TEST_MAX_COUNT,
          ),
        )
      : 0

  return {
    id: createInternalId('next-generation-area', index),
    title,
    rationale,
    priority: readPriority(rawArea.priority),
    relatedAreaIds: Array.from(new Set(relatedAreaNames)),
    suggestedTestCount,
    sourceSectionRefs: normalizeSourceSectionRefs(
      rawArea.sourceSectionRefs,
      sectionContext,
      validationWarnings,
    ),
  }
}

function hasRequiredArrays(value: Record<string, unknown>) {
  return [
    'coverageAreas',
    'actors',
    'states',
    'inputs',
    'failureModes',
    'integrationRisks',
    'permissionsSecurity',
    'dataPersistenceRules',
    'ambiguities',
    'nextGenerationAreas',
    'warnings',
  ].every((key) => Array.isArray(value[key]))
}

export function parseAiCoveragePlanResponse(
  rawResponse: unknown,
  options: {
    qaSourceId: string
    sourceContent: string
    sourceTruncated: boolean
    sourceSectionIndex?: QaSourceSectionIndex | null
    sourceSectionCatalog?: AiCoveragePlanSectionCatalog | null
  },
): ParseAiCoveragePlanResult {
  const parsedResponse = parseRawResponse(rawResponse)

  if (!parsedResponse) {
    return {
      ok: false,
      coveragePlan: null,
      error: 'AI coverage plan response was not valid JSON.',
      validationWarnings: [],
    }
  }

  if (
    !isRecord(parsedResponse) ||
    parsedResponse.schemaVersion !== AI_COVERAGE_PLAN_SCHEMA_VERSION ||
    !hasRequiredArrays(parsedResponse)
  ) {
    return {
      ok: false,
      coveragePlan: null,
      error: 'AI coverage plan response did not match the expected schema.',
      validationWarnings: [],
    }
  }

  const providerWarnings = readStringList(parsedResponse.warnings)
  const validationWarnings: string[] = []
  const sectionContext = createSectionRefNormalizationContext({
    sourceSectionIndex: options.sourceSectionIndex,
    sourceSectionCatalog: options.sourceSectionCatalog,
  })
  const rawCoverageAreas = parsedResponse.coverageAreas as unknown[]
  const rawAmbiguities = parsedResponse.ambiguities as unknown[]
  const rawNextGenerationAreas = parsedResponse.nextGenerationAreas as unknown[]
  const coverageAreas = rawCoverageAreas
    .slice(0, AI_COVERAGE_PLAN_AREA_MAX_COUNT)
    .filter(isRecord)
    .map((rawArea, index) =>
      normalizeCoverageArea({
        rawArea,
        index,
        sourceContent: options.sourceContent,
        sectionContext,
        validationWarnings,
      }),
    )
    .filter((area): area is AiCoverageArea => area !== null)
  const areaNameToId = new Map(
    coverageAreas.map((area) => [area.name, area.id]),
  )
  const ambiguities = rawAmbiguities
    .slice(0, AI_COVERAGE_PLAN_AMBIGUITY_MAX_COUNT)
    .map((rawAmbiguity, index) =>
      normalizeAmbiguity(
        rawAmbiguity,
        index,
        sectionContext,
        validationWarnings,
      ),
    )
    .filter((ambiguity): ambiguity is AiCoverageAmbiguity => ambiguity !== null)
  const nextGenerationAreas = rawNextGenerationAreas
    .slice(0, AI_COVERAGE_PLAN_NEXT_AREA_MAX_COUNT)
    .map((rawArea, index) =>
      normalizeNextGenerationArea(
        rawArea,
        index,
        areaNameToId,
        sectionContext,
        validationWarnings,
      ),
    )
    .filter((area): area is AiNextGenerationArea => area !== null)
  const truncationWarnings = options.sourceTruncated
    ? [
        'Selected source was truncated; coverage map only reflects visible packed content.',
      ]
    : []
  const warnings = Array.from(
    new Set([...providerWarnings, ...truncationWarnings]),
  )
  return {
    ok: true,
    coveragePlan: {
      schemaVersion: AI_COVERAGE_PLAN_SCHEMA_VERSION,
      sourceScope: {
        qaSourceId: options.qaSourceId,
        visibleSourceOnly: true,
        sourceTruncated: options.sourceTruncated,
        coverageCompleteness: options.sourceTruncated
          ? 'partial_due_to_truncation'
          : coverageAreas.length === 0
            ? 'insufficient_source'
            : 'visible_source_only',
        sectionContext: sectionContext.sectionContext,
      },
      coverageAreas,
      actors: readStringList(parsedResponse.actors),
      states: readStringList(parsedResponse.states),
      inputs: readStringList(parsedResponse.inputs),
      failureModes: readStringList(parsedResponse.failureModes),
      integrationRisks: readStringList(parsedResponse.integrationRisks),
      permissionsSecurity: readStringList(parsedResponse.permissionsSecurity),
      dataPersistenceRules: readStringList(parsedResponse.dataPersistenceRules),
      ambiguities,
      nextGenerationAreas,
      warnings,
    },
    error: null,
    validationWarnings: Array.from(new Set(validationWarnings)),
  }
}
