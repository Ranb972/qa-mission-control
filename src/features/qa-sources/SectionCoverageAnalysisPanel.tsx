import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { resolveAiSectionCoveragePlanContext } from '../ai-suggestions/aiSectionCoveragePlanContext'
import { createAiSectionCoveragePlanRequestGuard } from '../ai-suggestions/aiSectionCoveragePlanRequestGuard'
import type {
  AiSectionCoveragePlanProvider,
  PersistedSectionCoveragePlanRecord,
} from '../ai-suggestions/aiSectionCoveragePlanTypes'
import { getSectionBehaviorGrounding, type AiSectionCoverageArea } from '../ai-suggestions/aiSectionCoveragePlanTypes'
import { parseAiSectionCoveragePlanResponse } from '../ai-suggestions/aiSectionCoveragePlanValidation'
import {
  createPersistedSectionCoveragePlanRecord,
  type SaveSectionCoveragePlansResult,
  type SectionCoveragePlanFreshness,
} from '../../lib/storage/sectionCoveragePlanStorage'
import type { QaSourceSection, QaSourceSectionIndex } from './qaSourceSections'
import type { QaSource } from './qaSourceTypes'

export type SectionCoverageAnalysisRequestState =
  | { status: 'idle' }
  | { status: 'analyzing' }
  | { status: 'failed'; message: string }

const INITIAL_SECTION_COVERAGE_ANALYSIS_REQUEST_STATE = {
  status: 'idle',
} as const satisfies SectionCoverageAnalysisRequestState

type SectionCoverageAnalysisPanelProps = {
  qaSource: QaSource
  sectionIndex: QaSourceSectionIndex
  section: QaSourceSection
  selectedSection: {
    sectionId: string
    stableKey: string
  }
  savedRecord: PersistedSectionCoveragePlanRecord | null
  freshness: SectionCoveragePlanFreshness | null
  provider: AiSectionCoveragePlanProvider
  requestState: SectionCoverageAnalysisRequestState
  onRequestStateChange: (state: SectionCoverageAnalysisRequestState) => void
  onUpsert: (
    record: PersistedSectionCoveragePlanRecord,
    replacedRecordId?: string,
  ) => SaveSectionCoveragePlansResult | Promise<SaveSectionCoveragePlansResult>
}

const SAFE_FAILURE_MESSAGE =
  'Section analysis could not be completed safely. Try again.'

function getEvidenceSupportLabel(area: AiSectionCoverageArea) {
  const grounding = getSectionBehaviorGrounding(area)
  return grounding.status === 'linked' ? 'Evidence linked for each behavior'
    : grounding.status === 'partial' ? 'Partial evidence · review behaviors' : 'No validated behavior evidence'
}

function ReviewList({
  heading,
  items,
}: {
  heading: string
  items: string[]
}) {
  return (
    <section className="section-coverage-analysis__category">
      <h6>{heading}</h6>
      {items.length > 0 ? (
        <ul className="section-coverage-analysis__compact-list">
          {items.map((item, index) => (
            <li key={`${heading}-${index}`}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="section-coverage-analysis__empty">None identified.</p>
      )}
    </section>
  )
}

function SavedAnalysis({
  record,
  isFresh,
  headingRef,
  focusHeading = false,
}: {
  record: PersistedSectionCoveragePlanRecord
  isFresh: boolean
  headingRef?: React.RefObject<HTMLHeadingElement | null>
  focusHeading?: boolean
}) {
  const { plan } = record

  return (
    <div
      className={`section-coverage-analysis__result${
        isFresh ? '' : ' section-coverage-analysis__result--stale'
      }`}
    >
      <div className="section-coverage-analysis__result-heading">
        <div>
          <p className="meta-kicker">{isFresh ? 'Current' : 'Stale'}</p>
          <h5 ref={headingRef} tabIndex={focusHeading ? -1 : undefined}>
            {isFresh ? 'Current section analysis' : 'Saved section analysis'}
          </h5>
        </div>
        <span
          className={`section-coverage-status section-coverage-status--${
            isFresh ? 'current' : 'stale'
          }`}
        >
          {isFresh ? 'Current' : 'Stale'}
        </span>
      </div>

      {!isFresh ? (
        <div className="section-coverage-analysis__stale-copy">
          <p>
            This saved analysis reflects an earlier source revision. Review it
            as historical work and re-analyze the current section.
          </p>
          <p>
            Saved snapshot: {record.sectionSnapshot.path.join(' / ')} · Lines{' '}
            {record.sectionSnapshot.startLine}-{record.sectionSnapshot.endLine}
          </p>
        </div>
      ) : null}

      <section className="section-coverage-analysis__coverage-areas">
        <h6>Coverage areas</h6>
        {plan.coverageAreas.length > 0 ? (
          <ul className="section-coverage-analysis__area-list">
            {plan.coverageAreas.map((area) => (
              <li key={area.id}>
                <div className="section-coverage-analysis__area-heading">
                  <strong>{area.name}</strong>
                  <span
                    className={`section-coverage-evidence-support section-coverage-evidence-support--${getSectionBehaviorGrounding(area).status === 'linked' ? 'source_backed' : 'needs_review'}`}
                  >
                    {getEvidenceSupportLabel(area)}
                  </span>
                </div>
                <p>{area.summary}</p>
                <details className="section-coverage-analysis__disclosure">
                  <summary>Behaviors and validated evidence</summary>
                  <div className="section-coverage-analysis__disclosure-body">
                    <section className="section-coverage-analysis__category">
                      <h6>Behaviors</h6>
                      <p>Quotes are matched to source text, not QA approval. Review whether each quote supports the interpretation.</p>
                      {area.behaviors.length === 0 ? <p>No complete behaviors retained; review the source.</p> : <ul className="section-coverage-analysis__compact-list">
                        {area.behaviors.map((behavior, index) => {
                          const quotes = area.behaviorEvidence?.find((item) => item.behavior === behavior)?.evidence ?? []
                          return <li key={index}><strong>{behavior}</strong>
                            {quotes.length > 0 ? <ul>{quotes.map((quote, quoteIndex) => <li key={quoteIndex}><q style={{ whiteSpace: 'pre-wrap' }}>{quote}</q></li>)}</ul>
                              : <span>Needs evidence review — no validated quote linked to this behavior.</span>}
                          </li>
                        })}
                      </ul>}
                    </section>
                    <ReviewList
                      heading="Validated area excerpts (not evidence for every behavior)"
                      items={area.evidence}
                    />
                  </div>
                </details>
              </li>
            ))}
          </ul>
        ) : (
          <p className="section-coverage-analysis__empty">
            No coverage areas were returned for review.
          </p>
        )}
      </section>

      <div className="section-coverage-analysis__category-grid">
        <ReviewList heading="Actors" items={plan.actors} />
        <ReviewList heading="States" items={plan.states} />
        <ReviewList heading="Inputs" items={plan.inputs} />
        <ReviewList heading="Failure modes" items={plan.failureModes} />
        <ReviewList
          heading="Integration risks"
          items={plan.integrationRisks}
        />
        <ReviewList
          heading="Permissions and security"
          items={plan.permissionsSecurity}
        />
        <ReviewList
          heading="Data and persistence concerns"
          items={plan.dataPersistenceConcerns}
        />
      </div>

      <details className="section-coverage-analysis__disclosure">
        <summary>Ambiguities and next coverage</summary>
        <div className="section-coverage-analysis__disclosure-body">
          <section className="section-coverage-analysis__category">
            <h6>Ambiguities</h6>
            {plan.ambiguities.length > 0 ? (
              <ul className="section-coverage-analysis__compact-list">
                {plan.ambiguities.map((ambiguity) => (
                  <li key={ambiguity.id}>
                    <strong>{ambiguity.question}</strong>
                    <span>{ambiguity.whyItMatters}</span>
                    <span>Severity: {ambiguity.severity}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="section-coverage-analysis__empty">
                None identified.
              </p>
            )}
          </section>

          <section className="section-coverage-analysis__category">
            <h6>Next coverage</h6>
            {plan.nextCoverage.length > 0 ? (
              <ul className="section-coverage-analysis__compact-list">
                {plan.nextCoverage.map((item) => (
                  <li key={item.id}>
                    <strong>{item.title}</strong>
                    <span>{item.rationale}</span>
                    <span>Priority: {item.priority}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="section-coverage-analysis__empty">
                None identified.
              </p>
            )}
          </section>
        </div>
      </details>

      {plan.warnings.length > 0 ? (
        <section className="section-coverage-analysis__warnings">
          <h6>Warnings</h6>
          <ul className="section-coverage-analysis__compact-list">
            {plan.warnings.map((warning, index) => (
              <li key={`section-warning-${index}`}>{warning}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}

function getContextKey(
  context: ReturnType<typeof resolveAiSectionCoveragePlanContext>,
) {
  if (!context.ok) {
    return 'invalid'
  }

  return [
    context.context.sourceIdentity.qaSourceId,
    context.context.sourceIdentity.qaSourceCreatedAt,
    context.context.sourceIdentity.qaSourceUpdatedAt,
    context.context.sourceIdentity.sourceFingerprint,
    context.context.sectionIdentity.sectionId,
    context.context.sectionIdentity.stableKey,
    context.context.sectionIdentity.contentFingerprint,
  ].join('\u001f')
}

export function SectionCoverageAnalysisPanel({
  qaSource,
  sectionIndex,
  section,
  selectedSection,
  savedRecord,
  freshness,
  provider,
  requestState,
  onRequestStateChange,
  onUpsert,
}: SectionCoverageAnalysisPanelProps) {
  const [excerptContextKey, setExcerptContextKey] = useState<string | null>(null)
  const resultHeadingRef = useRef<HTMLHeadingElement>(null)
  const errorHeadingRef = useRef<HTMLHeadingElement>(null)
  const successFocusRequestedRef = useRef(false)
  const guardRef = useRef(createAiSectionCoveragePlanRequestGuard())
  const contextResult = resolveAiSectionCoveragePlanContext({
    qaSource,
    sectionIndex,
    selectedSection,
  })
  const context = contextResult.ok ? contextResult.context : null
  const contextKey = getContextKey(contextResult)
  const latestContextRef = useRef(context)
  const previousContextKeyRef = useRef(contextKey)

  useLayoutEffect(() => {
    latestContextRef.current = context

    if (previousContextKeyRef.current === contextKey) {
      return
    }

    previousContextKeyRef.current = contextKey
    guardRef.current.invalidateIfContextChanged(context)

    if (requestState.status === 'analyzing') {
      onRequestStateChange(INITIAL_SECTION_COVERAGE_ANALYSIS_REQUEST_STATE)
    }
  }, [context, contextKey, onRequestStateChange, requestState.status])

  useLayoutEffect(
    () => () => {
      guardRef.current.invalidate()
    },
    [],
  )

  useEffect(() => {
    if (
      successFocusRequestedRef.current &&
      requestState.status === 'idle' &&
      savedRecord &&
      freshness?.isFresh
    ) {
      successFocusRequestedRef.current = false
      resultHeadingRef.current?.focus()
    }
  }, [freshness?.isFresh, requestState.status, savedRecord])

  useEffect(() => {
    if (requestState.status === 'failed') {
      errorHeadingRef.current?.focus()
    }
  }, [requestState.status])

  const isAnalyzing = requestState.status === 'analyzing'
  const isFailed = requestState.status === 'failed'
  const savedIsFresh = Boolean(savedRecord && freshness?.isFresh)
  const savedIsStale = Boolean(savedRecord && !freshness?.isFresh)
  const canAnalyze = Boolean(context && provider.isAvailable && !isAnalyzing && (!context.visibleSection.truncated || excerptContextKey === contextKey))
  const announcement = isAnalyzing
    ? `Analyzing “${section.title}”…`
    : isFailed
      ? `Analysis for “${section.title}” failed.`
      : savedIsFresh
        ? `Analysis for “${section.title}” is ready for review.`
        : savedIsStale
          ? `Saved analysis for “${section.title}” is stale.`
          : ''

  function failSafely() {
    onRequestStateChange({
      status: 'failed',
      message: SAFE_FAILURE_MESSAGE,
    })
  }

  async function analyzeSection() {
    const requestContext = latestContextRef.current

    if (!requestContext || !canAnalyze) {
      return
    }

    const guardedRequest = guardRef.current.begin(requestContext)
    onRequestStateChange({ status: 'analyzing' })

    try {
      const response = await provider.generateSectionCoveragePlan(
        requestContext,
        { signal: guardedRequest.signal },
      )

      if (!guardRef.current.canAccept(guardedRequest.identity, latestContextRef.current)) return
      const latestContext = latestContextRef.current
      if (!latestContext) return

      const normalized = parseAiSectionCoveragePlanResponse(
        {
          ...response.analysis,
          warnings: Array.from(new Set([...response.analysis.warnings, ...response.warnings])).slice(0, 20),
        },
        { visibleSectionContent: latestContext.visibleSection.content, visibleSectionTruncated: latestContext.visibleSection.truncated },
      )
      if (!normalized.ok || !normalized.plan) {
        failSafely()
        return
      }

      let nextRecord: PersistedSectionCoveragePlanRecord
      try {
        nextRecord = createPersistedSectionCoveragePlanRecord({
          context: latestContext,
          plan: normalized.plan,
          analyzedAt: new Date().toISOString(),
        })
      } catch {
        failSafely()
        return
      }

      const saveResult = await onUpsert(nextRecord, savedRecord?.id)
      if (!guardRef.current.canAccept(guardedRequest.identity, latestContextRef.current)) return
      if (!saveResult.ok) {
        failSafely()
        return
      }
      guardRef.current.acceptIfCurrent(guardedRequest.identity, latestContextRef.current, () => {
        successFocusRequestedRef.current = true
        onRequestStateChange(INITIAL_SECTION_COVERAGE_ANALYSIS_REQUEST_STATE)
      })
    } catch {
      guardRef.current.acceptIfCurrent(
        guardedRequest.identity,
        latestContextRef.current,
        failSafely,
      )
    }
  }

  const actionLabel = isAnalyzing
    ? 'Analyzing…'
    : isFailed
      ? 'Try again'
      : savedRecord
        ? 'Re-analyze section'
        : 'Analyze section'
  const showSavedAnalysis = Boolean(
    savedRecord && (!isAnalyzing || savedIsStale),
  )

  return (
    <section
      className="section-coverage-analysis"
      role="region"
      aria-label={`Section coverage analysis for ${section.title}`}
      aria-busy={isAnalyzing}
    >
      <div className="section-coverage-analysis__heading">
        <div>
          <p className="meta-kicker">Selected section</p>
          <h4>Section Coverage Analysis</h4>
          <p>{section.path.join(' / ')}</p>
        </div>
        <button
          type="button"
          className="button button--primary button--compact"
          disabled={!canAnalyze}
          onClick={analyzeSection}
        >
          {actionLabel}
        </button>
      </div>

      <p className="visually-hidden" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
      {context?.visibleSection.truncated && <div className="document-preflight">
        <p>This section exceeds a single-request boundary. Analyze Entire Specification handles all of it as bounded regions, without manual splitting.</p>
        <details><summary>Advanced excerpt-only review</summary><label className="requirement-test-option"><input type="checkbox" checked={excerptContextKey === contextKey} onChange={(event) => setExcerptContextKey(event.target.checked ? contextKey : null)} />Analyze only the first bounded section excerpt</label></details>
      </div>}

      {!savedRecord && !isAnalyzing && !isFailed ? (
        <p className="section-coverage-analysis__empty-state">
          This selected section has not been analyzed. Run one review request
          when you are ready.
        </p>
      ) : null}

      {isAnalyzing ? (
        <div className="section-coverage-analysis__loading" role="status">
          <strong>Analyzing “{section.title}”…</strong>
          <span>Duplicate submission is disabled until this request ends.</span>
        </div>
      ) : null}

      {isFailed ? (
        <div className="section-coverage-analysis__error" role="alert">
          <h5 ref={errorHeadingRef} tabIndex={-1}>
            Section analysis failed
          </h5>
          <p>{requestState.message}</p>
        </div>
      ) : null}

      {showSavedAnalysis && savedRecord ? (
        <SavedAnalysis
          record={savedRecord}
          isFresh={savedIsFresh}
          headingRef={resultHeadingRef}
          focusHeading={savedIsFresh}
        />
      ) : null}

      {savedRecord?.sectionSnapshot.truncated ? (
        <p className="section-coverage-analysis__truncation">
          Only the first 24,000 characters of this section were analyzed.
        </p>
      ) : null}

      <div className="section-coverage-analysis__meaning">
        <p>
          Only the selected section’s visible source text, up to 24,000
          characters, is sent to the configured AI provider. Remove secrets
          before analyzing.
        </p>
        <p>
          Section analysis is review material, not coverage proof or QA
          approval.
        </p>
      </div>
    </section>
  )
}
