import { describe, expect, it } from 'vitest'
import { createExecution } from '../../test/executionFactory'
import { createTestCase } from '../../test/testCaseFactory'
import {
  findExecution,
  getExecutionDisplayValues,
  getReleaseExecutionSummary,
  upsertExecution,
} from './executionSelectors'

describe('executionSelectors', () => {
  it('preserves execution design on notes-only edits and timestamps explicit same-result re-runs', () => {
    const options = { releaseId: 'release-1', testCaseId: 'test-case-1', result: 'Passed' as const, notes: '', now: '2026-05-07T09:00:00.000Z', createId: () => 'execution-1', testDesignFingerprint: 'a'.repeat(64) }
    const first = upsertExecution([], options)
    const notes = upsertExecution(first, { ...options, now: '2026-05-07T10:00:00.000Z', notes: 'Reviewed evidence', testDesignFingerprint: undefined })
    expect(notes[0]).toMatchObject({ testDesignFingerprint: options.testDesignFingerprint, executedAt: options.now })
    const rerun = upsertExecution(notes, { ...options, now: '2026-05-07T11:00:00.000Z', testDesignFingerprint: 'b'.repeat(64) })
    expect(rerun[0]).toMatchObject({ testDesignFingerprint: 'b'.repeat(64), executedAt: '2026-05-07T11:00:00.000Z' })
    const reset = upsertExecution(rerun, { ...options, result: 'Not Run', testDesignFingerprint: undefined })
    expect(reset[0]).not.toHaveProperty('testDesignFingerprint')
  })
  it('defaults missing execution values to Not Run with empty notes', () => {
    expect(
      getExecutionDisplayValues([], 'release-1', 'test-case-1'),
    ).toEqual({
      result: 'Not Run',
      notes: '',
    })
  })

  it('finds an existing execution by release and test case', () => {
    const matchingExecution = createExecution({
      id: 'matching',
      releaseId: 'release-1',
      testCaseId: 'test-case-1',
    })

    expect(
      findExecution(
        [
          createExecution({
            id: 'other-release',
            releaseId: 'release-2',
            testCaseId: 'test-case-1',
          }),
          matchingExecution,
        ],
        'release-1',
        'test-case-1',
      ),
    ).toBe(matchingExecution)
  })

  it('keeps records for the same test case separate across different releases', () => {
    const releaseOneExecution = createExecution({
      id: 'release-1-execution',
      releaseId: 'release-1',
      testCaseId: 'test-case-1',
      result: 'Passed',
      notes: 'Release 1 notes.',
    })
    const releaseTwoExecution = createExecution({
      id: 'release-2-execution',
      releaseId: 'release-2',
      testCaseId: 'test-case-1',
      result: 'Failed',
      notes: 'Release 2 notes.',
    })
    const executions = [releaseOneExecution, releaseTwoExecution]

    expect(
      findExecution(executions, 'release-1', 'test-case-1'),
    ).toBe(releaseOneExecution)
    expect(
      findExecution(executions, 'release-2', 'test-case-1'),
    ).toBe(releaseTwoExecution)
    expect(
      getExecutionDisplayValues(executions, 'release-2', 'test-case-1'),
    ).toEqual({
      result: 'Failed',
      notes: 'Release 2 notes.',
    })
  })

  it('counts selected-release execution results with missing records as Not Run', () => {
    const testCases = [
      createTestCase({ id: 'not-run' }),
      createTestCase({ id: 'passed' }),
      createTestCase({ id: 'failed' }),
      createTestCase({ id: 'blocked' }),
    ]
    const executions = [
      createExecution({
        id: 'passed-execution',
        releaseId: 'release-1',
        testCaseId: 'passed',
        result: 'Passed',
      }),
      createExecution({
        id: 'failed-execution',
        releaseId: 'release-1',
        testCaseId: 'failed',
        result: 'Failed',
      }),
      createExecution({
        id: 'blocked-execution',
        releaseId: 'release-1',
        testCaseId: 'blocked',
        result: 'Blocked',
      }),
      createExecution({
        id: 'other-release-execution',
        releaseId: 'release-2',
        testCaseId: 'not-run',
        result: 'Passed',
      }),
    ]

    expect(getReleaseExecutionSummary(testCases, executions, 'release-1')).toEqual({
      total: 4,
      notRun: 1,
      passed: 1,
      failed: 1,
      blocked: 1,
    })
  })

  it('upserts only the exact release and test case pair', () => {
    const releaseOneExecution = createExecution({
      id: 'shared-execution-id',
      releaseId: 'release-1',
      testCaseId: 'test-case-1',
      result: 'Passed',
      notes: 'Release 1 notes.',
      executedAt: '2026-05-07T09:00:00.000Z',
      createdAt: '2026-05-07T08:00:00.000Z',
      updatedAt: '2026-05-07T09:00:00.000Z',
    })
    const releaseTwoExecution = createExecution({
      id: 'shared-execution-id',
      releaseId: 'release-2',
      testCaseId: 'test-case-1',
      result: 'Blocked',
      notes: 'Release 2 notes.',
      executedAt: '2026-05-07T10:00:00.000Z',
      createdAt: '2026-05-07T08:30:00.000Z',
      updatedAt: '2026-05-07T10:00:00.000Z',
    })

    const nextExecutions = upsertExecution(
      [releaseOneExecution, releaseTwoExecution],
      {
        releaseId: 'release-2',
        testCaseId: 'test-case-1',
        result: 'Failed',
        notes: 'Release 2 failed.',
        now: '2026-05-07T11:00:00.000Z',
        createId: () => 'unused-id',
      },
    )

    expect(
      findExecution(nextExecutions, 'release-1', 'test-case-1'),
    ).toEqual(releaseOneExecution)
    expect(
      findExecution(nextExecutions, 'release-2', 'test-case-1'),
    ).toMatchObject({
      id: 'shared-execution-id',
      releaseId: 'release-2',
      testCaseId: 'test-case-1',
      result: 'Failed',
      notes: 'Release 2 failed.',
      executedAt: '2026-05-07T11:00:00.000Z',
      createdAt: '2026-05-07T08:30:00.000Z',
      updatedAt: '2026-05-07T11:00:00.000Z',
    })
  })

  it('sets executedAt for completed results and clears it when reset to Not Run', () => {
    const initialExecutions = upsertExecution([], {
      releaseId: 'release-1',
      testCaseId: 'test-case-1',
      result: 'Passed',
      notes: 'Passed in staging.',
      now: '2026-05-07T09:00:00.000Z',
      createId: () => 'execution-1',
    })

    expect(initialExecutions[0]).toMatchObject({
      result: 'Passed',
      executedAt: '2026-05-07T09:00:00.000Z',
    })

    const resetExecutions = upsertExecution(initialExecutions, {
      releaseId: 'release-1',
      testCaseId: 'test-case-1',
      result: 'Not Run',
      notes: 'Reset for another pass.',
      now: '2026-05-07T10:00:00.000Z',
      createId: () => 'unused-id',
    })

    expect(resetExecutions[0]).toEqual({
      id: 'execution-1',
      releaseId: 'release-1',
      testCaseId: 'test-case-1',
      result: 'Not Run',
      notes: 'Reset for another pass.',
      createdAt: '2026-05-07T09:00:00.000Z',
      updatedAt: '2026-05-07T10:00:00.000Z',
    })
    expect(
      getReleaseExecutionSummary(
        [createTestCase({ id: 'test-case-1' })],
        resetExecutions,
        'release-1',
      ),
    ).toEqual({
      total: 1,
      notRun: 1,
      passed: 0,
      failed: 0,
      blocked: 0,
    })
  })
})
