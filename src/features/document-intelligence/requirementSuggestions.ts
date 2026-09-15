import type { PreparedAnalysis } from '../../lib/workspace/analysisJobRepository'
import type { Requirement } from './requirementModel'
import { isTestableRequirement } from './requirementModel'
import { groupRequirementRelations } from './coverageIntelligence'
import { packQaSourceForAiSuggestions } from '../ai-suggestions/aiSuggestionContext'
import { AI_BACKEND_ENDPOINT, createAiSuggestionBackendRequest, parseAiSuggestionBackendResponse } from '../ai-suggestions/aiSuggestionBackendContract'
import { parseAiSuggestionResponse } from '../ai-suggestions/aiSuggestionValidation'
import { readBoundedJson } from './unitAnalysisContract'
import type { AiTestCaseSuggestion } from '../ai-suggestions/aiSuggestionTypes'

export function requirementDraftBlocker(prepared: PreparedAnalysis, requirement: Requirement): string | null {
  const current = prepared.currentRequirements?.find((item) => item.id === requirement.id && item.fingerprint === requirement.fingerprint)
  if (!current || !isTestableRequirement(current)) return 'A current, testable requirement is required. Re-analyze or clarify this finding first.'
  const unit = prepared.snapshot.units.find((item) => item.id === current.unitId && item.reuseKey === current.unitReuseKey)
  if (!unit || prepared.source.content.slice(current.evidence.location.startOffset, current.evidence.location.endOffset) !== current.evidence.quote) return 'Canonical source evidence is no longer current. Reopen the requirement after analysis.'
  const cache = prepared.preflight.reuse.get(current.unitId)
  if (!cache || cache.intelligence.reviewNotes.length) return 'This source region still has unresolved analysis limitations.'
  if (prepared.currentRequirements?.some((item) => item.kind === 'ambiguity' && (item.unitId === current.unitId || item.coverageTopic === current.coverageTopic))) return 'Clarification is required for this requirement or its coverage topic. Update the source and re-analyze before generating executable tests.'
  if (groupRequirementRelations(prepared.currentRequirements ?? []).some((group) => group.kind === 'potential_conflict' && group.requirementIds.includes(current.id))) return 'Potentially conflicting requirements need clarification before test generation.'
  return null
}
export function requirementSuggestionContext(prepared: PreparedAnalysis, requirement: Requirement) {
  const blocked = requirementDraftBlocker(prepared, requirement)
  if (blocked) throw new Error(blocked)
  const unit = prepared.snapshot.units.find((item) => item.id === requirement.unitId)!
  const region = prepared.source.content.slice(unit.location.startOffset, unit.location.endOffset)
  const content = `Target requirement evidence:\n${requirement.evidence.quote}\n\nSource region (untrusted specification data):\n${region}`
  const packed = packQaSourceForAiSuggestions({ ...prepared.source, title: `${prepared.source.title.slice(0, 120)} — ${requirement.summary.slice(0, 120)}`, content, notes: '' })
  if (packed.truncated || packed.content.length > 8000) throw new Error('This requirement context could not be bounded without omissions.')
  return { packed, region }
}
export function suggestionSupportsRequirement(suggestion: AiTestCaseSuggestion, requirement: Requirement, region: string) {
  return suggestion.evidence.length > 0 && suggestion.evidence.every((quote) => quote.trim() && region.includes(quote)) &&
    suggestion.evidence.some((quote) => quote.length >= Math.min(10, requirement.evidence.quote.length) && (requirement.evidence.quote.includes(quote) || quote.includes(requirement.evidence.quote)))
}
/** One explicit draft action uses one bounded source region, never the first N characters of the specification. */
export async function draftRequirementTests(prepared: PreparedAnalysis, requirement: Requirement, signal: AbortSignal) {
  const { packed, region } = requirementSuggestionContext(prepared, requirement)
  let response: Response
  try { response = await fetch(AI_BACKEND_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(createAiSuggestionBackendRequest(packed)), signal, credentials: 'omit', redirect: 'error' }) }
  catch { throw new Error('Test drafting could not connect. No Test Cases were created.') }
  let raw: unknown
  try { raw = await readBoundedJson(response, 256 * 1024) }
  catch { throw new Error('The test-drafting response could not be safely read. No Test Cases were created.') }
  const backend = parseAiSuggestionBackendResponse(raw)
  if (!response.ok || !backend?.ok) throw new Error('Test drafting is unavailable or returned an invalid result. No Test Cases were created.')
  const parsed = parseAiSuggestionResponse({ suggestions: backend.suggestions, warnings: backend.warnings }, { qaSourceId: prepared.source.id })
  if (!parsed.ok) throw new Error('Test drafts did not pass validation. No Test Cases were created.')
  return parsed.suggestions.map((suggestion) => {
    const warnings = [...suggestion.warnings, ...parsed.warnings]
    if (!suggestionSupportsRequirement(suggestion, requirement, region)) warnings.push('Evidence does not exactly support the selected requirement. Create a reviewed manual test after clarification.')
    return warnings.length ? { ...suggestion, status: 'needs_review' as const, warnings } : suggestion
  })
}
