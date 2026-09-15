import { groupRequirementRelations } from '../../features/document-intelligence/coverageIntelligence'
import type { Requirement } from '../../features/document-intelligence/requirementModel'
import { AnalysisJobRepository, type PreparedAnalysis } from './analysisJobRepository'
import { loadSourceSets } from './sourceSetRepository'
import type { CommitOptions, WorkspaceRepository } from './workspaceRepository'

/** Saved source sets are explicit context, not permission to choose one side of an unresolved policy. */
export async function requirementSourceSetContext(repository: WorkspaceRepository, prepared: PreparedAnalysis, requirement: Requirement) {
  const sets = await loadSourceSets(repository)
  const related = sets.records.filter((record) => record.value.members.some((member) => member.sourceId === requirement.sourceId && member.sourceCreatedAt === requirement.sourceCreatedAt))
  const members = new Map(related.flatMap((record) => record.value.members).filter((member) => member.sourceId !== requirement.sourceId).map((member) => [JSON.stringify([member.sourceId, member.sourceCreatedAt]), member]))
  const recordChecks: NonNullable<CommitOptions['recordChecks']> = []
  const findings: Requirement[] = [requirement]
  const store = new AnalysisJobRepository(repository)
  for (const member of members.values()) {
    const source = await repository.readRecord('sources', member.sourceId)
    if (!source || (source.value as { createdAt: string }).createdAt !== member.sourceCreatedAt) {
      recordChecks.push({ collection: 'sources', id: member.sourceId, version: source?.version ?? null })
      continue
    }
    const context = await store.prepare(member.sourceId)
    if (context.source.createdAt !== member.sourceCreatedAt) throw new Error('Related source context changed. Reopen requirement review before continuing.')
    recordChecks.push({ collection: 'sources', id: member.sourceId, version: context.sourceVersion })
    findings.push(...context.currentRequirements ?? [])
  }
  const conflicted = groupRequirementRelations(findings).some((group) => group.kind === 'potential_conflict' && group.requirementIds.includes(requirement.id))
  const topic = requirement.coverageTopic.trim().normalize('NFC').toLocaleLowerCase()
  const ambiguous = !!topic && findings.some((item) => item.kind === 'ambiguity' && item.coverageTopic.trim().normalize('NFC').toLocaleLowerCase() === topic)
  return { blocker: conflicted || ambiguous ? 'Related source-set evidence requires clarification. Review both canonical sources in Source sets before generating or approving executable tests.' : null,
    recordChecks: [{ collection: 'sources', id: prepared.source.id, version: prepared.sourceVersion }, ...recordChecks], collectionCheck: { collection: 'sourceSets', version: sets.version } }
}
