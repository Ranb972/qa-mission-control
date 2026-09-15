import type { TestCase } from '../test-cases/testCaseTypes'
import type { Execution } from '../executions/executionTypes'
import type { Bug } from '../bugs/bugTypes'
import type { TestSuite } from '../test-suites/testSuiteTypes'
import { fingerprint } from './documentFingerprint'
import { isTestableRequirement, type Requirement } from './requirementModel'
import type { RequirementCoverageArea, RequirementCoverageLink } from './coverageIntelligence'

export type RequirementTestLink = {
  id: string
  sourceId: string
  requirementId: string
  requirementFingerprint: string
  testCaseId: string
  testDesignFingerprint: string
  confirmation: 'qa_confirmed'
  confirmedAt: string
}
export type RequirementTrace = {
  requirement: Requirement
  coverageAreaIds: string[]
  confirmedTestIds: string[]
  staleTestIds: string[]
  executionIds: string[]
  unverifiedExecutionIds: string[]
  failedTestIds: string[]
  blockedTestIds: string[]
  unrunTestIds: string[]
  bugIds: string[]
  suiteIds: string[]
  releaseIds: string[]
  gaps: Array<'no_coverage_area' | 'no_confirmed_test' | 'stale_test_links' | 'unresolved_ambiguity' | 'unverified_execution'>
}
export type RequirementTraceability = {
  rows: RequirementTrace[]
  testableTotal: number
  withCoverageArea: number
  withConfirmedTest: number
  withoutConfirmedTest: number
  ambiguous: number
  representedByFailedTests: number
  label: string
}
const designCache = new WeakMap<TestCase, Promise<string>>()
export function testDesignFingerprint(testCase: TestCase) {
  let result = designCache.get(testCase)
  if (!result) {
    result = fingerprint(JSON.stringify([testCase.id, testCase.createdAt, testCase.title, testCase.area, testCase.type, testCase.priority,
      testCase.preconditions ?? '', testCase.steps, testCase.expectedResult,
      testCase.structuredSteps?.map((step) => [step.action, step.expectedResult]) ?? []]))
    designCache.set(testCase, result)
  }
  return result
}
export async function createRequirementTestLink(requirement: Requirement, testCase: TestCase, confirmedAt: string): Promise<RequirementTestLink> {
  if (!isTestableRequirement(requirement)) throw new Error('Clarify this finding before confirming test traceability.')
  return { id: `trace:${requirement.id}:${testCase.id}`, sourceId: requirement.sourceId, requirementId: requirement.id,
    requirementFingerprint: requirement.fingerprint, testCaseId: testCase.id, testDesignFingerprint: await testDesignFingerprint(testCase), confirmation: 'qa_confirmed', confirmedAt }
}
const append = <T>(map: Map<string, T[]>, key: string, item: T) => { const list = map.get(key); if (list) list.push(item); else map.set(key, [item]) }

/** Real many-to-many joins. Library status is never substituted for release execution. */
export async function buildRequirementTraceability(options: {
  requirements: Requirement[]
  coverageAreas: RequirementCoverageArea[]
  coverageLinks: RequirementCoverageLink[]
  testLinks: RequirementTestLink[]
  testCases: TestCase[]
  executions: Execution[]
  bugs: Bug[]
  suites: TestSuite[]
  releaseId?: string
}): Promise<RequirementTraceability> {
  const tests = new Map(options.testCases.map((item) => [item.id, item]))
  const testFingerprints = new Map<string, string>()
  for (let start = 0; start < options.testCases.length; start += 64) {
    await Promise.all(options.testCases.slice(start, start + 64).map(async (item) => { testFingerprints.set(item.id, await testDesignFingerprint(item)) }))
  }
  const areas = new Map(options.coverageAreas.map((area) => [area.id, area]))
  const coverageByRequirement = new Map<string, RequirementCoverageLink[]>()
  for (const link of options.coverageLinks) append(coverageByRequirement, link.requirementId, link)
  const testsByRequirement = new Map<string, RequirementTestLink[]>()
  for (const link of options.testLinks) append(testsByRequirement, link.requirementId, link)
  const executionByTest = new Map<string, Execution[]>()
  for (const execution of options.executions) if (!options.releaseId || execution.releaseId === options.releaseId) append(executionByTest, execution.testCaseId, execution)
  const bugsByTest = new Map<string, Bug[]>()
  for (const bug of options.bugs) if (bug.testCaseId && bug.status !== 'Closed') append(bugsByTest, bug.testCaseId, bug)
  const suitesByTest = new Map<string, TestSuite[]>()
  for (const suite of options.suites) for (const id of suite.testCaseIds) append(suitesByTest, id, suite)
  const rows = options.requirements.map((requirement): RequirementTrace => {
    const coverageAreaIds = [...new Set((coverageByRequirement.get(requirement.id) ?? []).filter((link) =>
      link.active !== false && link.sourceId === requirement.sourceId && link.requirementFingerprint === requirement.fingerprint && areas.has(link.coverageAreaId)).map((link) => link.coverageAreaId))]
    const confirmedTestIds = new Set<string>()
    const staleTestIds = new Set<string>()
    for (const link of testsByRequirement.get(requirement.id) ?? []) {
      if (link.sourceId !== requirement.sourceId) continue
      if (link.confirmation === 'qa_confirmed' && link.requirementFingerprint === requirement.fingerprint && tests.has(link.testCaseId) &&
        testFingerprints.get(link.testCaseId) === link.testDesignFingerprint) confirmedTestIds.add(link.testCaseId)
      else staleTestIds.add(link.testCaseId)
    }
    const executionIds = new Set<string>()
    const unverifiedExecutionIds = new Set<string>()
    const failedTestIds = new Set<string>()
    const blockedTestIds = new Set<string>()
    const unrunTestIds = new Set<string>()
    const bugIds = new Set<string>()
    const suiteIds = new Set<string>()
    const releaseIds = new Set<string>()
    for (const testId of confirmedTestIds) {
      const executions = executionByTest.get(testId) ?? []
      for (const item of executions) {
        executionIds.add(item.id); releaseIds.add(item.releaseId)
        if (item.result !== 'Not Run' && item.testDesignFingerprint !== testFingerprints.get(testId)) unverifiedExecutionIds.add(item.id)
        if (item.result === 'Failed') failedTestIds.add(testId)
        if (item.result === 'Blocked') blockedTestIds.add(testId)
      }
      if (!executions.some((item) => (item.result === 'Passed' || item.result === 'Failed') && item.testDesignFingerprint === testFingerprints.get(testId))) unrunTestIds.add(testId)
      for (const bug of bugsByTest.get(testId) ?? []) bugIds.add(bug.id)
      for (const suite of suitesByTest.get(testId) ?? []) suiteIds.add(suite.id)
    }
    const gaps: RequirementTrace['gaps'] = []
    if (isTestableRequirement(requirement)) {
      if (!coverageAreaIds.length) gaps.push('no_coverage_area')
      if (!confirmedTestIds.size) gaps.push('no_confirmed_test')
      if (staleTestIds.size) gaps.push('stale_test_links')
      if (unverifiedExecutionIds.size) gaps.push('unverified_execution')
    }
    if (requirement.kind === 'ambiguity' || coverageAreaIds.some((id) => areas.get(id)?.readiness === 'blocked_by_ambiguity')) gaps.push('unresolved_ambiguity')
    return { requirement, coverageAreaIds, confirmedTestIds: [...confirmedTestIds], staleTestIds: [...staleTestIds], executionIds: [...executionIds], unverifiedExecutionIds: [...unverifiedExecutionIds],
      failedTestIds: [...failedTestIds], blockedTestIds: [...blockedTestIds], unrunTestIds: [...unrunTestIds], bugIds: [...bugIds], suiteIds: [...suiteIds], releaseIds: [...releaseIds], gaps }
  })
  const testable = rows.filter((row) => isTestableRequirement(row.requirement))
  const withConfirmedTest = testable.filter((row) => row.confirmedTestIds.length > 0).length
  return { rows, testableTotal: testable.length, withCoverageArea: testable.filter((row) => row.coverageAreaIds.length > 0).length,
    withConfirmedTest, withoutConfirmedTest: testable.length - withConfirmedTest, ambiguous: rows.filter((row) => row.requirement.kind === 'ambiguity').length,
    representedByFailedTests: testable.filter((row) => row.failedTestIds.length > 0).length,
    label: `${withConfirmedTest} / ${testable.length} current requirements have QA-confirmed test traceability` }
}

export function requirementImpact(previous: Requirement, links: RequirementTestLink[], coverage: RequirementCoverageLink[], suites: TestSuite[], executions: Execution[], bugs: Bug[]) {
  const testCaseIds = new Set(links.filter((link) => link.requirementId === previous.id).map((link) => link.testCaseId))
  return { requirementId: previous.id, before: previous.evidence.quote, testCaseIds: [...testCaseIds],
    coverageAreaIds: [...new Set(coverage.filter((link) => link.requirementId === previous.id).map((link) => link.coverageAreaId))],
    suiteIds: suites.filter((suite) => suite.testCaseIds.some((id) => testCaseIds.has(id))).map((suite) => suite.id),
    executionIds: executions.filter((item) => testCaseIds.has(item.testCaseId)).map((item) => item.id),
    releaseIds: [...new Set(executions.filter((item) => testCaseIds.has(item.testCaseId)).map((item) => item.releaseId))],
    bugIds: bugs.filter((bug) => bug.testCaseId && testCaseIds.has(bug.testCaseId)).map((bug) => bug.id) }
}
