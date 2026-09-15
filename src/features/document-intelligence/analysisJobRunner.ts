import type { AnalysisJobRepository, PreparedAnalysis } from '../../lib/workspace/analysisJobRepository'
import type { StoredRecord } from '../../lib/workspace/workspaceRepository'
import { JOB_CONCURRENCY, JOB_MAX_ATTEMPTS, retryDelay, type AnalysisJob, type AnalysisTask } from './analysisJobModel'
import { materializeRequirements } from './requirementModel'
import { analyzeDocumentUnit } from './unitAnalysisClient'
import { parseUnitRequest, parseUnitResponse, unitFailure, type UnitRequest, type UnitResponse } from './unitAnalysisContract'

export type JobStore = Pick<AnalysisJobRepository, 'tasks' | 'job' | 'changeJob' | 'saveTask'>
type RunnerOptions = {
  prepared: PreparedAnalysis
  store: JobStore
  signal: AbortSignal
  mode?: 'resume' | 'retry_failed'
  analyze?: (request: UnitRequest, signal: AbortSignal) => Promise<UnitResponse>
  onChange?: () => void
  wait?: (milliseconds: number, signal: AbortSignal) => Promise<void>
}
function abortableWait(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const finish = () => { clearTimeout(timer); signal.removeEventListener('abort', finish); resolve() }
    const timer = setTimeout(finish, milliseconds)
    signal.addEventListener('abort', finish, { once: true })
    if (signal.aborted) finish()
  })
}
/** Browser lock is released on tab close/reload. A second tab cannot start duplicate provider operations. */
export async function withAnalysisLock<T>(sourceId: string, work: () => Promise<T>): Promise<T> {
  if (!navigator.locks) throw new Error('This browser cannot safely coordinate analysis jobs. Use a current Chromium, Firefox, or Safari browser.')
  return navigator.locks.request(`qa-analysis:${sourceId}`, { ifAvailable: true }, (lock) => {
    if (!lock) throw new Error('Analysis is already active in another tab. Pause it there or close that tab before resuming here.')
    return work()
  })
}

/** Persists every attempt and validated result. No raw request/response or transient Test Case approval is saved. */
export async function runAnalysisJob({ prepared, store, signal, mode = 'resume', analyze = analyzeDocumentUnit, onChange = () => undefined, wait = abortableWait }: RunnerOptions) {
  let job = await store.job(prepared.source.id)
  if (!job || job.value.sourceRevision !== prepared.snapshot.manifest.sourceRevision || job.value.sourceVersion !== prepared.sourceVersion) throw new Error('The source changed. Prepare analysis for the current revision.')
  if (signal.aborted) return
  let tasks = (await store.tasks(prepared.source.id)).filter((task) => task.value.jobId === job!.value.id)
  const reset = tasks.filter((task) => ['running', 'retrying'].includes(task.value.status) ||
    (mode === 'retry_failed' && task.value.status === 'failed' && task.value.errorCode !== null))
  job = await store.changeJob(job, 'running', reset)
  tasks = (await store.tasks(prepared.source.id)).filter((task) => task.value.jobId === job!.value.id)
  const queue = tasks.filter((task) => task.value.status === 'pending')
  const units = new Map(prepared.snapshot.units.map((unit) => [unit.id, unit]))
  const sections = new Map(prepared.snapshot.sections.map((section) => [section.id, section]))
  const activeJob: StoredRecord<AnalysisJob> = job
  let next = 0
  let stopped = false
  let fatal: unknown = null
  onChange()

  const worker = async () => {
    while (!stopped && !signal.aborted && next < queue.length) {
      let record: StoredRecord<AnalysisTask> = queue[next++]
      const unit = units.get(record.value.unitId)
      if (!unit || unit.reuseKey !== record.value.reuseKey) throw new Error('Analysis scope changed. Prepare this source again.')
      const request = parseUnitRequest({ version: 1, text: prepared.source.content.slice(unit.location.startOffset, unit.location.endOffset),
        heading: (sections.get(unit.sectionId)?.path ?? []).slice(-12).map((heading) => heading.slice(0, 300)) })
      if (!request) throw new Error('This source region could not be safely bounded. No partial text was sent.')
      while (!stopped && !signal.aborted) {
        if (record.value.attempts >= JOB_MAX_ATTEMPTS) {
          await store.saveTask(activeJob, record, { ...record.value, status: 'failed', errorCode: 'timeout', nextAttemptAt: null })
          break
        }
        record = await store.saveTask(activeJob, record, { ...record.value, status: 'running', attempts: record.value.attempts + 1, nextAttemptAt: null })
        onChange()
        let response: UnitResponse
        try { response = parseUnitResponse(await analyze(request, signal), request.text) }
        catch { response = unitFailure('temporary') }
        if (stopped || signal.aborted) break
        if (response.ok) {
          const requirements = await materializeRequirements(prepared.source, prepared.snapshot, unit, response.analysis, new Date().toISOString())
          if (stopped || signal.aborted) break
          await store.saveTask(activeJob, record, { ...record.value,
            status: response.analysis.limitations.length ? 'needs_visual_review' : 'completed', errorCode: null, nextAttemptAt: null },
          { requirements, reviewNotes: response.analysis.limitations })
          onChange()
          break
        }
        const retry = response.error.retryable && record.value.attempts < JOB_MAX_ATTEMPTS
        const delay = retryDelay(record.value.attempts)
        record = await store.saveTask(activeJob, record, { ...record.value, status: retry ? 'retrying' : 'failed',
          errorCode: response.error.code, nextAttemptAt: retry ? Date.now() + delay : null })
        onChange()
        if (!retry) {
          // Stop a document-wide outage from consuming attempts on hundreds of untouched regions.
          if (response.error.code === 'configuration' || response.error.retryable) stopped = true
          break
        }
        await wait(delay, signal)
      }
    }
  }
  await Promise.all(Array.from({ length: JOB_CONCURRENCY }, async () => {
    try { await worker() }
    catch (error) { stopped = true; fatal = error }
  }))
  const latest = await store.job(prepared.source.id)
  // Pause/cancel/new-job commands invalidate the version that authorized this run.
  if (!latest || latest.version !== activeJob.version) return
  if (fatal) {
    await store.changeJob(latest, 'paused')
    onChange()
    throw new Error('Analysis paused because the source or saved job changed, or storage could not commit. Completed work is preserved. Refresh its scope before resuming.')
  }
  if (signal.aborted) { await store.changeJob(latest, 'paused'); onChange(); return }
  const finalTasks = (await store.tasks(prepared.source.id)).filter((task) => task.value.jobId === activeJob.value.id)
  const status = stopped && finalTasks.some((task) => ['pending', 'running', 'retrying'].includes(task.value.status)) ? 'paused' :
    finalTasks.every((task) => ['completed', 'excluded'].includes(task.value.status)) &&
      !prepared.snapshot.blocks.some((block) => block.kind === 'visual' && !['current', 'excluded'].includes(block.status)) ? 'completed' : 'partial'
  await store.changeJob(latest, status)
  onChange()
}
