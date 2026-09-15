import type { DocumentBlock, DocumentFormat, DocumentPage } from './documentTypes'
import { parseProductEvidence, type ProductEvidence } from '../product-evidence/productEvidence'

export type DocumentImport = {
  schemaVersion: 1
  fileName: string
  format: DocumentFormat
  contentFingerprint: string
  originalFileFingerprint?: string
  productEvidence?: ProductEvidence
  pages: DocumentPage[]
  blocks: DocumentBlock[]
}

const statuses = ['pending', 'current', 'failed', 'excluded', 'needs_visual_review', 'stale']
const formats = ['text', 'markdown', 'pdf', 'docx', 'openapi', 'json_schema', 'repository', 'image']
const kinds = ['heading', 'paragraph', 'list', 'table_row', 'visual', 'whitespace']
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value) }
function bounded(value: unknown, max: number): value is string { return typeof value === 'string' && value.length <= max }
function integer(value: unknown, max: number): value is number { return Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= max }

/** Copies known local-parser fields only. Imported/backup provenance is rechecked against exact source content when indexed. */
export function parseDocumentImport(value: unknown, contentLength: number, content?: string): DocumentImport | null {
  if (!record(value) || value.schemaVersion !== 1 || !bounded(value.fileName, 512) ||
    !formats.includes(String(value.format)) || !bounded(value.contentFingerprint, 64) || !/^[a-f0-9]{64}$/.test(value.contentFingerprint) ||
    !Array.isArray(value.pages) || value.pages.length > 1200 || !Array.isArray(value.blocks) || value.blocks.length > 100_000) return null
  if (value.originalFileFingerprint !== undefined && (typeof value.originalFileFingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(value.originalFileFingerprint))) return null
  const productEvidence = value.productEvidence === undefined ? undefined : content === undefined ? null : parseProductEvidence(value.productEvidence, content)
  if (productEvidence === null || productEvidence && value.format !== productEvidence.kind) return null
  const pages: DocumentPage[] = []
  let pageEnd = 0
  for (const page of value.pages) {
    if (!record(page) || page.number !== pages.length + 1 || !integer(page.startOffset, contentLength) || page.startOffset !== pageEnd ||
      !integer(page.endOffset, contentLength) || page.endOffset < page.startOffset || !statuses.includes(String(page.status)) ||
      !['text', 'ocr', 'manual', 'none', 'failed'].includes(String(page.extraction)) ||
      (page.warning !== undefined && !bounded(page.warning, 500)) ||
      (page.ocrConfidence !== undefined && (typeof page.ocrConfidence !== 'number' || !Number.isFinite(page.ocrConfidence) || page.ocrConfidence < 0 || page.ocrConfidence > 100))) return null
    let review: DocumentPage['review']
    if (page.review !== undefined) {
      const item = page.review
      if (!record(item) || !['ocr', 'manual'].includes(String(item.method)) || typeof item.reviewedAt !== 'string' || item.reviewedAt.length > 30 || !Number.isFinite(Date.parse(item.reviewedAt)) || item.language !== undefined && (typeof item.language !== 'string' || !/^[A-Za-z0-9-]{2,30}$/.test(item.language))) return null
      review = { method: item.method as 'ocr' | 'manual', reviewedAt: item.reviewedAt, ...(item.language ? { language: item.language as string } : {}) }
    }
    pages.push({ number: pages.length + 1, startOffset: page.startOffset, endOffset: page.endOffset,
      status: page.status as DocumentPage['status'], extraction: page.extraction as DocumentPage['extraction'],
      ...(page.warning === undefined ? {} : { warning: page.warning as string }),
      ...(page.ocrConfidence === undefined ? {} : { ocrConfidence: page.ocrConfidence as number }), ...(review ? { review } : {}) })
    pageEnd = page.endOffset
  }
  if (pages.length && pageEnd !== contentLength) return null
  const blocks: DocumentBlock[] = []
  let blockEnd = 0
  for (const block of value.blocks) {
    if (!record(block) || !bounded(block.id, 2000) || !kinds.includes(String(block.kind)) || !statuses.includes(String(block.status)) || !record(block.location)) return null
    const location = block.location
    if (!integer(location.startOffset, contentLength) || !integer(location.endOffset, contentLength) || location.startOffset !== blockEnd || location.endOffset < blockEnd ||
      !integer(location.startLine, contentLength + 1) || !integer(location.endLine, contentLength + 1) || location.startLine < 1 || location.endLine < location.startLine) return null
    const canonical: DocumentBlock['location'] = { startOffset: location.startOffset, endOffset: location.endOffset, startLine: location.startLine, endLine: location.endLine }
    for (const key of ['filePath', 'jsonPointer'] as const) if (location[key] !== undefined) {
      if (!bounded(location[key], key === 'filePath' ? 500 : 1500)) return null
      canonical[key] = location[key]
    }
    if (location.fileLine !== undefined) {
      if (!integer(location.fileLine, 200000) || location.fileLine < 1) return null
      canonical.fileLine = location.fileLine
    }
    for (const key of ['page', 'position', 'paragraph', 'table', 'row'] as const) {
      if (location[key] !== undefined) {
        if (!integer(location[key], key === 'page' ? pages.length : 100_000) || location[key] < 1) return null
        canonical[key] = location[key]
      }
    }
    if (location.cells !== undefined) {
      if (!Array.isArray(location.cells) || location.cells.length > 1000) return null
      canonical.cells = []
      let previousCellEnd = location.startOffset
      for (const cell of location.cells) {
        if (!record(cell) || !integer(cell.column, 1000) || cell.column < 1 || !integer(cell.startOffset, location.endOffset) ||
          cell.startOffset < previousCellEnd || !integer(cell.endOffset, location.endOffset) || cell.endOffset < cell.startOffset) return null
        canonical.cells.push({ column: cell.column, startOffset: cell.startOffset, endOffset: cell.endOffset })
        previousCellEnd = cell.endOffset
      }
    }
    blocks.push({ id: block.id, kind: block.kind as DocumentBlock['kind'], status: block.status as DocumentBlock['status'], location: canonical })
    blockEnd = location.endOffset
  }
  if (blocks.length && blockEnd !== contentLength) return null
  if (productEvidence) {
    const byStart = new Map(blocks.map((block) => [block.location.startOffset, block.location]))
    if (productEvidence.clues.some((clue) => { const location = byStart.get(clue.startOffset); return !location || location.endOffset !== clue.endOffset || location.filePath !== productEvidence.files[clue.origin.fileIndex].path || location.fileLine !== clue.origin.line || location.jsonPointer !== clue.origin.pointer })) return null
  }
  return { schemaVersion: 1, fileName: value.fileName, format: value.format as DocumentFormat, contentFingerprint: value.contentFingerprint, pages, blocks, ...(value.originalFileFingerprint ? { originalFileFingerprint: value.originalFileFingerprint as string } : {}), ...(productEvidence ? { productEvidence } : {}) }
}
