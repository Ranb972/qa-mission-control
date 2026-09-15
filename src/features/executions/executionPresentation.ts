import type { ReleaseReadinessReason } from '../readiness/releaseReadiness'
import type { ExecutionResult } from './executionTypes'

/** Display copy only; persisted results and filters retain their original values. */
export function formatExecutionResult(result: ExecutionResult) {
  return result === 'Not Run' ? 'Awaiting run' : result
}

export function formatExecutionReadinessReason(reason: ReleaseReadinessReason) {
  return reason.code === 'test-cases-not-run'
    ? `${reason.count} ${reason.count === 1 ? 'test' : 'tests'} awaiting run`
    : reason.label
}
