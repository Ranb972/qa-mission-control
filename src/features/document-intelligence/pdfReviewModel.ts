import type { DocumentImport } from './documentImport'
import { fingerprint, utf8Length } from './documentFingerprint'

export function pageBody(content: string, imported: DocumentImport, pageNumber: number) {
  const page = imported.pages.find((item) => item.number === pageNumber)
  if (!page) return ''
  return content.slice(page.startOffset, page.endOffset).replace(/^\n\n/, '').replace(/^--- Page \d+ ---\n/, '')
}

/** Explicit human transcription review rebases only canonical page boundaries. */
export async function applyPdfPageReview(content: string, imported: DocumentImport, pageNumber: number, text: string, method: 'ocr' | 'manual', visualReviewed: boolean, language?: string) {
  if (imported.format !== 'pdf' || imported.contentFingerprint !== await fingerprint(content) || !imported.pages.some((page) => page.number === pageNumber)) throw new Error('The source changed. Reopen page review; previous content is unchanged.')
  const reviewedText = text.trim()
  if (!reviewedText || reviewedText.length > 30000 || /[\uD800-\uDFFF]/u.test(reviewedText) || language !== undefined && !/^[A-Za-z0-9-]{2,30}$/.test(language)) throw new Error('Enter reviewed page text of up to 30,000 characters, with valid Unicode.')
  const entries: string[] = []
  let offset = 0
  const pages = imported.pages.map((page) => {
    const selected = page.number === pageNumber
    const entry = selected ? `${page.number > 1 ? '\n\n' : ''}${imported.pages.length > 1 ? `--- Page ${page.number} ---\n` : ''}${reviewedText}` : content.slice(page.startOffset, page.endOffset)
    const startOffset = offset; offset += entry.length; entries.push(entry)
    return { ...page, startOffset, endOffset: offset, ...(selected ? {
      extraction: method,
      status: visualReviewed ? 'pending' as const : 'needs_visual_review' as const,
      warning: `${visualReviewed ? 'Human-reviewed transcription; not QA approval or coverage proof.' : 'Transcription reviewed; visual meaning still requires human review.'} ${method === 'ocr' ? 'OCR confidence is unavailable.' : 'Manual transcription may omit details.'}`,
      review: { method, reviewedAt: new Date().toISOString(), ...(language ? { language } : {}) },
    } : {}) }
  })
  const nextContent = entries.join('')
  if (utf8Length(nextContent) > 16 * 1024 * 1024) throw new Error('Reviewed text exceeds the 16 MB source limit. Previous content is unchanged.')
  return { content: nextContent, documentImport: { ...imported, contentFingerprint: await fingerprint(nextContent), pages, blocks: [] } }
}

export async function renderPdfReviewPage(file: File, pageNumber: number, signal: AbortSignal) {
  const [pdfjs, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.mjs?url')])
  if (signal.aborted) throw new Error('Page preview canceled.')
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), disableFontFace: true, standardFontDataUrl: `${location.origin}/pdfjs/standard_fonts/` })
  const cancel = () => { void task.destroy().catch(() => undefined) }
  signal.addEventListener('abort', cancel, { once: true })
  try {
    const pdf = await task.promise
    const page = await pdf.getPage(pageNumber)
    const base = page.getViewport({ scale: 1 })
    const viewport = page.getViewport({ scale: Math.min(2.5, 1800 / Math.max(base.width, base.height)) })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height)
    await page.render({ canvas, viewport }).promise
    if (signal.aborted) throw new Error('Page preview canceled.')
    const image = canvas.toDataURL('image/png')
    canvas.width = 0; canvas.height = 0
    return image
  } finally { signal.removeEventListener('abort', cancel); await task.destroy() }
}
