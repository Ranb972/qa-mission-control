import type { QaSource } from '../../features/qa-sources/qaSourceTypes'
import { groupRequirementRelations } from '../../features/document-intelligence/coverageIntelligence'
import type { Requirement } from '../../features/document-intelligence/requirementModel'
import { AnalysisJobRepository } from './analysisJobRepository'
import { loadSourceSets } from './sourceSetRepository'
import { CONFLICT_ERROR, type CommitOptions, type WorkspaceRepository } from './workspaceRepository'

export const SOURCE_SUGGESTION_BLOCKER = 'Known requirement ambiguity or related-source conflict needs clarification. Review Requirements and Source sets, or use an unaffected requirement’s focused draft action. Broad source/area drafting and import cannot choose one side.'

/** Legacy broad scopes lack a canonical requirement mapping. Never infer that a
 * selected area avoids a known conflict; the focused requirement path can do so. */
export async function sourceSuggestionGuard(repository: WorkspaceRepository, selected: QaSource): Promise<CommitOptions> {
  const source = await repository.readRecord<QaSource>('sources', selected.id)
  if (!source || source.value.createdAt !== selected.createdAt || source.value.updatedAt !== selected.updatedAt || source.value.content !== selected.content || source.value.title !== selected.title || source.value.sourceType !== selected.sourceType) throw new Error(CONFLICT_ERROR)
  const versions = await Promise.all(['requirements', 'unitIntelligence'].map(async (collection) => ({ collection, version: await repository.readMetadata<number>(`collection:${collection}`) ?? 0 })))
  const sets = await loadSourceSets(repository)
  const members = new Map(sets.records.filter(({ value }) => value.members.some((member) => member.sourceId === selected.id && member.sourceCreatedAt === selected.createdAt)).flatMap(({ value }) => value.members).map((member) => [member.sourceId, member]))
  members.set(selected.id, { sourceId: selected.id, sourceCreatedAt: selected.createdAt })
  const checks: NonNullable<CommitOptions['recordChecks']> = []
  const findings: Requirement[] = []
  const store = new AnalysisJobRepository(repository)
  for (const member of members.values()) {
    const record = member.sourceId === source.id ? source : await repository.readRecord<QaSource>('sources', member.sourceId)
    checks.push({ collection: 'sources', id: member.sourceId, version: record?.version ?? null })
    if (!record || record.value.createdAt !== member.sourceCreatedAt) continue
    const stored = await repository.readSourceRecords('requirements', member.sourceId)
    if (!stored.length) continue
    const prepared = await store.prepare(member.sourceId)
    if (prepared.sourceVersion !== record.version) throw new Error(CONFLICT_ERROR)
    findings.push(...prepared.currentRequirements ?? [])
  }
  const own = new Set(findings.filter((item) => item.sourceId === selected.id).map((item) => item.id))
  const topics = new Set(findings.filter((item) => own.has(item.id)).map((item) => item.coverageTopic.trim().normalize('NFC').toLocaleLowerCase()).filter(Boolean))
  if (findings.some((item) => item.kind === 'ambiguity' && (own.has(item.id) || topics.has(item.coverageTopic.trim().normalize('NFC').toLocaleLowerCase()))) || groupRequirementRelations(findings).some((group) => group.kind === 'potential_conflict' && group.requirementIds.some((id) => own.has(id)))) throw new Error(SOURCE_SUGGESTION_BLOCKER)
  const collectionChecks = [...versions, { collection: 'sourceSets', version: sets.version }]
  // Generation uses this read-only check; import repeats it inside its atomic write.
  for (const check of collectionChecks) if ((await repository.readMetadata<number>(`collection:${check.collection}`) ?? 0) !== check.version) throw new Error(CONFLICT_ERROR)
  for (const check of checks) if ((await repository.readRecord(check.collection, check.id))?.version !== (check.version ?? undefined)) throw new Error(CONFLICT_ERROR)
  return { recordChecks: checks, collectionChecks }
}
