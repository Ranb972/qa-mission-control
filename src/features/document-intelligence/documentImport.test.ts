import { describe, expect, it } from 'vitest'
import { parseDocumentImport } from './documentImport'

const valid = {
  schemaVersion: 1, fileName: 'spec.pdf', format: 'pdf', contentFingerprint: 'a'.repeat(64),
  pages: [{ number: 1, startOffset: 0, endOffset: 10, status: 'pending', extraction: 'text' }],
  blocks: [{ id: 'b1', kind: 'table_row', status: 'pending', location: {
    startOffset: 0, endOffset: 10, startLine: 1, endLine: 1, page: 1, table: 1, row: 1,
    cells: [{ column: 1, startOffset: 1, endOffset: 9 }],
  } }],
}

describe('local import provenance validation', () => {
  it('retains canonical page/table locations and strips unknown payload fields', () => {
    expect(parseDocumentImport({ ...valid, rawResponse: 'MUST NOT PERSIST', token: 'MUST NOT PERSIST' }, 10)).toEqual(valid)
  })
  it('rejects missing and overlapping page accounting', () => {
    expect(parseDocumentImport({ ...valid, pages: [{ ...valid.pages[0], endOffset: 9 }] }, 10)).toBeNull()
    expect(parseDocumentImport({ ...valid, pages: [...valid.pages, { ...valid.pages[0], number: 2 }] }, 10)).toBeNull()
  })
  it('rejects cells outside the canonical block and invalid page pointers', () => {
    expect(parseDocumentImport({ ...valid, blocks: [{ ...valid.blocks[0], location: { ...valid.blocks[0].location, cells: [{ column: 1, startOffset: 1, endOffset: 11 }] } }] }, 10)).toBeNull()
    expect(parseDocumentImport({ ...valid, blocks: [{ ...valid.blocks[0], location: { ...valid.blocks[0].location, page: 2 } }] }, 10)).toBeNull()
  })
  it('rejects non-finite OCR confidence and unsupported schemas', () => {
    expect(parseDocumentImport({ ...valid, pages: [{ ...valid.pages[0], ocrConfidence: NaN }] }, 10)).toBeNull()
    expect(parseDocumentImport({ ...valid, schemaVersion: 999 }, 10)).toBeNull()
  })
})
