import { fingerprint, utf8Length } from '../document-intelligence/documentFingerprint'

export const PRODUCT_EVIDENCE_LIMIT = 3000
export const PRODUCT_INPUT_BYTES = 2 * 1024 * 1024
export const CLUE_KINDS = ['endpoint', 'parameter', 'authentication', 'response', 'schema', 'reference', 'route', 'module', 'component', 'test', 'feature_flag', 'documentation'] as const
export type ProductClueKind = typeof CLUE_KINDS[number]
export type ProductOrigin = { fileIndex: number; pointer?: string; line?: number }
export type ProductClue = { id: string; kind: ProductClueKind; summary: string; origin: ProductOrigin; startOffset: number; endOffset: number }
export type ProductEvidence = { version: 1; kind: 'openapi' | 'json_schema' | 'repository'; files: { path: string; fingerprint: string; lineCount: number }[]; clues: ProductClue[]; limitations: string[] }
export type EvidenceProjection = { content: string; manifest: ProductEvidence }
export type PendingClue = Pick<ProductClue, 'kind' | 'summary' | 'origin'>
const sha = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
const text = (value: unknown, max: number): value is string => typeof value === 'string' && value.length <= max && !/[\uD800-\uDFFF]/u.test(value)
const integer = (value: unknown, max: number): value is number => Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= max
export function object(value: unknown): Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {} }
export function safeEvidencePath(value: string) { const normalized = value.replace(/\\/g, '/'); return value.length > 0 && value.length <= 500 && !/^\/|^[a-z]:|(^|\/)\.\.(\/|$)|\p{Cc}/iu.test(normalized) }
export async function clueIdentity(fileFingerprint: string, clue: PendingClue) { return `clue-${await fingerprint(JSON.stringify([fileFingerprint, clue.kind, clue.origin.pointer ?? null, clue.origin.line ?? null, clue.summary]))}` }

/** Normalized local interpretation only; no raw input file or provider payload. */
export async function projectEvidence(kind: ProductEvidence['kind'], files: ProductEvidence['files'], clues: PendingClue[], limitations: string[]): Promise<EvidenceProjection> {
  if (!clues.length) throw new Error('No supported evidence clues were found. Nothing was imported.')
  if (clues.length > PRODUCT_EVIDENCE_LIMIT) throw new Error('This selection exceeds 3,000 evidence clues. Select a smaller explicit API or repository scope; no source prefix was imported.')
  let content = `# ${kind === 'repository' ? 'Selected repository evidence' : 'Structured API contract evidence'}\nThis is a local evidence projection, not proof of implementation correctness, requirement approval or test coverage.\n\n`
  const normalized: ProductClue[] = []
  const seen = new Set<string>()
  for (const clue of clues) {
    if (!text(clue.summary, 1200) || !clue.summary.trim()) throw new Error('An evidence clue exceeds the supported 1,200-character boundary. Nothing was imported.')
    const id = await clueIdentity(files[clue.origin.fileIndex].fingerprint, clue)
    if (seen.has(id)) continue
    seen.add(id)
    content += `## ${clue.kind.replace('_', ' ')} ${normalized.length + 1}\n`
    const startOffset = content.length; content += clue.summary
    normalized.push({ ...clue, id, origin: { ...clue.origin }, startOffset, endOffset: content.length }); content += '\n\n'
  }
  const manifest: ProductEvidence = { version: 1, kind, files, clues: normalized, limitations: [...new Set(limitations)].slice(0, 30) }
  if (!parseProductEvidence(manifest, content)) throw new Error('The evidence projection exceeds safe source-location limits. Nothing was imported.')
  return { content, manifest }
}

/** Validate backup/storage against the exact projected source text. */
export function parseProductEvidence(raw: unknown, content: string): ProductEvidence | null {
  const value = object(raw)
  if (value.version !== 1 || !['openapi', 'json_schema', 'repository'].includes(String(value.kind)) || !Array.isArray(value.files) || !value.files.length || value.files.length > 100 || !Array.isArray(value.clues) || !value.clues.length || value.clues.length > PRODUCT_EVIDENCE_LIMIT || !Array.isArray(value.limitations) || value.limitations.length > 30 || value.limitations.some((item) => !text(item, 500))) return null
  const files: ProductEvidence['files'] = []
  for (const rawFile of value.files) {
    const file = object(rawFile)
    if (typeof file.path !== 'string' || !safeEvidencePath(file.path) || !sha(file.fingerprint) || !integer(file.lineCount, 200000)) return null
    files.push({ path: file.path, fingerprint: file.fingerprint, lineCount: file.lineCount })
  }
  const clues: ProductClue[] = []; const seen = new Set<string>(); let end = 0
  for (const rawClue of value.clues) {
    const clue = object(rawClue); const origin = object(clue.origin)
    if (typeof clue.id !== 'string' || !/^clue-[a-f0-9]{64}$/.test(clue.id) || seen.has(clue.id) || !CLUE_KINDS.includes(clue.kind as ProductClueKind) || !text(clue.summary, 1200) || !integer(origin.fileIndex, files.length - 1) || !integer(clue.startOffset, content.length) || !integer(clue.endOffset, content.length) || clue.startOffset < end || clue.endOffset < clue.startOffset || content.slice(clue.startOffset, clue.endOffset) !== clue.summary || origin.pointer !== undefined && (!text(origin.pointer, 1500) || !/^(?:\/|$)/.test(origin.pointer)) || origin.line !== undefined && (!integer(origin.line, files[origin.fileIndex].lineCount) || origin.line < 1)) return null
    seen.add(clue.id); end = clue.endOffset
    clues.push({ id: clue.id, kind: clue.kind as ProductClueKind, summary: clue.summary, startOffset: clue.startOffset, endOffset: clue.endOffset, origin: { fileIndex: origin.fileIndex, ...(origin.pointer === undefined ? {} : { pointer: origin.pointer as string }), ...(origin.line === undefined ? {} : { line: origin.line as number }) } })
  }
  return { version: 1, kind: value.kind as ProductEvidence['kind'], files, clues, limitations: value.limitations as string[] }
}

export function validateEvidenceInput(input: { name: string; text: string }) {
  if (!safeEvidencePath(input.name) || /(^|\/)(?:\.env(?:\..*)?|id_rsa|credentials(?:\..*)?)$|\.(?:pem|key|p12|pfx)$/i.test(input.name.replace(/\\/g, '/'))) throw new Error('Choose explicit non-secret source or API files, not credentials or private-key files.')
  if (utf8Length(input.text) > PRODUCT_INPUT_BYTES || /[\uD800-\uDFFF]/u.test(input.text)) throw new Error('Each evidence input must be valid Unicode and at most 2 MB. No partial input was imported.')
  if (/(?:\b(?:sk-|gsk_|gh[pousr]_)[A-Za-z0-9_-]{20,}|\bAKIA[A-Z0-9]{16}\b|-----BEGIN[ A-Z]*PRIVATE KEY-----|(?:password|api[_-]?key|secret|access[_-]?token|auth[_-]?token)\s*["']?\s*[:=]\s*["'][^"'\r\n]{12,}["']|["']Bearer [A-Za-z0-9._-]{15,}["'])/i.test(input.text)) throw new Error('This selection appears to contain credential material. Remove secrets before importing; no content was saved or sent.')
}
