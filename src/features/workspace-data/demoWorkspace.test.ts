import { describe, expect, it } from 'vitest'
import { buildDemoWorkspace } from './demoWorkspace'
import { csvCell, exportRequirementHistoryCsv } from './requirementExport'
import { groupRequirementRelations } from '../document-intelligence/coverageIntelligence'
import { isTestableRequirement, type Requirement } from '../document-intelligence/requirementModel'
import { buildRequirementTraceability, type RequirementTestLink } from '../document-intelligence/requirementTraceability'
import type { RequirementCoverageArea, RequirementCoverageLink } from '../document-intelligence/coverageIntelligence'
import type { TestCase } from '../test-cases/testCaseTypes'
import type { Execution } from '../executions/executionTypes'
import type { Bug } from '../bugs/bugTypes'
import type { Risk } from '../risks/riskTypes'
import type { TestSuite } from '../test-suites/testSuiteTypes'
import type { QaSource } from '../qa-sources/qaSourceTypes'
import { calculateReleaseReadiness } from '../readiness/releaseReadiness'
import { northstarSources, NORTHSTAR_SOURCE_ID, NORTHSTAR_RELEASE_ID } from './northstarDemo'

describe('canonical Northstar synthetic workspace', () => {
  it('preserves both complete sources and every numbered finding with exact canonical evidence', async () => {
    const demo = await buildDemoWorkspace()
    expect(await buildDemoWorkspace()).toEqual(demo)
    const sources = demo.collections.sources.map(record => record.value as QaSource)
    expect(sources.map(source => ({ id: source.id, title: source.title, content: source.content }))).toEqual(northstarSources)
    const requirements = demo.collections.requirements.map(record => record.value as Requirement)
    expect(requirements.filter(item => item.sourceId === NORTHSTAR_SOURCE_ID)).toHaveLength(114)
    expect(requirements).toHaveLength(119)
    expect(new Set(requirements.map(item => item.summary.split(' — ')[0])).size).toBe(119)
    for (const item of requirements) {
      const source = sources.find(source => source.id === item.sourceId)!
      expect(source.content.slice(item.evidence.location.startOffset, item.evidence.location.endOffset)).toBe(item.evidence.quote)
      expect(source.content).toContain(item.summary)
    }
    expect(requirements.some(item => item.kind === 'ambiguity')).toBe(true)
    expect(JSON.stringify(demo)).not.toMatch(/demo-enterprise|Commerce ·|rawPrompt/)
    expect(exportRequirementHistoryCsv(demo)).toContain('NCP-CHK-005')
  })
  it('connects the four hero scenarios to evidence, one defect and an honest At Risk release', async () => {
    const demo = await buildDemoWorkspace()
    const values = <T,>(name: string) => demo.collections[name].map(record => record.value as T)
    const requirements = values<Requirement>('requirements')
    const tests = values<TestCase>('testCases')
    const executions = values<Execution>('executions')
    const bugs = values<Bug>('bugs')
    const trace = await buildRequirementTraceability({ requirements, testCases: tests, executions, bugs, suites: values<TestSuite>('testSuites'), testLinks: values<RequirementTestLink>('requirementTestLinks'), coverageAreas: values<RequirementCoverageArea>('requirementCoverageAreas'), coverageLinks: values<RequirementCoverageLink>('requirementCoverageLinks'), releaseId: NORTHSTAR_RELEASE_ID })
    const hero = trace.rows.find(row => row.requirement.summary.startsWith('NCP-CHK-005'))!
    expect(hero.requirement.evidence.quote).toBe('Duplicate confirmation clicks must create at most one order.')
    expect(hero.confirmedTestIds).toHaveLength(4)
    expect(executions.filter(item => hero.confirmedTestIds.includes(item.testCaseId)).map(item => item.result)).toEqual(['Passed', 'Failed', 'Not Run', 'Passed'])
    expect(hero.failedTestIds).toHaveLength(1)
    expect(hero.bugIds).toEqual(['BUG-DEMO-001'])
    expect(trace.withConfirmedTest).toBeLessThan(trace.testableTotal)
    expect(trace.withoutConfirmedTest).toBeGreaterThan(80)
    expect(requirements.filter(isTestableRequirement).length).toBe(trace.testableTotal)
    expect(tests).toHaveLength(16)
    expect(bugs).toHaveLength(1)
    for (const execution of executions.filter(item => item.result === 'Not Run')) {
      expect(execution.executedAt).toBeUndefined()
      expect(execution.testDesignFingerprint).toBeUndefined()
    }
    const readiness = calculateReleaseReadiness({ releaseId: NORTHSTAR_RELEASE_ID, testCases: tests, executions, bugs, risks: values<Risk>('risks') })
    expect(readiness.status).toBe('At Risk')
    expect(readiness.reasons.map(reason => reason.code)).toEqual(expect.arrayContaining(['failed-test-cases', 'test-cases-not-run', 'open-high-bugs', 'open-high-risks']))
    const conflicts = groupRequirementRelations(requirements).filter(group => group.kind === 'potential_conflict')
    const returns = conflicts.find(group => group.requirementIds.some(id => requirements.find(item => item.id === id)?.summary.startsWith('NCP-CHG-001')))!
    expect(returns).toBeDefined()
    expect(returns.requirementIds).not.toContain(hero.requirement.id)
    expect(returns.requirementIds.some(id => requirements.find(item => item.id === id)?.summary.startsWith('NCP-REF-003'))).toBe(true)
    const affected = trace.rows.filter(row => returns.requirementIds.includes(row.requirement.id)).flatMap(row => row.confirmedTestIds)
    expect(affected).toHaveLength(1)
    expect(affected.some(id => hero.confirmedTestIds.includes(id))).toBe(false)
  })
  it('neutralizes spreadsheet formula execution without corrupting CSV quotes', () => {
    expect(csvCell('=HYPERLINK("https://example.com")')).toBe('"\'=HYPERLINK(""https://example.com"")"')
    expect(csvCell('\t@SUM(1,2)')).toBe('"\'\t@SUM(1,2)"')
    expect(csvCell('ordinary, "text"')).toBe('"ordinary, ""text"""')
  })
})
