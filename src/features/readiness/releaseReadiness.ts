import type { Bug } from '../bugs/bugTypes'
import { indexReleaseExecutions } from '../executions/executionSelectors'
import type { Execution } from '../executions/executionTypes'
import type { Risk } from '../risks/riskTypes'
import type { TestCase } from '../test-cases/testCaseTypes'

export const RELEASE_READINESS_STATUSES = [
  'Ready',
  'At Risk',
  'Blocked',
] as const

export type ReleaseReadinessStatus =
  (typeof RELEASE_READINESS_STATUSES)[number]

export type ReleaseReadinessReasonCode =
  | 'failed-test-cases'
  | 'blocked-test-cases'
  | 'open-critical-bugs'
  | 'open-critical-risks'
  | 'no-test-cases'
  | 'test-cases-not-run'
  | 'open-high-bugs'
  | 'open-high-risks'
  | 'ready'

export type ReleaseReadinessReason = {
  code: ReleaseReadinessReasonCode
  label: string
  count?: number
}

export type ReleaseReadinessResult = {
  status: ReleaseReadinessStatus
  reasons: ReleaseReadinessReason[]
}

type CalculateReleaseReadinessOptions = {
  releaseId: string
  testCases: TestCase[]
  executions: Execution[]
  bugs: Bug[]
  risks: Risk[]
}

function formatCount(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`
}

function createCountReason(
  code: ReleaseReadinessReasonCode,
  count: number,
  singular: string,
  plural: string,
): ReleaseReadinessReason | null {
  if (count === 0) {
    return null
  }

  return {
    code,
    count,
    label: formatCount(count, singular, plural),
  }
}

function compactReasons(
  reasons: Array<ReleaseReadinessReason | null>,
): ReleaseReadinessReason[] {
  return reasons.filter(
    (reason): reason is ReleaseReadinessReason => reason !== null,
  )
}

export function calculateReleaseReadiness({
  releaseId,
  testCases,
  executions,
  bugs,
  risks,
}: CalculateReleaseReadinessOptions): ReleaseReadinessResult {
  let failedExecutionCount = 0
  let blockedExecutionCount = 0
  let notRunExecutionCount = 0
  const index = indexReleaseExecutions(executions, releaseId)

  testCases.forEach((testCase) => {
    const execution = index.get(testCase.id)
    const result = execution?.result ?? 'Not Run'

    if (result === 'Failed') {
      failedExecutionCount += 1
    } else if (result === 'Blocked') {
      blockedExecutionCount += 1
    } else if (result === 'Not Run') {
      notRunExecutionCount += 1
    }
  })

  const openCriticalBugCount = bugs.filter(
    (bug) => bug.status === 'Open' && bug.severity === 'Critical',
  ).length
  const openCriticalRiskCount = risks.filter(
    (risk) => risk.status === 'Open' && risk.impact === 'Critical',
  ).length
  const openHighBugCount = bugs.filter(
    (bug) => bug.status === 'Open' && bug.severity === 'High',
  ).length
  const openHighRiskCount = risks.filter(
    (risk) => risk.status === 'Open' && risk.impact === 'High',
  ).length

  const blockedReasons = compactReasons([
    createCountReason(
      'blocked-test-cases',
      blockedExecutionCount,
      'blocked test case',
      'blocked test cases',
    ),
    createCountReason(
      'open-critical-bugs',
      openCriticalBugCount,
      'open Critical bug',
      'open Critical bugs',
    ),
    createCountReason(
      'open-critical-risks',
      openCriticalRiskCount,
      'open Critical risk',
      'open Critical risks',
    ),
  ])
  const atRiskReasons = compactReasons([
    // A failed test requires investigation. Explicit execution blockers and Critical signals stop handoff.
    createCountReason('failed-test-cases', failedExecutionCount, 'failed test case', 'failed test cases'),
    testCases.length === 0
      ? {
          code: 'no-test-cases',
          label: 'No test cases available',
        }
      : null,
    createCountReason(
      'test-cases-not-run',
      notRunExecutionCount,
      'test case not run',
      'test cases not run',
    ),
    createCountReason(
      'open-high-bugs',
      openHighBugCount,
      'open High bug',
      'open High bugs',
    ),
    createCountReason(
      'open-high-risks',
      openHighRiskCount,
      'open High risk',
      'open High risks',
    ),
  ])

  if (blockedReasons.length > 0) {
    return {
      status: 'Blocked',
      reasons: [...blockedReasons, ...atRiskReasons],
    }
  }

  if (atRiskReasons.length > 0) {
    return {
      status: 'At Risk',
      reasons: atRiskReasons,
    }
  }

  return {
    status: 'Ready',
    reasons: [
      {
        code: 'ready',
        label:
          'All current test cases passed and no blocking signals are open.',
      },
    ],
  }
}
