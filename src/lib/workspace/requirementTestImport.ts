import type { AiTestCaseSuggestion } from '../../features/ai-suggestions/aiSuggestionTypes'
import { convertReadyAiSuggestionsToTestCases } from '../../features/ai-suggestions/aiSuggestionConversion'
import { createRequirementTestLink } from '../../features/document-intelligence/requirementTraceability'
import type { Requirement } from '../../features/document-intelligence/requirementModel'
import { requirementDraftBlocker, requirementSuggestionContext, suggestionSupportsRequirement } from '../../features/document-intelligence/requirementSuggestions'
import type { PreparedAnalysis } from './analysisJobRepository'
import type { WorkspaceClient } from './workspaceClient'
import { validateCoreCollection } from './workspaceSchema'
import { requirementSourceSetContext } from './requirementSourceSetContext'

/** Explicit QA approval imports tests AND their confirmed requirement links in one guarded transaction. */
export async function importRequirementTestDrafts(workspace: WorkspaceClient, prepared: PreparedAnalysis, requirement: Requirement, approved: AiTestCaseSuggestion[]) {
  const blocker = requirementDraftBlocker(prepared, requirement)
  if (blocker || approved.length === 0 || approved.length > 8 || approved.some((item) => item.qaSourceId !== requirement.sourceId)) throw new Error(blocker ?? 'Select ready drafts for this requirement before importing.')
  const { region } = requirementSuggestionContext(prepared, requirement)
  if (new Set(approved.map((item) => item.id)).size !== approved.length || approved.some((item) => !suggestionSupportsRequirement(item, requirement, region))) throw new Error('Selected drafts must have distinct identities and exact evidence for this requirement.')
  const related = await requirementSourceSetContext(workspace.repository, prepared, requirement)
  if (related.blocker) throw new Error(related.blocker)
  const tests = convertReadyAiSuggestionsToTestCases(approved, { now: new Date().toISOString(), createId: () => crypto.randomUUID() })
  if (tests.length !== approved.length) throw new Error('Only validated, ready drafts can be approved and imported.')
  validateCoreCollection('testCases', tests)
  const links = await Promise.all(tests.map((test) => createRequirementTestLink(requirement, test, new Date().toISOString())))
  const existing = await workspace.repository.readCollection('testCases')
  const nextOrder = existing.records.reduce((maximum, record) => Math.max(maximum, record.order), -1) + 1
  await workspace.repository.commit([
    { collection: 'testCases', put: tests.map((value, index) => ({ id: value.id, order: nextOrder + index, value })) },
    { collection: 'requirementTestLinks', put: links.map((value, order) => ({ id: value.id, sourceId: value.sourceId, order, value })) },
  ], { recordChecks: related.recordChecks,
  collectionChecks: [{ collection: 'testCases', version: existing.version },
    { collection: 'requirements', version: prepared.requirementVersion ?? -1 }, { collection: 'unitIntelligence', version: prepared.intelligenceVersion ?? -1 }, related.collectionCheck] })
  // The application collection hook subscribes to this completed, validated external transaction.
  let refreshWarning: string | null = null
  try { await workspace.refresh('testCases') }
  catch { refreshWarning = 'The tests and links were saved, but the library could not refresh. Reload the workspace; do not import these drafts again.' }
  return { tests, refreshWarning }
}
