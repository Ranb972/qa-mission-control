import type { AnalysisUnit, DocumentSnapshot } from './documentTypes'
import type { Requirement, UnitIntelligence } from './requirementModel'
import { UNIT_ANALYSIS_VERSION, type UnitErrorCode } from './unitAnalysisContract'

export type AnalysisJobStatus = 'prepared' | 'running' | 'paused' | 'canceled' | 'completed' | 'partial' | 'stale'
export type AnalysisTaskStatus = 'pending' | 'running' | 'retrying' | 'completed' | 'failed' | 'excluded' | 'needs_visual_review'
export type AnalysisJob = {
  id: string
  sourceId: string
  sourceCreatedAt: string
  sourceRevision: string
  sourceVersion: number
  type: 'entire_specification'
  status: AnalysisJobStatus
  taskCount: number
  createdAt: string
  updatedAt: string
}
export type AnalysisTask = {
  id: string
  jobId: string
  unitId: string
  reuseKey: string
  status: AnalysisTaskStatus
  attempts: number
  reused: boolean
  nextAttemptAt: number | null
  errorCode: UnitErrorCode | null
  updatedAt: string
}
export type AnalysisPreflight = {
  providerTasks: number
  reusedTasks: number
  localReviewTasks: number
  maxAttempts: number
  total: number
  reuse: Map<string, { intelligence: UnitIntelligence; requirements: Requirement[] }>
}
export const JOB_CONCURRENCY = 2
export const JOB_MAX_ATTEMPTS = 3
export const retryDelay = (attempt: number) => Math.min(30_000, 2000 * 2 ** Math.max(0, attempt - 1))

export function createAnalysisPreflight(snapshot: DocumentSnapshot, intelligence: UnitIntelligence[], requirements: Requirement[]): AnalysisPreflight {
  const requirementsById = new Map(requirements.map((item) => [item.id, item]))
  const cache = new Map<string, { intelligence: UnitIntelligence; requirements: Requirement[] }>()
  for (const result of intelligence) {
    if (result.sourceId !== snapshot.manifest.sourceId || result.sourceCreatedAt !== snapshot.manifest.sourceCreatedAt || result.analysisVersion !== UNIT_ANALYSIS_VERSION) continue
    const linked = result.requirementIds.map((id) => requirementsById.get(id))
    if (linked.some((item) => !item || item.unitReuseKey !== result.reuseKey)) continue
    cache.set(result.reuseKey, { intelligence: result, requirements: linked as Requirement[] })
  }
  const reuse: AnalysisPreflight['reuse'] = new Map()
  let localReviewTasks = 0
  for (const unit of snapshot.units) {
    if (isLocalReviewUnit(unit)) { localReviewTasks += 1; continue }
    const match = cache.get(unit.reuseKey)
    if (match) reuse.set(unit.id, match)
  }
  return { providerTasks: snapshot.units.length - localReviewTasks - reuse.size, reusedTasks: reuse.size,
    localReviewTasks, maxAttempts: JOB_MAX_ATTEMPTS, total: snapshot.units.length, reuse }
}
export function isLocalReviewUnit(unit: AnalysisUnit) { return ['needs_visual_review', 'failed', 'excluded'].includes(unit.status) }
export function jobCounts(tasks: AnalysisTask[]) {
  const counts: Record<AnalysisTaskStatus, number> = { pending: 0, running: 0, retrying: 0, completed: 0, failed: 0, excluded: 0, needs_visual_review: 0 }
  for (const task of tasks) counts[task.status] += 1
  return { ...counts, total: tasks.length, reused: tasks.filter((task) => task.reused).length }
}
