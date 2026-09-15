import { describe, expect, it, vi } from 'vitest'
import type { PreparedAnalysis } from '../../lib/workspace/analysisJobRepository'
import type { StoredRecord } from '../../lib/workspace/workspaceRepository'
import type { QaSource } from '../qa-sources/qaSourceTypes'
import { buildDocumentSnapshot } from './documentSegmentation'
import { createAnalysisPreflight, jobCounts, type AnalysisJob, type AnalysisTask } from './analysisJobModel'
import { runAnalysisJob, type JobStore } from './analysisJobRunner'
import { type Requirement, type UnitIntelligence, materializeRequirements, reuseRequirements } from './requirementModel'
import { UNIT_ANALYSIS_VERSION, unitFailure, type UnitRequest, type UnitResponse } from './unitAnalysisContract'

const source: QaSource = { id: 'source-1', createdAt: '2026-01-01', updatedAt: '2026-01-01', title: 'Commerce', sourceType: 'Requirement', status: 'Draft', notes: '',
  content: '# Receipts\nCustomers must receive receipts.\n# Refunds\nRefunds must complete in 14 days.\n# Security\nSessions must expire after 30 minutes.' }
function response(request: UnitRequest): UnitResponse {
  return { ok: true, analysis: { version: 1, findings: [{ kind: 'requirement', summary: 'Review specified behavior', quote: request.text.slice(0, 80), occurrence: 0, coverage: 'Commerce' }], limitations: [] } }
}
class MemoryJobs implements JobStore {
  current: StoredRecord<AnalysisJob>
  rows: StoredRecord<AnalysisTask>[]
  sourceVersion = 1
  requirements: Requirement[] = []
  intelligence: UnitIntelligence[] = []
  failStorage = false
  constructor(prepared: PreparedAnalysis) {
    this.current = { collection: 'analysisJobs', id: source.id, sourceId: source.id, order: 0, version: 1,
      value: { id: 'job-1', sourceId: source.id, sourceCreatedAt: source.createdAt, sourceRevision: prepared.snapshot.manifest.sourceRevision, sourceVersion: 1, type: 'entire_specification', status: 'prepared', taskCount: prepared.snapshot.units.length, createdAt: source.createdAt, updatedAt: source.updatedAt } }
    this.rows = prepared.snapshot.units.map((unit, order) => ({ collection: 'analysisTasks', id: `task-${order}`, order, sourceId: source.id, version: 1,
      value: { id: `task-${order}`, jobId: 'job-1', unitId: unit.id, reuseKey: unit.reuseKey, status: 'pending', attempts: 0, reused: false, errorCode: null, nextAttemptAt: null, updatedAt: source.updatedAt } }))
  }
  async job() { return structuredClone(this.current) }
  async tasks() { return structuredClone(this.rows) }
  async changeJob(record: StoredRecord<AnalysisJob>, status: AnalysisJob['status'], reset: StoredRecord<AnalysisTask>[] = []) {
    if (record.version !== this.current.version) throw new Error('conflict')
    this.current = { ...this.current, version: this.current.version + 1, value: { ...this.current.value, status } }
    for (const item of reset) {
      const row = this.rows.find((task) => task.id === item.id)!
      row.value = { ...row.value, status: 'pending', attempts: row.value.status === 'failed' ? 0 : row.value.attempts, errorCode: null, nextAttemptAt: null }
      row.version += 1
    }
    return structuredClone(this.current)
  }
  async saveTask(job: StoredRecord<AnalysisJob>, record: StoredRecord<AnalysisTask>, value: AnalysisTask, result?: { requirements: Requirement[]; reviewNotes: string[] }) {
    const index = this.rows.findIndex((item) => item.id === record.id)
    if (this.failStorage || job.version !== this.current.version || job.value.sourceVersion !== this.sourceVersion || record.version !== this.rows[index].version) throw new Error('atomic rejection')
    this.rows[index] = { ...record, value, version: record.version + 1 }
    if (result) {
      this.requirements.push(...result.requirements)
      this.intelligence.push({ id: value.unitId, sourceId: source.id, sourceCreatedAt: source.createdAt, unitId: value.unitId, reuseKey: value.reuseKey, analysisVersion: UNIT_ANALYSIS_VERSION, requirementIds: result.requirements.map((item) => item.id), reviewNotes: result.reviewNotes, analyzedAt: source.updatedAt })
    }
    return structuredClone(this.rows[index])
  }
}
async function setup(content = source.content) {
  const current = { ...source, content }
  const snapshot = await buildDocumentSnapshot(current)
  const prepared: PreparedAnalysis = { source: current, sourceVersion: 1, snapshot, preflight: createAnalysisPreflight(snapshot, [], []), job: null, tasks: [], requirements: [] }
  return { prepared, store: new MemoryJobs(prepared), signal: new AbortController().signal }
}
describe('resumable bounded analysis scheduler', () => {
  it('does zero provider work for preflight, limits concurrency to two, and saves only normalized requirements', async () => {
    const setupResult = await setup()
    let active = 0
    let peak = 0
    const analyze = vi.fn(async (request: UnitRequest) => {
      active += 1; peak = Math.max(peak, active)
      await Promise.resolve()
      active -= 1
      return response(request)
    })
    expect(analyze).not.toHaveBeenCalled()
    expect(setupResult.prepared.preflight.providerTasks).toBe(3)
    await runAnalysisJob({ ...setupResult, analyze })
    expect(peak).toBe(2)
    expect(analyze).toHaveBeenCalledTimes(3)
    expect(setupResult.store.current.value.status).toBe('completed')
    expect(setupResult.store.requirements).toHaveLength(3)
    expect(setupResult.store.requirements.every((item) => item.id.startsWith('req-'))).toBe(true)
    expect(JSON.stringify(setupResult.store.rows)).not.toContain('Customers must')
  })
  it('retries 429/timeout with bounded exponential delays and stops an outage before untouched tasks', async () => {
    const setupResult = await setup()
    const wait = vi.fn().mockResolvedValue(undefined)
    const analyze = vi.fn().mockResolvedValue(unitFailure('rate_limited'))
    await runAnalysisJob({ ...setupResult, analyze, wait })
    expect(analyze).toHaveBeenCalledTimes(6)
    expect(wait.mock.calls.map((call) => call[0]).sort()).toEqual([2000, 2000, 4000, 4000])
    expect(setupResult.store.rows.filter((row) => row.value.status === 'pending')).toHaveLength(1)
    expect(setupResult.store.current.value.status).toBe('paused')
  })
  it('never automatically retries malformed output or configuration failures', async () => {
    for (const code of ['invalid_response', 'configuration'] as const) {
      const setupResult = await setup()
      const analyze = vi.fn().mockResolvedValue(unitFailure(code))
      await runAnalysisJob({ ...setupResult, analyze })
      expect(analyze).toHaveBeenCalledTimes(code === 'configuration' ? 2 : 3)
      expect(Math.max(...setupResult.store.rows.map((row) => row.value.attempts))).toBe(1)
    }
  })
  it('reload recovery only resumes incomplete tasks and never replays a saved result', async () => {
    const setupResult = await setup()
    const first = setupResult.store.rows[0]
    first.value.status = 'completed'
    setupResult.store.rows[1].value.status = 'running'
    setupResult.store.rows[1].value.attempts = 1
    setupResult.store.current.value.status = 'running'
    const analyze = vi.fn(async (request: UnitRequest) => response(request))
    await runAnalysisJob({ ...setupResult, analyze })
    expect(analyze).toHaveBeenCalledTimes(2)
    expect(setupResult.store.rows[1].value.attempts).toBe(2)
    expect(setupResult.store.current.value.status).toBe('completed')
  })
  it('retries failed only on explicit command and preserves successful units', async () => {
    const setupResult = await setup()
    setupResult.store.rows[0].value.status = 'completed'
    setupResult.store.rows[1].value.status = 'failed'
    setupResult.store.rows[1].value.errorCode = 'invalid_response'
    setupResult.store.rows[1].value.attempts = 3
    setupResult.store.rows[2].value.status = 'needs_visual_review'
    const analyze = vi.fn(async (request: UnitRequest) => response(request))
    await runAnalysisJob({ ...setupResult, mode: 'retry_failed', analyze })
    expect(analyze).toHaveBeenCalledTimes(1)
    expect(setupResult.store.current.value.status).toBe('partial')
  })
  it('drops late canceled results and restores paused tasks for explicit resume', async () => {
    const setupResult = await setup()
    const controller = new AbortController()
    const analyze = vi.fn(async (request: UnitRequest) => { controller.abort(); return response(request) })
    await runAnalysisJob({ ...setupResult, signal: controller.signal, analyze })
    expect(setupResult.store.requirements).toHaveLength(0)
    expect(setupResult.store.current.value.status).toBe('paused')
    await runAnalysisJob({ ...setupResult, analyze: async (request) => response(request) })
    expect(setupResult.store.current.value.status).toBe('completed')
  })
  it('rejects late source edits and preserves prior results on storage failure', async () => {
    for (const failStorage of [true, false]) {
      const setupResult = await setup()
      setupResult.store.rows[0].value.status = 'completed'
      const analyze = vi.fn(async (request: UnitRequest) => {
        if (failStorage) setupResult.store.failStorage = true
        else setupResult.store.sourceVersion = 2
        return response(request)
      })
      await expect(runAnalysisJob({ ...setupResult, analyze })).rejects.toThrow('Completed work is preserved')
      expect(setupResult.store.requirements).toHaveLength(0)
      expect(setupResult.store.rows[0].value.status).toBe('completed')
    }
  })
  it('does not call complete text interpretation full success when the provider reports limitations', async () => {
    const setupResult = await setup()
    await runAnalysisJob({ ...setupResult, analyze: async () => ({ ok: true, analysis: { version: 1, findings: [], limitations: ['Diagram needs review'] } }) })
    expect(jobCounts(setupResult.store.rows.map((item) => item.value)).needs_visual_review).toBe(3)
    expect(setupResult.store.current.value.status).toBe('partial')
  })
  it('reuses exact distant units after an edit and safely rebases evidence, including duplicate occurrences', async () => {
    const setupResult = await setup()
    await runAnalysisJob({ ...setupResult, analyze: async (request) => response(request) })
    const edited = { ...source, updatedAt: '2026-01-02', content: source.content.replace('14 days', '30 business days') }
    const snapshot = await buildDocumentSnapshot(edited)
    const preflight = createAnalysisPreflight(snapshot, setupResult.store.intelligence, setupResult.store.requirements)
    expect(preflight.reusedTasks).toBe(2)
    expect(preflight.providerTasks).toBe(1)
    const last = snapshot.units[2]
    const cached = preflight.reuse.get(last.id)!
    const rebased = await reuseRequirements(edited, snapshot, last, cached.requirements)
    expect(rebased![0].id).toBe(cached.requirements[0].id)
    expect(rebased![0].evidence.location.startOffset).toBe(last.location.startOffset)
    expect(rebased![0].evidence.location.startOffset).not.toBe(cached.requirements[0].evidence.location.startOffset)
    const repeated = await setup('# Repeated\nMust comply. Must comply.')
    const result = await materializeRequirements(repeated.prepared.source, repeated.prepared.snapshot, repeated.prepared.snapshot.units[0],
      { version: 1, findings: [{ kind: 'constraint', summary: 'Comply', quote: 'Must comply.', occurrence: 1, coverage: 'Compliance' }], limitations: [] }, source.createdAt)
    expect(result[0].evidence.location.startOffset).toBe(repeated.prepared.source.content.lastIndexOf('Must comply.'))
  })
  it('accounts for 1000 sections without prefix clipping, then reuses all leaves locally', async () => {
    const content = Array.from({ length: 1000 }, (_, index) => `# Domain ${index + 1}\nREQ-${index + 1}: The platform must retain the corresponding audit record.\n`).join('')
    const setupResult = await setup(content)
    const analyze = vi.fn(async (request: UnitRequest) => { expect(request.text.length).toBeLessThanOrEqual(6000); return response(request) })
    await runAnalysisJob({ ...setupResult, analyze })
    expect(analyze).toHaveBeenCalledTimes(1000)
    expect(analyze.mock.calls.at(-1)![0].text).toContain('REQ-1000')
    const preflight = createAnalysisPreflight(setupResult.prepared.snapshot, setupResult.store.intelligence, setupResult.store.requirements)
    expect(preflight.providerTasks).toBe(0)
    expect(preflight.reusedTasks).toBe(1000)
  }, 30_000)
})
