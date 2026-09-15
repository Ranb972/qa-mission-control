import { loadBugs, parseBug } from '../storage/bugStorage'
import { loadCoveragePlans, parsePersistedCoveragePlanRecord } from '../storage/coveragePlanStorage'
import { loadExecutions, parseExecution } from '../storage/executionStorage'
import { loadQaSourceSectionIndexes, parseQaSourceSectionIndex } from '../storage/qaSourceSectionStorage'
import { loadQaSources, parseQaSource } from '../storage/qaSourceStorage'
import { loadReleases, parseRelease } from '../storage/releaseStorage'
import { loadRisks, parseRisk } from '../storage/riskStorage'
import { loadSectionCoveragePlans, parsePersistedRecord } from '../storage/sectionCoveragePlanStorage'
import { loadTestCases, parseTestCase } from '../storage/testCaseStorage'
import { loadTestSuites, parseTestSuite } from '../storage/testSuiteStorage'

export type CoreCollections = {
  testCases: ReturnType<typeof loadTestCases>['testCases'][number]
  bugs: ReturnType<typeof loadBugs>['bugs'][number]
  risks: ReturnType<typeof loadRisks>['risks'][number]
  releases: ReturnType<typeof loadReleases>['releases'][number]
  executions: ReturnType<typeof loadExecutions>['executions'][number]
  testSuites: ReturnType<typeof loadTestSuites>['testSuites'][number]
  sources: ReturnType<typeof loadQaSources>['qaSources'][number]
  coveragePlans: ReturnType<typeof loadCoveragePlans>['coveragePlans'][number]
  sectionIndexes: ReturnType<typeof loadQaSourceSectionIndexes>['sectionIndexes'][number]
  sectionPlans: ReturnType<typeof loadSectionCoveragePlans>['records'][number]
}
export type CoreCollectionName = keyof CoreCollections
export type CoreWorkspace = { [K in CoreCollectionName]: CoreCollections[K][] }

export const coreParsers: { [K in CoreCollectionName]: (value: unknown) => CoreCollections[K] | null } = {
  testCases: (value) => {
    const parsed = parseTestCase(value)
    return parsed && !parsed.hasInvalidStructuredSteps ? parsed.testCase : null
  },
  bugs: parseBug, risks: parseRisk, releases: parseRelease, executions: parseExecution,
  testSuites: parseTestSuite, sources: parseQaSource, coveragePlans: parsePersistedCoveragePlanRecord,
  sectionIndexes: parseQaSourceSectionIndex, sectionPlans: parsePersistedRecord,
}

export const CORE_COLLECTIONS = Object.keys(coreParsers) as CoreCollectionName[]

export function coreRecordId(name: CoreCollectionName, value: CoreCollections[CoreCollectionName]): string {
  return name === 'sectionIndexes' ? (value as CoreCollections['sectionIndexes']).qaSourceId : (value as Exclude<CoreCollections[CoreCollectionName], CoreCollections['sectionIndexes']>).id
}

export function validateCoreCollection<K extends CoreCollectionName>(name: K, values: readonly unknown[]): CoreCollections[K][] {
  const seen = new Set<string>()
  return values.map((value) => {
    const parsed = coreParsers[name](value)
    const id = parsed && coreRecordId(name, parsed)
    if (!parsed || !id || seen.has(id)) throw new Error('Workspace data contains invalid or duplicate records. Previously saved data was not changed.')
    seen.add(id)
    return parsed
  })
}

/** Uses the accepted v1 validators. The original localStorage values are never modified. */
export function readLegacyWorkspace(): { data: CoreWorkspace; warnings: string[] } {
  const testCases = loadTestCases()
  const bugs = loadBugs()
  const risks = loadRisks()
  const releases = loadReleases()
  const executions = loadExecutions()
  const testSuites = loadTestSuites()
  const sources = loadQaSources()
  const coveragePlans = loadCoveragePlans()
  const sectionIndexes = loadQaSourceSectionIndexes()
  const sectionPlans = loadSectionCoveragePlans()
  return {
    data: { testCases: testCases.testCases, bugs: bugs.bugs, risks: risks.risks, releases: releases.releases,
      executions: executions.executions, testSuites: testSuites.testSuites, sources: sources.qaSources,
      coveragePlans: coveragePlans.coveragePlans, sectionIndexes: sectionIndexes.sectionIndexes, sectionPlans: sectionPlans.records },
    warnings: [testCases, bugs, risks, releases, executions, testSuites, sources, coveragePlans, sectionIndexes, sectionPlans]
      .flatMap((result) => result.error ? [result.error] : []),
  }
}
