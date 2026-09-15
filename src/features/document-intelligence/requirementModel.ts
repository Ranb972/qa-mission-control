import type { QaSource } from '../qa-sources/qaSourceTypes'
import type { AnalysisUnit, DocumentSnapshot, SourceLocation } from './documentTypes'
import { fingerprint } from './documentFingerprint'
import { locateQuote, UNIT_ANALYSIS_VERSION, type FindingKind, type UnitAnalysis } from './unitAnalysisContract'

export type Requirement = {
  id: string
  sourceId: string
  sourceCreatedAt: string
  sourceRevision: string
  unitId: string
  unitReuseKey: string
  sectionId: string
  kind: FindingKind
  summary: string
  coverageTopic: string
  evidence: { quote: string; relativeStart: number; relativeEnd: number; location: SourceLocation; blockIds: string[] }
  fingerprint: string
  analysisVersion: typeof UNIT_ANALYSIS_VERSION
  createdAt: string
}
export type UnitIntelligence = {
  id: string
  sourceId: string
  sourceCreatedAt: string
  unitId: string
  reuseKey: string
  analysisVersion: typeof UNIT_ANALYSIS_VERSION
  requirementIds: string[]
  reviewNotes: string[]
  analyzedAt: string
}
export const isTestableRequirement = (requirement: Requirement) => ['requirement', 'business_rule', 'constraint'].includes(requirement.kind)
const blockIndexes = new WeakMap<DocumentSnapshot, Map<string, DocumentSnapshot['blocks'][number]>>()

function canonicalEvidence(source: QaSource, unit: AnalysisUnit, snapshot: DocumentSnapshot, relativeStart: number, quote: string): Requirement['evidence'] {
  const startOffset = unit.location.startOffset + relativeStart
  const endOffset = startOffset + quote.length
  let blocksById = blockIndexes.get(snapshot)
  if (!blocksById) { blocksById = new Map(snapshot.blocks.map((block) => [block.id, block])); blockIndexes.set(snapshot, blocksById) }
  const blocks = unit.blockIds.map((id) => blocksById.get(id)).filter((block) => block && block.location.startOffset < endOffset && block.location.endOffset > startOffset)
  const block = blocks[0]
  const startLine = unit.location.startLine + (source.content.slice(unit.location.startOffset, startOffset).match(/\n/g) ?? []).length
  const location: SourceLocation = { startOffset, endOffset, startLine, endLine: startLine + (quote.match(/\n/g) ?? []).length,
    ...(unit.location.page === undefined ? {} : { page: unit.location.page }),
    ...(block?.location.position === undefined ? {} : { position: block.location.position }),
    ...(block?.location.paragraph === undefined ? {} : { paragraph: block.location.paragraph }),
    ...(block?.location.table === undefined ? {} : { table: block.location.table }),
    ...(block?.location.row === undefined ? {} : { row: block.location.row }),
    ...(block?.location.filePath === undefined ? {} : { filePath: block.location.filePath }),
    ...(block?.location.fileLine === undefined ? {} : { fileLine: block.location.fileLine }),
    ...(block?.location.jsonPointer === undefined ? {} : { jsonPointer: block.location.jsonPointer }),
    ...(block?.location.cells ? { cells: block.location.cells.filter((cell) => cell.startOffset < endOffset && cell.endOffset > startOffset).map((cell) => ({ ...cell })) } : {}) }
  return { quote, relativeStart, relativeEnd: relativeStart + quote.length, location, blockIds: blocks.map((item) => item!.id) }
}

/** Only locally computed identities, offsets and normalized interpretation become durable. */
export async function materializeRequirements(source: QaSource, snapshot: DocumentSnapshot, unit: AnalysisUnit, analysis: UnitAnalysis, now: string): Promise<Requirement[]> {
  const content = source.content.slice(unit.location.startOffset, unit.location.endOffset)
  const results = new Map<string, Requirement>()
  for (const finding of analysis.findings) {
    const start = locateQuote(content, finding.quote, finding.occurrence)
    if (start < 0) throw new Error('Analysis evidence no longer matches this source region.')
    const identity = await fingerprint(JSON.stringify([source.id, source.createdAt, unit.id, finding.kind, start, finding.quote.length, finding.summary]))
    const id = `req-${identity}`
    results.set(id, { id, sourceId: source.id, sourceCreatedAt: source.createdAt, sourceRevision: snapshot.manifest.sourceRevision,
      unitId: unit.id, unitReuseKey: unit.reuseKey, sectionId: unit.sectionId, kind: finding.kind, summary: finding.summary, coverageTopic: finding.coverage,
      evidence: canonicalEvidence(source, unit, snapshot, start, finding.quote),
      fingerprint: await fingerprint(JSON.stringify([finding.kind, finding.summary, finding.quote, finding.coverage])), analysisVersion: UNIT_ANALYSIS_VERSION, createdAt: now })
  }
  return [...results.values()]
}

/** Reattach only when exact content AND heading ancestry match. IDs survive offset-only changes. */
export async function reuseRequirements(source: QaSource, snapshot: DocumentSnapshot, unit: AnalysisUnit, previous: Requirement[]): Promise<Requirement[] | null> {
  const content = source.content.slice(unit.location.startOffset, unit.location.endOffset)
  if (previous.some((item) => item.sourceId !== source.id || item.sourceCreatedAt !== source.createdAt || item.unitReuseKey !== unit.reuseKey ||
    item.analysisVersion !== UNIT_ANALYSIS_VERSION || content.slice(item.evidence.relativeStart, item.evidence.relativeEnd) !== item.evidence.quote)) return null
  return Promise.all(previous.map(async (item) => ({ ...item,
    id: item.unitId === unit.id ? item.id : `req-${await fingerprint(JSON.stringify([source.id, source.createdAt, unit.id, item.kind, item.evidence.relativeStart, item.evidence.quote.length, item.summary]))}`,
    sourceRevision: snapshot.manifest.sourceRevision, unitId: unit.id, sectionId: unit.sectionId,
    evidence: canonicalEvidence(source, unit, snapshot, item.evidence.relativeStart, item.evidence.quote) })))
}

export function requirementIsCurrent(requirement: Requirement, snapshot: DocumentSnapshot, units: ReadonlyMap<string, AnalysisUnit> = new Map(snapshot.units.map((unit) => [unit.id, unit]))) {
  const unit = units.get(requirement.unitId)
  return requirement.sourceId === snapshot.manifest.sourceId && requirement.sourceCreatedAt === snapshot.manifest.sourceCreatedAt &&
    requirement.analysisVersion === UNIT_ANALYSIS_VERSION && unit?.reuseKey === requirement.unitReuseKey
}
