import type { TestCase } from '../test-cases/testCaseTypes'
import type { Execution, ExecutionResult } from './executionTypes'

export type ExecutionSummary = {
  total: number
  notRun: number
  passed: number
  failed: number
  blocked: number
}

type UpsertExecutionOptions = {
  releaseId: string
  testCaseId: string
  result: ExecutionResult
  notes: string
  now: string
  createId: () => string
  testDesignFingerprint?: string
}

export function findExecution(
  executions: Execution[],
  releaseId: string,
  testCaseId: string,
) {
  return (
    executions.find(
      (execution) =>
        execution.releaseId === releaseId &&
        execution.testCaseId === testCaseId,
    ) ?? null
  )
}

/** Preserve existing first-record semantics while joining a release in linear time. */
export function indexReleaseExecutions(executions: Execution[], releaseId: string) {
  const index = new Map<string, Execution>()
  for (const execution of executions) if (execution.releaseId === releaseId && !index.has(execution.testCaseId)) index.set(execution.testCaseId, execution)
  return index
}

export function getExecutionDisplayValues(
  executions: Execution[],
  releaseId: string,
  testCaseId: string,
) {
  const execution = findExecution(executions, releaseId, testCaseId)

  return {
    result: execution?.result ?? 'Not Run',
    notes: execution?.notes ?? '',
  }
}

export function getReleaseExecutionSummary(
  testCases: TestCase[],
  executions: Execution[],
  releaseId: string,
): ExecutionSummary {
  const index = indexReleaseExecutions(executions, releaseId)
  return testCases.reduce<ExecutionSummary>(
    (summary, testCase) => {
      const result =
        index.get(testCase.id)?.result ?? 'Not Run'

      if (result === 'Passed') {
        summary.passed += 1
      } else if (result === 'Failed') {
        summary.failed += 1
      } else if (result === 'Blocked') {
        summary.blocked += 1
      } else {
        summary.notRun += 1
      }

      return summary
    },
    {
      total: testCases.length,
      notRun: 0,
      passed: 0,
      failed: 0,
      blocked: 0,
    },
  )
}

export function upsertExecution(
  executions: Execution[],
  options: UpsertExecutionOptions,
) {
  const existingExecution = findExecution(
    executions,
    options.releaseId,
    options.testCaseId,
  )
  const resultChanged = existingExecution?.result !== options.result
  const executedAt =
    options.result === 'Not Run'
      ? undefined
      : resultChanged || options.testDesignFingerprint !== undefined
        ? options.now
        : existingExecution?.executedAt ?? options.now
  const nextExecution: Execution = {
    id: existingExecution?.id ?? options.createId(),
    releaseId: options.releaseId,
    testCaseId: options.testCaseId,
    result: options.result,
    notes: options.notes,
    createdAt: existingExecution?.createdAt ?? options.now,
    updatedAt: options.now,
    ...(executedAt ? { executedAt } : {}),
    ...(options.result !== 'Not Run' && (options.testDesignFingerprint ?? existingExecution?.testDesignFingerprint)
      ? { testDesignFingerprint: options.testDesignFingerprint ?? existingExecution?.testDesignFingerprint } : {}),
  }

  if (!existingExecution) {
    return [nextExecution, ...executions]
  }

  return executions.map((execution) =>
    execution.releaseId === options.releaseId &&
    execution.testCaseId === options.testCaseId
      ? nextExecution
      : execution,
  )
}
