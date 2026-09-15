import { resolveAiSectionCoveragePlanContext } from '../src/features/ai-suggestions/aiSectionCoveragePlanContext'
import { fingerprint } from '../src/features/document-intelligence/documentFingerprint'
import { parseQaSource } from '../src/lib/storage/qaSourceStorage'
import { parseQaSourceSectionIndex } from '../src/lib/storage/qaSourceSectionStorage'

type Target = { ordinal: number; marker: string }
const databaseName = 'qa-mission-control-workspace'
const fail = (): never => { throw new Error('Bounded export refused: missing, ambiguous, stale, invalid or oversized sections. No workspace data was changed or exported.') }

function validTargets(targets: Target[]) {
  return Array.isArray(targets) && targets.length > 0 && targets.length <= 2 &&
    new Set(targets.map(target => target?.ordinal)).size === targets.length &&
    targets.every(target => Number.isSafeInteger(target?.ordinal) && target.ordinal > 0 &&
      typeof target.marker === 'string' && /^[A-Za-z0-9_.-]{1,80}$/.test(target.marker))
}

function hasMarker(text: string, marker: string) {
  const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^A-Za-z0-9_.])${escaped}($|[^A-Za-z0-9_.])`).test(text)
}

function matchesTargets(index: NonNullable<ReturnType<typeof parseQaSourceSectionIndex>>, targets: Target[]) {
  return targets.every(target => {
    const section = index.sections[target.ordinal - 1]
    return section?.ordinal === target.ordinal &&
      [section.title, section.preview].some(text => hasMarker(text, target.marker))
  })
}

/** Pure projection from a coherent snapshot. No fallback to stale/fuzzy section locations. */
export async function projectBoundedSourceSections(rawSource: unknown, rawIndex: unknown, targets: Target[]) {
  if (!validTargets(targets)) return fail()
  const source = parseQaSource(rawSource)
  const index = parseQaSourceSectionIndex(rawIndex)
  if (!source || !index || !matchesTargets(index, targets)) return fail()
  const pageProvenance = source.documentImport && source.documentImport.contentFingerprint === await fingerprint(source.content)
    ? 'current' : 'unavailable'
  const sections = targets.map(target => {
    const section = index.sections[target.ordinal - 1]
    const resolved = resolveAiSectionCoveragePlanContext({ qaSource: source, sectionIndex: index,
      selectedSection: { sectionId: section.id, stableKey: section.stableKey } })
    if (!resolved.ok || resolved.context.visibleSection.truncated) return fail()
    const context = resolved.context
    if (!hasMarker(context.visibleSection.content, target.marker) || /[\uD800-\uDFFF]/u.test(context.visibleSection.content)) return fail()
    return { ...context, location: { startOffset: section.startOffset, endOffset: section.endOffset,
      pageProvenance, pages: pageProvenance === 'current' ? source.documentImport!.pages
        .filter(page => page.startOffset < section.endOffset && page.endOffset > section.startOffset)
        .map(page => ({ number: page.number, startOffset: Math.max(page.startOffset, section.startOffset),
          endOffset: Math.min(page.endOffset, section.endOffset) })) : [] } }
  })
  const json = JSON.stringify({ format: 'qa-bounded-source-sections', version: 1, sections }, null, 2)
  // Refuse rather than redact: exported source must remain exact. This is not a
  // general secret detector; the owner must review the two excerpts before sharing.
  if (new TextEncoder().encode(json).length > 160_000 ||
    /\b(?:gsk_|sk-(?:proj-)?)[A-Za-z0-9_-]{16,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:authorization|api[_-]?key|access[_-]?token|password)\s*[=:]\s*\S+/i.test(json)) return fail()
  return json
}

/** Explicit console import only; not imported by the app or included in its build. */
export async function readBoundedSourceSections(targets: Target[]) {
  if (!import.meta.env.DEV || !['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) || !validTargets(targets)) return fail()
  let db: IDBDatabase | undefined
  try {
    // Do not open/upgrade/create a missing workspace, migrate legacy data, or use
    // the repository opener (which may create stores). Read no localStorage.
    if (!(await indexedDB.databases()).some(item => item.name === databaseName && item.version === 3)) return fail()
    db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(databaseName)
      request.onupgradeneeded = () => request.transaction!.abort()
      request.onerror = () => reject(new Error('database unavailable'))
      request.onsuccess = () => resolve(request.result)
    })
    if (db.version !== 3) return fail()
    const snapshot = await new Promise<{ source: unknown; index: unknown }>((resolve, reject) => {
      const transaction = db!.transaction('records', 'readonly')
      const records = transaction.objectStore('records')
      let snapshot: { source: unknown; index: unknown } | undefined
      transaction.onabort = transaction.onerror = () => reject(new Error('snapshot unavailable'))
      transaction.oncomplete = () => snapshot ? resolve(snapshot) : reject(new Error('snapshot unavailable'))
      const indexes = records.index('collection').getAll('sectionIndexes')
      indexes.onsuccess = () => {
        const candidates = indexes.result.flatMap(row => {
          const index = parseQaSourceSectionIndex(row.value)
          return index && row.id === index.qaSourceId && matchesTargets(index, targets) ? [index] : []
        })
        if (candidates.length !== 1) { transaction.abort(); return }
        // Only this exact source body is read, in the same readonly transaction.
        const source = records.get(['sources', candidates[0].qaSourceId])
        source.onsuccess = () => { snapshot = { source: source.result?.value, index: candidates[0] } }
      }
    })
    return await projectBoundedSourceSections(snapshot.source, snapshot.index, targets)
  } catch {
    return fail()
  } finally {
    db?.close()
  }
}
