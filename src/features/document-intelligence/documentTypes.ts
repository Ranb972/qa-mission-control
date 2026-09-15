/** Canonical locations are produced by local parsers, never by the AI provider. */
export type SourceLocation = {
  startOffset: number
  endOffset: number
  startLine: number
  endLine: number
  page?: number
  position?: number
  paragraph?: number
  table?: number
  row?: number
  filePath?: string
  fileLine?: number
  jsonPointer?: string
  cells?: Array<{ column: number; startOffset: number; endOffset: number }>
}

export type AccountingStatus = 'pending' | 'current' | 'failed' | 'excluded' | 'needs_visual_review' | 'stale'
export type DocumentFormat = 'text' | 'markdown' | 'pdf' | 'docx' | 'openapi' | 'json_schema' | 'repository' | 'image'

export type DocumentBlock = {
  id: string
  kind: 'heading' | 'paragraph' | 'list' | 'table_row' | 'visual' | 'whitespace'
  location: SourceLocation
  status: AccountingStatus
}

export type DocumentPage = {
  number: number
  startOffset: number
  endOffset: number
  status: AccountingStatus
  extraction: 'text' | 'ocr' | 'manual' | 'none' | 'failed'
  warning?: string
  ocrConfidence?: number
  review?: { method: 'ocr' | 'manual'; reviewedAt: string; language?: string }
}

export type DocumentSection = {
  id: string
  parentId: string | null
  title: string
  path: string[]
  level: number
  startOffset: number
  endOffset: number
  fingerprint: string
}

export type AnalysisUnit = {
  id: string
  sectionId: string
  /** Exact content + exact heading ancestry + algorithm version, scoped to a source at reuse time. */
  reuseKey: string
  contentFingerprint: string
  location: SourceLocation
  blockIds: string[]
  ordinal: number
  byteCount: number
  status: AccountingStatus
}

export type DocumentManifest = {
  schemaVersion: 1
  sourceId: string
  sourceCreatedAt: string
  sourceRevision: string
  sourceFingerprint: string
  fileName: string | null
  format: DocumentFormat
  pageCount: number | null
  blockCount: number
  sectionCount: number
  analysisUnitCount: number
  characterCount: number
  importStatus: 'complete' | 'partial'
  parsingStatus: 'complete' | 'partial'
  analysisStatus: 'pending' | 'partial' | 'complete' | 'stale'
  visualReviewCount: number
  failedUnitCount: number
  warnings: string[]
  createdAt: string
  updatedAt: string
}

export type DocumentSnapshot = {
  manifest: DocumentManifest
  pages: DocumentPage[]
  blocks: DocumentBlock[]
  sections: DocumentSection[]
  units: AnalysisUnit[]
}
