import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

export const OCR_MAX_PNG_BYTES = 3 * 1024 * 1024
export type OcrCapabilities = { supported: boolean; languages: string[]; maxDimension: number }
export type OcrText = { text: string; language: string }
export const OCR_UNSUPPORTED = 'Local OCR is unavailable on this server. Use a Windows host with an installed OCR language, or transcribe the page manually. Visual review remains open.'
let active = false

/** One local process, no shell interpolation, retries, network or disk artifacts. */
export async function runLocalOcr(input: { operation: 'capabilities' } | { operation: 'recognize'; png: string; language: string }, signal?: AbortSignal): Promise<unknown> {
  if (process.platform !== 'win32') throw new Error(OCR_UNSUPPORTED)
  if (active) throw new Error('Local OCR is busy. Wait for the current page to finish before trying again.')
  active = true
  let childCreated = false
  try {
    return await new Promise((resolveResult, reject) => {
      const executable = resolve(process.env.SystemRoot || 'C:/Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe')
      const child = spawn(executable, ['-NoProfile', '-NonInteractive', '-File', resolve(process.cwd(), 'scripts/windows-ocr.ps1')], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
      childCreated = true
      let output = ''; let ended = false
      const finish = (error?: Error, value?: unknown) => {
        if (ended) return
        ended = true; clearTimeout(timer); signal?.removeEventListener('abort', cancel)
        if (error) { child.kill(); reject(error) } else resolveResult(value)
      }
      const cancel = () => finish(new Error('Page recognition canceled. Source content is unchanged.'))
      const timer = setTimeout(() => finish(new Error('Local OCR timed out. Source content is unchanged.')), 30000)
      child.stdout.setEncoding('utf8')
      child.stdout.on('data', (chunk: string) => { output += chunk; if (output.length > 200000) finish(new Error('OCR output exceeded the page limit. Source content is unchanged.')) })
      child.stderr.resume()
      child.on('error', () => { active = false; finish(new Error(OCR_UNSUPPORTED)) })
      child.stdin.on('error', () => finish(new Error(OCR_UNSUPPORTED)))
      child.on('close', (code) => {
        active = false
        if (ended) return
        try { if (code !== 0) throw new Error(); finish(undefined, JSON.parse(output.replace(/^\uFEFF/, ''))) }
        catch { finish(new Error(OCR_UNSUPPORTED)) }
      })
      signal?.addEventListener('abort', cancel, { once: true })
      if (signal?.aborted) cancel()
      else child.stdin.end(JSON.stringify(input))
    })
  } finally { if (!childCreated) active = false }
}

export function validateOcrPng(value: unknown) {
  if (typeof value !== 'string' || value.length > 4 * Math.ceil(OCR_MAX_PNG_BYTES / 3) || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return false
  const bytes = Buffer.from(value, 'base64')
  if (bytes.length < 33 || bytes.length > OCR_MAX_PNG_BYTES || bytes.toString('base64') !== value || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || bytes.toString('ascii', 12, 16) !== 'IHDR') return false
  return bytes.readUInt32BE(16) > 0 && bytes.readUInt32BE(20) > 0 && bytes.readUInt32BE(16) <= 2048 && bytes.readUInt32BE(20) <= 2048
}

type Request = { method?: string; headers?: Record<string, string | string[] | undefined>; body?: unknown }
type Runner = typeof runLocalOcr
export async function handleOcrRequest(request: Request, runner: Runner = runLocalOcr) {
  const error = (status: number, message: string) => ({ status, body: { ok: false, error: message } })
  if (!['GET', 'POST'].includes(request.method ?? '')) return error(405, 'Use GET for availability or POST for one explicit page.')
  if (request.method === 'POST') {
    const origin = request.headers?.origin; const host = request.headers?.host
    try { if (typeof origin !== 'string' || typeof host !== 'string' || new URL(origin).host !== host || !['http:', 'https:'].includes(new URL(origin).protocol)) return error(403, 'Page recognition must be requested from this workspace.') } catch { return error(403, 'Page recognition must be requested from this workspace.') }
    if (!String(request.headers?.['content-type']).startsWith('application/json')) return error(415, 'Submit one page as JSON.')
  }
  const input = request.body as Record<string, unknown> | null
  if (request.method === 'POST' && (!input || Object.keys(input).some((key) => !['png', 'language'].includes(key)) || !validateOcrPng(input.png) || typeof input.language !== 'string' || !/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,2}$/.test(input.language))) return error(400, 'Choose one PNG page up to 2,048 pixels and 3 MB, and an installed OCR language.')
  try {
    const value = await runner(request.method === 'GET' ? { operation: 'capabilities' } : { operation: 'recognize', png: input!.png as string, language: input!.language as string }) as Record<string, unknown>
    if (request.method === 'GET') {
      if (typeof value.supported !== 'boolean' || !Array.isArray(value.languages) || value.languages.length > 100 || value.languages.some((item) => typeof item !== 'string' || !/^[A-Za-z0-9-]{2,30}$/.test(item))) throw new Error(OCR_UNSUPPORTED)
      return { status: 200, body: { ok: true, supported: value.supported, languages: value.languages, maxDimension: 2048 } }
    }
    if (typeof value.text !== 'string' || value.text.length > 30000 || typeof value.language !== 'string' || value.language !== input!.language) throw new Error(OCR_UNSUPPORTED)
    return { status: 200, body: { ok: true, text: value.text, language: value.language, confidence: null, warning: 'OCR can omit or misread text. Confidence is unavailable. Compare every line with the page before applying; diagrams still need human interpretation.' } }
  } catch (reason) {
    const allowed = [OCR_UNSUPPORTED, 'Local OCR is busy. Wait for the current page to finish before trying again.', 'Local OCR timed out. Source content is unchanged.']
    return error(503, reason instanceof Error && allowed.includes(reason.message) ? reason.message : OCR_UNSUPPORTED)
  }
}
