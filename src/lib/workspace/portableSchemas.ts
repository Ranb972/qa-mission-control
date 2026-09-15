import { FINDING_KINDS, UNIT_ANALYSIS_VERSION } from '../../features/document-intelligence/unitAnalysisContract'
import { parseSourceSet } from '../../features/document-intelligence/sourceSetModel'
import { parseReleaseRequirementBaseline } from '../../features/release-report/releaseRequirements'
import { parseEvidenceReview } from '../../features/product-evidence/evidenceReview'
import { parseActivityLedger } from './workspaceHistory'

type Parser = (value: unknown) => unknown
const invalid = () => { throw new Error('A backup record does not match the supported workspace schema. No saved data was changed.') }
export const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : invalid()
export const string = (max: number, empty = false): Parser => (value) => typeof value === 'string' && value.length <= max && (empty || value.trim()) && !/[\uD800-\uDFFF]/u.test(value) ? value : invalid()
export const integer = (max = 16 * 1024 * 1024): Parser => (value) => Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= max ? value : invalid()
const boolean: Parser = (value) => typeof value === 'boolean' ? value : invalid()
const enumeration = (...values: unknown[]): Parser => (value) => values.includes(value) ? value : invalid()
const optional = (parser: Parser): Parser => (value) => value === undefined ? undefined : parser(value)
const nullable = (parser: Parser): Parser => (value) => value === null ? null : parser(value)
export const array = (parser: Parser, max: number): Parser => (value) => Array.isArray(value) && value.length <= max ? value.map(parser) : invalid()
const shape = (fields: Record<string, Parser>): Parser => (value) => {
  const input = object(value)
  if (Object.keys(input).some((key) => !Object.hasOwn(fields, key))) return invalid()
  return Object.fromEntries(Object.entries(fields).flatMap(([key, parse]) => { const parsed = parse(input[key]); return parsed === undefined ? [] : [[key, parsed]] }))
}
export const identity = string(2000)
export const date: Parser = (value) => typeof value === 'string' && value.length <= 80 && Number.isFinite(Date.parse(value)) ? value : invalid()
const sha: Parser = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value) ? value : invalid()
const location = shape({ startOffset: integer(), endOffset: integer(), startLine: integer(), endLine: integer(), page: optional(integer(1200)), position: optional(integer()), paragraph: optional(integer()), table: optional(integer()), row: optional(integer()), filePath: optional(string(500)), fileLine: optional(integer(200000)), jsonPointer: optional(string(1500, true)), cells: optional(array(shape({ column: integer(1000), startOffset: integer(), endOffset: integer() }), 1000)) })
const parsed = (parse: Parser): Parser => (value) => parse(value) ?? invalid()
export const portableParsers: Record<string, Parser> = {
  requirements: shape({ id: identity, sourceId: identity, sourceCreatedAt: date, sourceRevision: sha, unitId: identity, unitReuseKey: sha, sectionId: identity, kind: enumeration(...FINDING_KINDS), summary: string(600), coverageTopic: string(120, true),
    evidence: shape({ quote: string(800), relativeStart: integer(6000), relativeEnd: integer(6000), location, blockIds: array(identity, 6000) }), fingerprint: sha, analysisVersion: enumeration(UNIT_ANALYSIS_VERSION), createdAt: date }),
  unitIntelligence: shape({ id: identity, sourceId: identity, sourceCreatedAt: date, unitId: identity, reuseKey: sha, analysisVersion: enumeration(UNIT_ANALYSIS_VERSION), requirementIds: array(identity, 48), reviewNotes: array(string(300), 8), analyzedAt: date }),
  analysisJobs: shape({ id: identity, sourceId: identity, sourceCreatedAt: date, sourceRevision: sha, sourceVersion: integer(Number.MAX_SAFE_INTEGER), type: enumeration('entire_specification'), status: enumeration('prepared', 'running', 'paused', 'canceled', 'completed', 'partial', 'stale'), taskCount: integer(100000), createdAt: date, updatedAt: date }),
  analysisTasks: shape({ id: identity, jobId: identity, unitId: identity, reuseKey: sha, status: enumeration('pending', 'running', 'retrying', 'completed', 'failed', 'excluded', 'needs_visual_review'), attempts: integer(3), reused: boolean, nextAttemptAt: nullable(integer(Number.MAX_SAFE_INTEGER)), errorCode: nullable(enumeration('bad_request', 'configuration', 'rate_limited', 'timeout', 'temporary', 'invalid_response')), updatedAt: date }),
  sourceCoveragePlans: shape({ id: identity, sourceId: identity, sourceRevision: sha, requirementSetFingerprint: sha, requirementCount: integer(100000), areaCount: integer(100000), createdAt: date, updatedAt: date }),
  requirementCoverageAreas: shape({ id: identity, sourceId: identity, name: string(600), fingerprint: sha, readiness: enumeration('needs_review', 'blocked_by_ambiguity') }),
  requirementCoverageLinks: shape({ id: identity, sourceId: identity, requirementId: identity, requirementFingerprint: sha, coverageAreaId: identity, active: optional(boolean) }),
  requirementTestLinks: shape({ id: identity, sourceId: identity, requirementId: identity, requirementFingerprint: sha, testCaseId: identity, testDesignFingerprint: sha, confirmation: enumeration('qa_confirmed'), confirmedAt: date }),
  sourceSets: parsed(parseSourceSet), releaseRequirementBaselines: parsed(parseReleaseRequirementBaseline),
  productEvidenceReviews: parsed(parseEvidenceReview),
  workspaceHistory: parsed(parseActivityLedger),
}
// Additive v1 package extensions: older valid backups omit these collections.
export const OPTIONAL_PORTABLE_COLLECTIONS = ['productEvidenceReviews', 'workspaceHistory']
export const REBUILT_COLLECTIONS = ['documentManifests', 'documentPages', 'documentBlocks', 'documentSections', 'analysisUnits'] as const
