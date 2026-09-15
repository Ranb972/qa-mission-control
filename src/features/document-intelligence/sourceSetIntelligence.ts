import type { WorkspaceClient } from '../../lib/workspace/workspaceClient'
import { AnalysisJobRepository } from '../../lib/workspace/analysisJobRepository'
import { loadSourceTraceability } from '../../lib/workspace/traceabilityRepository'
import { documentAccounting } from './documentAccounting'
import { groupRequirementRelations, type RequirementCoverageArea, type RequirementCoverageLink, type RequirementRelationGroup } from './coverageIntelligence'
import { buildRequirementTraceability, type RequirementTestLink, type RequirementTraceability } from './requirementTraceability'
import { sourceSetMembers, type SourceSet } from './sourceSetModel'
import type { Requirement } from './requirementModel'
import type { AccountingStatus } from './documentTypes'
import type { CommitOptions } from '../../lib/workspace/workspaceRepository'

export type SourceSetReview = {
  set: SourceSet
  sources: Array<{ id: string; title: string; current: number; total: number; findings: number; visual: number; failed: number; missing: boolean }>
  requirements: Requirement[]
  relations: RequirementRelationGroup[]
  traceability: RequirementTraceability
  guards: CommitOptions
}
/** Only explicit members are joined, and only exact current leaf evidence is included. No provider calls. */
export async function reviewSourceSet(workspace: WorkspaceClient, set: SourceSet, signal?: AbortSignal, releaseId?: string): Promise<SourceSetReview> {
  const initialVersions = await Promise.all(['requirements', 'unitIntelligence'].map((name) => workspace.repository.readMetadata<number>(`collection:${name}`)))
  const sourceVersions: Array<{ id: string; version: number | null }> = []
  const sources: SourceSetReview['sources'] = []
  const requirements: Requirement[] = []
  const coverageAreas: RequirementCoverageArea[] = []
  const coverageLinks: RequirementCoverageLink[] = []
  const testLinks: RequirementTestLink[] = []
  const store = new AnalysisJobRepository(workspace.repository)
  for (const { member, source } of sourceSetMembers(set, workspace.get('sources').items)) {
    if (signal?.aborted) throw new Error('Source-set review closed.')
    if (!source) {
      const savedSource = await workspace.repository.readRecord('sources', member.sourceId)
      sourceVersions.push({ id: member.sourceId, version: savedSource?.version ?? null })
      sources.push({ id: member.sourceId, title: 'Removed or replaced source', current: 0, total: 0, findings: 0, visual: 0, failed: 0, missing: true }); continue
    }
    const prepared = await store.prepare(source.id)
    sourceVersions.push({ id: source.id, version: prepared.sourceVersion })
    if (prepared.source.createdAt !== member.sourceCreatedAt) throw new Error('Source membership changed. Reopen the set to review its current members.')
    const states = new Map<string, AccountingStatus>()
    for (const [id, cached] of prepared.preflight.reuse) states.set(id, cached.intelligence.reviewNotes.length ? 'needs_visual_review' : 'current')
    if (prepared.job?.value.sourceRevision === prepared.snapshot.manifest.sourceRevision) for (const task of prepared.tasks) {
      if (task.value.jobId === prepared.job.value.id && task.value.status === 'failed') states.set(task.value.unitId, 'failed')
    }
    const accounting = documentAccounting(prepared.snapshot, states)
    sources.push({ id: source.id, title: prepared.source.title, current: accounting.units.current, total: accounting.units.total, findings: prepared.currentRequirements?.length ?? 0, visual: accounting.blocks.needs_visual_review, failed: accounting.units.failed, missing: false })
    requirements.push(...prepared.currentRequirements ?? [])
    const trace = await loadSourceTraceability(workspace.repository, source.id)
    coverageAreas.push(...trace.areas); coverageLinks.push(...trace.coverageLinks); testLinks.push(...trace.testLinks)
  }
  if (signal?.aborted) throw new Error('Source-set review closed.')
  const byId = new Map(requirements.map((item) => [item.id, item]))
  const relations = groupRequirementRelations(requirements).filter((group) => new Set(group.requirementIds.map((id) => byId.get(id)!.sourceId)).size > 1)
  const traceability = await buildRequirementTraceability({ requirements, coverageAreas, coverageLinks, testLinks, testCases: workspace.get('testCases').items,
    executions: workspace.get('executions').items, bugs: workspace.get('bugs').items, suites: workspace.get('testSuites').items, releaseId })
  const conflictIds = new Set(relations.filter((group) => group.kind === 'potential_conflict').flatMap((group) => group.requirementIds))
  for (const row of traceability.rows) if (conflictIds.has(row.requirement.id) && !row.gaps.includes('unresolved_ambiguity')) row.gaps.push('unresolved_ambiguity')
  const finalVersions = await Promise.all(['requirements', 'unitIntelligence'].map((name) => workspace.repository.readMetadata<number>(`collection:${name}`)))
  const stableSources = await Promise.all(sourceVersions.map(async ({ id, version }) => ((await workspace.repository.readMetadata<{ version: number | null }>(`record:${JSON.stringify(['sources', id])}`))?.version ?? null) === version))
  const currentSet = await workspace.repository.readRecord<SourceSet>('sourceSets', set.id)
  if (signal?.aborted || initialVersions.some((version, index) => version !== finalVersions[index]) || stableSources.some((stable) => !stable) || JSON.stringify(currentSet?.value) !== JSON.stringify(set)) throw new Error('Source-set evidence changed during review. Refresh the set after active analysis or editing finishes.')
  return { set, sources, requirements, relations, traceability, guards: {
    recordChecks: [{ collection: 'sourceSets', id: set.id, version: currentSet!.version }, ...sourceVersions.map(({ id, version }) => ({ collection: 'sources', id, version }))],
    collectionChecks: ['requirements', 'unitIntelligence'].map((collection, index) => ({ collection, version: finalVersions[index] ?? 0 })),
  } }
}
