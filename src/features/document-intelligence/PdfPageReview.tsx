import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import type { DocumentImport } from './documentImport'
import { applyPdfPageReview, pageBody, renderPdfReviewPage } from './pdfReviewModel'

type Props = { file: File | null; content: string; imported: DocumentImport; onAttach: (file: File) => void; onApply: (value: { content: string; documentImport: DocumentImport }) => void }
export function PdfPageReview({ file, content, imported, onAttach, onApply }: Props) {
  const candidates = imported.pages.filter((page) => ['needs_visual_review', 'failed'].includes(page.status) || page.review)
  const [attached, setAttached] = useState<File | null>(file)
  const [pageNumber, setPageNumber] = useState(candidates[0]?.number ?? 1)
  const [image, setImage] = useState('')
  const [text, setText] = useState('')
  const [method, setMethod] = useState<'manual' | 'ocr'>('manual')
  const [languages, setLanguages] = useState<string[]>([])
  const [language, setLanguage] = useState('')
  const [recognizedLanguage, setRecognizedLanguage] = useState<string | undefined>()
  const [textReviewed, setTextReviewed] = useState(false)
  const [visualReviewed, setVisualReviewed] = useState(false)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const request = useRef<AbortController | null>(null)
  useEffect(() => () => request.current?.abort(), [])
  const page = imported.pages.find((item) => item.number === pageNumber)
  function begin(label: string) {
    if (request.current) return null
    const controller = new AbortController(); request.current = controller; setBusy(label); setError(''); setNotice('')
    return controller
  }
  function finish(controller: AbortController) { if (request.current === controller) { request.current = null; setBusy('') } }
  function fail(controller: AbortController, message: string) { if (!controller.signal.aborted) setError(message) }
  async function reattach(event: ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0]; event.target.value = ''
    if (!chosen) return
    const controller = begin('Checking original file identity…'); if (!controller) return
    try {
      if (chosen.size > 32 * 1024 * 1024 || !imported.originalFileFingerprint) throw new Error()
      const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await chosen.arrayBuffer())), (byte) => byte.toString(16).padStart(2, '0')).join('')
      if (digest !== imported.originalFileFingerprint) throw new Error()
      if (!controller.signal.aborted) { setAttached(chosen); onAttach(chosen); setNotice('Exact original PDF attached for this review only. It will not be stored.') }
    } catch { fail(controller, 'The attachment does not match the exact imported PDF, or its identity is unavailable. Re-import through the source form to review a different file.') }
    finally { finish(controller) }
  }
  async function preview() {
    if (!attached) return
    const controller = begin(`Rendering page ${pageNumber} locally…`); if (!controller) return
    try {
      const next = await renderPdfReviewPage(attached, pageNumber, controller.signal)
      if (!controller.signal.aborted) {
        setImage(next); setText(pageBody(content, imported, pageNumber).replace(/^\[Page \d+:.*needs review\]$/, '')); setMethod(page?.review?.method ?? 'manual'); setRecognizedLanguage(page?.review?.language); setTextReviewed(false); setVisualReviewed(false)
      }
    } catch { fail(controller, 'This page could not be rendered safely. No source text changed. Try a readable original PDF.') }
    finally { finish(controller) }
  }
  async function availability() {
    const controller = begin('Checking local OCR availability…'); if (!controller) return
    try {
      const response = await fetch('/api/documents/ocr', { signal: controller.signal, cache: 'no-store', credentials: 'omit', redirect: 'error' }); const result = await response.json()
      if (!response.ok || !result.ok || !result.supported || !Array.isArray(result.languages) || !result.languages.length) throw new Error()
      if (!controller.signal.aborted) { setLanguages(result.languages.filter((value: unknown) => typeof value === 'string' && /^[A-Za-z0-9-]{2,30}$/.test(value)).slice(0, 100)); setLanguage(result.languages[0]); setNotice('Choose a language that matches the page. OCR does not detect unsupported languages reliably.') }
    } catch { fail(controller, 'Local OCR is unavailable. A Windows host and matching installed OCR language are required. You can transcribe this page manually; nothing is sent to AI.') }
    finally { finish(controller) }
  }
  async function recognize() {
    if (!image || !language) return
    const controller = begin(`Recognizing page ${pageNumber} on this host…`); if (!controller) return
    try {
      const png = image.slice(image.indexOf(',') + 1)
      if (png.length > 4194304) throw new Error()
      const response = await fetch('/api/documents/ocr', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ png, language }), signal: controller.signal, credentials: 'omit', redirect: 'error' })
      const result = await response.json()
      if (!response.ok || !result.ok || typeof result.text !== 'string' || result.text.length > 30000 || result.language !== language) throw new Error()
      if (!controller.signal.aborted) { setText(result.text); setMethod('ocr'); setRecognizedLanguage(language); setTextReviewed(false); setVisualReviewed(false); setNotice(result.text.trim() ? 'OCR draft only. Confidence is unavailable; compare and correct every line before applying.' : 'OCR found no text. Transcribe meaningful visual content manually or leave this page needing review.') }
    } catch { fail(controller, 'This page could not be recognized within the local OCR limits. The previous transcript is unchanged. Check the language or transcribe it manually.') }
    finally { finish(controller) }
  }
  async function apply() {
    if (!textReviewed || !image || !text.trim()) return
    const controller = begin('Applying the reviewed page to this unsaved source…'); if (!controller) return
    try {
      const value = await applyPdfPageReview(content, imported, pageNumber, text, method, visualReviewed, method === 'ocr' ? recognizedLanguage : undefined)
      if (!controller.signal.aborted) onApply(value)
    } catch { fail(controller, 'Reviewed text could not be applied safely. Reopen the review and keep the page within 30,000 characters. No source text changed.') }
    finally { finish(controller) }
  }
  if (!candidates.length) return null
  return <details className="pdf-page-review"><summary>Scanned & visual page review · {candidates.filter((item) => ['needs_visual_review', 'failed'].includes(item.status)).length} remaining</summary>
    <p className="helper-text">Page images stay transient. OCR sends only this rendered page to your application host, never the AI provider. Review text and visual meaning separately; save the source afterward to keep changes.</p>
    {!attached && <label className="field-group">Reattach exact original PDF<input type="file" accept=".pdf,application/pdf" disabled={!!busy} onChange={(event) => void reattach(event)} /></label>}
    <div className="document-review-controls"><label className="field-group">Page to review<select className="select" disabled={!!busy} value={pageNumber} onChange={(event) => { setPageNumber(Number(event.target.value)); setImage(''); setText(''); setTextReviewed(false); setVisualReviewed(false); setError(''); setNotice('') }}>{candidates.map((item) => <option value={item.number} key={item.number}>Page {item.number} · {item.status === 'pending' ? 'transcription reviewed' : item.status === 'failed' ? 'extraction failed' : 'needs visual review'}{item.extraction === 'ocr' ? ' · OCR' : ''}</option>)}</select></label><button type="button" className="button button--secondary" disabled={!!busy || !attached} onClick={() => void preview()}>Open page preview</button></div>
    {page?.warning && <p className="helper-text">{page.warning}</p>}
    {page?.review && <p className="helper-text">Last transcription review: {page.review.reviewedAt.slice(0, 10)} · {page.review.method === 'ocr' ? `OCR-assisted (${page.review.language ?? 'language unavailable'})` : 'manual'}. This is not test approval.</p>}
    {image && <><div className="pdf-review-grid"><figure><img src={image} alt={`Original PDF page ${pageNumber} for transcription review`} /><figcaption>Page {pageNumber} · original attachment</figcaption></figure><div className="field-group"><label htmlFor="pdf-page-transcript">Reviewed page transcript</label><textarea id="pdf-page-transcript" dir="auto" className="textarea" maxLength={30000} value={text} disabled={!!busy} onChange={(event) => { setText(event.target.value); setTextReviewed(false); setVisualReviewed(false) }} /><p className="helper-text">Include table relationships and diagram meaning in your own reviewed description. Do not infer missing behavior.</p></div></div>
      <div className="button-row">{!languages.length ? <button type="button" className="button button--secondary" disabled={!!busy} onClick={() => void availability()}>Check local OCR availability</button> : <><div className="field-group"><label htmlFor="pdf-ocr-language">OCR language</label><select id="pdf-ocr-language" className="select" value={language} disabled={!!busy} onChange={(event) => setLanguage(event.target.value)}>{languages.map((value) => <option key={value}>{value}</option>)}</select></div><button type="button" className="button button--secondary" disabled={!!busy} onClick={() => void recognize()}>Recognize this page</button></>}</div>
      <label className="checkbox-label"><input type="checkbox" disabled={!!busy} checked={textReviewed} onChange={(event) => setTextReviewed(event.target.checked)} />I compared this transcript with the page and corrected the text.</label>
      <label className="checkbox-label"><input type="checkbox" disabled={!!busy} checked={visualReviewed} onChange={(event) => setVisualReviewed(event.target.checked)} />I also accounted for diagrams, tables and other visual meaning, or confirmed there is none.</label>
      <button type="button" className="button button--primary" disabled={!!busy || !textReviewed || !text.trim()} onClick={() => void apply()}>Apply reviewed page to source</button></>}
    {busy && <div className="button-row"><p role="status">{busy}</p><button type="button" className="button button--secondary" onClick={() => { request.current?.abort(); setNotice('Page operation canceled. Source content is unchanged.') }}>Cancel page operation</button></div>}
    {notice && <p role="status" className="helper-text">{notice}</p>}{error && <p role="alert" className="field-error">{error}</p>}
  </details>
}
