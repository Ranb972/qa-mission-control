import type { Bug } from '../bugs/bugTypes'
import {
  indexReleaseExecutions,
  getReleaseExecutionSummary,
  type ExecutionSummary,
} from '../executions/executionSelectors'
import type { Execution, ExecutionResult } from '../executions/executionTypes'
import { formatExecutionResult, formatExecutionReadinessReason } from '../executions/executionPresentation'
import {
  calculateReleaseReadiness,
  type ReleaseReadinessResult,
} from '../readiness/releaseReadiness'
import type { Release } from '../releases/releaseTypes'
import type { Risk } from '../risks/riskTypes'
import type { TestCase } from '../test-cases/testCaseTypes'

export const GLOBAL_QUALITY_SIGNAL_NOTE =
  'Global open quality signals considered for this release readiness.'

export type ReleaseReportTestItem = {
  testCaseId: string
  title: string
  area: string
  priority: string
  result: ExecutionResult
  notes: string
  executedAt?: string
}

export type ReleaseReportNote = {
  testCaseId: string
  title: string
  result: ExecutionResult
  notes: string
}

export type ReleaseReportSignal = {
  id: string
  title: string
  level: 'High' | 'Critical'
  status: 'Open'
  detail: string
}

export type ReleaseReportModel = {
  release: Release
  readiness: ReleaseReadinessResult
  summary: ExecutionSummary
  failedTests: ReleaseReportTestItem[]
  blockedTests: ReleaseReportTestItem[]
  notRunTests: ReleaseReportTestItem[]
  executionNotes: ReleaseReportNote[]
  globalBugs: ReleaseReportSignal[]
  globalRisks: ReleaseReportSignal[]
  recommendedActions: string[]
}

type BuildReleaseReportModelOptions = {
  release: Release
  testCases: TestCase[]
  executions: Execution[]
  bugs: Bug[]
  risks: Risk[]
}

function createTestItem(
  testCase: TestCase,
  result: ExecutionResult,
  execution: Execution | null,
): ReleaseReportTestItem {
  return {
    testCaseId: testCase.id,
    title: testCase.title,
    area: testCase.area,
    priority: testCase.priority,
    result,
    notes: execution?.notes ?? '',
    ...(execution?.executedAt ? { executedAt: execution.executedAt } : {}),
  }
}

function isHighOrCritical(
  level: Bug['severity'] | Risk['impact'],
): level is ReleaseReportSignal['level'] {
  return level === 'Critical' || level === 'High'
}

function getGlobalBugSignals(bugs: Bug[]): ReleaseReportSignal[] {
  return bugs.flatMap((bug) => {
    if (bug.status !== 'Open' || !isHighOrCritical(bug.severity)) {
      return []
    }

    return [{
      id: bug.id,
      title: bug.title,
      level: bug.severity,
      status: bug.status,
      detail: bug.description,
    }]
  })
}

function getGlobalRiskSignals(risks: Risk[]): ReleaseReportSignal[] {
  return risks.flatMap((risk) => {
    if (risk.status !== 'Open' || !isHighOrCritical(risk.impact)) {
      return []
    }

    return [{
      id: risk.id,
      title: risk.title,
      level: risk.impact,
      status: risk.status,
      detail: risk.mitigationPlan,
    }]
  })
}

export function getReleaseReportActions(model: {
  readiness: ReleaseReadinessResult
  failedTests: ReleaseReportTestItem[]
  blockedTests: ReleaseReportTestItem[]
  notRunTests: ReleaseReportTestItem[]
  globalBugs: ReleaseReportSignal[]
  globalRisks: ReleaseReportSignal[]
}) {
  const actions: string[] = []

  if (model.failedTests.length > 0) {
    actions.push('Investigate and resolve failed test cases before release handoff.')
  }

  if (model.blockedTests.length > 0) {
    actions.push('Unblock blocked test cases or document accepted release risk.')
  }

  if (model.notRunTests.length > 0) {
    actions.push('Run the remaining tests and record their outcomes before assessing execution coverage.')
  }

  if (model.globalBugs.length > 0) {
    actions.push('Review open High/Critical global bugs before the release decision.')
  }

  if (model.globalRisks.length > 0) {
    actions.push('Review open High/Critical global risks and mitigation plans.')
  }

  if (actions.length === 0 && model.readiness.status === 'Ready') {
    actions.push('Review source evidence and outstanding QA decisions before stakeholder sign-off.')
  }

  if (model.readiness.reasons.some(reason => reason.code === 'no-test-cases')) {
    actions.unshift('Define executable Test Cases from reviewed requirements, then record their results for this release.')
  }

  return actions
}

export function buildReleaseReportModel({
  release,
  testCases,
  executions,
  bugs,
  risks,
}: BuildReleaseReportModelOptions): ReleaseReportModel {
  const failedTests: ReleaseReportTestItem[] = []
  const blockedTests: ReleaseReportTestItem[] = []
  const notRunTests: ReleaseReportTestItem[] = []
  const executionNotes: ReleaseReportNote[] = []
  const index = indexReleaseExecutions(executions, release.id)

  testCases.forEach((testCase) => {
    const execution = index.get(testCase.id) ?? null
    const result = execution?.result ?? 'Not Run'
    const item = createTestItem(testCase, result, execution)

    if (result === 'Failed') {
      failedTests.push(item)
    } else if (result === 'Blocked') {
      blockedTests.push(item)
    } else if (result === 'Not Run') {
      notRunTests.push(item)
    }

    if (execution?.notes.trim()) {
      executionNotes.push({
        testCaseId: testCase.id,
        title: testCase.title,
        result,
        notes: execution.notes,
      })
    }
  })

  const readiness = calculateReleaseReadiness({
    releaseId: release.id,
    testCases,
    executions,
    bugs,
    risks,
  })
  const globalBugs = getGlobalBugSignals(bugs)
  const globalRisks = getGlobalRiskSignals(risks)
  const modelBase = {
    release,
    readiness,
    summary: getReleaseExecutionSummary(testCases, executions, release.id),
    failedTests,
    blockedTests,
    notRunTests,
    executionNotes,
    globalBugs,
    globalRisks,
  }

  return {
    ...modelBase,
    recommendedActions: getReleaseReportActions(modelBase),
  }
}

function formatOptional(value: string) {
  return value.trim() ? value : 'None.'
}

function formatTestItem(item: ReleaseReportTestItem) {
  const details = [`Area: ${item.area}`, `Priority: ${item.priority}`]

  if (item.executedAt) {
    details.push(`Executed: ${item.executedAt}`)
  }

  if (item.notes.trim()) {
    details.push(`Notes: ${item.notes}`)
  }

  return `- ${item.title} (${details.join('; ')})`
}

function formatSignal(signal: ReleaseReportSignal) {
  return `- ${signal.level} - ${signal.title}: ${formatOptional(signal.detail)}`
}

function formatList<TItem>(
  items: TItem[],
  formatter: (item: TItem) => string,
) {
  if (items.length === 0) {
    return '- None.'
  }

  return items.map(formatter).join('\n')
}

export function formatReleaseReportMarkdown(model: ReleaseReportModel) {
  const { release, readiness, summary } = model

  return [
    `# QA Release Report: ${release.name}`,
    '',
    '## Release Overview',
    `- Version: ${release.version}`,
    `- Target date: ${release.targetDate}`,
    `- Release status: ${release.status}`,
    `- Release notes: ${formatOptional(release.notes)}`,
    '',
    '## Calculated Readiness',
    `- Status: ${readiness.status}`,
    ...readiness.reasons.map((reason) => `- ${formatExecutionReadinessReason(reason)}`),
    '- Scope: recorded execution results and global open bugs/risks; not final release approval. Review source evidence separately.',
    '',
    '## Execution Summary',
    `- Total: ${summary.total}`,
    `- Passed: ${summary.passed}`,
    `- Failed: ${summary.failed}`,
    `- Blocked: ${summary.blocked}`,
    `- Awaiting run: ${summary.notRun}`,
    '',
    '## Failed Tests',
    formatList(model.failedTests, formatTestItem),
    '',
    '## Blocked Tests',
    formatList(model.blockedTests, formatTestItem),
    '',
    '## Tests Awaiting Run',
    formatList(model.notRunTests, (item) =>
      `- ${item.title} (Area: ${item.area}; Priority: ${item.priority})`,
    ),
    '',
    '## Execution Notes',
    formatList(
      model.executionNotes,
      (note) => `- ${note.title} (${formatExecutionResult(note.result)}): ${note.notes}`,
    ),
    '',
    '## Bugs Summary',
    GLOBAL_QUALITY_SIGNAL_NOTE,
    formatList(model.globalBugs, formatSignal),
    '',
    '## Risks Summary',
    GLOBAL_QUALITY_SIGNAL_NOTE,
    formatList(model.globalRisks, formatSignal),
    '',
    '## Recommended Next Actions',
    formatList(model.recommendedActions, (action) => `- ${action}`),
  ].join('\n')
}
