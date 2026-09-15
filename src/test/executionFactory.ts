import type { Execution } from '../features/executions/executionTypes'

export function createExecution(
  overrides: Partial<Execution> = {},
): Execution {
  return {
    id: 'execution-1',
    releaseId: 'release-1',
    testCaseId: 'test-case-1',
    result: 'Passed',
    notes: 'Execution completed successfully.',
    executedAt: '2026-05-07T09:00:00.000Z',
    createdAt: '2026-05-07T08:00:00.000Z',
    updatedAt: '2026-05-07T09:00:00.000Z',
    ...overrides,
  }
}
