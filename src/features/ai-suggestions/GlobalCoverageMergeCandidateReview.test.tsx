import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { GlobalCoverageMergeCandidate } from './aiCoveragePlanMergeTypes'
import {
  GlobalCoverageMergeCandidateReview,
  type GlobalCoverageMergeReviewState,
} from './GlobalCoverageMergeCandidateReview'

function createCandidate(): GlobalCoverageMergeCandidate {
  return {
    schemaVersion: 'global-coverage-merge-candidate-v1',
    candidateId: 'merge-candidate-review',
    builtAt: '2026-07-20T10:00:00.000Z',
    sourceRevision: {
      qaSourceId: 'source-merge',
      qaSourceCreatedAt: '2026-07-20T08:00:00.000Z',
      qaSourceUpdatedAt: '2026-07-20T08:00:00.000Z',
      sourceFingerprint: 'source-fingerprint',
      sectionSchemaVersion: 'qa-source-sections-v1',
      sectionerVersion: 'qa-source-sectioner-v1',
      sectionSetFingerprint: 'section-set-fingerprint',
    },
    selectedAnalyses: [
      {
        analysisRefId: 'analysis-a',
        sectionPlanRecordId: 'record-a',
        analyzedAt: '2026-07-20T09:00:00.000Z',
        planFingerprint: 'plan-a',
        sectionId: 'section-a',
        stableKey: 'a',
        contentFingerprint: 'content-a',
      },
      {
        analysisRefId: 'analysis-b',
        sectionPlanRecordId: 'record-b',
        analyzedAt: '2026-07-20T09:01:00.000Z',
        planFingerprint: 'plan-b',
        sectionId: 'section-b',
        stableKey: 'b',
        contentFingerprint: 'content-b',
      },
    ],
    planDraft: {
      schemaVersion: 'ai-coverage-plan-json-v2',
      sourceScope: {
        qaSourceId: 'source-merge',
        visibleSourceOnly: true,
        sourceTruncated: false,
        coverageCompleteness: 'insufficient_source',
        sectionContext: {
          available: true,
          sectionSchemaVersion: 'qa-source-sections-v1',
          sectionerVersion: 'qa-source-sectioner-v1',
          sectionSetFingerprint: 'section-set-fingerprint',
          totalSectionCount: 6,
          visibleSectionCount: 2,
          omittedSectionCount: 4,
        },
      },
      coverageAreas: [
        {
          id: 'area-auth',
          name: 'Authentication',
          summary: 'Authentication coverage.',
          behaviors: ['Sign in', 'Reject bad credentials'],
          risks: [],
          evidence: ['Users sign in.'],
          ambiguities: [],
          generationReadiness: 'blocked_by_ambiguity',
          sourceSectionRefs: [],
        },
        {
          id: 'area-session',
          name: 'Session handling',
          summary: 'Session coverage.',
          behaviors: ['Renew session'],
          risks: [],
          evidence: ['Sessions expire after inactivity.'],
          ambiguities: [],
          generationReadiness: 'needs_review',
          sourceSectionRefs: [],
        },
      ],
      actors: ['Signed-in customer'],
      states: ['Active session', 'Expired session'],
      inputs: ['Valid credentials'],
      failureModes: ['Rejected credentials'],
      integrationRisks: [],
      permissionsSecurity: [],
      dataPersistenceRules: [],
      ambiguities: [
        {
          id: 'ambiguity-timeout',
          question: 'What is the inactivity timeout?',
          whyItMatters: 'Session-expiry boundaries cannot be verified yet.',
          severity: 'High',
          sourceSectionRefs: [],
        },
      ],
      nextGenerationAreas: [
        {
          id: 'next-recovery',
          title: 'Account recovery',
          rationale: 'Recovery behavior is not described.',
          priority: 'Medium',
          relatedAreaIds: ['area-auth'],
          suggestedTestCount: 2,
          sourceSectionRefs: [],
        },
      ],
      warnings: [
        'Four source sections are outside this candidate.',
        'Merged section-analysis scope counts; selected: 2; current but unselected: 1; stale: 1; unanalyzed: 1; excluded: 1',
      ],
    },
    outputProvenance: [
      {
        outputFindingId: 'area-auth',
        outputFindingKind: 'coverage_area',
        contributors: [
          {
            analysisRefId: 'analysis-a',
            sourceFindingKind: 'coverage_area',
            sourceFindingId: 'area-a',
          },
          {
            analysisRefId: 'analysis-b',
            sourceFindingKind: 'coverage_area',
            sourceFindingId: 'area-b',
          },
        ],
        disposition: 'exact_duplicate',
        evidenceOrigins: [],
      },
      {
        outputFindingId: 'area-session',
        outputFindingKind: 'coverage_area',
        contributors: [
          {
            analysisRefId: 'analysis-b',
            sourceFindingKind: 'coverage_area',
            sourceFindingId: 'area-session-b',
          },
        ],
        disposition: 'conflict',
        evidenceOrigins: [],
      },
    ],
    reviewRelations: [
      {
        relationId: 'relation-overlap',
        kind: 'likely_overlap',
        outputFindingIds: [
          'area-auth:behavior:0',
          'area-session:behavior:0',
        ],
      },
      {
        relationId: 'relation-conflict',
        kind: 'conflict',
        outputFindingIds: ['state:0', 'state:1'],
      },
    ],
    sectionScope: {
      selected: [
        {
          analysisRefId: 'analysis-a',
          sectionId: 'section-a',
          stableKey: 'a',
          contentFingerprint: 'content-a',
          ordinal: 1,
          title: 'Authentication',
          path: ['Authentication'],
          startLine: 1,
          endLine: 10,
          characterCount: 200,
          visibleCharacterCount: 200,
          visibleEndLine: 10,
          truncated: false,
        },
        {
          analysisRefId: 'analysis-b',
          sectionId: 'section-b',
          stableKey: 'b',
          contentFingerprint: 'content-b',
          ordinal: 2,
          title: 'Sessions',
          path: ['Sessions'],
          startLine: 11,
          endLine: 20,
          characterCount: 180,
          visibleCharacterCount: 180,
          visibleEndLine: 20,
          truncated: false,
        },
      ],
      unselected: [
        {
          sectionId: 'section-c',
          stableKey: 'c',
          contentFingerprint: 'content-c',
          ordinal: 3,
          title: 'Profile',
          path: ['Profile'],
          startLine: 21,
          endLine: 30,
          characterCount: 150,
          visibleCharacterCount: 150,
          visibleEndLine: 30,
          truncated: false,
        },
      ],
      stale: [
        {
          sectionId: 'section-d',
          stableKey: 'd',
          contentFingerprint: 'content-d',
          ordinal: 4,
          title: 'Audit',
          path: ['Audit'],
          startLine: 31,
          endLine: 40,
          characterCount: 150,
          visibleCharacterCount: 150,
          visibleEndLine: 40,
          truncated: false,
        },
      ],
      unanalyzed: [
        {
          sectionId: 'section-e',
          stableKey: 'e',
          contentFingerprint: 'content-e',
          ordinal: 5,
          title: 'Recovery',
          path: ['Recovery'],
          startLine: 41,
          endLine: 50,
          characterCount: 140,
          visibleCharacterCount: 140,
          visibleEndLine: 50,
          truncated: false,
        },
      ],
      excluded: [
        {
          sectionId: 'section-f',
          stableKey: 'f',
          contentFingerprint: 'content-f',
          ordinal: 6,
          title: 'Appendix',
          path: ['Appendix'],
          startLine: 51,
          endLine: 60,
          characterCount: 130,
          visibleCharacterCount: 130,
          visibleEndLine: 60,
          truncated: false,
        },
      ],
    },
    exactDuplicateSummary: {
      groupCount: 1,
      collapsedFindingCount: 1,
      groups: [
        {
          outputFindingId: 'area-auth',
          outputFindingKind: 'coverage_area',
          contributorCount: 2,
        },
      ],
    },
    warnings: [
      'Four source sections are outside this candidate.',
      'Merged section-analysis scope counts; selected: 2; current but unselected: 1; stale: 1; unanalyzed: 1; excluded: 1',
    ],
  }
}

function renderReview(
  state: GlobalCoverageMergeReviewState,
  overrides: Partial<Parameters<typeof GlobalCoverageMergeCandidateReview>[0]> = {},
) {
  const props = {
    state,
    onRequestSaveConfirmation: vi.fn(),
    onCancelConfirmation: vi.fn(),
    onConfirmSave: vi.fn(),
    onDiscardCandidate: vi.fn(),
    ...overrides,
  }
  render(<GlobalCoverageMergeCandidateReview {...props} />)
  return props
}

describe('GlobalCoverageMergeCandidateReview', () => {
  it('announces and focuses the building state without saved-plan workflow controls', () => {
    renderReview({
      status: 'building',
      sourceId: 'source-merge',
      selectedAnalysisCount: 2,
    })

    const region = screen.getByRole('region', {
      name: 'Unsaved Global Coverage Plan candidate',
    })
    expect(region).toHaveAttribute('aria-busy', 'true')
    expect(
      within(region).getByRole('heading', {
        name: 'Building unsaved Global Coverage Plan candidate',
      }),
    ).toHaveFocus()
    expect(region).toHaveTextContent('2 selected analyses')
    expect(screen.queryByText('Review Inbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Test Case/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/\\d+%/)).not.toBeInTheDocument()
  })

  it('shows candidate metrics, provenance, contributors, separated relations, and safe meaning copy', async () => {
    const user = userEvent.setup()
    const candidate = createCandidate()
    const props = renderReview({ status: 'ready', candidate, error: null })

    expect(
      screen.getByRole('heading', {
        name: 'Unsaved Global Coverage Plan candidate',
      }),
    ).toHaveFocus()
    expect(screen.getByText('2 selected analyses')).toBeVisible()
    expect(screen.getByText('2 merged areas')).toBeVisible()
    expect(screen.getByText('1 exact duplicate')).toBeVisible()
    expect(screen.getByText('1 likely overlap')).toBeVisible()
    expect(screen.getByText('1 conflict')).toBeVisible()
    expect(screen.getByText('4 sections not represented')).toBeVisible()
    expect(screen.getByText('Authentication', { selector: '.global-merge-chip' })).toBeVisible()
    expect(screen.getByText('Sessions', { selector: '.global-merge-chip' })).toBeVisible()
    const authenticationArea = screen.getByRole('article', {
      name: 'Authentication coverage area',
    })
    expect(within(authenticationArea).getByText('Authentication coverage.')).toBeVisible()
    expect(within(authenticationArea).getByText('Users sign in.')).toBeVisible()
    expect(within(authenticationArea).getByText('Blocked by ambiguity')).toBeVisible()
    await user.click(screen.getByText('Coverage dimensions', { selector: 'summary' }))
    expect(screen.getByRole('heading', { name: 'Coverage dimensions' })).toBeVisible()
    expect(screen.getByText('Signed-in customer')).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Sections outside this candidate' })).toBeVisible()
    expect(screen.getByText('Current, not selected')).toBeVisible()
    expect(screen.getByText('3. Profile')).toBeVisible()
    expect(screen.getByText('Stale analysis')).toBeVisible()
    expect(screen.getByText('4. Audit')).toBeVisible()
    expect(screen.getByText('Not analyzed')).toBeVisible()
    expect(screen.getByText('5. Recovery')).toBeVisible()
    expect(screen.getByText('Excluded from coverage')).toBeVisible()
    expect(screen.getByText('6. Appendix')).toBeVisible()
    expect(screen.getByText(/likely overlaps are kept separate/i)).toBeVisible()
    expect(screen.getByText(/conflicts are kept separate/i)).toBeVisible()
    expect(screen.getByText(/current saved plan remains unchanged/i)).toBeVisible()
    expect(
      screen.getByText(
        'This temporary candidate is not coverage proof, QA approval, Test Case readiness, or a coverage percentage.',
      ),
    ).toBeVisible()

    const duplicateDisclosure = screen.getByText('Exact duplicate provenance')
    duplicateDisclosure.focus()
    await user.keyboard(' ')
    expect(duplicateDisclosure.closest('details')).toHaveAttribute('open')
    expect(screen.getByText(/2 contributing findings/)).toBeVisible()
    expect(
      within(duplicateDisclosure.closest('details')!).getByText(
        /Authentication, Sessions/,
      ),
    ).toBeVisible()
    expect(
      screen.getByText('Authentication — Sign in / Session handling — Renew session'),
    ).toBeVisible()
    expect(screen.getByText('State — Active session / State — Expired session')).toBeVisible()
    expect(screen.queryByText('state:0 / state:1')).not.toBeInTheDocument()
    expect(
      screen.queryByText(/Merged section-analysis scope counts/),
    ).not.toBeInTheDocument()
    expect(screen.getByText('Conflict', { selector: '.global-merge-relation-card__status' })).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Review save options' }))
    expect(props.onRequestSaveConfirmation).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['create', 'Save new Global Coverage Plan?', 'Save new Global Coverage Plan'],
    ['replace', 'Replace the saved Global Coverage Plan?', 'Replace saved Global Coverage Plan'],
  ] as const)('uses explicit %s confirmation with cancel', async (mode, heading, action) => {
    const user = userEvent.setup()
    const candidate = createCandidate()
    const props = renderReview({
      status: 'confirmation_required',
      candidate,
      mode,
      expectedTargetKey: mode === 'replace' ? 'saved-plan-key' : null,
      error: null,
    })

    expect(screen.getByRole('heading', { name: heading })).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(props.onCancelConfirmation).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('button', { name: action }))
    expect(props.onConfirmSave).toHaveBeenCalledTimes(1)
  })

  it('keeps stale and failed states textual, focused, and non-saveable', () => {
    const candidate = createCandidate()
    const { rerender } = render(
      <GlobalCoverageMergeCandidateReview
        state={{
          status: 'stale',
          candidate,
          selectedAnalysisCount: 2,
          message: 'The source changed. Build a new candidate.',
        }}
        onRequestSaveConfirmation={vi.fn()}
        onCancelConfirmation={vi.fn()}
        onConfirmSave={vi.fn()}
        onDiscardCandidate={vi.fn()}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Candidate is stale' })).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Review save options' })).toBeDisabled()

    rerender(
      <GlobalCoverageMergeCandidateReview
        state={{
          status: 'failed',
          sourceId: 'source-merge',
          selectedAnalysisCount: 2,
          message: 'The merge could not be built safely.',
        }}
        onRequestSaveConfirmation={vi.fn()}
        onCancelConfirmation={vi.fn()}
        onConfirmSave={vi.fn()}
        onDiscardCandidate={vi.fn()}
      />,
    )
    expect(screen.getByRole('heading', { name: 'Candidate build failed' })).toHaveFocus()
    expect(screen.queryByRole('button', { name: 'Review save options' })).not.toBeInTheDocument()
  })
})
