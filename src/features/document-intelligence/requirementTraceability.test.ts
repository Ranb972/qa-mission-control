import { describe, expect, it } from 'vitest'
import type { Requirement } from './requirementModel'
import type { TestCase } from '../test-cases/testCaseTypes'
import { buildRequirementTraceability, createRequirementTestLink, requirementImpact, testDesignFingerprint } from './requirementTraceability'
import { UNIT_ANALYSIS_VERSION } from './unitAnalysisContract'

const requirement = (id: string): Requirement => ({ id, sourceId: 'source', sourceCreatedAt: '2026-01-01', sourceRevision: 'revision', unitId: `unit-${id}`, unitReuseKey: 'reuse', sectionId: 'section', kind: 'requirement', summary: `Requirement ${id}`, coverageTopic: 'Checkout',
  evidence: { quote: `Requirement ${id}`, relativeStart: 0, relativeEnd: 13, location: { startOffset: 0, endOffset: 13, startLine: 1, endLine: 1 }, blockIds: ['block'] }, fingerprint: `fingerprint-${id}`, analysisVersion: UNIT_ANALYSIS_VERSION, createdAt: '2026-01-01' })
const testCase = (id: string): TestCase => ({ id, title: `Test ${id}`, area: 'Checkout', priority: 'High', status: 'Passed', type: 'Functional', steps: 'Submit payment.', expectedResult: 'One order exists.', createdAt: '2026-01-01', updatedAt: '2026-01-01' })
const base = { coverageAreas: [], coverageLinks: [], testLinks: [], executions: [], bugs: [], suites: [] }

describe('requirement-based traceability and change impact', () => {
  it('supports many requirements per test and many reviewed tests per requirement without double counting the denominator', async () => {
    const requirements = [requirement('a'), requirement('b'), requirement('c')]
    const tests = [testCase('one'), testCase('two')]
    const links = await Promise.all([[0, 0], [0, 1], [1, 0]].map(([r, t]) => createRequirementTestLink(requirements[r], tests[t], '2026-01-02')))
    const graph = await buildRequirementTraceability({ ...base, requirements, testCases: tests, testLinks: links })
    expect(graph.testableTotal).toBe(3)
    expect(graph.withConfirmedTest).toBe(2)
    expect(graph.withoutConfirmedTest).toBe(1)
    expect(graph.rows[0].confirmedTestIds).toHaveLength(2)
    expect(graph.rows[0].unrunTestIds).toHaveLength(2) // Library Passed is not a release execution.
    expect(graph.label).toBe('2 / 3 current requirements have QA-confirmed test traceability')
  })
  it('requires an explicit QA-created link and keeps ambiguous source material meaningfully blocked', async () => {
    const item = requirement('a')
    const test = testCase('one')
    const graph = await buildRequirementTraceability({ ...base, requirements: [item], testCases: [test] })
    expect(graph.withConfirmedTest).toBe(0)
    expect(graph.rows[0].gaps).toEqual(['no_coverage_area', 'no_confirmed_test'])
    await expect(createRequirementTestLink({ ...item, kind: 'ambiguity' }, test, '2026-01-02')).rejects.toThrow('Clarify')
  })
  it('invalidates only changed test design or requirement meaning, not execution status or timestamps', async () => {
    const requirements = [requirement('a'), requirement('b')]
    const tests = [testCase('one'), testCase('two')]
    const links = await Promise.all(requirements.map((item, index) => createRequirementTestLink(item, tests[index], '2026-01-02')))
    expect(await testDesignFingerprint({ ...tests[0], status: 'Failed', updatedAt: '2026-01-03' })).toBe(await testDesignFingerprint(tests[0]))
    const graph = await buildRequirementTraceability({ ...base, requirements, testCases: [{ ...tests[0], expectedResult: 'Two orders exist.' }, tests[1]], testLinks: links })
    expect(graph.rows[0].staleTestIds).toEqual(['one'])
    expect(graph.rows[1].confirmedTestIds).toEqual(['two'])
    const changed = await buildRequirementTraceability({ ...base, requirements: [{ ...requirements[0], fingerprint: 'new-meaning' }, requirements[1]], testCases: tests, testLinks: links })
    expect(changed.withConfirmedTest).toBe(1)
  })
  it('traces failures to requirements with release isolation and links bugs/suites without presenting implementation as approval', async () => {
    const item = requirement('a')
    const test = testCase('one')
    const link = await createRequirementTestLink(item, test, '2026-01-02')
    const executions = [{ id: 'run-a', releaseId: 'release-a', testCaseId: test.id, result: 'Failed' as const, notes: '', createdAt: '2026-01-01', updatedAt: '2026-01-01' },
      { id: 'run-b', releaseId: 'release-b', testCaseId: test.id, result: 'Passed' as const, notes: '', createdAt: '2026-01-01', updatedAt: '2026-01-01' }]
    const suites = [{ id: 'suite', name: 'Smoke', type: 'Smoke' as const, description: '', testCaseIds: [test.id], createdAt: '2026-01-01', updatedAt: '2026-01-01' }]
    const options = { ...base, requirements: [item], testCases: [test], testLinks: [link], executions, suites }
    const failed = await buildRequirementTraceability({ ...options, releaseId: 'release-a' })
    const passed = await buildRequirementTraceability({ ...options, releaseId: 'release-b' })
    expect(failed.representedByFailedTests).toBe(1)
    expect(passed.representedByFailedTests).toBe(0)
    expect(failed.rows[0].suiteIds).toEqual(['suite'])
    expect(requirementImpact(item, [link], [], suites, executions, [])).toMatchObject({ testCaseIds: ['one'], suiteIds: ['suite'], executionIds: ['run-a', 'run-b'], releaseIds: ['release-a', 'release-b'] })
  })
  it('joins 10k requirements, 3000 tests and 30k confirmed relationships with bounded output', async () => {
    const requirements = Array.from({ length: 10000 }, (_, index) => requirement(`r-${index}`))
    const tests = Array.from({ length: 3000 }, (_, index) => testCase(`t-${index}`))
    const fingerprints = await Promise.all(tests.map(testDesignFingerprint))
    const links = requirements.flatMap((item, index) => Array.from({ length: 3 }, (_, offset) => ({ id: `link-${index}-${offset}`, sourceId: item.sourceId,
      requirementId: item.id, requirementFingerprint: item.fingerprint, testCaseId: tests[(index + offset) % tests.length].id,
      testDesignFingerprint: fingerprints[(index + offset) % tests.length], confirmation: 'qa_confirmed' as const, confirmedAt: '2026-01-02' })))
    const graph = await buildRequirementTraceability({ ...base, requirements, testCases: tests, testLinks: links })
    expect(links).toHaveLength(30000)
    expect(graph.withConfirmedTest).toBe(10000)
    expect(graph.rows.at(-1)?.confirmedTestIds).toHaveLength(3)
    expect(graph.rows.every((row) => row.confirmedTestIds.length === 3)).toBe(true)
  }, 30_000)
  it('never upgrades an old execution when QA re-confirms a changed test design', async () => {
    const item = requirement('a')
    const oldTest = testCase('one')
    const changedTest = { ...oldTest, expectedResult: 'A new explicitly specified outcome.' }
    const link = await createRequirementTestLink(item, changedTest, '2026-01-03')
    const oldRun = { id: 'run', releaseId: 'release', testCaseId: oldTest.id, result: 'Passed' as const, notes: '', executedAt: '2026-01-02', createdAt: '2026-01-02', updatedAt: '2026-01-02', testDesignFingerprint: await testDesignFingerprint(oldTest) }
    const options = { ...base, requirements: [item], testCases: [changedTest], testLinks: [link], executions: [oldRun] }
    const stale = await buildRequirementTraceability(options)
    expect(stale.withConfirmedTest).toBe(1)
    expect(stale.rows[0].unverifiedExecutionIds).toEqual(['run'])
    expect(stale.rows[0].unrunTestIds).toEqual(['one'])
    const current = await buildRequirementTraceability({ ...options, executions: [{ ...oldRun, testDesignFingerprint: await testDesignFingerprint(changedTest) }] })
    expect(current.rows[0].unverifiedExecutionIds).toEqual([])
    expect(current.rows[0].unrunTestIds).toEqual([])
    const legacy = await buildRequirementTraceability({ ...options, executions: [{ ...oldRun, testDesignFingerprint: undefined }] })
    expect(legacy.rows[0].gaps).toContain('unverified_execution')
  })
})
