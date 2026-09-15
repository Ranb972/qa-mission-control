import type { TestCase } from '../../features/test-cases/testCaseTypes'
import type { Requirement } from '../../features/document-intelligence/requirementModel'
import { buildCoverageIntelligence, type RequirementCoverageArea, type RequirementCoverageLink } from '../../features/document-intelligence/coverageIntelligence'
import { createRequirementTestLink, testDesignFingerprint, type RequirementTestLink } from '../../features/document-intelligence/requirementTraceability'
import type { PreparedAnalysis } from './analysisJobRepository'
import type { StoredRecord, WorkspaceRepository } from './workspaceRepository'
import { requirementSourceSetContext } from './requirementSourceSetContext'

export type SourceCoveragePlan = { id: string; sourceId: string; sourceRevision: string; requirementSetFingerprint: string; requirementCount: number; areaCount: number; createdAt: string; updatedAt: string }
export type SourceTraceability = { plan: StoredRecord<SourceCoveragePlan> | null; areas: RequirementCoverageArea[]; coverageLinks: RequirementCoverageLink[]; testLinks: RequirementTestLink[] }

export async function loadSourceTraceability(repository: WorkspaceRepository, sourceId: string): Promise<SourceTraceability> {
  const bundle = await repository.readSourceBundle(['sourceCoveragePlans', 'requirementCoverageAreas', 'requirementCoverageLinks', 'requirementTestLinks'], sourceId)
  return { plan: (bundle.sourceCoveragePlans[0] as StoredRecord<SourceCoveragePlan>) ?? null,
    areas: bundle.requirementCoverageAreas.map((record) => record.value as RequirementCoverageArea),
    coverageLinks: bundle.requirementCoverageLinks.map((record) => record.value as RequirementCoverageLink), testLinks: bundle.requirementTestLinks.map((record) => record.value as RequirementTestLink) }
}

/** Explicit save/replace only. Existing legacy section-merge plans and historical impact links are preserved. */
export async function saveSourceCoveragePlan(repository: WorkspaceRepository, prepared: PreparedAnalysis, previous: SourceTraceability) {
  if (prepared.requirementVersion === undefined || prepared.intelligenceVersion === undefined) throw new Error('Refresh requirements before saving coverage.')
  const candidate = await buildCoverageIntelligence(prepared.snapshot, prepared.currentRequirements ?? [], new Set(prepared.preflight.reuse.keys()))
  if (!candidate.testableRequirements) throw new Error('Analyze and review source requirements before saving a coverage plan.')
  const timestamp = new Date().toISOString()
  const sourceId = prepared.source.id
  const plan: SourceCoveragePlan = { id: sourceId, sourceId, sourceRevision: candidate.sourceRevision, requirementSetFingerprint: candidate.requirementSetFingerprint,
    requirementCount: candidate.testableRequirements, areaCount: candidate.areas.length, createdAt: previous.plan?.value.createdAt ?? timestamp, updatedAt: timestamp }
  const currentLinks = new Map(candidate.links.map((link) => [link.id, link]))
  for (const link of previous.coverageLinks) if (!currentLinks.has(link.id)) currentLinks.set(link.id, { ...link, active: false })
  await repository.commit([
    { collection: 'sourceCoveragePlans', put: [{ id: sourceId, sourceId, order: 0, value: plan }] },
    { collection: 'requirementCoverageAreas', put: candidate.areas.map((value, order) => ({ id: value.id, sourceId, order, value })) },
    { collection: 'requirementCoverageLinks', put: [...currentLinks.values()].map((value, order) => ({ id: value.id, sourceId, order, value })) },
  ], { recordChecks: [{ collection: 'sources', id: sourceId, version: prepared.sourceVersion },
    { collection: 'sourceCoveragePlans', id: sourceId, version: previous.plan?.version ?? null }],
  collectionChecks: [{ collection: 'requirements', version: prepared.requirementVersion }, { collection: 'unitIntelligence', version: prepared.intelligenceVersion }] })
}

/** QA confirms the exact displayed requirement and test design; neither endpoint nor AI may create this authority. */
export async function confirmRequirementTests(repository: WorkspaceRepository, prepared: PreparedAnalysis, requirement: Requirement, selectedTests: TestCase[]) {
  const current = prepared.currentRequirements?.find((item) => item.id === requirement.id && item.fingerprint === requirement.fingerprint)
  if (!current || !selectedTests.length || selectedTests.length > 100 || prepared.requirementVersion === undefined || prepared.intelligenceVersion === undefined) throw new Error('Select 1–100 reviewed tests for a current requirement.')
  const savedRequirement = await repository.readRecord<Requirement>('requirements', requirement.id)
  if (!savedRequirement || savedRequirement.value.fingerprint !== current.fingerprint) throw new Error('Requirement evidence changed. Refresh before confirming traceability.')
  const related = await requirementSourceSetContext(repository, prepared, current)
  if (related.blocker) throw new Error(related.blocker)
  const tests = await Promise.all(selectedTests.map(async (test) => {
    const saved = await repository.readRecord<TestCase>('testCases', test.id)
    if (!saved || await testDesignFingerprint(saved.value) !== await testDesignFingerprint(test)) throw new Error('A selected Test Case changed. Review its current design before linking.')
    return saved
  }))
  const links = await Promise.all(tests.map((test) => createRequirementTestLink(current, test.value, new Date().toISOString())))
  await repository.commit([{ collection: 'requirementTestLinks', put: links.map((value, order) => ({ id: value.id, sourceId: value.sourceId, order, value })) }],
    { recordChecks: [...related.recordChecks,
      { collection: 'requirements', id: current.id, version: savedRequirement.version },
      ...tests.map((test) => ({ collection: 'testCases', id: test.id, version: test.version }))],
    collectionChecks: [{ collection: 'requirements', version: prepared.requirementVersion }, { collection: 'unitIntelligence', version: prepared.intelligenceVersion }, related.collectionCheck] })
}

export async function removeRequirementTestLink(repository: WorkspaceRepository, sourceId: string, requirementId: string, testCaseId: string) {
  const id = `trace:${requirementId}:${testCaseId}`
  const record = await repository.readRecord<RequirementTestLink>('requirementTestLinks', id)
  if (!record || record.value.sourceId !== sourceId || record.value.requirementId !== requirementId || record.value.testCaseId !== testCaseId) throw new Error('This traceability link changed. Refresh the saved state before removing it.')
  await repository.commit([{ collection: 'requirementTestLinks', remove: [id] }], { recordChecks: [{ collection: 'requirementTestLinks', id, version: record.version }] })
}
