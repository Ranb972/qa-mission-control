import type { QaSource } from '../../features/qa-sources/qaSourceTypes'
import type { DocumentManifest, DocumentSnapshot } from '../../features/document-intelligence/documentTypes'
import { buildDocumentSnapshot } from '../../features/document-intelligence/documentSegmentation'
import { createAnalysisPreflight, isLocalReviewUnit, type AnalysisJob, type AnalysisPreflight, type AnalysisTask } from '../../features/document-intelligence/analysisJobModel'
import { reuseRequirements, type Requirement, type UnitIntelligence } from '../../features/document-intelligence/requirementModel'
import { UNIT_ANALYSIS_VERSION } from '../../features/document-intelligence/unitAnalysisContract'
import { loadDocumentSnapshot, saveDocumentSnapshot } from './documentRepository'
import type { StoredRecord, WorkspaceRepository } from './workspaceRepository'

export type PreparedAnalysis = { source: QaSource; sourceVersion: number; snapshot: DocumentSnapshot; preflight: AnalysisPreflight; job: StoredRecord<AnalysisJob> | null; tasks: StoredRecord<AnalysisTask>[]; requirements: Requirement[]; currentRequirements?: Requirement[]; requirementVersion?: number; intelligenceVersion?: number }
const now = () => new Date().toISOString()
const write = <T>(record: StoredRecord<T>, value: T) => ({ id: record.id, sourceId: record.sourceId, order: record.order, value })

export class AnalysisJobRepository {
  readonly repository: WorkspaceRepository
  constructor(repository: WorkspaceRepository) { this.repository = repository }

  async prepare(sourceId: string): Promise<PreparedAnalysis> {
    const sourceRecord = await this.repository.readRecord<QaSource>('sources', sourceId)
    if (!sourceRecord) throw new Error('Save this source before preparing analysis.')
    const source = sourceRecord.value
    const previous = await loadDocumentSnapshot(this.repository, sourceId)
    const rebuilt = await buildDocumentSnapshot(source)
    // Verify exact content even if two edits share a timestamp. Preparing never contacts a provider.
    const snapshot = previous?.manifest.sourceRevision === rebuilt.manifest.sourceRevision ? previous : rebuilt
    if (snapshot === rebuilt) await saveDocumentSnapshot(this.repository, snapshot, sourceRecord.version)
    const [bundle, job] = await Promise.all([
      this.repository.readSourceBundleWithVersions(['unitIntelligence', 'requirements', 'analysisTasks'], sourceId),
      this.repository.readRecord<AnalysisJob>('analysisJobs', sourceId),
    ])
    const requirements = bundle.requirements.records.map((record) => record.value as Requirement)
    const preflight = createAnalysisPreflight(snapshot, bundle.unitIntelligence.records.map((record) => record.value as UnitIntelligence), requirements)
    const currentRequirements: Requirement[] = []
    for (const unit of snapshot.units) {
      const cached = preflight.reuse.get(unit.id)
      if (!cached) continue
      const rebased = await reuseRequirements(source, snapshot, unit, cached.requirements)
      if (rebased) currentRequirements.push(...rebased)
    }
    return { source, sourceVersion: sourceRecord.version, snapshot, preflight, job, tasks: bundle.analysisTasks.records as StoredRecord<AnalysisTask>[], requirements, currentRequirements,
      requirementVersion: bundle.requirements.version, intelligenceVersion: bundle.unitIntelligence.version }
  }

  async create(prepared: PreparedAnalysis): Promise<StoredRecord<AnalysisJob>> {
    const { source, snapshot, sourceVersion, preflight } = prepared
    const timestamp = now()
    const job: AnalysisJob = { id: crypto.randomUUID(), sourceId: source.id, sourceCreatedAt: source.createdAt, sourceRevision: snapshot.manifest.sourceRevision, sourceVersion,
      type: 'entire_specification', status: 'prepared', taskCount: snapshot.units.length, createdAt: timestamp, updatedAt: timestamp }
    const tasks: AnalysisTask[] = []
    const requirements: Requirement[] = []
    const intelligence: UnitIntelligence[] = []
    for (const unit of snapshot.units) {
      const cached = preflight.reuse.get(unit.id)
      const reused = cached ? await reuseRequirements(source, snapshot, unit, cached.requirements) : null
      if (cached && !reused) throw new Error('Reusable evidence changed. Refresh the analysis scope before confirming.')
      if (reused && cached) {
        requirements.push(...reused)
        intelligence.push({ ...cached.intelligence, id: unit.id, unitId: unit.id, requirementIds: reused.map((item) => item.id) })
      }
      tasks.push({ id: `${job.id}:${unit.id}`, jobId: job.id, unitId: unit.id, reuseKey: unit.reuseKey,
        status: unit.status === 'excluded' ? 'excluded' : isLocalReviewUnit(unit) ? unit.status === 'failed' ? 'failed' : 'needs_visual_review' :
          reused ? cached?.intelligence.reviewNotes.length ? 'needs_visual_review' : 'completed' : 'pending',
        attempts: 0, reused: !!reused, errorCode: null, nextAttemptAt: null, updatedAt: timestamp })
    }
    const versions = await this.repository.commit([
      { collection: 'analysisJobs', put: [{ id: source.id, value: job, sourceId: source.id, order: 0 }] },
      { collection: 'analysisTasks', remove: prepared.tasks.map((task) => task.id), put: tasks.map((value, order) => ({ id: value.id, value, sourceId: source.id, order })) },
      { collection: 'requirements', put: requirements.map((value) => ({ id: value.id, value, sourceId: source.id, order: value.evidence.location.startOffset })) },
      { collection: 'unitIntelligence', put: intelligence.map((value) => ({ id: value.id, value, sourceId: source.id, order: 0 })) },
    ], { recordChecks: [{ collection: 'sources', id: source.id, version: sourceVersion },
      { collection: 'analysisJobs', id: source.id, version: prepared.job?.version ?? null }] })
    return { collection: 'analysisJobs', id: source.id, sourceId: source.id, value: job, order: 0, version: versions.analysisJobs }
  }

  async tasks(sourceId: string) { return this.repository.readSourceRecords<AnalysisTask>('analysisTasks', sourceId) }
  async job(sourceId: string) { return this.repository.readRecord<AnalysisJob>('analysisJobs', sourceId) }

  async changeJob(record: StoredRecord<AnalysisJob>, status: AnalysisJob['status'], reset: StoredRecord<AnalysisTask>[] = []): Promise<StoredRecord<AnalysisJob>> {
    const value = { ...record.value, status, updatedAt: now() }
    const manifest = await this.repository.readRecord<DocumentManifest>('documentManifests', value.sourceId)
    const sameManifest = manifest?.value.sourceRevision === value.sourceRevision
    const taskRows = sameManifest ? await this.tasks(value.sourceId) : []
    const resetIds = new Set(reset.map((item) => item.id))
    const failed = taskRows.filter((item) => item.value.jobId === value.id && item.value.status === 'failed' && !resetIds.has(item.id)).length
    const hasCompleted = taskRows.some((item) => item.value.jobId === value.id && item.value.status === 'completed')
    const changes = [{ collection: 'analysisJobs', put: [write(record, value)] },
      ...(manifest && sameManifest ? [{ collection: 'documentManifests', put: [write(manifest, { ...manifest.value,
        analysisStatus: status === 'completed' ? 'complete' as const : status === 'stale' ? 'stale' as const : hasCompleted ? 'partial' as const : 'pending' as const,
        failedUnitCount: failed })] }] : []),
      ...(reset.length ? [{ collection: 'analysisTasks', put: reset.map((task) => write(task, { ...task.value, status: 'pending' as const, attempts: task.value.status === 'failed' ? 0 : task.value.attempts, nextAttemptAt: null, errorCode: null })) }] : [])]
    const versions = await this.repository.commit(changes, { recordChecks: [
      { collection: 'analysisJobs', id: record.id, version: record.version },
      ...(status === 'stale' || status === 'paused' || status === 'canceled' ? [] : [{ collection: 'sources', id: value.sourceId, version: value.sourceVersion }]),
      ...reset.map((task) => ({ collection: 'analysisTasks', id: task.id, version: task.version })),
      ...(manifest && sameManifest ? [{ collection: 'documentManifests', id: manifest.id, version: manifest.version }] : []),
    ] })
    return { ...record, value, version: versions.analysisJobs }
  }

  async saveTask(job: StoredRecord<AnalysisJob>, record: StoredRecord<AnalysisTask>, task: AnalysisTask,
    result?: { requirements: Requirement[]; reviewNotes: string[] }): Promise<StoredRecord<AnalysisTask>> {
    const sourceId = job.value.sourceId
    const value = { ...task, updatedAt: now() }
    const intelligence: UnitIntelligence | undefined = result ? { id: task.unitId, sourceId, sourceCreatedAt: job.value.sourceCreatedAt,
      unitId: task.unitId, reuseKey: task.reuseKey, analysisVersion: UNIT_ANALYSIS_VERSION,
      requirementIds: result.requirements.map((item) => item.id), reviewNotes: result.reviewNotes, analyzedAt: now() } : undefined
    const versions = await this.repository.commit([
      { collection: 'analysisTasks', put: [write(record, value)] },
      ...(result && intelligence ? [
        { collection: 'requirements', put: result.requirements.map((item) => ({ id: item.id, sourceId, order: item.evidence.location.startOffset, value: item })) },
        { collection: 'unitIntelligence', put: [{ id: task.unitId, sourceId, order: record.order, value: intelligence }] },
      ] : []),
    ], { recordChecks: [{ collection: 'sources', id: sourceId, version: job.value.sourceVersion },
      { collection: 'analysisJobs', id: job.id, version: job.version }, { collection: 'analysisTasks', id: record.id, version: record.version }] })
    return { ...record, value, version: versions.analysisTasks }
  }
}
