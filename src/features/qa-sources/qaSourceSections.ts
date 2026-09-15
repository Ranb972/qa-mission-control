import type { QaSource } from './qaSourceTypes'

export const QA_SOURCE_SECTION_SCHEMA_VERSION = 'qa-source-sections-json-v1'
export const QA_SOURCE_SECTIONER_VERSION = 'qa-source-sectioner-v1'

const SECTION_PREVIEW_CHARACTERS = 180
const FALLBACK_TARGET_CHUNK_CHARACTERS = 4_000
const FALLBACK_MAX_CHUNK_CHARACTERS = 6_000

export type QaSourceSection = {
  id: string
  stableKey: string
  ordinal: number
  title: string
  level: number
  path: string[]
  startOffset: number
  endOffset: number
  startLine: number
  endLine: number
  characterCount: number
  contentFingerprint: string
  preview: string
  includedInCoverage: boolean
}

export type QaSourceSectionIndex = {
  qaSourceId: string
  qaSourceCreatedAt: string
  qaSourceUpdatedAt: string
  sourceFingerprint: string
  schemaVersion: typeof QA_SOURCE_SECTION_SCHEMA_VERSION
  sectionerVersion: typeof QA_SOURCE_SECTIONER_VERSION
  indexedAt: string
  sourceLength: number
  sectionSetFingerprint: string
  sections: QaSourceSection[]
  warnings: string[]
}

export type QaSourceSectionIndexFreshness = {
  isFresh: boolean
  reasons: string[]
}

type SourceLine = {
  text: string
  startOffset: number
  endOffset: number
  lineNumber: number
}

type HeadingCandidate = {
  lineIndex: number
  lineNumber: number
  startOffset: number
  title: string
  level: number
  kind: 'markdown' | 'setext' | 'numbered' | 'caps' | 'preamble'
}

type SectionBoundary = {
  title: string
  level: number
  path: string[]
  startOffset: number
  endOffset: number
  startLine: number
  endLine: number
}

function hashString(value: string) {
  let hash = 2166136261

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return (hash >>> 0).toString(16).padStart(8, '0')
}

function normalizeComparableText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function createPreview(value: string) {
  const normalizedValue = value.replace(/\s+/g, ' ').trim()

  if (normalizedValue.length <= SECTION_PREVIEW_CHARACTERS) {
    return normalizedValue
  }

  return `${normalizedValue.slice(0, SECTION_PREVIEW_CHARACTERS).trim()}...`
}

function getLines(value: string): SourceLine[] {
  const lines: SourceLine[] = []
  let lineStartOffset = 0
  let lineNumber = 1

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]

    if (character !== '\n' && character !== '\r') {
      continue
    }

    const lineEndOffset = index
    let nextLineStartOffset = index + 1

    if (character === '\r' && value[index + 1] === '\n') {
      nextLineStartOffset = index + 2
      index += 1
    }

    lines.push({
      text: value.slice(lineStartOffset, lineEndOffset),
      startOffset: lineStartOffset,
      endOffset: lineEndOffset,
      lineNumber,
    })

    lineStartOffset = nextLineStartOffset
    lineNumber += 1
  }

  if (lineStartOffset < value.length || value.length === 0) {
    lines.push({
      text: value.slice(lineStartOffset),
      startOffset: lineStartOffset,
      endOffset: value.length,
      lineNumber,
    })
  }

  return lines
}

function getLineNumberAtOffset(lines: SourceLine[], offset: number) {
  if (lines.length === 0) {
    return 1
  }

  const targetOffset = Math.max(0, offset)

  let low = 0
  let high = lines.length - 1
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    if (lines[middle].startOffset <= targetOffset) low = middle
    else high = middle - 1
  }
  return lines[low].lineNumber
}

function parseMarkdownHeading(line: SourceLine): HeadingCandidate | null {
  const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line.text.trim())

  if (!match) {
    return null
  }

  const title = match[2].trim()

  if (!title) {
    return null
  }

  return {
    lineIndex: line.lineNumber - 1,
    lineNumber: line.lineNumber,
    startOffset: line.startOffset,
    title,
    level: match[1].length,
    kind: 'markdown',
  }
}

function parseNumberedHeading(line: SourceLine): HeadingCandidate | null {
  const trimmedLine = line.text.trim()
  const match = /^(\d+(?:\.\d+)*\.?)\s+(.{2,120})$/.exec(trimmedLine)

  if (!match) {
    return null
  }

  const title = match[2].trim()

  if (!title || /[.!?]$/.test(title)) {
    return null
  }

  return {
    lineIndex: line.lineNumber - 1,
    lineNumber: line.lineNumber,
    startOffset: line.startOffset,
    title,
    level: match[1].split('.').filter(Boolean).length,
    kind: 'numbered',
  }
}

function parseCapsHeading(line: SourceLine): HeadingCandidate | null {
  const trimmedLine = line.text.trim().replace(/:$/, '')

  if (
    trimmedLine.length < 3 ||
    trimmedLine.length > 80 ||
    !/[A-Z]/.test(trimmedLine) ||
    /[.!?]$/.test(trimmedLine) ||
    trimmedLine !== trimmedLine.toUpperCase()
  ) {
    return null
  }

  if (!/^[A-Z0-9][A-Z0-9\s/&()_-]+$/.test(trimmedLine)) {
    return null
  }

  return {
    lineIndex: line.lineNumber - 1,
    lineNumber: line.lineNumber,
    startOffset: line.startOffset,
    title: trimmedLine,
    level: 1,
    kind: 'caps',
  }
}

function parseSetextHeading(
  line: SourceLine,
  underlineLine: SourceLine | undefined,
): HeadingCandidate | null {
  const title = line.text.trim()

  if (
    !underlineLine ||
    !title ||
    title.length > 120 ||
    !/^(=+|-+)\s*$/.test(underlineLine.text.trim())
  ) {
    return null
  }

  return {
    lineIndex: line.lineNumber - 1,
    lineNumber: line.lineNumber,
    startOffset: line.startOffset,
    title,
    level: underlineLine.text.trim().startsWith('=') ? 1 : 2,
    kind: 'setext',
  }
}

function detectHeadingCandidates(lines: SourceLine[]) {
  const candidates: HeadingCandidate[] = []
  let skipNextLine = false

  for (let index = 0; index < lines.length; index += 1) {
    if (skipNextLine) {
      skipNextLine = false
      continue
    }

    const line = lines[index]
    const markdownHeading = parseMarkdownHeading(line)

    if (markdownHeading) {
      candidates.push({ ...markdownHeading, lineIndex: index })
      continue
    }

    const setextHeading = parseSetextHeading(line, lines[index + 1])

    if (setextHeading) {
      candidates.push({ ...setextHeading, lineIndex: index })
      skipNextLine = true
      continue
    }

    const numberedHeading = parseNumberedHeading(line)

    if (numberedHeading) {
      candidates.push({ ...numberedHeading, lineIndex: index })
      continue
    }

    const capsHeading = parseCapsHeading(line)

    if (capsHeading) {
      candidates.push({ ...capsHeading, lineIndex: index })
    }
  }

  return candidates
}

function createPathForCandidates(candidates: HeadingCandidate[]) {
  const headingStack: Array<{ level: number; title: string }> = []

  return candidates.map((candidate) => {
    while (
      headingStack.length > 0 &&
      headingStack[headingStack.length - 1].level >= candidate.level
    ) {
      headingStack.pop()
    }

    headingStack.push({
      level: candidate.level,
      title: candidate.title,
    })

    return {
      ...candidate,
      path: headingStack.map((heading) => heading.title),
    }
  })
}

function createHeadingBoundaries(
  sourceContent: string,
  lines: SourceLine[],
  candidates: HeadingCandidate[],
): SectionBoundary[] {
  const candidatesWithPreamble =
    candidates.length > 0 && candidates[0].startOffset > 0
      ? [
          {
            lineIndex: 0,
            lineNumber: 1,
            startOffset: 0,
            title: 'Introduction',
            level: 1,
            kind: 'preamble' as const,
          },
          ...candidates,
        ]
      : candidates

  const candidatesWithPaths = createPathForCandidates(candidatesWithPreamble)

  return candidatesWithPaths
    .map((candidate, index): SectionBoundary | null => {
      const endOffset =
        candidatesWithPaths[index + 1]?.startOffset ?? sourceContent.length
      const sectionText = sourceContent.slice(candidate.startOffset, endOffset)

      if (!sectionText.trim()) {
        return null
      }

      return {
        title: candidate.title,
        level: candidate.level,
        path: candidate.path,
        startOffset: candidate.startOffset,
        endOffset,
        startLine: candidate.lineNumber,
        endLine: getLineNumberAtOffset(lines, Math.max(candidate.startOffset, endOffset - 1)),
      }
    })
    .filter((boundary): boundary is SectionBoundary => boundary !== null)
}

function findFallbackEndOffset(sourceContent: string, startOffset: number) {
  const remainingLength = sourceContent.length - startOffset

  if (remainingLength <= FALLBACK_MAX_CHUNK_CHARACTERS) {
    return sourceContent.length
  }

  const targetEndOffset = Math.min(
    sourceContent.length,
    startOffset + FALLBACK_TARGET_CHUNK_CHARACTERS,
  )
  const maxEndOffset = Math.min(
    sourceContent.length,
    startOffset + FALLBACK_MAX_CHUNK_CHARACTERS,
  )
  const searchWindow = sourceContent.slice(targetEndOffset, maxEndOffset)
  const paragraphBreak = searchWindow.search(/\r?\n\s*\r?\n/)

  if (paragraphBreak >= 0) {
    return targetEndOffset + paragraphBreak
  }

  const lineBreak = searchWindow.search(/\r?\n/)

  if (lineBreak >= 0) {
    return targetEndOffset + lineBreak
  }

  const previousLineBreak = sourceContent
    .slice(startOffset, maxEndOffset)
    .lastIndexOf('\n')

  if (previousLineBreak > FALLBACK_TARGET_CHUNK_CHARACTERS / 2) {
    return startOffset + previousLineBreak
  }

  return maxEndOffset
}

function createFallbackBoundaries(
  sourceContent: string,
  lines: SourceLine[],
): SectionBoundary[] {
  const boundaries: SectionBoundary[] = []
  let startOffset = 0

  while (startOffset < sourceContent.length) {
    const endOffset = findFallbackEndOffset(sourceContent, startOffset)

    if (endOffset <= startOffset) {
      break
    }

    const title = `Part ${boundaries.length + 1}`

    boundaries.push({
      title,
      level: 1,
      path: [title],
      startOffset,
      endOffset,
      startLine: getLineNumberAtOffset(lines, startOffset),
      endLine: getLineNumberAtOffset(lines, Math.max(startOffset, endOffset - 1)),
    })

    startOffset = endOffset

    while (sourceContent[startOffset] === '\n' || sourceContent[startOffset] === '\r') {
      startOffset += 1
    }
  }

  return boundaries
}

function createSectionsFromBoundaries(
  sourceContent: string,
  boundaries: SectionBoundary[],
) {
  const seenStableKeys = new Map<string, number>()

  return boundaries.map((boundary, index): QaSourceSection => {
    const sectionText = sourceContent.slice(boundary.startOffset, boundary.endOffset)
    const normalizedPath = boundary.path.map(normalizeComparableText).join(' > ')
    const anchorText = normalizeComparableText(sectionText).slice(0, 420)
    const baseStableKey = `${normalizedPath || 'section'}::${hashString(anchorText)}`
    const nextOccurrence = (seenStableKeys.get(baseStableKey) ?? 0) + 1
    const stableKey = `${baseStableKey}::${nextOccurrence}`

    seenStableKeys.set(baseStableKey, nextOccurrence)

    return {
      id: `source-section-${index + 1}-${hashString(stableKey).slice(0, 10)}`,
      stableKey,
      ordinal: index + 1,
      title: boundary.title,
      level: boundary.level,
      path: boundary.path,
      startOffset: boundary.startOffset,
      endOffset: boundary.endOffset,
      startLine: boundary.startLine,
      endLine: boundary.endLine,
      characterCount: boundary.endOffset - boundary.startOffset,
      contentFingerprint: `section-${hashString(sectionText)}`,
      preview: createPreview(sectionText),
      includedInCoverage: true,
    }
  })
}

function createSectionSetFingerprint(sections: QaSourceSection[]) {
  return `section-set-${hashString(
    sections
      .map((section) =>
        [
          section.stableKey,
          section.startOffset,
          section.endOffset,
          section.contentFingerprint,
        ].join(':'),
      )
      .join('|'),
  )}`
}

export function createQaSourceSectionSourceFingerprint(qaSource: QaSource) {
  return `source-${hashString(
    [
      qaSource.id,
      qaSource.createdAt,
      qaSource.updatedAt,
      qaSource.title,
      qaSource.sourceType,
      qaSource.status,
      qaSource.content,
    ].join('\u001f'),
  )}`
}

export function createQaSourceSectionIndex(
  qaSource: QaSource,
  indexedAt = new Date().toISOString(),
): QaSourceSectionIndex {
  const lines = getLines(qaSource.content)
  const headingCandidates = detectHeadingCandidates(lines)
  const duplicateHeadingNames = new Set<string>()
  const seenHeadingNames = new Set<string>()

  headingCandidates.forEach((candidate) => {
    const normalizedName = normalizeComparableText(candidate.title)

    if (seenHeadingNames.has(normalizedName)) {
      duplicateHeadingNames.add(normalizedName)
    }

    seenHeadingNames.add(normalizedName)
  })

  const boundaries =
    headingCandidates.length > 0
      ? createHeadingBoundaries(qaSource.content, lines, headingCandidates)
      : createFallbackBoundaries(qaSource.content, lines)
  const sections = createSectionsFromBoundaries(qaSource.content, boundaries)
  const warnings: string[] = []

  if (headingCandidates.length === 0) {
    warnings.push(
      'No reliable headings were detected; source structure uses fallback parts.',
    )
  }

  if (duplicateHeadingNames.size > 0) {
    warnings.push(
      'Duplicate section headings were detected; stable occurrence keys were applied.',
    )
  }

  return {
    qaSourceId: qaSource.id,
    qaSourceCreatedAt: qaSource.createdAt,
    qaSourceUpdatedAt: qaSource.updatedAt,
    sourceFingerprint: createQaSourceSectionSourceFingerprint(qaSource),
    schemaVersion: QA_SOURCE_SECTION_SCHEMA_VERSION,
    sectionerVersion: QA_SOURCE_SECTIONER_VERSION,
    indexedAt,
    sourceLength: qaSource.content.length,
    sectionSetFingerprint: createSectionSetFingerprint(sections),
    sections,
    warnings,
  }
}

export function getQaSourceSectionIndexFreshness(
  sectionIndex: QaSourceSectionIndex,
  qaSource: QaSource | null,
): QaSourceSectionIndexFreshness {
  const reasons: string[] = []

  if (!qaSource) {
    return {
      isFresh: false,
      reasons: ['The section index source no longer exists.'],
    }
  }

  if (sectionIndex.qaSourceId !== qaSource.id) {
    reasons.push('The section index belongs to a different QA Source.')
  }

  if (sectionIndex.qaSourceCreatedAt !== qaSource.createdAt) {
    reasons.push('The QA Source identity changed after this section index was built.')
  }

  if (sectionIndex.qaSourceUpdatedAt !== qaSource.updatedAt) {
    reasons.push('The QA Source was edited after this section index was built.')
  }

  if (
    sectionIndex.sourceFingerprint !== createQaSourceSectionSourceFingerprint(qaSource)
  ) {
    reasons.push('The QA Source content or metadata no longer matches this section index.')
  }

  if (sectionIndex.schemaVersion !== QA_SOURCE_SECTION_SCHEMA_VERSION) {
    reasons.push('The section index uses an unsupported schema.')
  }

  if (sectionIndex.sectionerVersion !== QA_SOURCE_SECTIONER_VERSION) {
    reasons.push('The section index was built by an unsupported sectioner version.')
  }

  return {
    isFresh: reasons.length === 0,
    reasons,
  }
}
