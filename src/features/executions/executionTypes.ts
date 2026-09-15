import type { TestCaseStatus } from '../test-cases/testCaseTypes'

export const EXECUTION_RESULTS = [
  'Not Run',
  'Passed',
  'Failed',
  'Blocked',
] as const satisfies readonly TestCaseStatus[]

export type ExecutionResult = (typeof EXECUTION_RESULTS)[number]

export type Execution = {
  id: string
  releaseId: string
  testCaseId: string
  result: ExecutionResult
  notes: string
  executedAt?: string
  /** App-owned fingerprint of the design explicitly executed; absent for legacy runs. */
  testDesignFingerprint?: string
  createdAt: string
  updatedAt: string
}
