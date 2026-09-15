import { CORE_COLLECTIONS, coreParsers, coreRecordId, type CoreCollectionName, type CoreCollections } from './workspaceSchema'
import { OPTIONAL_PORTABLE_COLLECTIONS, REBUILT_COLLECTIONS, array, date, identity, integer, object, portableParsers } from './portableSchemas'
import { fingerprint } from '../../features/document-intelligence/documentFingerprint'
import type { Requirement, UnitIntelligence } from '../../features/document-intelligence/requirementModel'
import type { QaSource } from '../../features/qa-sources/qaSourceTypes'
import { buildDocumentSnapshot } from '../../features/document-intelligence/documentSegmentation'
import type { RecordWrite } from './workspaceRepository'
import { clueIdentity } from '../../features/product-evidence/productEvidence'
import { evidenceReviewId, type EvidenceReview } from '../../features/product-evidence/evidenceReview'

export const BACKUP_MAX_BYTES = 256 * 1024 * 1024
export const BACKUP_MAX_RECORDS = 500000
export const PORTABLE_COLLECTIONS = [...CORE_COLLECTIONS, ...Object.keys(portableParsers)]
export const BACKUP_COLLECTIONS = [...PORTABLE_COLLECTIONS, ...REBUILT_COLLECTIONS]
export type WorkspaceBackup = { format: 'qa-mission-control-workspace'; version: 1; exportedAt: string; collections: Record<string, RecordWrite[]> }
const fail = () => { throw new Error('The workspace package is malformed, inconsistent or uses an unsupported format. No saved data was changed.') }
function checkJsonBudget(value: unknown) {
  const pending = [{ value, depth: 0 }]
  let visited = 0
  while (pending.length) {
    const item = pending.pop()!
    if (++visited > 4000000 || item.depth > 30) return fail()
    if (typeof item.value === 'string' && (item.value.length > 16 * 1024 * 1024 || /[\uD800-\uDFFF]/u.test(item.value))) return fail()
    if (item.value && typeof item.value === 'object') for (const child of Object.values(item.value)) pending.push({ value: child, depth: item.depth + 1 })
  }
}
/** Strict normalized records only. Derived document indexes are rebuilt locally after restore. */
export async function validateWorkspaceBackup(raw: unknown): Promise<WorkspaceBackup> {
  checkJsonBudget(raw)
  const input = object(raw)
  if (input.format !== 'qa-mission-control-workspace' || input.version !== 1 || Object.keys(input).some((key) => !['format', 'version', 'exportedAt', 'collections'].includes(key))) return fail()
  const exportedAt = date(input.exportedAt) as string
  const collections = object(input.collections)
  if (PORTABLE_COLLECTIONS.some((key) => !OPTIONAL_PORTABLE_COLLECTIONS.includes(key) && !Object.hasOwn(collections, key)) || Object.keys(collections).some((key) => !PORTABLE_COLLECTIONS.includes(key))) return fail()
  let count = 0
  const output: WorkspaceBackup['collections'] = {}
  for (const name of PORTABLE_COLLECTIONS) {
    const records = array(object, BACKUP_MAX_RECORDS)(Object.hasOwn(collections, name) ? collections[name] : OPTIONAL_PORTABLE_COLLECTIONS.includes(name) ? [] : undefined) as Record<string, unknown>[]
    count += records.length
    if (count > BACKUP_MAX_RECORDS) return fail()
    const ids = new Set<string>()
    output[name] = records.map((record) => {
      if (Object.keys(record).some((key) => !['id', 'value', 'order', 'sourceId'].includes(key))) return fail()
      const id = identity(record.id) as string
      if (ids.has(id)) return fail()
      ids.add(id)
      const order = integer(Number.MAX_SAFE_INTEGER)(record.order) as number
      const core = CORE_COLLECTIONS.includes(name as CoreCollectionName)
      const value = core ? coreParsers[name as CoreCollectionName](record.value) : portableParsers[name](record.value)
      if (!value) return fail()
      if (core ? coreRecordId(name as CoreCollectionName, value as CoreCollections[CoreCollectionName]) !== id : name === 'analysisJobs' ? object(value).sourceId !== id : object(value).id !== id) return fail()
      const sourceScoped = !core && !['sourceSets', 'releaseRequirementBaselines', 'workspaceHistory'].includes(name)
      const sourceId = record.sourceId === undefined ? undefined : identity(record.sourceId) as string
      if (sourceScoped && (!sourceId || object(value).sourceId !== undefined && object(value).sourceId !== sourceId) || !sourceScoped && sourceId !== undefined) return fail()
      return { id, order, value, ...(sourceId ? { sourceId } : {}) }
    })
  }
  const requirements = new Map(output.requirements.map((record) => [record.id, record.value as Requirement]))
  for (const record of output.productEvidenceReviews) if (record.id !== await evidenceReviewId(record.value as EvidenceReview)) return fail()
  for (const record of output.sources) {
    const source = record.value as QaSource
    const evidence = source.documentImport?.productEvidence
    if (evidence) {
      if (source.documentImport!.contentFingerprint !== await fingerprint(source.content)) return fail()
      for (const clue of evidence.clues) if (clue.id !== await clueIdentity(evidence.files[clue.origin.fileIndex].fingerprint, clue)) return fail()
    }
  }
  for (const item of requirements.values()) {
    const evidence = item.evidence
    if (evidence.relativeEnd - evidence.relativeStart !== evidence.quote.length || evidence.location.endOffset - evidence.location.startOffset !== evidence.quote.length || evidence.location.startLine < 1 || evidence.location.endLine < evidence.location.startLine) return fail()
    if (item.fingerprint !== await fingerprint(JSON.stringify([item.kind, item.summary, evidence.quote, item.coverageTopic])) || item.id !== `req-${await fingerprint(JSON.stringify([item.sourceId, item.sourceCreatedAt, item.unitId, item.kind, evidence.relativeStart, evidence.quote.length, item.summary]))}`) return fail()
  }
  for (const record of output.unitIntelligence) {
    const item = record.value as UnitIntelligence
    if (item.id !== item.unitId || new Set(item.requirementIds).size !== item.requirementIds.length || item.requirementIds.some((id) => { const requirement = requirements.get(id); return !requirement || requirement.sourceId !== item.sourceId || requirement.sourceCreatedAt !== item.sourceCreatedAt || requirement.unitReuseKey !== item.reuseKey })) return fail()
  }
  // A syntactically valid cache cannot suppress analysis with evidence that no
  // longer exists. Historical, nonmatching regions remain history, not reuse.
  const cacheBySource = new Map<string, UnitIntelligence[]>()
  for (const record of output.unitIntelligence) {
    const item = record.value as UnitIntelligence
    const group = cacheBySource.get(item.sourceId) ?? []
    group.push(item); cacheBySource.set(item.sourceId, group)
  }
  for (const record of output.sources) {
    const source = record.value as QaSource
    const cache = cacheBySource.get(source.id)
    if (!cache?.length) continue
    const snapshot = await buildDocumentSnapshot(source)
    const units = new Map(snapshot.units.map((unit) => [unit.reuseKey, unit]))
    for (const item of cache) {
      if (item.sourceCreatedAt !== source.createdAt) continue
      const unit = units.get(item.reuseKey)
      if (!unit) continue
      const content = source.content.slice(unit.location.startOffset, unit.location.endOffset)
      if (item.requirementIds.some((id) => { const evidence = requirements.get(id)!.evidence; return content.slice(evidence.relativeStart, evidence.relativeEnd) !== evidence.quote })) return fail()
    }
  }
  const jobs = new Map(output.analysisJobs.map((record) => [object(record.value).id, record]))
  const taskCounts = new Map<string, number>()
  for (const record of output.analysisTasks) {
    const item = object(record.value)
    const job = jobs.get(item.jobId)
    if (!job || job.sourceId !== record.sourceId || item.id !== `${item.jobId}:${item.unitId}`) return fail()
    taskCounts.set(job.id, (taskCounts.get(job.id) ?? 0) + 1)
  }
  if (output.analysisJobs.some((record) => object(record.value).taskCount !== (taskCounts.get(record.id) ?? 0))) return fail()
  for (const record of output.requirementTestLinks) {
    const item = object(record.value)
    if (item.id !== `trace:${item.requirementId}:${item.testCaseId}`) return fail()
  }
  const areas = new Map(output.requirementCoverageAreas.map((record) => [record.id, object(record.value)]))
  for (const record of output.requirementCoverageLinks) {
    const item = object(record.value)
    if (item.id !== `${item.coverageAreaId}:${item.requirementId}` || areas.has(String(item.coverageAreaId)) && areas.get(String(item.coverageAreaId))!.sourceId !== item.sourceId) return fail()
  }
  // Historical links to removed tests/requirements are intentionally preserved.
  // They never become current solely because a backup was restored.
  return { format: 'qa-mission-control-workspace', version: 1, exportedAt, collections: output }
}

export async function parseWorkspaceBackup(text: string) {
  if (new TextEncoder().encode(text).byteLength > BACKUP_MAX_BYTES) throw new Error('Workspace packages are limited to 256 MB. No saved data was changed.')
  let raw: unknown
  try { raw = JSON.parse(text) } catch { return fail() }
  return validateWorkspaceBackup(raw)
}
