import type { QaSource } from '../qa-sources/qaSourceTypes'
import { createQaSourceSectionIndex } from '../qa-sources/qaSourceSections'
import { fingerprint, utf8Length } from './documentFingerprint'
import type { AnalysisUnit, DocumentBlock, DocumentFormat, DocumentPage, DocumentSection, DocumentSnapshot, SourceLocation } from './documentTypes'

export const MAX_UNIT_CHARACTERS = 6_000
export const MAX_UNIT_BYTES = 18_000
export const DOCUMENT_ALGORITHM = 'document-units-v1'

type ImportMetadata = {
  fileName?: string
  format?: DocumentFormat
  pages?: DocumentPage[]
  /** Only local import parsers can supply canonical positions. */
  blocks?: DocumentBlock[]
  warnings?: string[]
}

function lineStarts(content: string) {
  const starts = [0]
  for (const match of content.matchAll(/\r\n|\r|\n/g)) starts.push(match.index + match[0].length)
  return starts
}

function floorIndex(starts: readonly number[], offset: number) {
  let low = 0
  let high = starts.length - 1
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    if (starts[middle] <= offset) low = middle
    else high = middle - 1
  }
  return low
}

function validatePages(pages: readonly DocumentPage[], length: number) {
  let offset = 0
  pages.forEach((page, index) => {
    if (page.number !== index + 1 || !Number.isSafeInteger(page.startOffset) ||
      !Number.isSafeInteger(page.endOffset) || page.startOffset !== offset ||
      page.endOffset < offset || page.endOffset > length) {
      throw new Error('Document page accounting is inconsistent. The original source has not been changed.')
    }
    offset = page.endOffset
  })
  if (pages.length && offset !== length) throw new Error('Document pages do not account for all extracted text.')
}

function safeCut(content: string, offset: number) {
  if (offset > 0 && offset < content.length) {
    const previous = content.charCodeAt(offset - 1)
    const next = content.charCodeAt(offset)
    if ((previous >= 0xd800 && previous <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) ||
      (content[offset - 1] === '\r' && content[offset] === '\n')) return offset - 1
  }
  return offset
}

/** Hard bounds apply after preferred boundaries, including the no-whitespace pathological case. */
export function boundedEnd(content: string, start: number, end: number) {
  let cap = safeCut(content, Math.min(end, start + MAX_UNIT_CHARACTERS))
  while (utf8Length(content.slice(start, cap)) > MAX_UNIT_BYTES) {
    cap = safeCut(content, cap - 256)
  }
  if (cap === end) return end
  const window = content.slice(start + Math.floor((cap - start) / 2), cap)
  const windowStart = cap - window.length
  for (const pattern of [/\r?\n\s*\r?\n/g, /\r?\n/g, /[.!?。!?]\s+/g, /\s+/g]) {
    let boundary = 0
    for (const match of window.matchAll(pattern)) boundary = windowStart + match.index + match[0].length
    if (boundary > start) return safeCut(content, boundary)
  }
  return cap
}

function textBlocks(content: string, sections: readonly DocumentSection[], pages: readonly DocumentPage[], revision: string) {
  const starts = lineStarts(content)
  const headings = new Set(sections.map((section) => section.startOffset))
  const blocks: DocumentBlock[] = []
  let table = 0
  let row = 0
  let paragraph = 0
  const regions = pages.length ? pages : [{ startOffset: 0, endOffset: content.length, number: undefined }]
  for (const region of regions) {
    let previousKind: DocumentBlock['kind'] | null = null
    for (const match of content.slice(region.startOffset, region.endOffset).matchAll(/[^\r\n]*(?:\r\n|\r|\n|$)/g)) {
      if (!match[0]) continue
      const startOffset = region.startOffset + match.index
      const endOffset = startOffset + match[0].length
      const text = match[0].trim()
      const kind: DocumentBlock['kind'] = !text ? 'whitespace'
        : headings.has(startOffset) ? 'heading'
          : /^\|.*\|$/.test(text) ? 'table_row'
            : /^(?:[-*+] |\d+[.)] )/.test(text) ? 'list' : 'paragraph'
      if (kind === 'table_row') {
        if (previousKind !== kind) { table += 1; row = 0 }
        row += 1
      }
      const location: SourceLocation = {
        startOffset, endOffset, startLine: floorIndex(starts, startOffset) + 1,
        endLine: floorIndex(starts, endOffset - 1) + 1,
        ...(region.number === undefined ? {} : { page: region.number, position: blocks.length + 1 }),
      }
      if (kind === 'table_row') {
        const pipes = Array.from(match[0].matchAll(/(?<!\\)\|/g), (pipe) => startOffset + pipe.index)
        location.table = table
        location.row = row
        location.cells = pipes.slice(0, -1).map((pipe, index) => ({ column: index + 1, startOffset: pipe + 1, endOffset: pipes[index + 1] }))
      }
      const prior = blocks.at(-1)
      if ((kind === 'paragraph' || kind === 'whitespace') && previousKind === kind && prior) {
        prior.location.endOffset = endOffset
        prior.location.endLine = location.endLine
      } else {
        if (kind === 'paragraph') { paragraph += 1; location.paragraph = paragraph }
        blocks.push({ id: `block-${revision}-${blocks.length + 1}`, kind, location, status: 'pending' })
      }
      previousKind = kind
    }
  }
  return blocks
}

export async function buildDocumentSnapshot(source: QaSource, imported: ImportMetadata = {}): Promise<DocumentSnapshot> {
  const content = source.content
  if (/[\uD800-\uDFFF]/u.test(content)) throw new Error('Source contains invalid Unicode. Correct the source before analysis.')
  const sourceFingerprint = await fingerprint(content)
  const provenanceChanged = source.documentImport && source.documentImport.contentFingerprint !== sourceFingerprint
  if (source.documentImport && !provenanceChanged) {
    imported = { ...source.documentImport, blocks: source.documentImport.blocks.length ? source.documentImport.blocks : undefined, ...imported }
  }
  const revision = await fingerprint(JSON.stringify([source.id, source.createdAt, source.updatedAt, source.title, sourceFingerprint]))
  const pages = (imported.pages ?? []).map((page) => ({ ...page }))
  validatePages(pages, content.length)
  const legacy = createQaSourceSectionIndex(source)
  const boundaries = (legacy.sections.length ? legacy.sections : content.length ? [{ title: 'Document', path: ['Document'], level: 1, startOffset: 0 }] : [])
    .map((boundary) => ({ ...boundary, startOffset: safeCut(content, boundary.startOffset) }))
  const sections: DocumentSection[] = []
  const ancestry: DocumentSection[] = []
  for (let index = 0; index < boundaries.length; index += 1) {
    const boundary = boundaries[index]
    while (ancestry.length && ancestry[ancestry.length - 1].level >= boundary.level) ancestry.pop()
    const section: DocumentSection = {
      id: `section-${revision}-${index + 1}`, parentId: ancestry.at(-1)?.id ?? null,
      title: boundary.title, path: boundary.path, level: boundary.level,
      startOffset: index === 0 ? 0 : boundary.startOffset,
      endOffset: boundaries[index + 1]?.startOffset ?? content.length,
      fingerprint: '',
    }
    sections.push(section)
    ancestry.push(section)
  }
  const blocks = imported.blocks?.map((block, index) => ({ ...block, id: `block-${revision}-${index + 1}`, location: { ...block.location } })) ?? textBlocks(content, sections, pages, revision)
  const textOnlyBlocks = blocks.filter((block) => block.location.endOffset > block.location.startOffset)
  let accountedOffset = 0
  for (const block of textOnlyBlocks) {
    if (block.location.startOffset !== accountedOffset || block.location.endOffset > content.length) {
      throw new Error('Document block accounting is inconsistent. No source text was discarded.')
    }
    accountedOffset = block.location.endOffset
  }
  if (accountedOffset !== content.length) throw new Error('Document blocks do not account for all source text.')
  for (const page of pages) {
    if ((page.status === 'needs_visual_review' || page.status === 'failed') && !blocks.some((block) => block.kind === 'visual' && block.location.page === page.number)) {
      blocks.push({ id: `visual-${revision}-${page.number}`, kind: 'visual', status: page.status,
        location: { startOffset: page.endOffset, endOffset: page.endOffset, startLine: 1, endLine: 1, page: page.number } })
    }
  }
  const lines = lineStarts(content)
  const blockStarts = textOnlyBlocks.map((block) => block.location.startOffset)
  const nonemptyPages = pages.filter((page) => page.endOffset > page.startOffset)
  const pageStarts = nonemptyPages.map((page) => page.startOffset)
  const units: AnalysisUnit[] = []
  const occurrences = new Map<string, number>()
  for (const section of sections) {
    section.fingerprint = await fingerprint(JSON.stringify([section.path, content.slice(section.startOffset, section.endOffset)]))
    let start = section.startOffset
    while (start < section.endOffset) {
      const page = nonemptyPages[floorIndex(pageStarts, start)]
      const end = boundedEnd(content, start, Math.min(section.endOffset, page?.endOffset ?? content.length))
      if (end <= start) throw new Error('A source region could not be segmented safely.')
      const text = content.slice(start, end)
      const contentFingerprint = await fingerprint(text)
      const reuseKey = await fingerprint(JSON.stringify([DOCUMENT_ALGORITHM, section.path, contentFingerprint]))
      const occurrence = (occurrences.get(reuseKey) ?? 0) + 1
      occurrences.set(reuseKey, occurrence)
      const blockIds: string[] = []
      for (let index = floorIndex(blockStarts, start); index < textOnlyBlocks.length && textOnlyBlocks[index].location.startOffset < end; index += 1) blockIds.push(textOnlyBlocks[index].id)
      units.push({
        id: `unit-${source.id}-${reuseKey}-${occurrence}`, sectionId: section.id, reuseKey, contentFingerprint,
        ordinal: units.length + 1, byteCount: utf8Length(text), status: page?.extraction === 'none' ? 'needs_visual_review' : page?.extraction === 'failed' ? 'failed' : 'pending', blockIds,
        location: { startOffset: start, endOffset: end, startLine: floorIndex(lines, start) + 1, endLine: floorIndex(lines, end - 1) + 1, ...(page ? { page: page.number } : {}) },
      })
      start = end
    }
  }
  const partial = pages.some((page) => page.extraction === 'failed' || page.extraction === 'none')
  return {
    manifest: {
      schemaVersion: 1, sourceId: source.id, sourceCreatedAt: source.createdAt, sourceRevision: revision, sourceFingerprint,
      fileName: imported.fileName ?? null, format: imported.format ?? 'text', pageCount: pages.length || null,
      blockCount: blocks.length, sectionCount: sections.length, analysisUnitCount: units.length, characterCount: content.length,
      importStatus: partial ? 'partial' : 'complete', parsingStatus: partial ? 'partial' : 'complete', analysisStatus: 'pending',
      visualReviewCount: blocks.filter((block) => block.status === 'needs_visual_review').length,
      failedUnitCount: units.filter((unit) => unit.status === 'failed').length,
      warnings: [...legacy.warnings, ...(provenanceChanged ? ['Source text changed after import. Historical file locations are not treated as current.'] : []), ...(imported.warnings ?? [])].slice(0, 40),
      createdAt: source.createdAt, updatedAt: source.updatedAt,
    }, pages, blocks, sections, units,
  }
}
