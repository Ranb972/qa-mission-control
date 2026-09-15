import type { QaSource } from '../qa-sources/qaSourceTypes'
import type { TestCase } from '../test-cases/testCaseTypes'
import type { Requirement, UnitIntelligence } from '../document-intelligence/requirementModel'
import { materializeRequirements, isTestableRequirement } from '../document-intelligence/requirementModel'
import { buildDocumentSnapshot } from '../document-intelligence/documentSegmentation'
import { buildCoverageIntelligence } from '../document-intelligence/coverageIntelligence'
import { createRequirementTestLink, testDesignFingerprint } from '../document-intelligence/requirementTraceability'
import { UNIT_ANALYSIS_VERSION } from '../document-intelligence/unitAnalysisContract'
import { PORTABLE_COLLECTIONS, validateWorkspaceBackup, type WorkspaceBackup } from '../../lib/workspace/workspaceBackup'
import { northstarSources, northstarFindings, northstarTests, NORTHSTAR_RELEASE_ID } from './northstarDemo'

const timestamp = '2026-09-01T09:00:00.000Z'

/** The supplied Northstar sources and curated QA history. No provider or generated approval. */
export async function buildDemoWorkspace(): Promise<WorkspaceBackup> {
  const collections = Object.fromEntries(PORTABLE_COLLECTIONS.map(name => [name, []])) as WorkspaceBackup['collections']
  function put<T extends { id: string }>(collection: string, value: T, sourceId?: string, recordId = value.id) {
    collections[collection].push({ id: recordId, order: collections[collection].length, value, ...(sourceId ? { sourceId } : {}) })
  }
  const requirements: Requirement[] = []
  const byCode = new Map<string, Requirement>()
  const sources: QaSource[] = []
  for (const spec of northstarSources) {
    const source: QaSource = { ...spec, sourceType: 'PRD', status: 'Reviewed', notes: 'Entirely synthetic Northstar demonstration material. Curated findings and QA history; no Live AI analysis. Review-required items remain unresolved.', createdAt: timestamp, updatedAt: timestamp }
    sources.push(source); put('sources', source)
    const snapshot = await buildDocumentSnapshot(source)
    const inventory = northstarFindings(source.content)
    const sourceRequirements: Requirement[] = []
    const jobId = `demo-northstar-job-${source.id}`
    for (const unit of snapshot.units) {
      const items = inventory.filter(item => item.offset >= unit.location.startOffset && item.offset + item.quote.length <= unit.location.endOffset)
      const findings = await materializeRequirements(source, snapshot, unit, { version: 1, findings: items.map(item => ({ kind: item.kind, summary: `${item.code} — ${item.title}`, quote: item.quote, occurrence: 0, coverage: item.topic })), limitations: [] }, timestamp)
      for (const item of findings) { put('requirements', item, source.id); byCode.set(item.summary.split(' — ')[0], item) }
      sourceRequirements.push(...findings)
      const intelligence: UnitIntelligence = { id: unit.id, sourceId: source.id, sourceCreatedAt: source.createdAt, unitId: unit.id, reuseKey: unit.reuseKey, analysisVersion: UNIT_ANALYSIS_VERSION, requirementIds: findings.map(item => item.id), reviewNotes: [], analyzedAt: timestamp }
      put('unitIntelligence', intelligence, source.id)
      put('analysisTasks', { id: `${jobId}:${unit.id}`, jobId, unitId: unit.id, reuseKey: unit.reuseKey, status: 'completed', attempts: 0, reused: false, nextAttemptAt: null, errorCode: null, updatedAt: timestamp } as { id: string }, source.id)
    }
    if (sourceRequirements.length !== inventory.length) throw new Error('Northstar evidence inventory did not map completely to source regions.')
    put('analysisJobs', { id: jobId, sourceId: source.id, sourceCreatedAt: source.createdAt, sourceRevision: snapshot.manifest.sourceRevision, sourceVersion: 0, type: 'entire_specification', status: 'completed', taskCount: snapshot.units.length, createdAt: timestamp, updatedAt: timestamp } as { id: string }, source.id, source.id)
    const coverage = await buildCoverageIntelligence(snapshot, sourceRequirements, new Set(snapshot.units.map(unit => unit.id)))
    // This review flag describes a curated unresolved source-set policy; it does not revoke or invent evidence.
    for (const item of coverage.areas) put('requirementCoverageAreas', item.name === 'Marketplace return fallback' ? { ...item, readiness: 'blocked_by_ambiguity' } : item, source.id)
    for (const item of coverage.links) put('requirementCoverageLinks', item, source.id)
    put('sourceCoveragePlans', { id: source.id, sourceId: source.id, sourceRevision: coverage.sourceRevision, requirementSetFingerprint: coverage.requirementSetFingerprint, requirementCount: coverage.testableRequirements, areaCount: coverage.areas.length, createdAt: timestamp, updatedAt: timestamp } as { id: string }, source.id)
    requirements.push(...sourceRequirements)
  }
  const tests: TestCase[] = []
  for (const [index, scenario] of northstarTests.entries()) {
    const requirement = byCode.get(scenario.code)
    if (!requirement) throw new Error(`Missing canonical demo requirement: ${scenario.code}`)
    const test: TestCase = { id: `demo-northstar-test-${index + 1}`, title: `${scenario.code} · ${scenario.title}`, area: requirement.coverageTopic, type: index < 4 ? 'Regression' : 'Functional', priority: index < 4 ? 'High' : 'Medium', status: 'Not Run', qaSourceId: requirement.sourceId, preconditions: 'Synthetic Northstar staging environment with seeded accounts, orders, a controllable clock and payment/event stubs. Curated QA review history; not a real product execution.', steps: scenario.steps, expectedResult: scenario.expected, createdAt: timestamp, updatedAt: timestamp }
    tests.push(test); put('testCases', test)
    put('requirementTestLinks', await createRequirementTestLink(requirement, test, timestamp), requirement.sourceId)
    put('executions', { id: `demo-northstar-run-${index + 1}`, releaseId: NORTHSTAR_RELEASE_ID, testCaseId: test.id, result: scenario.result, notes: scenario.result === 'Not Run' ? 'Awaiting run. No observation is claimed.' : scenario.result === 'Failed' ? 'Synthetic observation: delayed first response plus rapid resubmission persisted two order IDs for one logical identity. See BUG-DEMO-001. Northstar 3.2 remains At Risk; the 3.3 notice proposes an explicit release-blocking gate.' : `Synthetic observation: ${scenario.expected}`, ...(scenario.result === 'Not Run' ? {} : { testDesignFingerprint: await testDesignFingerprint(test), executedAt: timestamp }), createdAt: timestamp, updatedAt: timestamp } as { id: string })
  }
  put('bugs', { id: 'BUG-DEMO-001', title: 'BUG-DEMO-001 — Rapid double submit can create a second order under delayed client response', description: 'Synthetic Northstar defect linked to NCP-CHK-005 and its failed execution. High release-confidence risk for 3.2; NCP-CHG-005 explicitly makes unresolved duplicate-order defects release-blocking for 3.3.', severity: 'High', status: 'Open', testCaseId: tests[1].id, stepsToReproduce: tests[1].steps, expectedBehavior: tests[1].expectedResult, actualBehavior: 'Two commercial orders were persisted for the same logical confirmation identity.', createdAt: timestamp, updatedAt: timestamp } as { id: string })
  put('risks', { id: 'demo-northstar-risk-policy', title: 'Marketplace return fallback needs a version-scoped QA decision', description: 'NCP-REF-003 defines no universal fallback in 3.2. NCP-CHG-001 proposes 45 days in 3.3. Both sources remain evidence; the marketplace-return test and its coverage require review. Unrelated checkout tests retain their links.', impact: 'High', likelihood: 'Medium', status: 'Open', mitigationPlan: 'Confirm release applicability with Product and QA, review both canonical claims, and revise only the affected return-policy test before execution.', createdAt: timestamp, updatedAt: timestamp } as { id: string })
  for (const name of ['Checkout Integrity', 'Payment Safety', 'Release Smoke', 'Recovery & Continuity', 'Security & Audit']) {
    put('testSuites', { id: `demo-northstar-suite-${name.toLowerCase().replaceAll(' ', '-')}`, name, type: name === 'Release Smoke' ? 'Smoke' : 'Regression', description: 'Representative synthetic Northstar scenarios with source-backed QA links.', testCaseIds: tests.filter((_, index) => northstarTests[index].suite === name || name === 'Release Smoke' && [0, 1, 4, 9].includes(index)).map(test => test.id), createdAt: timestamp, updatedAt: timestamp } as { id: string })
  }
  put('releases', { id: NORTHSTAR_RELEASE_ID, name: 'Northstar Commerce', version: '3.2', targetDate: '2026-10-01', status: 'In Testing', notes: 'At Risk: investigate BUG-DEMO-001, run the timeout/recovery scenarios, and clarify marketplace return policy. The 3.3 change notice is comparison context, not automatic approval or a silent policy replacement. Final sign-off belongs to human QA.', createdAt: timestamp, updatedAt: timestamp } as { id: string })
  const members = sources.map(source => ({ sourceId: source.id, sourceCreatedAt: source.createdAt }))
  put('sourceSets', { schemaVersion: 1, id: 'demo-northstar-set', name: 'Northstar 3.2 and proposed 3.3 changes', description: 'Canonical synthetic specifications. Review version scope, return-policy conflict and reservation clarification without choosing a silent winner.', members, createdAt: timestamp, updatedAt: timestamp } as { id: string })
  put('releaseRequirementBaselines', { schemaVersion: 1, id: NORTHSTAR_RELEASE_ID, releaseCreatedAt: timestamp, sourceSetId: 'demo-northstar-set', sourceSetCreatedAt: timestamp, members, requirements: requirements.filter(isTestableRequirement).map(({ id, fingerprint }) => ({ id, fingerprint })), capturedAt: timestamp } as { id: string })
  return validateWorkspaceBackup({ format: 'qa-mission-control-workspace', version: 1, exportedAt: timestamp, collections })
}
