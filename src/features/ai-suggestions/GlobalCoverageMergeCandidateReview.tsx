import { useLayoutEffect, useMemo, useRef } from 'react'
import {
  createAiCoveragePlanMergeBehaviorOutputFindingId,
  createAiCoveragePlanMergeScalarOutputFindingId,
} from './aiCoveragePlanMergeOutputIdentity'
import type { GlobalCoverageMergeCandidate } from './aiCoveragePlanMergeTypes'

export type GlobalCoverageMergeReviewState =
  | {
      status: 'building'
      sourceId: string
      selectedAnalysisCount: number
    }
  | {
      status: 'ready'
      candidate: GlobalCoverageMergeCandidate
      error: string | null
    }
  | {
      status: 'stale'
      candidate: GlobalCoverageMergeCandidate | null
      selectedAnalysisCount: number
      message: string
    }
  | {
      status: 'failed'
      sourceId: string
      selectedAnalysisCount: number
      message: string
    }
  | {
      status: 'confirmation_required'
      candidate: GlobalCoverageMergeCandidate
      mode: 'create' | 'replace'
      expectedTargetKey: string | null
      error: string | null
    }

type GlobalCoverageMergeCandidateReviewProps = {
  state: GlobalCoverageMergeReviewState
  onRequestSaveConfirmation: () => void
  onCancelConfirmation: () => void
  onConfirmSave: () => void
  onDiscardCandidate: () => void
}

function formatCount(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`
}

function getUnrepresentedSectionCount(candidate: GlobalCoverageMergeCandidate) {
  return (
    candidate.sectionScope.unselected.length +
    candidate.sectionScope.stale.length +
    candidate.sectionScope.unanalyzed.length +
    candidate.sectionScope.excluded.length
  )
}

function getFindingLabel(
  candidate: GlobalCoverageMergeCandidate,
  findingId: string,
) {
  const area = candidate.planDraft.coverageAreas.find(
    (candidateArea) => candidateArea.id === findingId,
  )
  if (area) return area.name

  for (const candidateArea of candidate.planDraft.coverageAreas) {
    const behaviorIndex = candidateArea.behaviors.findIndex(
      (_behavior, index) =>
        createAiCoveragePlanMergeBehaviorOutputFindingId(
          candidateArea.id,
          index,
        ) === findingId,
    )

    if (behaviorIndex >= 0) {
      return `${candidateArea.name} — ${candidateArea.behaviors[behaviorIndex]}`
    }
  }

  const scalarGroups = [
    ['actor', 'Actor', candidate.planDraft.actors],
    ['state', 'State', candidate.planDraft.states],
    ['input', 'Input', candidate.planDraft.inputs],
    ['failure_mode', 'Failure mode', candidate.planDraft.failureModes],
    [
      'integration_risk',
      'Integration risk',
      candidate.planDraft.integrationRisks,
    ],
    [
      'permissions_security',
      'Permission or security concern',
      candidate.planDraft.permissionsSecurity,
    ],
    [
      'data_persistence',
      'Data persistence rule',
      candidate.planDraft.dataPersistenceRules,
    ],
    ['warning', 'Warning', candidate.planDraft.warnings],
  ] as const

  for (const [kind, label, values] of scalarGroups) {
    const valueIndex = values.findIndex(
      (_value, index) =>
        createAiCoveragePlanMergeScalarOutputFindingId(kind, index) ===
        findingId,
    )

    if (valueIndex >= 0) {
      return `${label} — ${values[valueIndex]}`
    }
  }

  const ambiguity = candidate.planDraft.ambiguities.find(
    (candidateAmbiguity) => candidateAmbiguity.id === findingId,
  )
  if (ambiguity) return ambiguity.question

  const nextArea = candidate.planDraft.nextGenerationAreas.find(
    (candidateArea) => candidateArea.id === findingId,
  )
  if (nextArea) return nextArea.title

  return findingId
}

function getContributingSectionTitles(
  candidate: GlobalCoverageMergeCandidate,
  findingId: string,
) {
  const provenance = candidate.outputProvenance.find(
    (item) => item.outputFindingId === findingId,
  )
  if (!provenance) return []

  const sectionTitleByAnalysisRefId = new Map(
    candidate.sectionScope.selected.map((section) => [
      section.analysisRefId,
      section.title,
    ]),
  )

  return Array.from(
    new Set(
      provenance.contributors
        .map((contributor) =>
          sectionTitleByAnalysisRefId.get(contributor.analysisRefId),
        )
        .filter((title): title is string => Boolean(title)),
    ),
  )
}

function CandidateValueList({
  label,
  values,
}: {
  label: string
  values: readonly string[]
}) {
  if (values.length === 0) return null

  return (
    <div className="global-merge-candidate__value-group">
      <h5>{label}</h5>
      <ul>
        {values.map((value) => (
          <li key={value}>{value}</li>
        ))}
      </ul>
    </div>
  )
}

const CANDIDATE_READINESS_LABELS = {
  source_backed: 'Source-backed evidence',
  needs_review: 'Needs QA review',
  blocked_by_ambiguity: 'Blocked by ambiguity',
} as const

function CandidateCoverageAreas({
  candidate,
}: {
  candidate: GlobalCoverageMergeCandidate
}) {
  return (
    <section
      className="global-merge-candidate__card"
      aria-labelledby="merge-candidate-areas-heading"
    >
      <h3 id="merge-candidate-areas-heading">Candidate coverage areas</h3>
      <p>
        Review the merged findings and their evidence before deciding whether to
        save this candidate.
      </p>
      <div className="global-merge-candidate__area-grid">
        {candidate.planDraft.coverageAreas.map((area) => {
          const contributingSections = getContributingSectionTitles(
            candidate,
            area.id,
          )

          return (
            <article
              key={area.id}
              className="global-merge-candidate__area"
              aria-label={`${area.name} coverage area`}
            >
              <div className="global-merge-candidate__area-heading">
                <h4>{area.name}</h4>
                <span
                  className={`global-merge-candidate__readiness global-merge-candidate__readiness--${area.generationReadiness}`}
                >
                  {CANDIDATE_READINESS_LABELS[area.generationReadiness]}
                </span>
              </div>
              <p>{area.summary}</p>
              {contributingSections.length > 0 ? (
                <p className="global-merge-candidate__source-note">
                  Contributing sections: {contributingSections.join(', ')}
                </p>
              ) : null}
              <div className="global-merge-candidate__value-grid">
                <CandidateValueList label="Behaviors" values={area.behaviors} />
                <CandidateValueList label="Risks" values={area.risks} />
                <CandidateValueList label="Source-backed evidence" values={area.evidence} />
                <CandidateValueList label="Ambiguities" values={area.ambiguities} />
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}

function CandidateCoverageDimensions({
  candidate,
}: {
  candidate: GlobalCoverageMergeCandidate
}) {
  const groups = [
    ['Actors', candidate.planDraft.actors],
    ['States', candidate.planDraft.states],
    ['Inputs', candidate.planDraft.inputs],
    ['Failure modes', candidate.planDraft.failureModes],
    ['Integration risks', candidate.planDraft.integrationRisks],
    ['Permissions and security', candidate.planDraft.permissionsSecurity],
    ['Data persistence', candidate.planDraft.dataPersistenceRules],
    [
      'Open ambiguities',
      candidate.planDraft.ambiguities.map(
        (ambiguity) =>
          `${ambiguity.question} — ${ambiguity.whyItMatters} (${ambiguity.severity})`,
      ),
    ],
    [
      'Follow-up coverage',
      candidate.planDraft.nextGenerationAreas.map(
        (area) => `${area.title} — ${area.rationale} (${area.priority})`,
      ),
    ],
  ] as const
  const visibleGroups = groups.filter(([, values]) => values.length > 0)

  return (
    <section
      className="global-merge-candidate__card"
      aria-labelledby="merge-candidate-dimensions-heading"
    >
      <h3 id="merge-candidate-dimensions-heading">Coverage dimensions</h3>
      {visibleGroups.length > 0 ? (
        <div className="global-merge-candidate__value-grid">
          {visibleGroups.map(([label, values]) => (
            <CandidateValueList key={label} label={label} values={values} />
          ))}
        </div>
      ) : (
        <p>No additional coverage dimensions were found in the selected analyses.</p>
      )}
    </section>
  )
}

function CandidateSectionScope({
  candidate,
}: {
  candidate: GlobalCoverageMergeCandidate
}) {
  const groups = [
    ['Current, not selected', candidate.sectionScope.unselected],
    ['Stale analysis', candidate.sectionScope.stale],
    ['Not analyzed', candidate.sectionScope.unanalyzed],
    ['Excluded from coverage', candidate.sectionScope.excluded],
  ] as const
  const visibleGroups = groups.filter(([, sections]) => sections.length > 0)

  return (
    <section
      className="global-merge-candidate__card"
      aria-labelledby="merge-candidate-scope-heading"
    >
      <h3 id="merge-candidate-scope-heading">Sections outside this candidate</h3>
      <p>
        These source sections do not contribute findings to this unsaved plan.
      </p>
      {visibleGroups.length > 0 ? (
        <div className="global-merge-candidate__scope-grid">
          {visibleGroups.map(([label, sections]) => (
            <div key={label} className="global-merge-candidate__scope-group">
              <h4>{label}</h4>
              <ul>
                {sections.map((section) => (
                  <li key={section.sectionId}>
                    {section.ordinal}. {section.path.join(' / ')}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <p>Every current in-scope section is represented by a selected analysis.</p>
      )}
    </section>
  )
}

function CandidateMetrics({
  candidate,
}: {
  candidate: GlobalCoverageMergeCandidate
}) {
  const likelyOverlapCount = candidate.reviewRelations.filter(
    (relation) => relation.kind === 'likely_overlap',
  ).length
  const conflictCount = candidate.reviewRelations.filter(
    (relation) => relation.kind === 'conflict',
  ).length
  const unrepresentedCount = getUnrepresentedSectionCount(candidate)
  const metrics = [
    formatCount(candidate.selectedAnalyses.length, 'selected analysis', 'selected analyses'),
    formatCount(candidate.planDraft.coverageAreas.length, 'merged area'),
    formatCount(
      candidate.exactDuplicateSummary.collapsedFindingCount,
      'exact duplicate',
    ),
    formatCount(likelyOverlapCount, 'likely overlap'),
    formatCount(conflictCount, 'conflict'),
    formatCount(
      unrepresentedCount,
      'section not represented',
      'sections not represented',
    ),
  ]

  return (
    <div className="global-merge-candidate__metrics" aria-label="Candidate summary">
      {metrics.map((metric) => (
        <span key={metric} className="global-merge-candidate__metric">
          {metric}
        </span>
      ))}
    </div>
  )
}

function CandidateDetails({
  candidate,
}: {
  candidate: GlobalCoverageMergeCandidate
}) {
  const duplicateGroups = candidate.exactDuplicateSummary.groups
  const likelyOverlaps = candidate.reviewRelations.filter(
    (relation) => relation.kind === 'likely_overlap',
  )
  const conflicts = candidate.reviewRelations.filter(
    (relation) => relation.kind === 'conflict',
  )
  const warnings = Array.from(
    new Set([...candidate.warnings, ...candidate.planDraft.warnings]),
  ).filter(
    (warning) => !warning.startsWith('Merged section-analysis scope counts;'),
  )

  return (
    <>
      <section className="global-merge-candidate__card" aria-labelledby="merge-contributors-heading">
        <h3 id="merge-contributors-heading">Contributing sections</h3>
        <div className="global-merge-chip-row">
          {candidate.sectionScope.selected.map((section) => (
            <span key={section.analysisRefId} className="global-merge-chip">
              {section.title}
            </span>
          ))}
        </div>
      </section>

      <div className="global-merge-review-relations">
      <section className="global-merge-candidate__card" aria-labelledby="merge-overlaps-heading">
        <h3 id="merge-overlaps-heading">Likely overlaps kept separate</h3>
        <p>Likely overlaps are kept separate for explicit QA review.</p>
        {likelyOverlaps.length > 0 ? (
          <div className="global-merge-relation-list">
            {likelyOverlaps.map((relation) => (
              <article
                key={relation.relationId}
                className="global-merge-relation-card global-merge-relation-card--overlap"
              >
                <span className="global-merge-relation-card__status">
                  Likely overlap
                </span>
                <p>
                  {getFindingLabel(candidate, relation.outputFindingIds[0])} /{' '}
                  {getFindingLabel(candidate, relation.outputFindingIds[1])}
                </p>
              </article>
            ))}
          </div>
        ) : (
          <p>No likely overlaps were classified.</p>
        )}
      </section>

      <section
        className="global-merge-candidate__card global-merge-candidate__card--conflict"
        aria-labelledby="merge-conflicts-heading"
      >
        <h3 id="merge-conflicts-heading">Conflicts kept separate</h3>
        <p>Conflicts are kept separate and block automatic readiness claims.</p>
        {conflicts.length > 0 ? (
          <div className="global-merge-relation-list">
            {conflicts.map((relation) => (
              <article
                key={relation.relationId}
                className="global-merge-relation-card global-merge-relation-card--conflict"
              >
                <span className="global-merge-relation-card__status">Conflict</span>
                <p>
                  {getFindingLabel(candidate, relation.outputFindingIds[0])} /{' '}
                  {getFindingLabel(candidate, relation.outputFindingIds[1])}
                </p>
              </article>
            ))}
          </div>
        ) : (
          <p>No conflicts were classified.</p>
        )}
      </section>

      </div>
      <CandidateCoverageAreas candidate={candidate} />
      <details className="global-merge-candidate__card global-merge-candidate__disclosure"><summary>Coverage dimensions</summary><CandidateCoverageDimensions candidate={candidate} /></details>
      <CandidateSectionScope candidate={candidate} />

      <details className="global-merge-candidate__card global-merge-candidate__disclosure">
        <summary
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return
            event.preventDefault()
            const details = event.currentTarget.parentElement
            if (details instanceof HTMLDetailsElement) {
              details.open = !details.open
            }
          }}
        >
          Exact duplicate provenance
        </summary>
        {duplicateGroups.length > 0 ? (
          <ul>
            {duplicateGroups.map((group) => (
              <li key={group.outputFindingId}>
                <strong>{getFindingLabel(candidate, group.outputFindingId)}</strong>{' '}
                ({group.outputFindingKind.replaceAll('_', ' ')}) —{' '}
                {formatCount(group.contributorCount, 'contributing finding')}
                {getContributingSectionTitles(
                  candidate,
                  group.outputFindingId,
                ).length > 0 ? (
                  <span className="global-merge-candidate__provenance-sections">
                    Contributing sections:{' '}
                    {getContributingSectionTitles(
                      candidate,
                      group.outputFindingId,
                    ).join(', ')}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p>No exact duplicate groups were collapsed.</p>
        )}
      </details>

      {warnings.length > 0 ? (
        <section className="global-merge-candidate__card" aria-labelledby="merge-warnings-heading">
          <h3 id="merge-warnings-heading">Safe warnings</h3>
          <ul>
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  )
}

export function GlobalCoverageMergeCandidateReview({
  state,
  onRequestSaveConfirmation,
  onCancelConfirmation,
  onConfirmSave,
  onDiscardCandidate,
}: GlobalCoverageMergeCandidateReviewProps) {
  const headingRef = useRef<HTMLHeadingElement | null>(null)
  const candidate =
    state.status === 'ready' ||
    state.status === 'confirmation_required' ||
    state.status === 'stale'
      ? state.candidate
      : null
  const heading = useMemo(() => {
    switch (state.status) {
      case 'building':
        return 'Building unsaved Global Coverage Plan candidate'
      case 'ready':
        return 'Unsaved Global Coverage Plan candidate'
      case 'stale':
        return 'Candidate is stale'
      case 'failed':
        return 'Candidate build failed'
      case 'confirmation_required':
        return state.mode === 'create'
          ? 'Save new Global Coverage Plan?'
          : 'Replace the saved Global Coverage Plan?'
    }
  }, [state])

  useLayoutEffect(() => {
    headingRef.current?.focus()
  }, [state.status, heading])

  return (
    <section
      className="page page--ai-coverage global-merge-candidate"
      role="region"
      aria-label="Unsaved Global Coverage Plan candidate"
      aria-busy={state.status === 'building'}
    >
      <div className="page-heading page-heading--split">
        <div className="page-heading">
          <p className="meta-kicker">Transient merge review</p>
          <h2
            id="global-merge-candidate-heading"
            ref={headingRef}
            tabIndex={-1}
          >
            {heading}
          </h2>
          <p>
            This temporary candidate is not coverage proof, QA approval, Test Case
            readiness, or a coverage percentage.
          </p>
        </div>
        <button
          type="button"
          className="button button--secondary"
          onClick={onDiscardCandidate}
        >
          Discard candidate
        </button>
      </div>

      <div className="global-merge-candidate__status" aria-live="polite">
        {state.status === 'building' ? (
          <p>{formatCount(state.selectedAnalysisCount, 'selected analysis', 'selected analyses')} are being merged safely.</p>
        ) : state.status === 'failed' ? (
          <p role="alert">{state.message}</p>
        ) : state.status === 'stale' ? (
          <p role="alert">{state.message}</p>
        ) : state.error ? (
          <p role="alert">{state.error}</p>
        ) : (
          <p>Candidate is ready for review but remains unsaved.</p>
        )}
      </div>

      {candidate ? (
        <>
          <CandidateMetrics candidate={candidate} />
          <div className="global-merge-candidate__notice" role="status">
            The current saved plan remains unchanged until a fully validated save
            succeeds.
            <p>Review behavior-level evidence in the contributing section analyses. Area excerpts alone do not establish support for every behavior.</p>
          </div>

          {state.status === 'confirmation_required' ? (
            <section
              className="global-merge-candidate__confirmation"
              aria-label="Global Coverage Plan save confirmation"
            >
              <p>
                {state.mode === 'create'
                  ? 'Create the one saved Global Coverage Plan for this QA Source?'
                  : 'Replace the current saved Global Coverage Plan for this QA Source?'}
              </p>
              <div className="button-row">
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={onCancelConfirmation}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="button button--primary"
                  onClick={onConfirmSave}
                >
                  {state.mode === 'create'
                    ? 'Save new Global Coverage Plan'
                    : 'Replace saved Global Coverage Plan'}
                </button>
              </div>
            </section>
          ) : (
            <div className="global-merge-candidate__actions">
              <button
                type="button"
                className="button button--primary"
                disabled={state.status === 'stale'}
                onClick={onRequestSaveConfirmation}
              >
                Review save options
              </button>
            </div>
          )}
          <CandidateDetails candidate={candidate} />
        </>
      ) : null}
    </section>
  )
}
