import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import type { DocumentImport } from '../document-intelligence/documentImport'

type Preview = { content: string; imported: DocumentImport }
export function ProductEvidenceImport({ onApply }: { onApply: (preview: Preview) => boolean }) {
  const [kind, setKind] = useState<'api' | 'repository'>('api')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const request = useRef<{ id: number; worker?: Worker } | null>(null)
  const sequence = useRef(0)
  useEffect(() => () => { request.current?.worker?.terminate(); request.current = null }, [])
  function cancel() { request.current?.worker?.terminate(); request.current = null; setBusy(false) }
  async function filesSelected(event: ChangeEvent<HTMLInputElement>) {
    const files = [...event.target.files ?? []]; event.target.value = ''
    if (!files.length || request.current) return
    setError(''); setPreview(null)
    if (files.length > (kind === 'api' ? 1 : 100) || files.reduce((sum, file) => sum + file.size, 0) > 2 * 1024 * 1024) { setError('Choose one API JSON file or up to 100 explicit repository files, at most 2 MB in total.'); return }
    const id = ++sequence.current; request.current = { id }; setBusy(true)
    try {
      const inputs = await Promise.all(files.map(async (file) => ({ name: file.name, text: await file.text() })))
      if (request.current?.id !== id) return
      const worker = new Worker(new URL('./productImport.worker.ts', import.meta.url), { type: 'module' }); request.current.worker = worker
      worker.onmessage = (message) => {
        if (request.current?.id !== id) return
        if (message.data.ok) setPreview({ content: message.data.content, imported: message.data.imported })
        else setError(message.data.error)
        cancel()
      }
      worker.onerror = () => { if (request.current?.id === id) { setError('Evidence processing failed. No saved source changed.'); cancel() } }
      worker.postMessage({ kind, inputs })
    } catch { if (request.current?.id === id) { setError('Selected files could not be read. No saved source changed.'); cancel() } }
  }
  const manifest = preview?.imported.productEvidence
  return <details className="product-import"><summary>Import product, API or repository evidence</summary>
    <p className="helper-text">Use selected local files only. Nothing is cloned, crawled, executed or sent to AI. The preview retains supported clues, not the original files. Review confidential material before saving.</p>
    <div className="document-review-controls"><label className="field-group">Evidence format<select aria-label="Evidence format" className="select" value={kind} disabled={busy} onChange={(event) => { setKind(event.target.value as 'api' | 'repository'); setPreview(null); setError('') }}><option value="api">OpenAPI / JSON Schema (JSON)</option><option value="repository">Selected repository / README excerpts</option></select></label><label className="field-group">Choose product evidence files<input type="file" multiple={kind === 'repository'} disabled={busy} accept={kind === 'api' ? '.json,application/json' : '.ts,.tsx,.js,.jsx,.mjs,.cjs,.py,.java,.cs,.go,.rb,.rs,.php,.md,.txt'} onChange={(event) => void filesSelected(event)} /></label></div>
    <p className="helper-text">2 MB selected scope · 3,000 clues maximum. API import supports OpenAPI 3.0/3.1 and JSON Schema, not YAML. Repository extraction is heuristic and cannot establish implementation completeness.</p>
    {busy && <div className="button-row"><p role="status">Preparing explicit evidence in a background worker…</p><button type="button" className="button button--secondary" onClick={cancel}>Cancel evidence import</button></div>}
    {error && <p className="field-error" role="alert">{error}</p>}
    {preview && manifest && <section aria-label="Product evidence import preview"><h4>{manifest.clues.length.toLocaleString()} evidence clues · {manifest.files.length} selected files</h4><ul className="helper-text">{manifest.limitations.map((item) => <li key={item}>{item}</li>)}</ul><details><summary>Preview the first 8 clues</summary>{manifest.clues.slice(0, 8).map((clue) => <p key={clue.id}><strong>{clue.kind.replace('_', ' ')}:</strong> {clue.summary}</p>)}<p className="helper-text">All {manifest.clues.length} clues are included in the source, not just this preview.</p></details><button type="button" className="button button--secondary" onClick={() => { if (onApply(preview)) setPreview(null) }}>Use reviewed evidence as source</button></section>}
  </details>
}
