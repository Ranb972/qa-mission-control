import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from 'react'
import { EmptyState } from '../../components/ui/EmptyState'
import type { AppView } from '../../components/layout/AppShell'
import { CoverageStart, CoverageWorkflow } from './CoverageStart'
import { SavedCoverageWorkspace } from './SavedCoverageWorkspace'
import { isNorthstarSource } from '../workspace-data/northstarDemo'
import { DocumentIntelligencePanel } from '../document-intelligence/DocumentIntelligencePanel'
import { useWorkspace } from '../../lib/workspace/workspaceContext'
import { sourceSuggestionGuard, SOURCE_SUGGESTION_BLOCKER } from '../../lib/workspace/sourceSuggestionGuard'
import { CONFLICT_ERROR } from '../../lib/workspace/workspaceRepository'
import type { WorkspaceSaveResult } from '../../lib/workspace/workspaceClient'
import { SummaryCard } from '../../components/ui/SummaryCard'
import { formatDateTime } from '../../lib/formatters'
import {
  createPersistedCoveragePlanRecord,
  createQaSourceFingerprint,
  findCoveragePlanForSource,
  getCoveragePlanFreshness,
  removeCoveragePlanForSource,
  upsertCoveragePlanRecord,
  type CoveragePlanFreshness,
  type PersistedCoveragePlanRecord,
} from '../../lib/storage/coveragePlanStorage'
import type { QaSourceSectionIndex } from '../qa-sources/qaSourceSections'
import type { QaSource } from '../qa-sources/qaSourceTypes'
import type { TestCase } from '../test-cases/testCaseTypes'
import {
  buildAiCoverageAreaSuggestionRequest,
} from './aiCoverageAreaSuggestionPrompt'
import type {
  AiCoverageAreaSuggestionProvider,
  AiCoverageAreaSuggestionResult,
  AiCoverageAreaSuggestionSelectedArea,
  AiCoverageAreaTestCaseSuggestion,
} from './aiCoverageAreaSuggestionTypes'
import {
  groupAiCoverageAreaSuggestions,
  parseAiCoverageAreaSuggestionResponse,
} from './aiCoverageAreaSuggestionValidation'
import {
  AI_COVERAGE_PLAN_SOURCE_CONTEXT_MAX_CHARACTERS,
  buildAiCoveragePlanRequest,
} from './aiCoveragePlanPrompt'
import {
  createAiCoveragePlanSectionCatalog,
  getAiCoveragePlanSectionCatalogRuntimeContext,
} from './aiCoveragePlanSectionContext'
import { resolveAiCoveragePlanSectionRefs } from './aiCoveragePlanSectionRefResolution'
import { resolveAiMergedCoveragePlanSectionRefs } from './aiMergedCoveragePlanSectionRefResolution'
import type {
  AiCoveragePlan,
  AiCoveragePlanProvider,
  AiCoveragePlanReadiness,
  AiCoveragePlanSectionContext,
} from './aiCoveragePlanTypes'
import { parseAiCoveragePlanResponse } from './aiCoveragePlanValidation'
import {
  convertReadyAiSuggestionsToTestCases,
} from './aiSuggestionConversion'
import {
  packQaSourceForAiSuggestions,
} from './aiSuggestionContext'
import { buildAiSuggestionRequest } from './aiSuggestionPrompt'
import {
  AI_COVERAGE_AREA_SUGGESTION_PROVIDER_UNAVAILABLE_MESSAGE,
  AI_COVERAGE_PLAN_PROVIDER_UNAVAILABLE_MESSAGE,
  AI_PROVIDER_UNAVAILABLE_MESSAGE,
  unavailableAiCoverageAreaSuggestionProvider,
  unavailableAiCoveragePlanProvider,
  unavailableAiSuggestionProvider,
} from './aiSuggestionProvider'
import type {
  AiSuggestionProvider,
  AiSuggestionStatus,
  AiTestCaseSuggestion,
  PackedQaSourceContext,
} from './aiSuggestionTypes'
import {
  groupAiSuggestions,
  parseAiSuggestionResponse,
} from './aiSuggestionValidation'
import {
  GlobalCoverageMergeCandidateReview,
  type GlobalCoverageMergeReviewState,
} from './GlobalCoverageMergeCandidateReview'
import type { PersistedSectionCoveragePlanRecord } from './aiSectionCoveragePlanTypes'
import {
  createInitialAiSuggestionsWorkflowState,
  type AiSuggestionsMode,
  type AiSuggestionsSourceRevision,
  type AiSuggestionsWorkflowState,
} from './aiSuggestionsWorkflowState'

type AiSuggestionsPageProps = {
  onNavigate?: (view: AppView) => void
  qaSources: QaSource[]
  testCases: TestCase[]
  onChange: (testCases: TestCase[]) => void | WorkspaceSaveResult | Promise<void | WorkspaceSaveResult>
  selectedQaSourceId?: string
  onSelectedQaSourceChange?: (sourceId: string) => void
  workflowState?: AiSuggestionsWorkflowState
  onWorkflowStateChange?: Dispatch<SetStateAction<AiSuggestionsWorkflowState>>
  savedCoveragePlans?: PersistedCoveragePlanRecord[]
  onSavedCoveragePlansChange?: (coveragePlans: PersistedCoveragePlanRecord[]) => void | { ok: boolean; error: string | null } | Promise<{ ok: boolean; error: string | null }>
  sourceSectionIndexes?: QaSourceSectionIndex[]
  sectionCoveragePlanRecords?: PersistedSectionCoveragePlanRecord[]
  provider?: AiSuggestionProvider
  coveragePlanProvider?: AiCoveragePlanProvider
  coverageAreaSuggestionProvider?: AiCoverageAreaSuggestionProvider
  globalCoverageMergeReviewState?: GlobalCoverageMergeReviewState | null
  onRequestGlobalCoverageMergeSave?: () => void
  onCancelGlobalCoverageMergeSave?: () => void
  onConfirmGlobalCoverageMergeSave?: () => void
  onDiscardGlobalCoverageMergeCandidate?: () => void
}

type WorkflowFieldValue<T> = T | ((current: T) => T)

function resolveWorkflowFieldValue<T>(
  value: WorkflowFieldValue<T>,
  current: T,
) {
  return typeof value === 'function'
    ? (value as (currentValue: T) => T)(current)
    : value
}

const STATUS_LABELS: Record<AiSuggestionStatus, string> = {
  ready: 'Ready',
  needs_review: 'Needs review',
  rejected: 'Rejected',
}

const STATUS_TONES: Record<AiSuggestionStatus, string> = {
  ready: 'positive',
  needs_review: 'warning',
  rejected: 'critical',
}

const COVERAGE_READINESS_LABELS: Record<AiCoveragePlanReadiness, string> = {
  source_backed: 'Source-backed',
  needs_review: 'Needs review',
  blocked_by_ambiguity: 'Blocked by ambiguity',
}

const COVERAGE_READINESS_TONES: Record<AiCoveragePlanReadiness, string> = {
  source_backed: 'positive',
  needs_review: 'warning',
  blocked_by_ambiguity: 'critical',
}

const AREA_SUGGESTION_STATUS_TONES = {
  Ready: 'positive',
  'Needs review': 'warning',
  Rejected: 'critical',
} as const

const COVERAGE_AREA_PROGRESS_TONES = {
  'Not started': 'outline',
  'Generated this session': 'warning',
  Imported: 'positive',
  'Blocked by ambiguity': 'critical',
} as const

type CoverageAreaProgress = keyof typeof COVERAGE_AREA_PROGRESS_TONES

type CoveragePlanPersistenceState = {
  status: 'loaded' | 'stale'
  analyzedAt: string
  reasons: string[]
} | null

let fallbackSuggestionTestCaseId = 0

function createAiSuggestionsSourceRevision(
  qaSource: QaSource,
): AiSuggestionsSourceRevision {
  return {
    qaSourceId: qaSource.id,
    qaSourceCreatedAt: qaSource.createdAt,
    qaSourceUpdatedAt: qaSource.updatedAt,
    sourceFingerprint: createQaSourceFingerprint(qaSource),
  }
}

function isSameAiSuggestionsSourceRevision(
  left: AiSuggestionsSourceRevision | null,
  right: AiSuggestionsSourceRevision | null,
) {
  return Boolean(
    left &&
      right &&
      left.qaSourceId === right.qaSourceId &&
      left.qaSourceCreatedAt === right.qaSourceCreatedAt &&
      left.qaSourceUpdatedAt === right.qaSourceUpdatedAt &&
      left.sourceFingerprint === right.sourceFingerprint,
  )
}

function getAiSuggestionsSourceRevisionKey(
  sourceRevision: AiSuggestionsSourceRevision | null,
) {
  return sourceRevision
    ? [
        sourceRevision.qaSourceId,
        sourceRevision.qaSourceCreatedAt,
        sourceRevision.qaSourceUpdatedAt,
        sourceRevision.sourceFingerprint,
      ].join('\u001f')
    : null
}

function hasSourceBoundTransientState(state: AiSuggestionsWorkflowState) {
  return Boolean(
    state.transientSourceRevision ||
      state.suggestions.length > 0 ||
      state.selectedSuggestionIds.length > 0 ||
      state.importedSuggestionIds.length > 0 ||
      state.selectedCoverageArea ||
      state.coverageAreaSuggestionResult ||
      state.providerError ||
      state.providerWarnings.length > 0 ||
      state.coveragePlanError ||
      state.coveragePlanWarnings.length > 0 ||
      state.coverageAreaSuggestionError ||
      state.coverageAreaSuggestionWarnings.length > 0 ||
      state.selectedAreaSuggestionIds.length > 0 ||
      state.importedAreaSuggestionIds.length > 0 ||
      state.importSummary ||
      state.areaImportSummary,
  )
}

function clearSourceBoundTransientState(
  state: AiSuggestionsWorkflowState,
): AiSuggestionsWorkflowState {
  return {
    ...state,
    transientSourceRevision: null,
    suggestions: [],
    selectedSuggestionIds: [],
    importedSuggestionIds: [],
    selectedCoverageArea: null,
    coverageAreaSuggestionResult: null,
    providerError: null,
    providerWarnings: [],
    coveragePlanError: null,
    coveragePlanWarnings: [],
    coverageAreaSuggestionError: null,
    coverageAreaSuggestionWarnings: [],
    selectedAreaSuggestionIds: [],
    importedAreaSuggestionIds: [],
    importSummary: null,
    areaImportSummary: null,
  }
}

function createSuggestionTestCaseId() {
  const randomId = globalThis.crypto?.randomUUID?.()

  if (randomId) {
    return randomId
  }

  fallbackSuggestionTestCaseId += 1
  return `ai-suggested-test-case-${Date.now()}-${fallbackSuggestionTestCaseId}`
}

function formatCount(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`
}

function formatCharacterCount(count: number) {
  return `${count.toLocaleString()} characters`
}

function getSectionDistributionLabel(sectionIndex: QaSourceSectionIndex) {
  const counts = sectionIndex.sections.map((section) => section.characterCount)
  const smallest = Math.min(...counts)
  const largest = Math.max(...counts)

  if (smallest === largest) {
    return `${formatCharacterCount(largest)} per section`
  }

  return `${formatCharacterCount(smallest)} to ${formatCharacterCount(largest)} per section`
}

function normalizeComparableText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function getSuggestionHeading(suggestion: AiTestCaseSuggestion) {
  return suggestion.title || 'Untitled suggestion'
}

function getAreaSuggestionHeading(
  suggestion: AiCoverageAreaTestCaseSuggestion,
) {
  return suggestion.title || 'Untitled area suggestion'
}

function getAreaSuggestionReasonSummary(
  suggestion: AiCoverageAreaTestCaseSuggestion,
) {
  if (suggestion.warnings.length > 0) {
    return `Warning: ${suggestion.warnings[0]}`
  }

  if (suggestion.assumptions.length > 0) {
    return `Assumption: ${suggestion.assumptions[0]}`
  }

  if (suggestion.evidence.length > 0) {
    return `Evidence: ${suggestion.evidence[0]}`
  }

  if (suggestion.status === 'Ready') {
    return 'Ready for QA approval after reviewing details.'
  }

  if (suggestion.status === 'Rejected') {
    return 'Rejected suggestions cannot be imported as-is.'
  }

  return 'Review source support before approving any test design.'
}

function mapAreaSuggestionToImportSuggestion(
  suggestion: AiCoverageAreaTestCaseSuggestion,
): AiTestCaseSuggestion {
  return {
    id: suggestion.id,
    qaSourceId: suggestion.qaSourceId,
    status: suggestion.status === 'Ready' ? 'ready' : 'needs_review',
    title: suggestion.title,
    area: suggestion.area,
    priority: suggestion.priority,
    type: suggestion.type,
    preconditions: suggestion.preconditions,
    structuredSteps: suggestion.structuredSteps,
    evidence: suggestion.evidence,
    assumptions: suggestion.assumptions,
    warnings: suggestion.warnings,
  }
}

function createSelectedAreaFromCoverageArea(
  area: AiCoveragePlan['coverageAreas'][number],
): AiCoverageAreaSuggestionSelectedArea {
  return {
    id: area.id,
    name: area.name,
    summary: area.summary,
    behaviors: area.behaviors,
    risks: area.risks,
    evidence: area.evidence,
    ambiguities: area.ambiguities,
    generationReadiness: area.generationReadiness,
    sourceSectionRefs: area.sourceSectionRefs ?? [],
  }
}

function getCoverageAreaProgress({
  area,
  areaResult,
  qaSourceId,
  testCases,
}: {
  area: AiCoveragePlan['coverageAreas'][number]
  areaResult: AiCoverageAreaSuggestionResult | null
  qaSourceId: string
  testCases: TestCase[]
}): CoverageAreaProgress {
  if (area.generationReadiness === 'blocked_by_ambiguity') {
    return 'Blocked by ambiguity'
  }

  const comparableAreaName = normalizeComparableText(area.name)
  const hasImportedTestCase = testCases.some(
    (testCase) =>
      testCase.qaSourceId === qaSourceId &&
      normalizeComparableText(testCase.area) === comparableAreaName,
  )

  if (hasImportedTestCase) {
    return 'Imported'
  }

  if (
    areaResult &&
    normalizeComparableText(areaResult.areaScope.name) === comparableAreaName
  ) {
    return 'Generated this session'
  }

  return 'Not started'
}

function SuggestionNotes({
  label,
  values,
}: {
  label: string
  values: string[]
}) {
  if (values.length === 0) {
    return null
  }

  return (
    <div className="description-block">
      <span className="field-label">{label}</span>
      <ul className="ai-suggestion-note-list">
        {values.map((value) => (
          <li key={value}>{value}</li>
        ))}
      </ul>
    </div>
  )
}

function SuggestionGroup({
  title,
  description,
  suggestions,
  selectedIds,
  importedIds,
  onToggleSelected,
  onReject,
}: {
  title: string
  description: string
  suggestions: AiTestCaseSuggestion[]
  selectedIds: string[]
  importedIds: string[]
  onToggleSelected: (suggestionId: string) => void
  onReject: (suggestionId: string) => void
}) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <div className="panel-heading__content">
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        <span className="panel-caption">
          {formatCount(suggestions.length, 'suggestion')}
        </span>
      </div>

      {suggestions.length === 0 ? (
        <EmptyState
          title={`No ${title.toLowerCase()}`}
          description="Suggestions will appear here after a provider returns validated results."
        />
      ) : (
        <div className="test-case-list">
          {suggestions.map((suggestion) => {
            const isReady = suggestion.status === 'ready'
            const isImported = importedIds.includes(suggestion.id)
            const isSelected = selectedIds.includes(suggestion.id)

            return (
              <article
                key={suggestion.id}
                className="test-case-card"
                aria-label={getSuggestionHeading(suggestion)}
              >
                <div className="test-case-card__header">
                  <div>
                    <p className="meta-kicker">{suggestion.area || 'No area'}</p>
                    <h3>{getSuggestionHeading(suggestion)}</h3>
                  </div>

                  <div className="card-actions">
                    {isReady ? (
                      <label className="ai-suggestion-select">
                        <input
                          type="checkbox"
                          aria-label="Approve for import"
                          checked={isSelected}
                          disabled={isImported}
                          onChange={() => onToggleSelected(suggestion.id)}
                        />
                        {isImported ? 'Imported' : 'Approve for import'}
                      </label>
                    ) : null}
                    {suggestion.status !== 'rejected' && !isImported ? (
                      <button
                        type="button"
                        className="button button--secondary"
                        onClick={() => onReject(suggestion.id)}
                      >
                        Reject
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="badge-row">
                  <span
                    className={`badge badge--${STATUS_TONES[suggestion.status]}`}
                  >
                    {STATUS_LABELS[suggestion.status]}
                  </span>
                  <span className="badge badge--outline">
                    {suggestion.priority}
                  </span>
                  <span className="badge badge--outline">
                    {suggestion.type}
                  </span>
                  <span className="badge badge--outline">
                    {formatCount(suggestion.structuredSteps.length, 'step')}
                  </span>
                </div>

                <div className="description-grid">
                  <div className="description-block">
                    <span className="field-label">Preconditions</span>
                    <p>
                      {suggestion.preconditions ||
                        'No preconditions suggested.'}
                    </p>
                  </div>
                  <SuggestionNotes
                    label="Evidence to verify"
                    values={suggestion.evidence}
                  />
                  <SuggestionNotes
                    label="Assumptions"
                    values={suggestion.assumptions}
                  />
                  <SuggestionNotes label="Warnings" values={suggestion.warnings} />
                </div>

                <div className="structured-step-list">
                  {suggestion.structuredSteps.map((step, index) => (
                    <article key={step.id} className="structured-step">
                      <div className="structured-step__header">
                        <span className="badge badge--neutral">
                          Step {index + 1}
                        </span>
                      </div>
                      <div className="description-grid">
                        <div className="description-block">
                          <span className="field-label">Action</span>
                          <p>{step.action || 'Missing action'}</p>
                        </div>
                        <div className="description-block">
                          <span className="field-label">Expected Result</span>
                          <p>
                            {step.expectedResult ||
                              'Missing expected result'}
                          </p>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readStringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

function getCoverageProviderPayload(rawResponse: unknown) {
  if (isRecord(rawResponse) && 'coveragePlan' in rawResponse) {
    return {
      coveragePlan: rawResponse.coveragePlan,
      warnings: readStringList(rawResponse.warnings),
    }
  }

  return {
    coveragePlan: rawResponse,
    warnings: [],
  }
}

function getCoverageAreaSuggestionProviderPayload(rawResponse: unknown) {
  if (isRecord(rawResponse) && 'areaSuggestionResult' in rawResponse) {
    return {
      areaSuggestionResult: rawResponse.areaSuggestionResult,
      warnings: readStringList(rawResponse.warnings),
    }
  }

  return {
    areaSuggestionResult: rawResponse,
    warnings: [],
  }
}

function CoverageList({ label, values }: { label: string; values: string[] }) {
  if (values.length === 0) {
    return null
  }

  return (
    <div className="description-block">
      <span className="field-label">{label}</span>
      <ul className="ai-suggestion-note-list">
        {values.map((value) => (
          <li key={value}>{value}</li>
        ))}
      </ul>
    </div>
  )
}

function CoverageDecisionList({
  label,
  values,
  emptyMessage,
}: {
  label: string
  values: string[]
  emptyMessage: string
}) {
  return (
    <div className="description-block">
      <span className="field-label">{label}</span>
      {values.length === 0 ? (
        <p>{emptyMessage}</p>
      ) : (
        <ul className="ai-suggestion-note-list">
          {values.map((value) => (
            <li key={value}>{value}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

function AreaSuggestionGroup({
  title,
  description,
  suggestions,
  selectedIds,
  importedIds,
  activeSuggestionId,
  allowSelection = true,
  onActiveSuggestionChange,
  onToggleSelected,
  onReject,
}: {
  title: string
  description: string
  suggestions: AiCoverageAreaTestCaseSuggestion[]
  selectedIds: string[]
  importedIds: string[]
  activeSuggestionId: string | null
  allowSelection?: boolean
  onActiveSuggestionChange: (suggestionId: string | null) => void
  onToggleSelected: (suggestionId: string) => void
  onReject: (suggestionId: string) => void
}) {
  return (
    <section className="coverage-review-lane" aria-label={title}>
      <div className="coverage-review-lane__header">
        <div>
          <h4>{title}</h4>
          <p>{description}</p>
        </div>
        <span>{formatCount(suggestions.length, 'suggestion')}</span>
      </div>

      {suggestions.length === 0 ? (
        <div className="coverage-empty-state">
          Area suggestions will appear here after validated generation.
        </div>
      ) : (
        <div className="coverage-suggestion-list">
          {suggestions.map((suggestion) => {
            const isReady = suggestion.status === 'Ready'
            const isImported = importedIds.includes(suggestion.id)
            const isSelected = selectedIds.includes(suggestion.id)
            const isActive = activeSuggestionId === suggestion.id
            const reasonSummary = getAreaSuggestionReasonSummary(suggestion)

            return (
              <article
                key={suggestion.id}
                className={`coverage-suggestion-card coverage-suggestion-card--compact${
                  isActive ? ' coverage-suggestion-card--active' : ''
                }`}
                aria-label={getAreaSuggestionHeading(suggestion)}
              >
                <div className="coverage-suggestion-card__header">
                  <div>
                    <p className="meta-kicker">{suggestion.area || 'No area'}</p>
                    <h4>{getAreaSuggestionHeading(suggestion)}</h4>
                  </div>

                  <div className="card-actions">
                    {isReady && allowSelection ? (
                      <label className="ai-suggestion-select">
                        <input
                          type="checkbox"
                          aria-label="Approve for import"
                          checked={isSelected}
                          disabled={isImported}
                          onChange={() => onToggleSelected(suggestion.id)}
                        />
                        {isImported ? 'Imported' : 'Approve for import'}
                      </label>
                    ) : null}
                    <button
                      type="button"
                      className="button button--secondary button--compact"
                      aria-expanded={isActive}
                      onClick={() =>
                        onActiveSuggestionChange(isActive ? null : suggestion.id)
                      }
                    >
                      {isActive ? 'Hide details' : 'Review details'}
                    </button>
                    {suggestion.status !== 'Rejected' && !isImported ? (
                      <button
                        type="button"
                        className="button button--secondary button--compact"
                        onClick={() => onReject(suggestion.id)}
                      >
                        Reject
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="badge-row">
                  <span
                    className={`badge badge--${
                      AREA_SUGGESTION_STATUS_TONES[suggestion.status]
                    }`}
                  >
                    {suggestion.status}
                  </span>
                  <span className="badge badge--outline">
                    {suggestion.confidence} confidence
                  </span>
                  <span className="badge badge--outline">
                    {suggestion.priority}
                  </span>
                  <span className="badge badge--outline">
                    {suggestion.type}
                  </span>
                  <span className="badge badge--outline">
                    {formatCount(suggestion.structuredSteps.length, 'step')}
                  </span>
                </div>

                <p className="coverage-suggestion-card__reason">
                  {reasonSummary}
                </p>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}

function AreaSuggestionDetailPanel({
  suggestion,
}: {
  suggestion: AiCoverageAreaTestCaseSuggestion | null
}) {
  if (!suggestion) {
    return (
      <section
        className="coverage-suggestion-detail-panel coverage-suggestion-detail-panel--empty"
        aria-label="Selected suggestion details"
      >
        <p className="meta-kicker">Selected suggestion</p>
        <h4>Choose Review details</h4>
        <p>
          Pick one generated suggestion to inspect preconditions, source
          evidence, steps, expected results, warnings, and assumptions.
        </p>
      </section>
    )
  }

  return (
    <section
      className="coverage-suggestion-detail-panel"
      aria-label="Selected suggestion details"
    >
      <div className="coverage-suggestion-detail-panel__heading">
        <div>
          <p className="meta-kicker">Selected suggestion</p>
          <h4>{getAreaSuggestionHeading(suggestion)}</h4>
        </div>
        <div className="badge-row">
          <span
            className={`badge badge--${
              AREA_SUGGESTION_STATUS_TONES[suggestion.status]
            }`}
          >
            {suggestion.status}
          </span>
          <span className="badge badge--outline">
            {suggestion.confidence} confidence
          </span>
          <span className="badge badge--outline">
            {formatCount(suggestion.structuredSteps.length, 'step')}
          </span>
        </div>
      </div>

      <div className="description-grid">
        <div className="description-block">
          <span className="field-label">Preconditions</span>
          <p>{suggestion.preconditions || 'No preconditions suggested.'}</p>
        </div>
        <SuggestionNotes
          label="Evidence to verify"
          values={suggestion.evidence}
        />
        <SuggestionNotes label="Assumptions" values={suggestion.assumptions} />
        <SuggestionNotes label="Warnings" values={suggestion.warnings} />
      </div>

      <div className="structured-step-list">
        {suggestion.structuredSteps.map((step, index) => (
          <article key={step.id} className="structured-step">
            <div className="structured-step__header">
              <span className="badge badge--neutral">Step {index + 1}</span>
            </div>
            <div className="description-grid">
              <div className="description-block">
                <span className="field-label">Action</span>
                <p>{step.action || 'Missing action'}</p>
              </div>
              <div className="description-block">
                <span className="field-label">Expected Result</span>
                <p>{step.expectedResult || 'Missing expected result'}</p>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function getCoverageLevelTone(
  level: AiCoverageAreaSuggestionResult['coverageAssessment']['coverageLevel'],
) {
  if (level === 'High') {
    return 'positive'
  }

  if (level === 'Partial') {
    return 'warning'
  }

  return 'critical'
}

function CoverageDeckStat({
  label,
  value,
  tone = 'neutral',
}: {
  label: string
  value: number | string
  tone?: 'neutral' | 'positive' | 'warning' | 'critical'
}) {
  return (
    <div className={`coverage-deck-stat coverage-deck-stat--${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function getSectionRefPathLabel(
  sectionRef: AiCoveragePlan['coverageAreas'][number]['sourceSectionRefs'][number],
) {
  return sectionRef.path.length > 0
    ? sectionRef.path.join(' / ')
    : sectionRef.title
}

function formatSectionRefLocation(
  sectionRef: AiCoveragePlan['coverageAreas'][number]['sourceSectionRefs'][number],
) {
  const lineLabel =
    sectionRef.visibility === 'partial' ? 'visible lines' : 'lines'

  return `${sectionRef.ordinal}. ${getSectionRefPathLabel(sectionRef)} (${lineLabel} ${sectionRef.startLine}-${sectionRef.endLine})`
}

function SectionRefChips({
  refs,
  maxVisible = 3,
}: {
  refs: AiCoveragePlan['coverageAreas'][number]['sourceSectionRefs']
  maxVisible?: number
}) {
  if (refs.length === 0) {
    return null
  }

  const visibleRefs = refs.slice(0, maxVisible)
  const hiddenCount = refs.length - visibleRefs.length

  return (
    <ul className="coverage-section-ref-row" aria-label="Source section references">
      {visibleRefs.map((sectionRef) => (
        <li key={sectionRef.sectionId} className="coverage-section-chip">
          <span className="coverage-section-chip__title">{sectionRef.title}</span>
          {sectionRef.visibility === 'partial' ? (
            <span className="coverage-section-chip__partial">
              Partial source location
            </span>
          ) : null}
        </li>
      ))}
      {hiddenCount > 0 ? (
        <li className="coverage-section-chip coverage-section-chip--muted">
          +{hiddenCount}
        </li>
      ) : null}
    </ul>
  )
}

function SectionRefLocationDisclosure({
  refs,
  showDisclaimer = false,
}: {
  refs: AiCoveragePlan['coverageAreas'][number]['sourceSectionRefs']
  showDisclaimer?: boolean
}) {
  if (refs.length === 0) {
    return null
  }

  return (
    <div className="coverage-source-locations">
      <details className="coverage-details coverage-source-locations__details">
        <summary>
          View {formatCount(refs.length, 'source location')}
        </summary>
        <ul className="ai-suggestion-note-list coverage-source-locations__list">
          {refs.map((sectionRef) => (
            <li key={sectionRef.sectionId}>
              <span className="coverage-source-location__path">
                {formatSectionRefLocation(sectionRef)}
              </span>
            </li>
          ))}
        </ul>
      </details>
      {showDisclaimer ? (
        <p className="coverage-source-locations__disclaimer">
          Sections identify source locations, not coverage completeness or QA
          approval.
        </p>
      ) : null}
    </div>
  )
}

function CoverageAreaDetails({
  area,
}: {
  area: AiCoveragePlan['coverageAreas'][number]
}) {
  const sourceSectionRefs = area.sourceSectionRefs ?? []

  return (
    <details className="coverage-details coverage-details--compact">
      <summary>Evidence and ambiguity notes</summary>
      <div className="description-grid">
        <CoverageList label="Behaviors" values={area.behaviors} />
        <CoverageList label="Risks" values={area.risks} />
        <CoverageList label="Evidence" values={area.evidence} />
        <CoverageList label="Ambiguities" values={area.ambiguities} />
        {sourceSectionRefs.length > 0 ? (
          <div className="description-block">
            <span className="field-label">Source locations</span>
            <SectionRefLocationDisclosure refs={sourceSectionRefs} />
          </div>
        ) : null}
      </div>
    </details>
  )
}

function CoverageSourceDescription({
  activePackedSource,
  activeSourceSectionIndex,
}: {
  activePackedSource: PackedQaSourceContext | null
  activeSourceSectionIndex: QaSourceSectionIndex | null
}) {
  if (!activePackedSource) {
    return null
  }

  return (
    <>
      <div className="description-block">
        <span className="field-label">Selected source</span>
        <p>
          {activePackedSource.title} updated{' '}
          {formatDateTime(activePackedSource.updatedAt)}.
        </p>
      </div>
      <div className="description-block">
        <span className="field-label">Source status</span>
        <p>
          {activePackedSource.sourceType} - {activePackedSource.status}
        </p>
      </div>
      <div className="description-block">
        <span className="field-label">Source preview</span>
        <p className="qa-source-preview">{activePackedSource.preview}</p>
      </div>
      {activeSourceSectionIndex ? (
        <div className="description-block">
          <span className="field-label">Source structure</span>
          <p>
            {formatCount(activeSourceSectionIndex.sections.length, 'section')}{' '}
            detected. {getSectionDistributionLabel(activeSourceSectionIndex)}.
            Sections identify source locations, not coverage completeness or QA
            approval.
          </p>
        </div>
      ) : null}
      {activeSourceSectionIndex?.warnings.length ? (
        <CoverageList
          label="Source structure warnings"
          values={activeSourceSectionIndex.warnings}
        />
      ) : null}
      {activeSourceSectionIndex ? (
        <CoverageList
          label="Detected sections"
          values={activeSourceSectionIndex.sections
            .slice(0, 8)
            .map(
              (section) =>
                `${section.ordinal}. ${section.path.join(' / ')} - ${formatCharacterCount(section.characterCount)}`,
            )}
        />
      ) : null}
      <CoverageList
        label="Included"
        values={activePackedSource.privacySummary.included}
      />
      <CoverageList
        label="Excluded"
        values={activePackedSource.privacySummary.excluded}
      />
    </>
  )
}

function CoverageSourceDetails({
  activePackedSource,
  activeSourceSectionIndex,
}: {
  activePackedSource: PackedQaSourceContext | null
  activeSourceSectionIndex: QaSourceSectionIndex | null
}) {
  if (!activePackedSource) {
    return null
  }

  return (
    <details className="coverage-details">
      <summary>Source and evidence details</summary>
      <div className="description-grid">
        <CoverageSourceDescription
          activePackedSource={activePackedSource}
          activeSourceSectionIndex={activeSourceSectionIndex}
        />
      </div>
    </details>
  )
}

function CoverageRequestScope({
  activePackedSource,
  sectionContext,
}: {
  activePackedSource: PackedQaSourceContext | null
  sectionContext: AiCoveragePlanSectionContext
}) {
  if (!activePackedSource) {
    return null
  }

  const visibleCharacterCount = activePackedSource.packedCharacterCount
  const originalCharacterCount = activePackedSource.originalCharacterCount
  const hiddenCharacterCount = Math.max(
    0,
    originalCharacterCount - visibleCharacterCount,
  )

  return (
    <section
      className={`coverage-request-scope${
        activePackedSource.truncated
          ? ' coverage-request-scope--partial'
          : ''
      }`}
      aria-labelledby="coverage-request-scope-heading"
    >
      <div className="coverage-request-scope__heading">
        <div>
          <p className="meta-kicker">Before you analyze</p>
          <h4 id="coverage-request-scope-heading">
            Request scope:{' '}
            {activePackedSource.truncated ? 'Partial source' : 'Full source'}
          </h4>
        </div>
        <span
          className={`badge badge--${
            activePackedSource.truncated ? 'warning' : 'positive'
          }`}
        >
          {visibleCharacterCount.toLocaleString()} of{' '}
          {originalCharacterCount.toLocaleString()} characters
        </span>
      </div>

      <p>
        <strong>Analyze coverage</strong> makes one bounded server request using
        only the visible characters reported above. Selecting a source or area
        is local and sends nothing.
      </p>

      {sectionContext.available ? (
        <p>
          Source-location identities available: {sectionContext.visibleSectionCount}{' '}
          of {sectionContext.totalSectionCount} detected sections
          {sectionContext.omittedSectionCount > 0
            ? `; ${sectionContext.omittedSectionCount} omitted from the bounded reference catalog.`
            : '.'}
        </p>
      ) : null}

      {activePackedSource.truncated ? (
        <p className="coverage-request-scope__warning" role="status">
          {hiddenCharacterCount.toLocaleString()} characters are outside this
          optional excerpt request. The result cannot establish whole-document
          coverage. Use Analyze Entire Specification to process every source
          region without manual splitting.
        </p>
      ) : null}

      <ol className="coverage-request-sequence" aria-label="AI request sequence">
        <li>
          <strong>Select</strong>
          <span>Local only. No AI request.</span>
        </li>
        <li>
          <strong>Analyze or generate</strong>
          <span>One explicit, bounded AI request per action.</span>
        </li>
        <li>
          <strong>Review and approve</strong>
          <span>Human decision before any Test Case is created.</span>
        </li>
      </ol>
    </section>
  )
}

function CoveragePlanAmbiguityList({
  ambiguities,
  label = 'Coverage-map ambiguity questions',
}: {
  ambiguities: AiCoveragePlan['ambiguities']
  label?: string
}) {
  return (
    <div className="description-block">
      <span className="field-label">{label}</span>
      {ambiguities.length === 0 ? (
        <p>No coverage-map ambiguity questions were returned.</p>
      ) : (
        <ul className="ai-suggestion-note-list coverage-source-owner-list">
          {ambiguities.map((ambiguity) => (
            <li key={ambiguity.id}>
              <strong>{ambiguity.question}</strong> {ambiguity.whyItMatters}
              <SectionRefChips refs={ambiguity.sourceSectionRefs ?? []} />
              <SectionRefLocationDisclosure
                refs={ambiguity.sourceSectionRefs ?? []}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function CoverageNextGenerationAreaList({
  areas,
}: {
  areas: AiCoveragePlan['nextGenerationAreas']
}) {
  return (
    <div className="description-block">
      <span className="field-label">Suggested next generation areas</span>
      {areas.length === 0 ? (
        <p>No next generation areas were returned.</p>
      ) : (
        <ul className="ai-suggestion-note-list coverage-source-owner-list">
          {areas.map((area) => (
            <li key={area.id}>
              <strong>{area.title}</strong>: {area.rationale}
              <SectionRefChips refs={area.sourceSectionRefs ?? []} />
              <SectionRefLocationDisclosure refs={area.sourceSectionRefs ?? []} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function CoverageDimensionsContent({
  coveragePlan,
}: {
  coveragePlan: AiCoveragePlan | null
}) {
  if (!coveragePlan) {
    return (
      <div className="description-block">
        <span className="field-label">Coverage dimensions</span>
        <p>Analyze coverage to populate source-backed dimensions.</p>
      </div>
    )
  }

  return (
    <div className="description-grid">
      <CoverageDecisionList
        label="Actors / roles"
        values={coveragePlan.actors}
        emptyMessage="No actors or roles were extracted."
      />
      <CoverageDecisionList
        label="States / statuses"
        values={coveragePlan.states}
        emptyMessage="No states or statuses were extracted."
      />
      <CoverageDecisionList
        label="Inputs / validation"
        values={coveragePlan.inputs}
        emptyMessage="No inputs or validation dimensions were extracted."
      />
      <CoverageDecisionList
        label="Failure modes"
        values={coveragePlan.failureModes}
        emptyMessage="No failure modes were extracted."
      />
      <CoverageDecisionList
        label="Integration / provider risks"
        values={coveragePlan.integrationRisks}
        emptyMessage="No integration or provider risks were extracted."
      />
      <CoverageDecisionList
        label="Permissions / security"
        values={coveragePlan.permissionsSecurity}
        emptyMessage="No permissions or security dimensions were extracted."
      />
      <CoverageDecisionList
        label="Data / persistence"
        values={coveragePlan.dataPersistenceRules}
        emptyMessage="No data or persistence dimensions were extracted."
      />
      <CoverageNextGenerationAreaList areas={coveragePlan.nextGenerationAreas} />
    </div>
  )
}

function CoverageQueue({
  coveragePlan,
  selectedAreaId,
  areaProgress,
  isSelectingDisabled,
  onSelectArea,
}: {
  coveragePlan: AiCoveragePlan | null
  selectedAreaId: string
  areaProgress: Record<string, CoverageAreaProgress>
  isSelectingDisabled: boolean
  onSelectArea: (area: AiCoveragePlan['coverageAreas'][number]) => void
}) {
  return (
    <section
      className="coverage-deck-panel coverage-deck-panel--queue"
      aria-labelledby="coverage-queue-heading"
    >
      <div className="coverage-deck-panel__heading">
        <p className="meta-kicker">Global Coverage Plan</p>
        <h3 id="coverage-queue-heading">Coverage Queue</h3>
      </div>

      {!coveragePlan ? (
        <div className="coverage-empty-state">
          Analyze the selected source to populate source-backed areas.
        </div>
      ) : coveragePlan.coverageAreas.length === 0 ? (
        <div className="coverage-empty-state">
          The selected source did not produce source-backed coverage areas.
        </div>
      ) : (
        <div className="coverage-queue-list">
          {coveragePlan.coverageAreas.map((area) => {
            const isSelected = selectedAreaId === area.id
            const progress = areaProgress[area.id] ?? 'Not started'
            const sourceSectionRefs = area.sourceSectionRefs ?? []

            return (
              <article
                key={area.id}
                className={`coverage-queue-item${
                  isSelected ? ' coverage-queue-item--selected' : ''
                }`}
                aria-label={area.name}
              >
                <div className="coverage-queue-item__main">
                  <span
                    className={`coverage-queue-item__status coverage-queue-item__status--${
                      COVERAGE_READINESS_TONES[area.generationReadiness]
                    }`}
                    aria-hidden="true"
                  />
                  <div>
                    <h4>{area.name}</h4>
                    <p>{area.summary}</p>
                  </div>
                </div>

                <div className="coverage-queue-item__meta">
                  <span
                    className={`badge badge--${
                      COVERAGE_READINESS_TONES[area.generationReadiness]
                    }`}
                  >
                    {COVERAGE_READINESS_LABELS[area.generationReadiness]}
                  </span>
                  <span
                    className={`badge badge--${COVERAGE_AREA_PROGRESS_TONES[progress]}`}
                  >
                    {progress}
                  </span>
                  {sourceSectionRefs.length > 0 ? (
                    <span className="badge badge--outline coverage-queue-item__section-summary">
                      {sourceSectionRefs.length === 1
                        ? sourceSectionRefs[0].title
                        : formatCount(sourceSectionRefs.length, 'section')}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    className="button button--secondary button--compact"
                    onClick={() => onSelectArea(area)}
                    disabled={isSelectingDisabled || isSelected}
                  >
                    {isSelected ? 'Selected area' : 'Select area'}
                  </button>
                </div>

                <CoverageAreaDetails area={area} />
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}

function ActiveAreaCommandCard({
  selectedArea,
  coveragePlan,
  result,
  activePackedSource,
  activeSourceSectionIndex,
  areaGenerationError,
  areaGenerationWarnings,
  isGeneratingAreaSuggestions,
  canGenerateAreaSuggestions,
  onGenerateAreaSuggestions,
}: {
  selectedArea: AiCoverageAreaSuggestionSelectedArea | null
  coveragePlan: AiCoveragePlan | null
  result: AiCoverageAreaSuggestionResult | null
  activePackedSource: PackedQaSourceContext
  activeSourceSectionIndex: QaSourceSectionIndex | null
  areaGenerationError: string | null
  areaGenerationWarnings: string[]
  isGeneratingAreaSuggestions: boolean
  canGenerateAreaSuggestions: boolean
  onGenerateAreaSuggestions: (
    area: AiCoverageAreaSuggestionSelectedArea,
  ) => void
}) {
  const selectedAreaBlocked =
    selectedArea?.generationReadiness === 'blocked_by_ambiguity'
  const resultBlocked =
    result?.areaScope.generationReadiness === 'blocked_by_ambiguity'
  const canGenerateSelectedArea = Boolean(
    selectedArea &&
      canGenerateAreaSuggestions &&
      !selectedAreaBlocked &&
      !isGeneratingAreaSuggestions,
  )
  const readinessTone = selectedArea
    ? COVERAGE_READINESS_TONES[selectedArea.generationReadiness]
    : 'outline'
  const readinessLabel = selectedArea
    ? COVERAGE_READINESS_LABELS[selectedArea.generationReadiness]
    : 'Awaiting area'
  const firstRisk = selectedArea?.risks[0]
  const firstEvidence = selectedArea?.evidence[0]
  const selectedSectionRefs = selectedArea?.sourceSectionRefs ?? []
  const blockedReason =
    selectedArea?.ambiguities[0] ??
    'The source does not yet provide enough clear detail for safe generation.'

  return (
    <section
      className="coverage-deck-panel coverage-command-card"
      aria-labelledby="active-area-command-card-heading"
    >
      <div className="coverage-command-card__copy">
        <p className="meta-kicker">Selected coverage area</p>
        <h3 id="active-area-command-card-heading">
          {selectedArea ? selectedArea.name : 'No active area selected'}
        </h3>
        <p className="coverage-command-card__summary">
          {selectedArea
            ? selectedArea.summary
            : 'Pick one coverage area from the queue to generate area-scoped suggestions.'}
        </p>
      </div>

      <div className="coverage-decision-hub">
        <div
          className={`coverage-decision-status coverage-decision-status--${readinessTone}`}
        >
          <span>Status</span>
          <strong>{readinessLabel}</strong>
          <p>
            {selectedAreaBlocked
              ? 'Generation is blocked until ambiguity is clarified.'
              : 'Generation can proceed only with source-backed QA review.'}
          </p>
        </div>

        <div className="coverage-decision-body">
          <div>
            <span className="field-label">Why this area matters</span>
            <p>
              {selectedArea?.summary ??
                'Select an area to see why it matters before generating tests.'}
            </p>
            {firstRisk ? <p>Risk focus: {firstRisk}</p> : null}
            {firstEvidence ? <p>Evidence anchor: {firstEvidence}</p> : null}
          </div>

          <div
            className="coverage-decision-metrics"
            aria-label="Area decision metrics"
          >
            <span>
              Evidence: <strong>{selectedArea?.evidence.length ?? 0}</strong>
            </span>
            <span>
              Risks: <strong>{selectedArea?.risks.length ?? 0}</strong>
            </span>
            <span>
              Ambiguities:{' '}
              <strong>{selectedArea?.ambiguities.length ?? 0}</strong>
            </span>
            {selectedArea ? (
              <span>
                Sections: <strong>{selectedSectionRefs.length}</strong>
              </span>
            ) : null}
          </div>

          <SectionRefChips refs={selectedSectionRefs} maxVisible={3} />
          <SectionRefLocationDisclosure
            refs={selectedSectionRefs}
            showDisclaimer
          />
        </div>
      </div>

      {selectedAreaBlocked ? (
        <div className="coverage-deck-alert" role="status">
          Clarify ambiguity before generation: {blockedReason}
          <SectionRefChips refs={selectedSectionRefs} maxVisible={1} />
        </div>
      ) : null}

      {resultBlocked ? (
        <div className="coverage-deck-alert" role="status">
          Provider marked the selected area as blocked by ambiguity. Blocked
          areas cannot produce import-ready suggestions.
        </div>
      ) : null}

      {areaGenerationError ? (
        <div className="coverage-deck-alert" role="alert">
          {selectedArea
            ? formatAreaGenerationError(selectedArea.name, areaGenerationError)
            : areaGenerationError}
        </div>
      ) : null}

      {areaGenerationWarnings.length > 0 ? (
        <div className="coverage-deck-warning" role="status">
          {areaGenerationWarnings.join(' ')}
        </div>
      ) : null}

      {result && selectedArea ? (
        <div className="coverage-deck-status coverage-command-card__result" role="status">
          <span
            className={`badge badge--${getCoverageLevelTone(
              result.coverageAssessment.coverageLevel,
            )}`}
          >
            AI suggestion coverage for this area:{' '}
            {result.coverageAssessment.coverageLevel}
          </span>
          <span>
            Area suggestions generated for: {selectedArea.name}. Review the
            assessment and approve Ready suggestions below.
          </span>
        </div>
      ) : null}

      <div className="coverage-decision-details">
        <details className="coverage-details">
          <summary>Evidence used</summary>
          <div className="description-grid">
            <CoverageDecisionList
              label="Source-backed evidence excerpts"
              values={selectedArea?.evidence ?? []}
              emptyMessage="No evidence excerpts were extracted for this area."
            />
            <CoverageDecisionList
              label="Supported behaviors"
              values={selectedArea?.behaviors ?? []}
              emptyMessage="No supported behaviors were extracted for this area."
            />
          </div>
        </details>

        <details className="coverage-details">
          <summary>Risks to test</summary>
          <div className="description-grid">
            <CoverageDecisionList
              label="Area risks"
              values={selectedArea?.risks ?? []}
              emptyMessage="No explicit area risks were extracted."
            />
            <CoverageDecisionList
              label="Failure modes from coverage map"
              values={coveragePlan?.failureModes ?? []}
              emptyMessage="No failure modes were extracted from the coverage map."
            />
          </div>
        </details>

        <details className="coverage-details">
          <summary>Ambiguities to clarify</summary>
          <div className="description-grid">
            <CoverageDecisionList
              label="Area ambiguities"
              values={selectedArea?.ambiguities ?? []}
              emptyMessage="No area ambiguities were extracted."
            />
            <CoveragePlanAmbiguityList
              ambiguities={coveragePlan?.ambiguities ?? []}
            />
          </div>
        </details>

        <details className="coverage-details">
          <summary>Source scope</summary>
          <div className="description-grid">
            <CoverageSourceDescription
              activePackedSource={activePackedSource}
              activeSourceSectionIndex={activeSourceSectionIndex}
            />
          </div>
        </details>

        <details className="coverage-details">
          <summary>Coverage dimensions</summary>
          <CoverageDimensionsContent coveragePlan={coveragePlan} />
        </details>
      </div>

      {selectedArea ? (
        <div className="coverage-command-card__actions">
          <button
            type="button"
            className="button button--primary"
            onClick={() => {
              if (selectedArea) {
                onGenerateAreaSuggestions(selectedArea)
              }
            }}
            disabled={!canGenerateSelectedArea}
          >
            {selectedAreaBlocked
              ? 'Clarify ambiguity before generation'
              : isGeneratingAreaSuggestions
                ? 'Generating tests for selected area...'
                : 'Generate tests for selected area'}
          </button>
        </div>
      ) : null}
    </section>
  )
}

function ImportGate({
  coveragePlan,
  selectedArea,
  result,
  selectedReadyCount,
  importedCount,
  importSummary,
  onImportSelected,
}: {
  coveragePlan: AiCoveragePlan | null
  selectedArea: AiCoverageAreaSuggestionSelectedArea | null
  result: AiCoverageAreaSuggestionResult | null
  selectedReadyCount: number
  importedCount: number
  importSummary: string | null
  onImportSelected: () => void
}) {
  const groupedSuggestions = result
    ? groupAiCoverageAreaSuggestions(result.testCaseSuggestions)
    : { ready: [], needsReview: [], rejected: [] }
  const isBlocked = result?.areaScope.generationReadiness === 'blocked_by_ambiguity'
  const canImport = Boolean(result && selectedReadyCount > 0 && !isBlocked)
  const gateState = !coveragePlan
    ? 'Locked: awaiting coverage analysis.'
    : !selectedArea
      ? 'Awaiting area selection from the Coverage Queue.'
      : !result
        ? 'Awaiting selected-area suggestion generation.'
        : selectedReadyCount > 0
          ? `${formatCount(
              selectedReadyCount,
              'Ready suggestion',
            )} approved for import.`
          : groupedSuggestions.ready.length > 0
            ? 'Awaiting explicit QA approval for Ready suggestions.'
            : 'No Ready suggestions are approved for import.'

  return (
    <section
      className="coverage-deck-panel coverage-import-gate"
      aria-labelledby="coverage-import-gate-heading"
    >
      <div className="coverage-deck-panel__heading">
        <p className="meta-kicker">QA approval required</p>
        <h3 id="coverage-import-gate-heading">QA approval</h3>
      </div>

      <div
        className={`coverage-gate-state${
          !coveragePlan ? ' coverage-gate-state--locked' : ''
        }`}
        role="status"
      >
        {importSummary ?? gateState}
      </div>

      {result ? (
        <div className="coverage-gate-counts">
          <span>
            Ready <strong>{groupedSuggestions.ready.length}</strong>
          </span>
          <span>
            Needs review <strong>{groupedSuggestions.needsReview.length}</strong>
          </span>
          <span>
            Rejected <strong>{groupedSuggestions.rejected.length}</strong>
          </span>
          <span>
            Approved for import <strong>{selectedReadyCount}</strong>
          </span>
          <span>
            Created <strong>{importedCount}</strong>
          </span>
        </div>
      ) : null}

      {importSummary ? (
        <div className="coverage-deck-status" role="status">
          {importSummary}
        </div>
      ) : null}

      <p>
        Only Ready suggestions that QA explicitly approves can become Test
        Cases. Needs review, Rejected, and blocked suggestions stay out of
        import.
      </p>

      <button
        type="button"
        className="button button--primary"
        onClick={onImportSelected}
        disabled={!canImport}
      >
        Create Test Cases from approved Ready suggestions
      </button>
    </section>
  )
}

function CoverageAreaSuggestionResultPanel({
  result,
  selectedIds,
  importedIds,
  selectedReadyCount,
  importSummary,
  onToggleSelected,
  onReject,
}: {
  result: AiCoverageAreaSuggestionResult
  selectedIds: string[]
  importedIds: string[]
  selectedReadyCount: number
  importSummary: string | null
  onToggleSelected: (suggestionId: string) => void
  onReject: (suggestionId: string) => void
}) {
  const groupedSuggestions = groupAiCoverageAreaSuggestions(
    result.testCaseSuggestions,
  )
  const [activeSuggestionId, setActiveSuggestionId] = useState<string | null>(
    null,
  )
  const totalSuggestionCount = result.testCaseSuggestions.length
  const activeSuggestion =
    result.testCaseSuggestions.find(
      (suggestion) => suggestion.id === activeSuggestionId,
    ) ?? null
  const canSelectReadySuggestions =
    result.areaScope.generationReadiness !== 'blocked_by_ambiguity'
  const noReadySuggestionMessage =
    totalSuggestionCount === 0
      ? 'No import-ready suggestions were generated for this area. The source or selected area did not safely support executable suggestions.'
      : 'No import-ready suggestions were generated for this area. Review Needs review or Rejected suggestions for ambiguity, insufficient source evidence, or low source support.'

  return (
    <section
      className="coverage-review-inbox"
      aria-labelledby="ai-area-coverage-heading"
    >
      <div className="coverage-review-inbox__heading">
        <div>
          <p className="meta-kicker">AI Area Suggestion Coverage</p>
          <h3 id="ai-area-coverage-heading">
            Area suggestions generated for: {result.areaScope.name}
          </h3>
          <p>
            This assessment reflects AI-generated suggestions for the selected
            area and visible source only. It is not product coverage or saved
            Test Case library coverage.
          </p>
        </div>
        <span
          className={`badge badge--${getCoverageLevelTone(
            result.coverageAssessment.coverageLevel,
          )}`}
        >
          Coverage level: {result.coverageAssessment.coverageLevel}
        </span>
      </div>

      {importSummary ? (
        <div className="coverage-deck-status" role="status">
          {importSummary}
        </div>
      ) : null}

      <div className="summary-grid coverage-review-inbox__metrics">
        <SummaryCard
          label="Ready"
          value={groupedSuggestions.ready.length}
          description="Eligible for explicit QA approval."
          tone="positive"
        />
        <SummaryCard
          label="Needs review"
          value={groupedSuggestions.needsReview.length}
          description="Warnings, ambiguity, assumptions, or validation issues."
          tone="warning"
        />
        <SummaryCard
          label="Rejected"
          value={groupedSuggestions.rejected.length}
          description="Cannot be imported as-is."
          tone="critical"
        />
        <SummaryCard
          label="Approved for import"
          value={selectedReadyCount}
          description="Ready suggestions explicitly approved by QA."
          tone="neutral"
        />
      </div>

      {groupedSuggestions.ready.length === 0 ? (
        <div className="coverage-deck-alert" role="status">
          {noReadySuggestionMessage}
        </div>
      ) : null}

      <details className="coverage-details">
        <summary>Coverage assessment details</summary>
        <div className="description-grid">
          <CoverageList
            label="Covered behaviors"
            values={result.coverageAssessment.coveredBehaviors}
          />
          <CoverageList
            label="Missing behaviors"
            values={result.coverageAssessment.missingBehaviors}
          />
          <CoverageList
            label="Blocked / ambiguous items"
            values={result.coverageAssessment.blockedAmbiguousItems}
          />
          <CoverageList
            label="Suggested follow-up coverage"
            values={result.coverageAssessment.suggestedFollowUpCoverage}
          />
        </div>

        <div className="description-block">
          <span className="field-label">Stop reason</span>
          <p>{result.coverageAssessment.stopReason}</p>
        </div>
      </details>

      {result.warnings.length > 0 ? (
        <div className="coverage-deck-warning" role="status">
          {result.warnings.join(' ')}
        </div>
      ) : null}

      <div className="coverage-review-workbench">
        <div className="coverage-review-columns" aria-label="Suggestion inbox">
          <AreaSuggestionGroup
            title="Ready Area Suggestions"
            description="Ready suggestions require explicit QA approval before import."
            suggestions={groupedSuggestions.ready}
            selectedIds={selectedIds}
            importedIds={importedIds}
            activeSuggestionId={activeSuggestionId}
            allowSelection={canSelectReadySuggestions}
            onActiveSuggestionChange={setActiveSuggestionId}
            onToggleSelected={onToggleSelected}
            onReject={onReject}
          />
          <AreaSuggestionGroup
            title="Needs Review Area Suggestions"
            description="Review uncertainty, source support, assumptions, or warnings."
            suggestions={groupedSuggestions.needsReview}
            selectedIds={selectedIds}
            importedIds={importedIds}
            activeSuggestionId={activeSuggestionId}
            onActiveSuggestionChange={setActiveSuggestionId}
            onToggleSelected={onToggleSelected}
            onReject={onReject}
          />
          <AreaSuggestionGroup
            title="Rejected Area Suggestions"
            description="Rejected suggestions cannot be imported without correction."
            suggestions={groupedSuggestions.rejected}
            selectedIds={selectedIds}
            importedIds={importedIds}
            activeSuggestionId={activeSuggestionId}
            onActiveSuggestionChange={setActiveSuggestionId}
            onToggleSelected={onToggleSelected}
            onReject={onReject}
          />
        </div>
        <AreaSuggestionDetailPanel suggestion={activeSuggestion} />
      </div>
    </section>
  )
}

function isRateLimitErrorMessage(errorMessage: string) {
  return errorMessage.toLowerCase().includes('rate limit')
}

function formatAreaGenerationError(areaName: string, errorMessage: string) {
  const requestFailureDetail = isRateLimitErrorMessage(errorMessage)
    ? ' The request was sent, but no suggestions were generated.'
    : ' Review the source and try again.'

  return `Area suggestion generation failed for ${areaName}: ${errorMessage}${requestFailureDetail}`
}

function CoveragePlanDetails({
  coveragePlan,
}: {
  coveragePlan: AiCoveragePlan
}) {
  return (
    <details className="coverage-details coverage-plan-details">
      <summary>Coverage dimensions</summary>
      <div className="coverage-plan-details__grid">
        <CoverageDimensionsContent coveragePlan={coveragePlan} />
        <div className="description-grid">
          <CoveragePlanAmbiguityList
            ambiguities={coveragePlan.ambiguities}
            label="Ambiguities"
          />
        </div>
      </div>
    </details>
  )
}

function CoverageReviewInboxPlaceholder() {
  return (
    <section
      className="coverage-review-inbox coverage-review-inbox--empty"
      aria-labelledby="coverage-review-inbox-heading"
    >
      <div className="coverage-review-inbox__heading">
        <div>
          <p className="meta-kicker">Review Inbox</p>
          <h3 id="coverage-review-inbox-heading">Review Inbox</h3>
          <p>
            Awaiting selected-area generation. Ready, Needs review, and
            Rejected outputs will appear here after one eligible area is
            generated.
          </p>
        </div>
      </div>
    </section>
  )
}

function CoverageLaunchState({
  activePackedSource,
  activeSourceSectionIndex,
  sectionContext,
}: {
  activePackedSource: PackedQaSourceContext | null
  activeSourceSectionIndex: QaSourceSectionIndex | null
  sectionContext: AiCoveragePlanSectionContext
}) {
  return (
    <div className="coverage-launch-grid">
      <section
        className="coverage-deck-panel coverage-launch-state"
        aria-labelledby="coverage-launch-heading"
      >
        <div className="coverage-deck-panel__heading">
          <p className="meta-kicker">Optional AI analysis</p>
          <h3 id="coverage-launch-heading">
            {activePackedSource
              ? 'Ready to analyze selected QA source'
              : 'Select a QA Source to launch coverage analysis'}
          </h3>
        </div>

        <div className="coverage-launch-state__body">
          <div>
            <p>
              {activePackedSource ? 'Review the selected source text and its scope before analysis. AI can propose test areas; it cannot approve coverage.' : 'Choose a saved QA Source above. Review its text first so proposed coverage has a stable, inspectable reference.'}
            </p>
            <CoverageWorkflow />
          </div>
        </div>

        <CoverageRequestScope
          activePackedSource={activePackedSource}
          sectionContext={sectionContext}
        />

        <CoverageSourceDetails
          activePackedSource={activePackedSource}
          activeSourceSectionIndex={activeSourceSectionIndex}
        />
      </section>

      <ImportGate
        coveragePlan={null}
        selectedArea={null}
        result={null}
        selectedReadyCount={0}
        importedCount={0}
        importSummary={null}
        onImportSelected={() => undefined}
      />
    </div>
  )
}

function ActiveAreaAwaitingSelection() {
  return (
    <section
      className="coverage-deck-panel coverage-command-empty"
      aria-labelledby="active-area-awaiting-selection-heading"
    >
      <div className="coverage-deck-panel__heading">
        <p className="meta-kicker">Selected coverage area</p>
        <h3 id="active-area-awaiting-selection-heading">
          Select an area from Coverage Queue
        </h3>
      </div>
      <div className="coverage-command-empty__status" aria-hidden="true">
        <span>Status</span>
        <strong>Awaiting area</strong>
      </div>
      <p>
        Choose one non-blocked area to unlock selected-area generation. Blocked
        ambiguity areas stay clarify-first and cannot be generated.
      </p>
    </section>
  )
}

function CoverageDirectModeState({
  activePackedSource,
  activeSourceSectionIndex,
}: {
  activePackedSource: PackedQaSourceContext | null
  activeSourceSectionIndex: QaSourceSectionIndex | null
}) {
  return (
    <section
      className="coverage-deck-panel coverage-direct-state"
      aria-labelledby="coverage-direct-state-heading"
    >
      <div className="coverage-deck-panel__heading">
        <p className="meta-kicker">Secondary path</p>
        <h3 id="coverage-direct-state-heading">Advanced direct suggestions</h3>
      </div>
      <p>
        Direct suggestions remain available below for advanced use. The safer
        deck path is coverage analysis first, selected-area generation second,
        and explicit Ready approval before import.
      </p>
      <CoverageSourceDetails
        activePackedSource={activePackedSource}
        activeSourceSectionIndex={activeSourceSectionIndex}
      />
    </section>
  )
}

function CoverageDeck({
  qaSources,
  selectedQaSourceId,
  activePackedSource,
  activeSourceSectionIndex,
  coverageSourceSectionContext,
  activeMode,
  coveragePlan,
  selectedArea,
  areaResult,
  selectedIds,
  importedIds,
  selectedReadyCount,
  importSummary,
  planPersistenceState,
  coveragePlanSectionNotice,
  areaProgress,
  coveragePlanUnavailableReason,
  coverageAreaSuggestionUnavailableReason,
  coveragePlanError,
  coveragePlanWarnings,
  areaGenerationError,
  areaGenerationWarnings,
  isPlanningCoverage,
  isGeneratingAreaSuggestions,
  canPlanCoverage,
  canGenerateAreaSuggestions,
  resultRef,
  onPlanCoverage,
  onClearCoveragePlan,
  onSourceChange,
  onModeChange,
  onSelectArea,
  onGenerateAreaSuggestions,
  onToggleSelected,
  onReject,
  onImportSelected,
}: {
  qaSources: QaSource[]
  selectedQaSourceId: string
  activePackedSource: PackedQaSourceContext | null
  activeSourceSectionIndex: QaSourceSectionIndex | null
  coverageSourceSectionContext: AiCoveragePlanSectionContext
  activeMode: AiSuggestionsMode
  coveragePlan: AiCoveragePlan | null
  selectedArea: AiCoverageAreaSuggestionSelectedArea | null
  areaResult: AiCoverageAreaSuggestionResult | null
  selectedIds: string[]
  importedIds: string[]
  selectedReadyCount: number
  importSummary: string | null
  planPersistenceState: CoveragePlanPersistenceState
  coveragePlanSectionNotice: string | null
  areaProgress: Record<string, CoverageAreaProgress>
  coveragePlanUnavailableReason: string | null
  coverageAreaSuggestionUnavailableReason: string | null
  coveragePlanError: string | null
  coveragePlanWarnings: string[]
  areaGenerationError: string | null
  areaGenerationWarnings: string[]
  isPlanningCoverage: boolean
  isGeneratingAreaSuggestions: boolean
  canPlanCoverage: boolean
  canGenerateAreaSuggestions: boolean
  resultRef: RefObject<HTMLDivElement | null>
  onPlanCoverage: () => void
  onClearCoveragePlan: () => void
  onSourceChange: (sourceId: string) => void
  onModeChange: (activeMode: AiSuggestionsMode) => void
  onSelectArea: (area: AiCoveragePlan['coverageAreas'][number]) => void
  onGenerateAreaSuggestions: (
    area: AiCoverageAreaSuggestionSelectedArea,
  ) => void
  onToggleSelected: (suggestionId: string) => void
  onReject: (suggestionId: string) => void
  onImportSelected: () => void
}) {
  const areaResultMatchesSelection =
    areaResult && selectedArea
      ? areaResult.areaScope.name === selectedArea.name
      : false
  const matchingAreaResult = areaResultMatchesSelection ? areaResult : null
  const groupedSuggestions = matchingAreaResult
    ? groupAiCoverageAreaSuggestions(matchingAreaResult.testCaseSuggestions)
    : { ready: [], needsReview: [], rejected: [] }
  const blockedAreaCount =
    coveragePlan?.coverageAreas.filter(
      (area) => area.generationReadiness === 'blocked_by_ambiguity',
    ).length ?? 0
  const blockedSuggestionCount =
    matchingAreaResult?.coverageAssessment.blockedAmbiguousItems.length ?? 0
  const isCoverageMode = activeMode === 'coverage_planner'

  return (
    <section
      className="ai-coverage-deck"
      aria-labelledby="ai-coverage-deck-heading"
    >
      <div className="ai-coverage-deck__topbar">
        <div className="coverage-workspace-title">
          <p className="meta-kicker">AI suggests, QA approves</p>
          <h3 id="ai-coverage-deck-heading">Global coverage & suggestions</h3>
          <p>
            Analyze one selected source, pick one area, then approve only Ready
            suggestions before creating Test Cases.
          </p>
        </div>

        <div className="coverage-command-dock">
          <div className="field-group coverage-source-dock">
            <label className="field-label" htmlFor="ai-source-select">
              QA Source
            </label>
            <select
              id="ai-source-select"
              className="select"
              value={selectedQaSourceId}
              onChange={(event) => onSourceChange(event.target.value)}
            >
              <option value="">Select a QA Source</option>
              {qaSources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.title}
                </option>
              ))}
            </select>
            <span className="coverage-source-status">
              {activePackedSource
                ? `${activePackedSource.sourceType} - ${activePackedSource.status}`
                : 'No source selected'}
            </span>
            {activeSourceSectionIndex ? (
              <span className="coverage-source-status">
                Structure: {formatCount(activeSourceSectionIndex.sections.length, 'section')}
              </span>
            ) : null}
          </div>

          <div
            className="coverage-mode-switch"
            role="group"
            aria-label="AI workspace mode"
          >
            <button
              type="button"
              className={`button ${
                isCoverageMode ? 'button--primary' : 'button--secondary'
              }`}
              aria-pressed={isCoverageMode}
              onClick={() => onModeChange('coverage_planner')}
            >
              Coverage workflow
            </button>
            <button
              type="button"
              className={`button ${
                activeMode === 'suggestions'
                  ? 'button--primary'
                  : 'button--secondary'
              }`}
              aria-pressed={activeMode === 'suggestions'}
              onClick={() => onModeChange('suggestions')}
            >
              Advanced: direct suggestions
            </button>
          </div>

          <div className="ai-coverage-deck__actions">
            <button
              type="button"
              className="button button--primary"
              onClick={() => {
                if (!isCoverageMode) {
                  onModeChange('coverage_planner')
                }
                onPlanCoverage()
              }}
              disabled={!canPlanCoverage || isPlanningCoverage}
            >
              {isPlanningCoverage ? 'Analyzing coverage' : 'Analyze coverage'}
            </button>
            {coveragePlan ? (
              <button
                type="button"
                className="button button--secondary"
                onClick={onClearCoveragePlan}
              >
                Clear saved coverage plan
              </button>
            ) : null}
          </div>
          <p className="coverage-command-dock__boundary">
            Selecting a source or area sends nothing. Only an explicit Analyze
            or Generate action contacts AI.
          </p>
        </div>
      </div>

      {coveragePlanUnavailableReason ? (
        <div className="coverage-deck-alert" role="status">
          {coveragePlanUnavailableReason}
        </div>
      ) : null}

      {planPersistenceState ? (
        <div
          className={
            planPersistenceState.status === 'stale'
              ? 'coverage-deck-warning'
              : 'coverage-deck-status'
          }
          role="status"
        >
          {planPersistenceState.status === 'stale'
            ? `Saved coverage plan is stale. Re-analyze coverage before generating tests. ${planPersistenceState.reasons.join(' ')}`
            : `Saved coverage plan loaded. Analyzed ${formatDateTime(planPersistenceState.analyzedAt)}.`}
        </div>
      ) : null}

      {coveragePlanSectionNotice ? (
        <div className="coverage-deck-warning" role="status">
          {coveragePlanSectionNotice}
        </div>
      ) : null}

      {coverageAreaSuggestionUnavailableReason ? (
        <div className="coverage-deck-alert" role="status">
          {coverageAreaSuggestionUnavailableReason}
        </div>
      ) : null}

      {coveragePlanError ? (
        <div className="coverage-deck-alert" role="alert">
          {coveragePlanError}
        </div>
      ) : null}

      {coveragePlanWarnings.length > 0 ? (
        <div className="coverage-deck-warning" role="status">
          {coveragePlanWarnings.map((warning) => (
            <span key={warning}>{warning} </span>
          ))}
        </div>
      ) : null}

      {activeMode === 'suggestions' ? (
        <CoverageDirectModeState
          activePackedSource={activePackedSource}
          activeSourceSectionIndex={activeSourceSectionIndex}
        />
      ) : !coveragePlan ? (
        <CoverageLaunchState
          activePackedSource={activePackedSource}
          activeSourceSectionIndex={activeSourceSectionIndex}
          sectionContext={coverageSourceSectionContext}
        />
      ) : (
        <>
          <div className="ai-coverage-deck__stats">
            <CoverageDeckStat
              label="AI-proposed areas"
              value={coveragePlan.coverageAreas.length}
            />
            <CoverageDeckStat
              label="Ambiguities"
              value={coveragePlan.ambiguities.length}
              tone={coveragePlan.ambiguities.length ? 'warning' : 'positive'}
            />
            <CoverageDeckStat
              label="Ready suggestions"
              value={groupedSuggestions.ready.length}
              tone="positive"
            />
            <CoverageDeckStat
              label="Needs review"
              value={groupedSuggestions.needsReview.length}
              tone="warning"
            />
            <CoverageDeckStat
              label="Blocked items"
              value={blockedSuggestionCount + blockedAreaCount}
              tone={
                blockedSuggestionCount + blockedAreaCount > 0
                  ? 'critical'
                  : 'neutral'
              }
            />
          </div>

          <aside
            className="coverage-trust-definition"
            aria-label="Coverage trust definition"
          >
            <strong>How to read these states:</strong> Source-backed means the
            evidence matched transmitted source text. Current means the same
            source revision. Neither proves correctness, completeness, or QA
            approval.
          </aside>

          <div className="ai-coverage-deck__grid">
            <CoverageQueue
              coveragePlan={coveragePlan}
              selectedAreaId={selectedArea?.id ?? ''}
              areaProgress={areaProgress}
              isSelectingDisabled={isGeneratingAreaSuggestions}
              onSelectArea={onSelectArea}
            />

            {selectedArea && activePackedSource ? (
              <ActiveAreaCommandCard
                selectedArea={selectedArea}
                coveragePlan={coveragePlan}
                result={matchingAreaResult}
                activePackedSource={activePackedSource}
                activeSourceSectionIndex={activeSourceSectionIndex}
                areaGenerationError={areaGenerationError}
                areaGenerationWarnings={areaGenerationWarnings}
                isGeneratingAreaSuggestions={isGeneratingAreaSuggestions}
                canGenerateAreaSuggestions={canGenerateAreaSuggestions}
                onGenerateAreaSuggestions={onGenerateAreaSuggestions}
              />
            ) : (
              <ActiveAreaAwaitingSelection />
            )}

            <ImportGate
              coveragePlan={coveragePlan}
              selectedArea={selectedArea}
              result={matchingAreaResult}
              selectedReadyCount={selectedReadyCount}
              importedCount={importedIds.length}
              importSummary={importSummary}
              onImportSelected={onImportSelected}
            />
          </div>

          <CoveragePlanDetails coveragePlan={coveragePlan} />

          {matchingAreaResult ? (
            <div
              ref={resultRef}
              tabIndex={-1}
              aria-label={`Generated area suggestion result for ${matchingAreaResult.areaScope.name}`}
            >
              <CoverageAreaSuggestionResultPanel
                result={matchingAreaResult}
                selectedIds={selectedIds}
                importedIds={importedIds}
                selectedReadyCount={selectedReadyCount}
                importSummary={importSummary}
                onToggleSelected={onToggleSelected}
                onReject={onReject}
              />
            </div>
          ) : (
            <CoverageReviewInboxPlaceholder />
          )}
        </>
      )}
    </section>
  )
}

export function AiSuggestionsPage({
  onNavigate,
  qaSources,
  testCases,
  onChange,
  selectedQaSourceId = '',
  onSelectedQaSourceChange,
  workflowState: controlledWorkflowState,
  onWorkflowStateChange,
  savedCoveragePlans = [],
  onSavedCoveragePlansChange,
  sourceSectionIndexes = [],
  sectionCoveragePlanRecords = [],
  provider = unavailableAiSuggestionProvider,
  coveragePlanProvider = unavailableAiCoveragePlanProvider,
  coverageAreaSuggestionProvider = unavailableAiCoverageAreaSuggestionProvider,
  globalCoverageMergeReviewState = null,
  onRequestGlobalCoverageMergeSave = () => undefined,
  onCancelGlobalCoverageMergeSave = () => undefined,
  onConfirmGlobalCoverageMergeSave = () => undefined,
  onDiscardGlobalCoverageMergeCandidate = () => undefined,
}: AiSuggestionsPageProps) {
  const workspace = useWorkspace()
  const importInFlight = useRef(false)
  const [importBusy, setImportBusy] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [showOptionalPlanner, setShowOptionalPlanner] = useState(false)
  const [excerptSourceRevision, setExcerptSourceRevision] = useState<string | null>(null)
  const [localWorkflowState, setLocalWorkflowState] = useState(() => {
    const initialState = createInitialAiSuggestionsWorkflowState()
    const savedPlan = selectedQaSourceId
      ? findCoveragePlanForSource(savedCoveragePlans, selectedQaSourceId)
      : null

    return savedPlan
      ? {
          ...initialState,
          coveragePlan: savedPlan.plan,
        }
      : initialState
  })
  const hasControlledWorkflowState = controlledWorkflowState !== undefined
  const workflowState = controlledWorkflowState ?? localWorkflowState
  const {
    activeMode,
    transientSourceRevision,
    suggestions,
    selectedSuggestionIds,
    importedSuggestionIds,
    coveragePlan,
    selectedCoverageArea,
    coverageAreaSuggestionResult,
    providerError,
    providerWarnings,
    coveragePlanError,
    coveragePlanWarnings,
    coverageAreaSuggestionError,
    coverageAreaSuggestionWarnings,
    selectedAreaSuggestionIds,
    importedAreaSuggestionIds,
    importSummary,
    areaImportSummary,
  } = workflowState
  const [isGenerating, setIsGenerating] = useState(false)
  const [isPlanningCoverage, setIsPlanningCoverage] = useState(false)
  const [isGeneratingCoverageAreaSuggestions, setIsGeneratingCoverageAreaSuggestions] =
    useState(false)
  const generationRequestIdRef = useRef(0)
  const coveragePlanRequestIdRef = useRef(0)
  const coverageAreaSuggestionRequestIdRef = useRef(0)
  const areaSuggestionResultRef = useRef<HTMLDivElement | null>(null)
  const selectedSource =
    qaSources.find((source) => source.id === selectedQaSourceId) ?? null
  const selectedSourceRevision = useMemo(
    () =>
      selectedSource ? createAiSuggestionsSourceRevision(selectedSource) : null,
    [selectedSource],
  )
  const selectedSourceRevisionKey = getAiSuggestionsSourceRevisionKey(
    selectedSourceRevision,
  )
  const currentSourceRevisionKeyRef = useRef(selectedSourceRevisionKey)
  const isTransientSourceCurrent = isSameAiSuggestionsSourceRevision(
    transientSourceRevision,
    selectedSourceRevision,
  )
  const activeSuggestions = isTransientSourceCurrent ? suggestions : []
  const activeSelectedCoverageArea = isTransientSourceCurrent
    ? selectedCoverageArea
    : null
  const activeCoverageAreaSuggestionResult = isTransientSourceCurrent
    ? coverageAreaSuggestionResult
    : null
  const selectedSourceSectionIndex = selectedSource
    ? sourceSectionIndexes.find(
        (sectionIndex) => sectionIndex.qaSourceId === selectedSource.id,
      ) ?? null
    : null
  const packedSuggestionSource = useMemo(
    () => (selectedSource ? packQaSourceForAiSuggestions(selectedSource) : null),
    [selectedSource],
  )
  const packedCoverageSource = useMemo(
    () =>
      selectedSource
        ? packQaSourceForAiSuggestions(selectedSource, {
            maxCharacterCount: AI_COVERAGE_PLAN_SOURCE_CONTEXT_MAX_CHARACTERS,
          })
        : null,
    [selectedSource],
  )
  const coverageSourceSectionCatalog = useMemo(
    () =>
      createAiCoveragePlanSectionCatalog(
        selectedSourceSectionIndex,
        packedCoverageSource,
      ),
    [packedCoverageSource, selectedSourceSectionIndex],
  )
  const coverageSourceSectionContext = useMemo(
    () =>
      getAiCoveragePlanSectionCatalogRuntimeContext(
        coverageSourceSectionCatalog,
      )?.sectionContext ?? {
        available: coverageSourceSectionCatalog.available,
        sectionSchemaVersion: coverageSourceSectionCatalog.sectionSchemaVersion,
        sectionerVersion: coverageSourceSectionCatalog.sectionerVersion,
        sectionSetFingerprint:
          coverageSourceSectionCatalog.sectionSetFingerprint,
        totalSectionCount: coverageSourceSectionCatalog.totalSectionCount,
        visibleSectionCount: coverageSourceSectionCatalog.visibleSectionCount,
        omittedSectionCount: coverageSourceSectionCatalog.omittedSectionCount,
      },
    [coverageSourceSectionCatalog],
  )
  const activePackedSource =
    activeMode === 'coverage_planner'
      ? packedCoverageSource
      : packedSuggestionSource
  const savedCoveragePlanRecord = selectedSource
    ? findCoveragePlanForSource(savedCoveragePlans, selectedSource.id)
    : null
  const savedCoveragePlanFreshness: CoveragePlanFreshness | null =
    savedCoveragePlanRecord
      ? getCoveragePlanFreshness(savedCoveragePlanRecord, selectedSource)
      : null
  const isLoadedSavedCoveragePlan = Boolean(
    coveragePlan &&
      savedCoveragePlanRecord &&
      coveragePlan === savedCoveragePlanRecord.plan,
  )
  const coveragePlanSectionResolution = useMemo(() => {
    if (!coveragePlan) {
      return null
    }

    if (
      isLoadedSavedCoveragePlan &&
      savedCoveragePlanRecord?.origin.kind === 'section_merge'
    ) {
      return resolveAiMergedCoveragePlanSectionRefs({
        record: savedCoveragePlanRecord,
        qaSource: selectedSource,
        currentIndex: selectedSourceSectionIndex,
        currentSectionPlanRecords: sectionCoveragePlanRecords,
      })
    }

    return resolveAiCoveragePlanSectionRefs(
      coveragePlan,
      selectedSourceSectionIndex,
      coverageSourceSectionCatalog,
    )
  }, [
    coveragePlan,
    coverageSourceSectionCatalog,
    isLoadedSavedCoveragePlan,
    savedCoveragePlanRecord,
    sectionCoveragePlanRecords,
    selectedSource,
    selectedSourceSectionIndex,
  ])
  const resolvedCoveragePlan =
    coveragePlanSectionResolution?.resolvedPlan ?? null
  const displayedCoveragePlanWarnings = isLoadedSavedCoveragePlan && savedCoveragePlanRecord?.origin.kind === 'section_merge'
    ? [...new Set([...coveragePlanWarnings, ...(resolvedCoveragePlan?.warnings ?? []), 'Review behavior-level evidence in the contributing section analyses. Area excerpts alone do not establish support for every behavior.'])]
    : coveragePlanWarnings
  const resolvedSelectedCoverageArea = useMemo(() => {
    if (!activeSelectedCoverageArea || !resolvedCoveragePlan) {
      return null
    }

    const currentArea = resolvedCoveragePlan.coverageAreas.find(
      (area) => area.id === activeSelectedCoverageArea.id,
    )

    return currentArea ? createSelectedAreaFromCoverageArea(currentArea) : null
  }, [activeSelectedCoverageArea, resolvedCoveragePlan])
  const planPersistenceState: CoveragePlanPersistenceState =
    isLoadedSavedCoveragePlan && savedCoveragePlanRecord && savedCoveragePlanFreshness
      ? {
          status: savedCoveragePlanFreshness.isFresh ? 'loaded' : 'stale',
          analyzedAt: savedCoveragePlanRecord.analysis.analyzedAt,
          reasons: savedCoveragePlanFreshness.reasons,
        }
      : null
  const isLoadedStaleCoveragePlan = planPersistenceState?.status === 'stale'
  const groupedSuggestions = groupAiSuggestions(activeSuggestions)
  const allowExcerpt = excerptSourceRevision === selectedSourceRevisionKey
  const canGenerate = Boolean(packedSuggestionSource && provider.isAvailable && (!packedSuggestionSource.truncated || allowExcerpt))
  const canPlanCoverage = Boolean(
    packedCoverageSource && coveragePlanProvider.isAvailable && (!packedCoverageSource.truncated || allowExcerpt),
  )
  const coveragePlanSectionNotice = (() => {
    if (!coveragePlanSectionResolution) {
      return null
    }

    if (coveragePlanSectionResolution.status === 'stale_context') {
      return 'Saved source section locations no longer match the current source structure. Re-analyze coverage to refresh them.'
    }

    if (coveragePlanSectionResolution.status === 'unavailable_index') {
      return 'Saved source section locations cannot be checked right now and are hidden.'
    }

    if (coveragePlanSectionResolution.status === 'resolved_with_omissions') {
      return 'Some saved source section locations could not be revalidated and are hidden. Re-analyze coverage to refresh them.'
    }

    if (
      coveragePlanSectionResolution.status === 'no_refs' &&
      isLoadedSavedCoveragePlan &&
      savedCoveragePlanFreshness?.isFresh &&
      canPlanCoverage
    ) {
      return 'This saved coverage plan has no section references. Re-analyze to add them.'
    }

    return null
  })()
  const canGenerateCoverageAreaSuggestions = Boolean(
    packedCoverageSource &&
      (!packedCoverageSource.truncated || allowExcerpt) &&
      resolvedCoveragePlan &&
      !isLoadedStaleCoveragePlan &&
      coverageAreaSuggestionProvider.isAvailable &&
      resolvedSelectedCoverageArea?.generationReadiness !==
        'blocked_by_ambiguity',
  )
  const areaProgress = resolvedCoveragePlan
    ? Object.fromEntries(
        resolvedCoveragePlan.coverageAreas.map((area) => [
          area.id,
          getCoverageAreaProgress({
            area,
            areaResult: activeCoverageAreaSuggestionResult,
            qaSourceId: resolvedCoveragePlan.sourceScope.qaSourceId,
            testCases,
          }),
        ]),
      )
    : {}
  const selectedReadySuggestions = activeSuggestions.filter(
    (suggestion) =>
      suggestion.status === 'ready' &&
      selectedSuggestionIds.includes(suggestion.id) &&
      !importedSuggestionIds.includes(suggestion.id),
  )
  const selectedReadyAreaSuggestions =
    activeCoverageAreaSuggestionResult?.areaScope.generationReadiness ===
    'blocked_by_ambiguity'
      ? []
      : activeCoverageAreaSuggestionResult?.testCaseSuggestions.filter(
          (suggestion) =>
            suggestion.status === 'Ready' &&
            selectedAreaSuggestionIds.includes(suggestion.id) &&
            !importedAreaSuggestionIds.includes(suggestion.id),
        ) ?? []

  useEffect(() => {
    return () => {
      generationRequestIdRef.current += 1
      coveragePlanRequestIdRef.current += 1
      coverageAreaSuggestionRequestIdRef.current += 1
    }
  }, [])

  useLayoutEffect(() => {
    currentSourceRevisionKeyRef.current = selectedSourceRevisionKey
    generationRequestIdRef.current += 1
    coveragePlanRequestIdRef.current += 1
    coverageAreaSuggestionRequestIdRef.current += 1
  }, [selectedSourceRevisionKey])

  useEffect(() => {
    if (
      !hasSourceBoundTransientState(workflowState) ||
      isTransientSourceCurrent
    ) {
      return
    }

    const invalidatedSourceRevision = workflowState.transientSourceRevision
    const clearStaleState = (currentState: AiSuggestionsWorkflowState) =>
      isSameAiSuggestionsSourceRevision(
        currentState.transientSourceRevision,
        invalidatedSourceRevision,
      )
        ? clearSourceBoundTransientState(currentState)
        : currentState

    globalThis.queueMicrotask(() => {
      if (hasControlledWorkflowState) {
        onWorkflowStateChange?.(clearStaleState)
      } else {
        setLocalWorkflowState(clearStaleState)
      }
      setIsGenerating(false)
      setIsPlanningCoverage(false)
      setIsGeneratingCoverageAreaSuggestions(false)
    })
  }, [
    hasControlledWorkflowState,
    isTransientSourceCurrent,
    onWorkflowStateChange,
    selectedSourceRevision,
    workflowState,
  ])

  useEffect(() => {
    if (
      !activeCoverageAreaSuggestionResult ||
      activeMode !== 'coverage_planner'
    ) {
      return
    }

    areaSuggestionResultRef.current?.scrollIntoView?.({
      behavior: 'smooth',
      block: 'start',
    })
    areaSuggestionResultRef.current?.focus({ preventScroll: true })
  }, [activeCoverageAreaSuggestionResult, activeMode])

  function setWorkflowState(
    action: SetStateAction<AiSuggestionsWorkflowState>,
  ) {
    if (hasControlledWorkflowState) {
      onWorkflowStateChange?.(action)
      return
    }

    setLocalWorkflowState(action)
  }

  function setActiveMode(activeMode: AiSuggestionsMode) {
    setWorkflowState((currentState) => ({ ...currentState, activeMode }))
  }

  function setTransientSourceRevision(
    sourceRevision: AiSuggestionsSourceRevision | null,
  ) {
    setWorkflowState((currentState) => ({
      ...currentState,
      transientSourceRevision: sourceRevision,
    }))
  }

  function setSuggestions(
    value: WorkflowFieldValue<AiTestCaseSuggestion[]>,
  ) {
    setWorkflowState((currentState) => ({
      ...currentState,
      suggestions: resolveWorkflowFieldValue(value, currentState.suggestions),
    }))
  }

  function setSelectedSuggestionIds(value: WorkflowFieldValue<string[]>) {
    setWorkflowState((currentState) => ({
      ...currentState,
      selectedSuggestionIds: resolveWorkflowFieldValue(
        value,
        currentState.selectedSuggestionIds,
      ),
    }))
  }

  function setImportedSuggestionIds(value: WorkflowFieldValue<string[]>) {
    setWorkflowState((currentState) => ({
      ...currentState,
      importedSuggestionIds: resolveWorkflowFieldValue(
        value,
        currentState.importedSuggestionIds,
      ),
    }))
  }

  function setCoveragePlan(value: WorkflowFieldValue<AiCoveragePlan | null>) {
    setWorkflowState((currentState) => ({
      ...currentState,
      coveragePlan: resolveWorkflowFieldValue(value, currentState.coveragePlan),
    }))
  }

  function setSelectedCoverageArea(
    value: WorkflowFieldValue<AiCoverageAreaSuggestionSelectedArea | null>,
  ) {
    setWorkflowState((currentState) => ({
      ...currentState,
      selectedCoverageArea: resolveWorkflowFieldValue(
        value,
        currentState.selectedCoverageArea,
      ),
    }))
  }

  function setCoverageAreaSuggestionResult(
    value: WorkflowFieldValue<AiCoverageAreaSuggestionResult | null>,
  ) {
    setWorkflowState((currentState) => ({
      ...currentState,
      coverageAreaSuggestionResult: resolveWorkflowFieldValue(
        value,
        currentState.coverageAreaSuggestionResult,
      ),
    }))
  }

  function setProviderError(value: WorkflowFieldValue<string | null>) {
    setWorkflowState((currentState) => ({
      ...currentState,
      providerError: resolveWorkflowFieldValue(
        value,
        currentState.providerError,
      ),
    }))
  }

  function setProviderWarnings(value: WorkflowFieldValue<string[]>) {
    setWorkflowState((currentState) => ({
      ...currentState,
      providerWarnings: resolveWorkflowFieldValue(
        value,
        currentState.providerWarnings,
      ),
    }))
  }

  function setCoveragePlanError(value: WorkflowFieldValue<string | null>) {
    setWorkflowState((currentState) => ({
      ...currentState,
      coveragePlanError: resolveWorkflowFieldValue(
        value,
        currentState.coveragePlanError,
      ),
    }))
  }

  function setCoveragePlanWarnings(value: WorkflowFieldValue<string[]>) {
    setWorkflowState((currentState) => ({
      ...currentState,
      coveragePlanWarnings: resolveWorkflowFieldValue(
        value,
        currentState.coveragePlanWarnings,
      ),
    }))
  }

  function setCoverageAreaSuggestionError(
    value: WorkflowFieldValue<string | null>,
  ) {
    setWorkflowState((currentState) => ({
      ...currentState,
      coverageAreaSuggestionError: resolveWorkflowFieldValue(
        value,
        currentState.coverageAreaSuggestionError,
      ),
    }))
  }

  function setCoverageAreaSuggestionWarnings(
    value: WorkflowFieldValue<string[]>,
  ) {
    setWorkflowState((currentState) => ({
      ...currentState,
      coverageAreaSuggestionWarnings: resolveWorkflowFieldValue(
        value,
        currentState.coverageAreaSuggestionWarnings,
      ),
    }))
  }

  function setSelectedAreaSuggestionIds(value: WorkflowFieldValue<string[]>) {
    setWorkflowState((currentState) => ({
      ...currentState,
      selectedAreaSuggestionIds: resolveWorkflowFieldValue(
        value,
        currentState.selectedAreaSuggestionIds,
      ),
    }))
  }

  function setImportedAreaSuggestionIds(value: WorkflowFieldValue<string[]>) {
    setWorkflowState((currentState) => ({
      ...currentState,
      importedAreaSuggestionIds: resolveWorkflowFieldValue(
        value,
        currentState.importedAreaSuggestionIds,
      ),
    }))
  }

  function setImportSummary(value: WorkflowFieldValue<string | null>) {
    setWorkflowState((currentState) => ({
      ...currentState,
      importSummary: resolveWorkflowFieldValue(
        value,
        currentState.importSummary,
      ),
    }))
  }

  function setAreaImportSummary(value: WorkflowFieldValue<string | null>) {
    setWorkflowState((currentState) => ({
      ...currentState,
      areaImportSummary: resolveWorkflowFieldValue(
        value,
        currentState.areaImportSummary,
      ),
    }))
  }

  function createWorkflowStateForSource(sourceId: string) {
    const nextState = createInitialAiSuggestionsWorkflowState()
    const savedPlan = findCoveragePlanForSource(savedCoveragePlans, sourceId)

    return {
      ...nextState,
      activeMode,
      coveragePlan: savedPlan?.plan ?? null,
    }
  }

  function handleSourceChange(sourceId: string) {
    setImportError(null)
    generationRequestIdRef.current += 1
    coveragePlanRequestIdRef.current += 1
    coverageAreaSuggestionRequestIdRef.current += 1
    onSelectedQaSourceChange?.(sourceId)
    setWorkflowState(createWorkflowStateForSource(sourceId))
    setIsGenerating(false)
    setIsPlanningCoverage(false)
    setIsGeneratingCoverageAreaSuggestions(false)
  }

  async function handleGenerate() {
    if (
      !canGenerate || isGenerating || importInFlight.current ||
      !packedSuggestionSource ||
      !selectedSourceRevision ||
      !provider.isAvailable
    ) {
      return
    }

    const requestId = generationRequestIdRef.current + 1
    generationRequestIdRef.current = requestId
    const requestedSourceRevision = selectedSourceRevision
    const requestedSourceRevisionKey = selectedSourceRevisionKey
    const abortController = new AbortController()
    const isCurrentRequest = () =>
      generationRequestIdRef.current === requestId &&
      currentSourceRevisionKeyRef.current === requestedSourceRevisionKey

    setTransientSourceRevision(requestedSourceRevision)
    setIsGenerating(true)
    setProviderError(null)
    setProviderWarnings([])
    setImportSummary(null)
    setSelectedSuggestionIds([])
    setImportedSuggestionIds([])

    try {
      if (workspace && selectedSource) await sourceSuggestionGuard(workspace.repository, selectedSource)
      if (!isCurrentRequest()) return
      const request = buildAiSuggestionRequest(packedSuggestionSource)
      const rawResponse = await provider.generateTestCaseSuggestions(request, {
        signal: abortController.signal,
      })

      if (!isCurrentRequest()) {
        return
      }

      const parseResult = parseAiSuggestionResponse(rawResponse, {
        qaSourceId: packedSuggestionSource.qaSourceId,
      })

      if (!isCurrentRequest()) {
        return
      }

      if (!parseResult.ok) {
        setSuggestions([])
        setProviderError(parseResult.error)
        return
      }

      setSuggestions(parseResult.suggestions)
      setProviderWarnings(parseResult.warnings)
    } catch (error) {
      if (!isCurrentRequest()) {
        return
      }

      setSuggestions([])
      setProviderError(
        error instanceof Error ? error.message : AI_PROVIDER_UNAVAILABLE_MESSAGE,
      )
    } finally {
      if (isCurrentRequest()) {
        setIsGenerating(false)
      }
    }
  }

  async function handlePlanCoverage() {
    if (
      !canPlanCoverage || isPlanningCoverage ||
      !selectedSource ||
      !selectedSourceRevision ||
      !packedCoverageSource ||
      !coveragePlanProvider.isAvailable
    ) {
      return
    }

    const requestId = coveragePlanRequestIdRef.current + 1
    coveragePlanRequestIdRef.current = requestId
    coverageAreaSuggestionRequestIdRef.current += 1
    const requestedSourceRevision = selectedSourceRevision
    const requestedSourceRevisionKey = selectedSourceRevisionKey
    const abortController = new AbortController()
    const isCurrentRequest = () =>
      coveragePlanRequestIdRef.current === requestId &&
      currentSourceRevisionKeyRef.current === requestedSourceRevisionKey

    setTransientSourceRevision(requestedSourceRevision)
    setIsPlanningCoverage(true)
    setSelectedCoverageArea(null)
    setCoverageAreaSuggestionResult(null)
    setCoveragePlanError(null)
    setCoveragePlanWarnings([])
    setCoverageAreaSuggestionError(null)
    setCoverageAreaSuggestionWarnings([])
    setSelectedAreaSuggestionIds([])
    setImportedAreaSuggestionIds([])
    setAreaImportSummary(null)
    setIsGeneratingCoverageAreaSuggestions(false)

    try {
      const request = buildAiCoveragePlanRequest(
        packedCoverageSource,
        coverageSourceSectionCatalog,
      )
      const rawResponse = await coveragePlanProvider.generateCoveragePlan(
        request,
        {
          signal: abortController.signal,
        },
      )

      if (!isCurrentRequest()) {
        return
      }

      const providerPayload = getCoverageProviderPayload(rawResponse)
      const parseResult = parseAiCoveragePlanResponse(
        providerPayload.coveragePlan,
        {
          qaSourceId: packedCoverageSource.qaSourceId,
          sourceContent: packedCoverageSource.content,
          sourceTruncated: packedCoverageSource.truncated,
          sourceSectionIndex: selectedSourceSectionIndex,
          sourceSectionCatalog: coverageSourceSectionCatalog,
        },
      )

      if (!isCurrentRequest()) {
        return
      }

      if (!parseResult.ok) {
        setCoveragePlanError(parseResult.error)
        return
      }

      if (parseResult.coveragePlan) {
        const persistedRecord = createPersistedCoveragePlanRecord({
          qaSource: selectedSource,
          packedSource: packedCoverageSource,
          plan: parseResult.coveragePlan,
        })

        const saved = await onSavedCoveragePlansChange?.(
          upsertCoveragePlanRecord(savedCoveragePlans, persistedRecord),
        )
        if (!isCurrentRequest()) return
        if (saved && !saved.ok) {
          setCoveragePlanError(saved.error ?? 'This plan could not be saved. The previous plan was preserved.')
          return
        }
      }
      setCoveragePlan(parseResult.coveragePlan)
      setCoveragePlanWarnings([
        ...providerPayload.warnings,
        ...parseResult.validationWarnings,
      ])
    } catch (error) {
      if (!isCurrentRequest()) {
        return
      }

      setCoveragePlanError(
        error instanceof Error
          ? error.message
          : AI_COVERAGE_PLAN_PROVIDER_UNAVAILABLE_MESSAGE,
      )
    } finally {
      if (isCurrentRequest()) {
        setIsPlanningCoverage(false)
      }
    }
  }

  function handleSelectCoverageArea(
    area: AiCoveragePlan['coverageAreas'][number],
  ) {
    if (!selectedSourceRevision) {
      return
    }

    const selectedArea = createSelectedAreaFromCoverageArea(area)
    const isSameArea = activeSelectedCoverageArea?.id === selectedArea.id

    coverageAreaSuggestionRequestIdRef.current += 1
    setTransientSourceRevision(selectedSourceRevision)
    setSelectedCoverageArea(selectedArea)
    setCoverageAreaSuggestionResult((currentResult) =>
      isSameArea ? currentResult : null,
    )
    setCoverageAreaSuggestionError(null)
    setCoverageAreaSuggestionWarnings([])
    setSelectedAreaSuggestionIds([])
    if (!isSameArea) {
      setImportedAreaSuggestionIds([])
    }
    setAreaImportSummary(null)
    setIsGeneratingCoverageAreaSuggestions(false)
  }

  async function handleGenerateCoverageAreaSuggestions(
    selectedArea: AiCoverageAreaSuggestionSelectedArea,
  ) {
    if (
      (packedCoverageSource?.truncated && !allowExcerpt) || isGeneratingCoverageAreaSuggestions || importInFlight.current ||
      !packedCoverageSource ||
      !selectedSourceRevision ||
      isLoadedStaleCoveragePlan ||
      !coverageAreaSuggestionProvider.isAvailable ||
      selectedArea.generationReadiness === 'blocked_by_ambiguity'
    ) {
      return
    }

    const requestId = coverageAreaSuggestionRequestIdRef.current + 1
    coverageAreaSuggestionRequestIdRef.current = requestId
    const requestedSourceRevision = selectedSourceRevision
    const requestedSourceRevisionKey = selectedSourceRevisionKey
    const abortController = new AbortController()
    const isCurrentRequest = () =>
      coverageAreaSuggestionRequestIdRef.current === requestId &&
      currentSourceRevisionKeyRef.current === requestedSourceRevisionKey
    const shouldPreserveCurrentResult =
      activeSelectedCoverageArea?.id === selectedArea.id

    setTransientSourceRevision(requestedSourceRevision)
    setSelectedCoverageArea(selectedArea)
    setCoverageAreaSuggestionResult((currentResult) =>
      shouldPreserveCurrentResult ? currentResult : null,
    )
    setCoverageAreaSuggestionError(null)
    setCoverageAreaSuggestionWarnings([])
    setSelectedAreaSuggestionIds([])
    if (!shouldPreserveCurrentResult) {
      setImportedAreaSuggestionIds([])
    }
    setAreaImportSummary(null)
    setIsGeneratingCoverageAreaSuggestions(true)

    try {
      if (workspace && selectedSource) await sourceSuggestionGuard(workspace.repository, selectedSource)
      if (!isCurrentRequest()) return
      const request = buildAiCoverageAreaSuggestionRequest(
        packedCoverageSource,
        selectedArea,
      )
      const rawResponse =
        await coverageAreaSuggestionProvider.generateCoverageAreaSuggestions(
          request,
          {
            signal: abortController.signal,
          },
        )

      if (!isCurrentRequest()) {
        return
      }

      const providerPayload =
        getCoverageAreaSuggestionProviderPayload(rawResponse)
      const parseResult = parseAiCoverageAreaSuggestionResponse(
        providerPayload.areaSuggestionResult,
        {
          qaSourceId: packedCoverageSource.qaSourceId,
          sourceContent: packedCoverageSource.content,
          sourceTruncated: packedCoverageSource.truncated,
          selectedArea,
        },
      )

      if (!isCurrentRequest()) {
        return
      }

      if (!parseResult.ok) {
        setCoverageAreaSuggestionResult(null)
        setCoverageAreaSuggestionError(parseResult.error)
        return
      }

      setImportedAreaSuggestionIds([])
      setCoverageAreaSuggestionResult(parseResult.areaSuggestionResult)
      setCoverageAreaSuggestionWarnings(
        Array.from(new Set([...providerPayload.warnings, ...parseResult.warnings])),
      )
    } catch (error) {
      if (!isCurrentRequest()) {
        return
      }

      const errorMessage =
        error instanceof Error
          ? error.message
          : AI_COVERAGE_AREA_SUGGESTION_PROVIDER_UNAVAILABLE_MESSAGE

      if (!isRateLimitErrorMessage(errorMessage)) {
        setCoverageAreaSuggestionResult(null)
      }
      setCoverageAreaSuggestionError(errorMessage)
    } finally {
      if (isCurrentRequest()) {
        setIsGeneratingCoverageAreaSuggestions(false)
      }
    }
  }

  function toggleSelectedSuggestion(suggestionId: string) {
    setSelectedSuggestionIds((currentIds) =>
      currentIds.includes(suggestionId)
        ? currentIds.filter((id) => id !== suggestionId)
        : [...currentIds, suggestionId],
    )
  }

  function rejectSuggestion(suggestionId: string) {
    setSuggestions((currentSuggestions) =>
      currentSuggestions.map((suggestion) =>
        suggestion.id === suggestionId
          ? {
              ...suggestion,
              status: 'rejected',
              warnings: [...suggestion.warnings, 'Rejected by tester.'],
            }
          : suggestion,
      ),
    )
    setSelectedSuggestionIds((currentIds) =>
      currentIds.filter((id) => id !== suggestionId),
    )
  }

  function toggleSelectedAreaSuggestion(suggestionId: string) {
    setSelectedAreaSuggestionIds((currentIds) =>
      currentIds.includes(suggestionId)
        ? currentIds.filter((id) => id !== suggestionId)
        : [...currentIds, suggestionId],
    )
  }

  function rejectAreaSuggestion(suggestionId: string) {
    setCoverageAreaSuggestionResult((currentResult) =>
      currentResult
        ? {
            ...currentResult,
            testCaseSuggestions: currentResult.testCaseSuggestions.map(
              (suggestion) =>
                suggestion.id === suggestionId
                  ? {
                      ...suggestion,
                      status: 'Rejected',
                      warnings: [
                        ...suggestion.warnings,
                        'Rejected by tester.',
                      ],
                    }
                  : suggestion,
            ),
          }
        : currentResult,
    )
    setSelectedAreaSuggestionIds((currentIds) =>
      currentIds.filter((id) => id !== suggestionId),
    )
  }

  function cancelSuggestions() {
    setSuggestions([])
    setSelectedSuggestionIds([])
    setImportedSuggestionIds([])
    setProviderError(null)
    setProviderWarnings([])
    setImportSummary(null)
  }

  async function cancelCoveragePlan() {
    if (!selectedSource) {
      return
    }

    const confirmed = window.confirm(
      `Clear the coverage plan for "${selectedSource.title}"? The saved plan and transient coverage-area suggestions for this source will be removed. Existing Test Cases will not be changed.`,
    )

    if (!confirmed) {
      return
    }

    coveragePlanRequestIdRef.current += 1
    coverageAreaSuggestionRequestIdRef.current += 1
    const saved = await onSavedCoveragePlansChange?.(
      removeCoveragePlanForSource(savedCoveragePlans, selectedSource.id),
    )
    if (saved && !saved.ok) {
      setCoveragePlanError(saved.error ?? 'The saved plan could not be cleared. It was preserved.')
      return
    }
    setCoveragePlan(null)
    setSelectedCoverageArea(null)
    setCoverageAreaSuggestionResult(null)
    setCoveragePlanError(null)
    setCoveragePlanWarnings([])
    setCoverageAreaSuggestionError(null)
    setCoverageAreaSuggestionWarnings([])
    setSelectedAreaSuggestionIds([])
    setImportedAreaSuggestionIds([])
    setAreaImportSummary(null)
    setIsPlanningCoverage(false)
    setIsGeneratingCoverageAreaSuggestions(false)
  }

  async function saveReviewedTests(importedTestCases: TestCase[], completed: () => void) {
    if (importInFlight.current || !selectedSource) return
    importInFlight.current = true
    setImportBusy(true)
    setImportError(null)
    const sourceKey = selectedSourceRevisionKey
    try {
      const checks = workspace ? await sourceSuggestionGuard(workspace.repository, selectedSource) : undefined
      if (currentSourceRevisionKeyRef.current !== sourceKey) return
      const saved = workspace
        ? await workspace.save('testCases', [...importedTestCases, ...workspace.get('testCases').items], checks)
        : await onChange([...importedTestCases, ...testCases])
      if (saved && !saved.ok) throw new Error(saved.error ?? 'not saved')
      if (currentSourceRevisionKeyRef.current === sourceKey) completed()
    } catch (reason) {
      if (currentSourceRevisionKeyRef.current === sourceKey) setImportError(reason instanceof Error && [SOURCE_SUGGESTION_BLOCKER, CONFLICT_ERROR].includes(reason.message)
        ? reason.message : 'Test Cases were not saved. Previous library data and your approval selection were preserved. Retry after storage is available.')
    } finally { importInFlight.current = false; setImportBusy(false) }
  }

  async function importSelectedSuggestions() {
    if (!isTransientSourceCurrent || importInFlight.current) {
      return
    }

    const now = new Date().toISOString()
    const importedTestCases = convertReadyAiSuggestionsToTestCases(
      selectedReadySuggestions,
      {
        now,
        createId: createSuggestionTestCaseId,
      },
    )

    if (importedTestCases.length === 0) {
      return
    }

    await saveReviewedTests(importedTestCases, () => {
      setImportedSuggestionIds((currentIds) => [
        ...currentIds,
        ...selectedReadySuggestions.map((suggestion) => suggestion.id),
      ])
      setSelectedSuggestionIds([])
      setImportSummary(
        `${formatCount(importedTestCases.length, 'Test Case')} created from reviewed AI suggestions.`,
      )
    })
  }

  async function importSelectedAreaSuggestions() {
    if (!isTransientSourceCurrent || importInFlight.current || isLoadedStaleCoveragePlan || activeSelectedCoverageArea?.generationReadiness === 'blocked_by_ambiguity') {
      return
    }

    const now = new Date().toISOString()
    const importedTestCases = convertReadyAiSuggestionsToTestCases(
      selectedReadyAreaSuggestions.map(mapAreaSuggestionToImportSuggestion),
      {
        now,
        createId: createSuggestionTestCaseId,
      },
    )

    if (importedTestCases.length === 0) {
      return
    }

    await saveReviewedTests(importedTestCases, () => {
      setImportedAreaSuggestionIds((currentIds) => [
        ...currentIds,
        ...selectedReadyAreaSuggestions.map((suggestion) => suggestion.id),
      ])
      setSelectedAreaSuggestionIds([])
      setAreaImportSummary(
        `${formatCount(importedTestCases.length, 'Test Case')} created from reviewed AI area suggestions.`,
      )
    })
  }

  if (globalCoverageMergeReviewState) {
    return (
      <GlobalCoverageMergeCandidateReview
        state={globalCoverageMergeReviewState}
        onRequestSaveConfirmation={onRequestGlobalCoverageMergeSave}
        onCancelConfirmation={onCancelGlobalCoverageMergeSave}
        onConfirmSave={onConfirmGlobalCoverageMergeSave}
        onDiscardCandidate={onDiscardGlobalCoverageMergeCandidate}
      />
    )
  }

  if (qaSources.length === 0) {
    return <CoverageStart onNavigate={onNavigate} />
  }

  if (!showOptionalPlanner && qaSources.some(source => isNorthstarSource(source.id))) {
    return <SavedCoverageWorkspace sources={qaSources.filter(source => isNorthstarSource(source.id))} onNavigate={onNavigate} onOpenPlanner={() => setShowOptionalPlanner(true)} />
  }

  return (
    <section className="page page--ai-coverage">
      <h2 className="visually-hidden">AI Coverage Workspace</h2>
      {!resolvedCoveragePlan && onNavigate && <aside className="coverage-evidence-entry" aria-label="Start from saved evidence"><div><p className="meta-kicker">{qaSources.some(source => source.id.startsWith('demo-northstar-source-')) ? 'Synthetic demo / evidence ready to review' : 'Start from saved evidence'}</p><p>Review source text, requirement evidence and saved coverage in Sources. The optional planner below creates new AI suggestions; it does not replace that evidence.</p></div><button className="button button--secondary" onClick={() => onNavigate('qa-sources')}>Review source evidence</button></aside>}
      {importBusy && <p className="feedback" role="status">Saving reviewed Test Cases…</p>}
      {importError && <p className="feedback feedback--error" role="alert">{importError}</p>}
      {selectedSource && (packedSuggestionSource?.truncated || packedCoverageSource?.truncated) && <section className="panel enterprise-coverage-entry">
        <h3>{selectedSource.title}</h3>
        <DocumentIntelligencePanel key={`${selectedSource.id}:${selectedSource.updatedAt}`} source={selectedSource} />
        <details className="document-secondary"><summary>Advanced: bounded excerpt analysis</summary>
          <p className="helper-text">Whole-specification analysis is the normal large-document workflow. The older single-request actions below are disabled for partial input unless you explicitly choose an excerpt-only review.</p>
          <label className="requirement-test-option"><input type="checkbox" checked={allowExcerpt} onChange={(event) => setExcerptSourceRevision(event.target.checked ? selectedSourceRevisionKey : null)} />Enable excerpt-only analysis for this source</label>
          <p className="helper-text">An excerpt is not a whole-source coverage plan. Source omissions stay visible; saved requirement-backed coverage is unchanged.</p>
        </details>
      </section>}
      <CoverageDeck
        qaSources={qaSources}
        selectedQaSourceId={selectedQaSourceId}
        activePackedSource={activePackedSource}
        activeSourceSectionIndex={selectedSourceSectionIndex}
        coverageSourceSectionContext={coverageSourceSectionContext}
        activeMode={activeMode}
        coveragePlan={resolvedCoveragePlan}
        selectedArea={resolvedSelectedCoverageArea}
        areaResult={activeCoverageAreaSuggestionResult}
        selectedIds={selectedAreaSuggestionIds}
        importedIds={importedAreaSuggestionIds}
        selectedReadyCount={selectedReadyAreaSuggestions.length}
        importSummary={areaImportSummary}
        planPersistenceState={planPersistenceState}
        coveragePlanSectionNotice={coveragePlanSectionNotice}
        areaProgress={areaProgress}
        coveragePlanUnavailableReason={
          coveragePlanProvider.isAvailable
            ? null
            : coveragePlanProvider.unavailableReason ??
              AI_COVERAGE_PLAN_PROVIDER_UNAVAILABLE_MESSAGE
        }
        coverageAreaSuggestionUnavailableReason={
          coverageAreaSuggestionProvider.isAvailable
            ? null
            : coverageAreaSuggestionProvider.unavailableReason ??
              AI_COVERAGE_AREA_SUGGESTION_PROVIDER_UNAVAILABLE_MESSAGE
        }
        coveragePlanError={coveragePlanError}
        coveragePlanWarnings={displayedCoveragePlanWarnings}
        areaGenerationError={coverageAreaSuggestionError}
        areaGenerationWarnings={coverageAreaSuggestionWarnings}
        isPlanningCoverage={isPlanningCoverage}
        isGeneratingAreaSuggestions={isGeneratingCoverageAreaSuggestions}
        canPlanCoverage={canPlanCoverage}
        canGenerateAreaSuggestions={canGenerateCoverageAreaSuggestions}
        resultRef={areaSuggestionResultRef}
        onPlanCoverage={handlePlanCoverage}
        onClearCoveragePlan={cancelCoveragePlan}
        onSourceChange={handleSourceChange}
        onModeChange={setActiveMode}
        onSelectArea={handleSelectCoverageArea}
        onGenerateAreaSuggestions={handleGenerateCoverageAreaSuggestions}
        onToggleSelected={toggleSelectedAreaSuggestion}
        onReject={rejectAreaSuggestion}
        onImportSelected={importSelectedAreaSuggestions}
      />

      {activePackedSource && activeMode === 'suggestions' ? (
        <>
            <section className="panel" aria-labelledby="ai-source-preview-heading">
              <div className="panel-heading">
                <div className="panel-heading__content">
                  <h3 id="ai-source-preview-heading">Source Privacy Preview</h3>
                  <p>{activePackedSource.privacySummary.message}</p>
                  <p>
                    Suggestion generation uses only this selected source context
                    and still requires explicit QA approval before Test Cases are
                    created.
                  </p>
                </div>
                <span className="panel-caption">
                  Updated {formatDateTime(activePackedSource.updatedAt)}
                </span>
              </div>

              <div className="summary-grid">
                <SummaryCard
                  label="Characters"
                  value={activePackedSource.originalCharacterCount}
                  description={`${activePackedSource.packedCharacterCount} characters prepared for this request mode.`}
                  tone="neutral"
                />
                <SummaryCard
                  label="Limit"
                  value={activePackedSource.maxCharacterCount}
                  description="Hard cap for test suggestion request construction."
                  tone="neutral"
                />
              <SummaryCard
                label="Truncated"
                value={activePackedSource.truncated ? 'Yes' : 'No'}
                description={
                  activePackedSource.truncated
                    ? 'Only the first supported characters would be sent.'
                    : 'The full selected source fits within the limit.'
                }
                tone={activePackedSource.truncated ? 'warning' : 'positive'}
              />
              <SummaryCard
                label="Status"
                value={activePackedSource.status}
                description={`${activePackedSource.sourceType} selected for AI planning.`}
                tone={
                  activePackedSource.status === 'Ready for test design'
                    ? 'positive'
                    : 'warning'
                }
              />
            </div>

            <div className="description-grid">
              <div className="description-block">
                <span className="field-label">Included</span>
                <ul className="ai-suggestion-note-list">
                  {activePackedSource.privacySummary.included.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div className="description-block">
                <span className="field-label">Excluded</span>
                <ul className="ai-suggestion-note-list">
                  {activePackedSource.privacySummary.excluded.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="description-block">
              <span className="field-label">Source preview</span>
              <p className="qa-source-preview">{activePackedSource.preview}</p>
            </div>
            </section>

            <>
              <section className="panel" aria-labelledby="ai-provider-heading">
                <div className="panel-heading">
                  <div className="panel-heading__content">
                    <h3 id="ai-provider-heading">
                      Advanced: direct suggestions
                    </h3>
                    <p>
                      This skips the coverage map workflow and asks for direct
                      source-backed suggestions. Ready still means eligible for
                      QA approval, not automatically approved.
                    </p>
                  </div>
                </div>

                {!provider.isAvailable ? (
                  <div className="storage-alert" role="status">
                    {provider.unavailableReason ?? AI_PROVIDER_UNAVAILABLE_MESSAGE}
                  </div>
                ) : null}

                {providerError ? (
                  <div className="storage-alert" role="alert">
                    {providerError}
                  </div>
                ) : null}

                {providerWarnings.length > 0 ? (
                  <div className="qa-source-import-warning" role="status">
                    {providerWarnings.join(' ')}
                  </div>
                ) : null}

                {importSummary ? (
                  <div className="storage-alert" role="status">
                    {importSummary}
                  </div>
                ) : null}

                <div className="button-row">
                  {provider.isAvailable ? (
                    <button
                      type="button"
                      className="button button--primary"
                      onClick={handleGenerate}
                      disabled={!canGenerate || isGenerating}
                    >
                      {isGenerating
                        ? 'Generating direct suggestions'
                        : 'Generate direct suggestions'}
                    </button>
                  ) : (
                    <button type="button" className="button button--secondary" disabled>
                      Generation unavailable
                    </button>
                  )}
                  {activeSuggestions.length > 0 ? (
                    <button
                      type="button"
                      className="button button--secondary"
                      onClick={cancelSuggestions}
                    >
                      Cancel suggestions
                    </button>
                  ) : null}
                  {activeSuggestions.length > 0 ? (
                    <button
                      type="button"
                      className="button button--primary"
                      onClick={importSelectedSuggestions}
                      disabled={selectedReadySuggestions.length === 0}
                    >
                      Create Test Cases from approved Ready suggestions
                    </button>
                  ) : null}
                </div>
              </section>

              {activeSuggestions.length > 0 ? (
                <>
                  <div className="summary-grid">
                    <SummaryCard
                      label="Ready"
                      value={groupedSuggestions.ready.length}
                      description="Import-eligible suggestions with evidence and no assumptions or warnings."
                      tone="positive"
                    />
                    <SummaryCard
                      label="Needs review"
                      value={groupedSuggestions.needsReview.length}
                      description="Suggestions with missing evidence, assumptions, warnings, vague steps, or validation issues."
                      tone="warning"
                    />
                    <SummaryCard
                      label="Rejected"
                      value={groupedSuggestions.rejected.length}
                      description="Suggestions that cannot become Test Cases as-is."
                      tone="critical"
                    />
                    <SummaryCard
                      label="QA approved"
                      value={selectedReadySuggestions.length}
                      description="Ready suggestions explicitly approved for import."
                      tone="neutral"
                    />
                  </div>

                  <SuggestionGroup
                    title="Ready"
                    description="Import-eligible suggestions with source evidence. QA must still approve before creating Test Cases."
                    suggestions={groupedSuggestions.ready}
                    selectedIds={selectedSuggestionIds}
                    importedIds={importedSuggestionIds}
                    onToggleSelected={toggleSelectedSuggestion}
                    onReject={rejectSuggestion}
                  />
                  <SuggestionGroup
                    title="Needs review"
                    description="Suggestions with missing evidence, assumptions, warnings, vague steps, or validation issues."
                    suggestions={groupedSuggestions.needsReview}
                    selectedIds={selectedSuggestionIds}
                    importedIds={importedSuggestionIds}
                    onToggleSelected={toggleSelectedSuggestion}
                    onReject={rejectSuggestion}
                  />
                  <SuggestionGroup
                    title="Rejected"
                    description="Suggestions that cannot be imported without substantial correction."
                    suggestions={groupedSuggestions.rejected}
                    selectedIds={selectedSuggestionIds}
                    importedIds={importedSuggestionIds}
                    onToggleSelected={toggleSelectedSuggestion}
                    onReject={rejectSuggestion}
                  />
                </>
              ) : null}
            </>
        </>
      ) : null}
    </section>
  )
}
