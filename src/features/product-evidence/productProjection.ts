import type { DocumentImport } from '../document-intelligence/documentImport'
import type { DocumentBlock } from '../document-intelligence/documentTypes'
import { fingerprint } from '../document-intelligence/documentFingerprint'
import type { EvidenceProjection } from './productEvidence'

export async function projectionDocumentImport(projection: EvidenceProjection): Promise<DocumentImport> {
  const { content, manifest } = projection
  const blocks: DocumentBlock[] = []; let offset = 0; let line = 1
  const add = (end: number, kind: DocumentBlock['kind'], origin?: DocumentBlock['location']) => {
    if (end <= offset) return
    const startLine = line; line += (content.slice(offset, end).match(/\n/g) ?? []).length
    blocks.push({ id: `projection-block-${blocks.length + 1}`, kind, status: 'pending', location: { ...origin, startOffset: offset, endOffset: end, startLine, endLine: Math.max(startLine, line - (content[end - 1] === '\n' ? 1 : 0)) } })
    offset = end
  }
  for (const clue of manifest.clues) {
    add(clue.startOffset, 'heading')
    add(clue.endOffset, 'paragraph', { startOffset: clue.startOffset, endOffset: clue.endOffset, startLine: line, endLine: line, filePath: manifest.files[clue.origin.fileIndex].path, ...(clue.origin.line === undefined ? {} : { fileLine: clue.origin.line }), ...(clue.origin.pointer === undefined ? {} : { jsonPointer: clue.origin.pointer }) })
  }
  add(content.length, 'whitespace')
  return { schemaVersion: 1, fileName: manifest.files.length === 1 ? manifest.files[0].path : `${manifest.files.length} selected repository excerpts`, format: manifest.kind, contentFingerprint: await fingerprint(content), pages: [], blocks, productEvidence: manifest }
}
