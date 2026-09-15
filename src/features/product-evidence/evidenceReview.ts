import type { QaSource } from '../qa-sources/qaSourceTypes'
import { fingerprint } from '../document-intelligence/documentFingerprint'
import type { PreparedAnalysis } from '../../lib/workspace/analysisJobRepository'
import type { WorkspaceRepository, StoredRecord } from '../../lib/workspace/workspaceRepository'
import type { Requirement } from '../document-intelligence/requirementModel'
import { object } from './productEvidence'

export const EVIDENCE_DECISIONS = ['potential_difference', 'related_evidence', 'dismissed'] as const
export type EvidenceReview = { id: string; sourceId: string; sourceCreatedAt: string; evidenceFingerprint: string; requirementSourceId: string; requirementSourceCreatedAt: string; requirementId: string; requirementFingerprint: string; clueIds: string[]; decision: typeof EVIDENCE_DECISIONS[number]; note: string; reviewedAt: string }
const identity = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 2000
const sha = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
const date = (value: unknown): value is string => typeof value === 'string' && value.length <= 80 && Number.isFinite(Date.parse(value))
export function parseEvidenceReview(raw: unknown): EvidenceReview | null {
  const value = object(raw)
  if (Object.keys(value).some((key) => !['id', 'sourceId', 'sourceCreatedAt', 'evidenceFingerprint', 'requirementSourceId', 'requirementSourceCreatedAt', 'requirementId', 'requirementFingerprint', 'clueIds', 'decision', 'note', 'reviewedAt'].includes(key)) || !identity(value.id) || !identity(value.sourceId) || !identity(value.requirementSourceId) || !identity(value.requirementId) || !date(value.sourceCreatedAt) || !date(value.requirementSourceCreatedAt) || !date(value.reviewedAt) || !sha(value.evidenceFingerprint) || !sha(value.requirementFingerprint) || !Array.isArray(value.clueIds) || value.clueIds.length > 3 || new Set(value.clueIds).size !== value.clueIds.length || value.clueIds.some((id) => typeof id !== 'string' || !/^clue-[a-f0-9]{64}$/.test(id)) || !EVIDENCE_DECISIONS.includes(value.decision as EvidenceReview['decision']) || typeof value.note !== 'string' || value.note.length > 600 || /[\uD800-\uDFFF]/u.test(value.note)) return null
  return value as EvidenceReview
}
export const evidenceReviewId = async (value: Pick<EvidenceReview, 'sourceId' | 'sourceCreatedAt' | 'requirementSourceId' | 'requirementSourceCreatedAt' | 'requirementId'>) => `evidence-review-${await fingerprint(JSON.stringify([value.sourceId, value.sourceCreatedAt, value.requirementSourceId, value.requirementSourceCreatedAt, value.requirementId]))}`
export function reviewIsCurrent(review: EvidenceReview, source: QaSource, requirement: Requirement) {
  const evidence = source.documentImport?.productEvidence
  return review.sourceId === source.id && review.sourceCreatedAt === source.createdAt && review.evidenceFingerprint === source.documentImport?.contentFingerprint && review.requirementSourceId === requirement.sourceId && review.requirementSourceCreatedAt === requirement.sourceCreatedAt && review.requirementId === requirement.id && review.requirementFingerprint === requirement.fingerprint && review.clueIds.every((id) => evidence?.clues.some((clue) => clue.id === id))
}
export async function saveEvidenceReview(repository: WorkspaceRepository, prepared: PreparedAnalysis, evidenceSource: StoredRecord<QaSource>, requirement: Requirement, clueIds: string[], decision: EvidenceReview['decision'], note: string, previous: StoredRecord<EvidenceReview> | null) {
  const source = evidenceSource.value
  const evidence = source.documentImport?.productEvidence
  if (!evidence || decision === 'related_evidence' && !clueIds.length || !prepared.currentRequirements?.some((item) => item.id === requirement.id && item.fingerprint === requirement.fingerprint) || clueIds.some((id) => !evidence.clues.some((clue) => clue.id === id)) || prepared.requirementVersion === undefined || prepared.intelligenceVersion === undefined) throw new Error('Refresh both sources before recording this review.')
  const identity = { sourceId: source.id, sourceCreatedAt: source.createdAt, requirementSourceId: requirement.sourceId, requirementSourceCreatedAt: requirement.sourceCreatedAt, requirementId: requirement.id }
  const value = parseEvidenceReview({ ...identity, id: await evidenceReviewId(identity), evidenceFingerprint: source.documentImport!.contentFingerprint, requirementFingerprint: requirement.fingerprint, clueIds, decision, note: note.trim(), reviewedAt: new Date().toISOString() })
  if (!value || previous && previous.id !== value.id) throw new Error('The review is invalid. Existing decisions were preserved.')
  await repository.commit([{ collection: 'productEvidenceReviews', put: [{ id: value.id, sourceId: source.id, order: Date.now(), value }] }], {
    recordChecks: [{ collection: 'sources', id: source.id, version: evidenceSource.version }, { collection: 'sources', id: prepared.source.id, version: prepared.sourceVersion }, { collection: 'productEvidenceReviews', id: value.id, version: previous?.version ?? null }],
    collectionChecks: [{ collection: 'requirements', version: prepared.requirementVersion }, { collection: 'unitIntelligence', version: prepared.intelligenceVersion }],
  })
  return value
}
