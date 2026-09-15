import { describe, expect, it } from 'vitest'
import { applyPdfPageReview, pageBody } from './pdfReviewModel'
import { fingerprint } from './documentFingerprint'
import { parseDocumentImport, type DocumentImport } from './documentImport'
import { buildDocumentSnapshot } from './documentSegmentation'
import { createQaSource } from '../../test/qaSourceFactory'
async function fixture() {
  const entries = ['--- Page 1 ---\nThe first requirement.', '\n\n--- Page 2 ---\n[Page 2: no selectable text — needs review]', '\n\n--- Page 3 ---\nLast page remains exact.']
  const content = entries.join(''); let offset = 0
  const imported: DocumentImport = { schemaVersion: 1, format: 'pdf', fileName: 'source.pdf', originalFileFingerprint: 'a'.repeat(64), contentFingerprint: await fingerprint(content), blocks: [], pages: entries.map((entry, index) => { const startOffset = offset; offset += entry.length; return { number: index + 1, startOffset, endOffset: offset, status: index === 1 ? 'needs_visual_review' : 'pending', extraction: index === 1 ? 'none' : 'text' } }) }
  return { content, imported }
}
describe('explicit PDF page review', () => {
  it('retains other pages and canonical page provenance while visual review remains open by default', async () => {
    const { content, imported } = await fixture()
    const result = await applyPdfPageReview(content, imported, 2, 'חובה לאמת הרשאות.\nSessions expire after 30 minutes.', 'ocr', false, 'en-US')
    expect(pageBody(result.content, result.documentImport, 3)).toBe(pageBody(content, imported, 3))
    expect(result.documentImport.pages[1]).toMatchObject({ extraction: 'ocr', status: 'needs_visual_review', review: { method: 'ocr', language: 'en-US' } })
    expect(result.documentImport.pages[1].ocrConfidence).toBeUndefined()
    expect(parseDocumentImport(result.documentImport, result.content.length)).toEqual(result.documentImport)
    const snapshot = await buildDocumentSnapshot(createQaSource({ ...result }))
    expect(snapshot.units.at(-1)?.location.page).toBe(3)
    expect(snapshot.manifest.visualReviewCount).toBe(1)
    expect(snapshot.units.map((unit) => result.content.slice(unit.location.startOffset, unit.location.endOffset)).join('')).toBe(result.content)
  })
  it('clears visual review only with explicit human confirmation, never marks analysis current', async () => {
    const { content, imported } = await fixture()
    const result = await applyPdfPageReview(content, imported, 2, 'The diagram requires explicit payment confirmation.', 'manual', true)
    expect(result.documentImport.pages[1]).toMatchObject({ extraction: 'manual', status: 'pending', review: { method: 'manual' } })
    const snapshot = await buildDocumentSnapshot(createQaSource(result))
    expect(snapshot.manifest.visualReviewCount).toBe(0)
    expect(snapshot.units.every((unit) => unit.status === 'pending')).toBe(true)
  })
  it('rejects stale source, nonexistent page, blank or oversized transcription without mutation', async () => {
    const { content, imported } = await fixture(); const original = JSON.stringify(imported)
    for (const [body, number, text] of [[content + 'edit', 2, 'text'], [content, 9, 'text'], [content, 2, ''], [content, 2, 'x'.repeat(30001)]] as const) await expect(applyPdfPageReview(body, imported, number, text, 'manual', true)).rejects.toThrow()
    expect(JSON.stringify(imported)).toBe(original)
  })
})
