import type {
  AiCoveragePlanSectionCatalog,
  AiCoveragePlanSectionCatalogEntry,
  AiCoveragePlanSectionContext,
  AiCoverageSourceSectionRef,
} from './aiCoveragePlanTypes'
import type { PackedQaSourceContext } from './aiSuggestionTypes'
import type {
  QaSourceSection,
  QaSourceSectionIndex,
} from '../qa-sources/qaSourceSections'

// The catalog accompanies a 24k-character source prefix. These limits keep it
// deterministic and leave room for multibyte source text and JSON escaping in
// the 128 KiB combined request budget.
export const AI_COVERAGE_PLAN_SECTION_CATALOG_MAX_ENTRIES = 40
export const AI_COVERAGE_PLAN_SECTION_ID_MAX_LENGTH = 160
export const AI_COVERAGE_PLAN_SECTION_STABLE_KEY_MAX_LENGTH = 512
export const AI_COVERAGE_PLAN_SECTION_TITLE_MAX_LENGTH = 140
export const AI_COVERAGE_PLAN_SECTION_PATH_MAX_DEPTH = 12
export const AI_COVERAGE_PLAN_SECTION_PATH_SEGMENT_MAX_LENGTH = 120
export const AI_COVERAGE_PLAN_SECTION_PREVIEW_MAX_LENGTH = 120
export const AI_COVERAGE_PLAN_SECTION_CATALOG_MAX_UTF8_BYTES = 12 * 1024
export const AI_COVERAGE_PLAN_BACKEND_MAX_REQUEST_UTF8_BYTES = 128 * 1024

const FALLBACK_STRUCTURE_WARNING =
  'No reliable headings were detected; source structure uses fallback parts.'

export const EMPTY_AI_COVERAGE_PLAN_SECTION_CATALOG: AiCoveragePlanSectionCatalog = {
  available: false,
  sectionSchemaVersion: '',
  sectionerVersion: '',
  sectionSetFingerprint: '',
  totalSectionCount: 0,
  visibleSectionCount: 0,
  omittedSectionCount: 0,
  sections: [],
}

export type AiCoveragePlanSectionCatalogRuntimeContext = {
  sectionContext: AiCoveragePlanSectionContext
  canonicalRefByProviderPairKey: ReadonlyMap<
    string,
    AiCoverageSourceSectionRef
  >
  visibleCanonicalRefByPairKey: ReadonlyMap<
    string,
    AiCoverageSourceSectionRef
  >
}

const runtimeContextByCatalog = new WeakMap<
  AiCoveragePlanSectionCatalog,
  AiCoveragePlanSectionCatalogRuntimeContext
>()

export function createAiCoveragePlanSectionRefPairKey(
  sectionId: string,
  stableKey: string,
) {
  return `${sectionId}\u001f${stableKey}`
}

export function getAiCoveragePlanSectionCatalogRuntimeContext(
  catalog: AiCoveragePlanSectionCatalog | null | undefined,
) {
  return catalog ? runtimeContextByCatalog.get(catalog) ?? null : null
}

export function getAiCoveragePlanUtf8ByteLength(value: string) {
  return new TextEncoder().encode(value).byteLength
}

function createCatalogPreview(value: string) {
  const normalizedValue = value.replace(/\s+/g, ' ').trim()

  if (normalizedValue.length <= AI_COVERAGE_PLAN_SECTION_PREVIEW_MAX_LENGTH) {
    return normalizedValue
  }

  return `${normalizedValue
    .slice(0, AI_COVERAGE_PLAN_SECTION_PREVIEW_MAX_LENGTH - 3)
    .trimEnd()}...`
}

function truncateMetadata(value: string, maxLength: number) {
  return value.trim().slice(0, maxLength).trimEnd()
}

function getLineNumberAtOffset(value: string, offset: number) {
  const safeOffset = Math.max(0, Math.min(offset, value.length))
  let lineNumber = 1

  for (let index = 0; index < safeOffset; index += 1) {
    if (value[index] === '\n') {
      lineNumber += 1
    }
  }

  return lineNumber
}

function getCompleteVisibleLine(value: string, startOffset: number) {
  const lineEndOffset = value.indexOf('\n', startOffset)

  if (lineEndOffset < 0) {
    return null
  }

  return {
    text: value.slice(startOffset, lineEndOffset).trim(),
    endOffset: lineEndOffset + 1,
  }
}

function isSingleLineHeadingIdentity(line: string, title: string) {
  const markdownMatch = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line)

  if (markdownMatch?.[2].trim() === title) {
    return true
  }

  const numberedMatch = /^(\d+(?:\.\d+)*\.?)\s+(.{2,120})$/.exec(line)

  if (numberedMatch?.[2].trim() === title) {
    return true
  }

  const capsTitle = line.replace(/:$/, '').trim()

  return capsTitle === title && capsTitle === capsTitle.toUpperCase()
}

function hasVisibleSectionIdentity(
  section: QaSourceSection,
  sectionIndex: QaSourceSectionIndex,
  packedSource: PackedQaSourceContext,
) {
  if (section.endOffset <= packedSource.packedCharacterCount) {
    return true
  }

  if (sectionIndex.warnings.includes(FALLBACK_STRUCTURE_WARNING)) {
    return true
  }

  const firstLine = getCompleteVisibleLine(
    packedSource.content,
    section.startOffset,
  )

  if (!firstLine) {
    return false
  }

  if (isSingleLineHeadingIdentity(firstLine.text, section.title)) {
    return true
  }

  if (
    section.startOffset === 0 &&
    section.title === 'Introduction' &&
    section.path.length === 1
  ) {
    return true
  }

  const secondLine = getCompleteVisibleLine(
    packedSource.content,
    firstLine.endOffset,
  )

  return Boolean(
    secondLine &&
      firstLine.text === section.title &&
      /^(=+|-+)\s*$/.test(secondLine.text),
  )
}

function getVisibleSectionEntry(
  section: QaSourceSection,
  sectionIndex: QaSourceSectionIndex,
  packedSource: PackedQaSourceContext,
): AiCoveragePlanSectionCatalogEntry | null {
  if (
    !section.includedInCoverage ||
    section.startOffset >= packedSource.packedCharacterCount ||
    section.id.length > AI_COVERAGE_PLAN_SECTION_ID_MAX_LENGTH ||
    section.stableKey.length > AI_COVERAGE_PLAN_SECTION_STABLE_KEY_MAX_LENGTH ||
    !hasVisibleSectionIdentity(section, sectionIndex, packedSource)
  ) {
    return null
  }

  const visibleEndOffset = Math.min(
    section.endOffset,
    packedSource.packedCharacterCount,
  )
  const visibleText = packedSource.content.slice(
    section.startOffset,
    visibleEndOffset,
  )
  const visibility = section.endOffset <= packedSource.packedCharacterCount
    ? 'full'
    : 'partial'

  return {
    sectionId: section.id,
    stableKey: section.stableKey,
    ordinal: section.ordinal,
    title: truncateMetadata(
      section.title,
      AI_COVERAGE_PLAN_SECTION_TITLE_MAX_LENGTH,
    ),
    path: section.path
      .slice(-AI_COVERAGE_PLAN_SECTION_PATH_MAX_DEPTH)
      .map((segment) =>
        truncateMetadata(
          segment,
          AI_COVERAGE_PLAN_SECTION_PATH_SEGMENT_MAX_LENGTH,
        ),
      )
      .filter(Boolean),
    startLine: section.startLine,
    endLine: visibility === 'full'
      ? section.endLine
      : getLineNumberAtOffset(
          packedSource.content,
          Math.max(section.startOffset, visibleEndOffset - 1),
        ),
    characterCount: visibleEndOffset - section.startOffset,
    visibility,
    preview: createCatalogPreview(visibleText),
  }
}

function hashVisibleCatalogValue(value: string) {
  let hash = 2166136261

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return (hash >>> 0).toString(16).padStart(8, '0')
}

function createProviderSectionEntry(
  canonicalEntry: AiCoveragePlanSectionCatalogEntry,
  visibleOrdinal: number,
): AiCoveragePlanSectionCatalogEntry {
  const visibleMetadata = {
    ordinal: visibleOrdinal,
    title: canonicalEntry.title,
    path: [...canonicalEntry.path],
    startLine: canonicalEntry.startLine,
    endLine: canonicalEntry.endLine,
    characterCount: canonicalEntry.characterCount,
    visibility: canonicalEntry.visibility,
    preview: canonicalEntry.preview,
  }
  const identityHash = hashVisibleCatalogValue(JSON.stringify(visibleMetadata))

  return {
    sectionId: `visible-section-${visibleOrdinal}-${identityHash}`,
    stableKey: `visible-section-key-${visibleOrdinal}-${identityHash}`,
    ...visibleMetadata,
  }
}

function createCanonicalSectionRef(
  section: QaSourceSection,
  providerEntry: AiCoveragePlanSectionCatalogEntry,
): AiCoverageSourceSectionRef {
  return {
    sectionId: section.id,
    stableKey: section.stableKey,
    ordinal: section.ordinal,
    title: providerEntry.title,
    path: [...providerEntry.path],
    startLine: providerEntry.startLine,
    endLine: providerEntry.endLine,
    visibility: providerEntry.visibility,
  }
}

function getCatalogUtf8ByteLength(catalog: AiCoveragePlanSectionCatalog) {
  return getAiCoveragePlanUtf8ByteLength(JSON.stringify(catalog))
}

function createProviderCatalog(
  sectionIndex: QaSourceSectionIndex,
  sections: AiCoveragePlanSectionCatalogEntry[],
): AiCoveragePlanSectionCatalog {
  const sectionSetFingerprint = `visible-section-set-${hashVisibleCatalogValue(
    JSON.stringify({
      sectionSchemaVersion: sectionIndex.schemaVersion,
      sectionerVersion: sectionIndex.sectionerVersion,
      sections,
    }),
  )}`

  return {
    available: sections.length > 0,
    sectionSchemaVersion: sectionIndex.schemaVersion,
    sectionerVersion: sectionIndex.sectionerVersion,
    sectionSetFingerprint,
    totalSectionCount: sections.length,
    visibleSectionCount: sections.length,
    omittedSectionCount: 0,
    sections,
  }
}

export function createAiCoveragePlanSectionCatalog(
  sectionIndex: QaSourceSectionIndex | null,
  packedSource: PackedQaSourceContext | null,
): AiCoveragePlanSectionCatalog {
  if (!sectionIndex || !packedSource) {
    return EMPTY_AI_COVERAGE_PLAN_SECTION_CATALOG
  }

  const providerSections: AiCoveragePlanSectionCatalogEntry[] = []
  const canonicalRefByProviderPairKey = new Map<
    string,
    AiCoverageSourceSectionRef
  >()
  const visibleCanonicalRefByPairKey = new Map<
    string,
    AiCoverageSourceSectionRef
  >()

  for (const section of sectionIndex.sections) {
    if (
      providerSections.length >=
      AI_COVERAGE_PLAN_SECTION_CATALOG_MAX_ENTRIES
    ) {
      break
    }

    const canonicalEntry = getVisibleSectionEntry(
      section,
      sectionIndex,
      packedSource,
    )

    if (!canonicalEntry || canonicalEntry.path.length === 0 || !canonicalEntry.title) {
      continue
    }

    const providerEntry = createProviderSectionEntry(
      canonicalEntry,
      providerSections.length + 1,
    )
    const nextSections = [...providerSections, providerEntry]
    const nextCatalog = createProviderCatalog(sectionIndex, nextSections)

    if (
      getCatalogUtf8ByteLength(nextCatalog) >
      AI_COVERAGE_PLAN_SECTION_CATALOG_MAX_UTF8_BYTES
    ) {
      break
    }

    const canonicalRef = createCanonicalSectionRef(section, providerEntry)

    providerSections.push(providerEntry)
    canonicalRefByProviderPairKey.set(
      createAiCoveragePlanSectionRefPairKey(
        providerEntry.sectionId,
        providerEntry.stableKey,
      ),
      canonicalRef,
    )
    visibleCanonicalRefByPairKey.set(
      createAiCoveragePlanSectionRefPairKey(
        canonicalRef.sectionId,
        canonicalRef.stableKey,
      ),
      canonicalRef,
    )
  }

  const catalog = createProviderCatalog(sectionIndex, providerSections)

  runtimeContextByCatalog.set(catalog, {
    sectionContext: {
      available: providerSections.length > 0,
      sectionSchemaVersion: sectionIndex.schemaVersion,
      sectionerVersion: sectionIndex.sectionerVersion,
      sectionSetFingerprint: sectionIndex.sectionSetFingerprint,
      totalSectionCount: sectionIndex.sections.length,
      visibleSectionCount: providerSections.length,
      omittedSectionCount:
        sectionIndex.sections.length - providerSections.length,
    },
    canonicalRefByProviderPairKey,
    visibleCanonicalRefByPairKey,
  })

  return catalog
}
