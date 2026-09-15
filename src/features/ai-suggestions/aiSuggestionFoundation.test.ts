import { describe, expect, it } from 'vitest'
import { createQaSource } from '../../test/qaSourceFactory'
import { packQaSourceForAiSuggestions } from './aiSuggestionContext'
import { buildAiSuggestionRequest } from './aiSuggestionPrompt'
import { convertAiSuggestionToTestCase } from './aiSuggestionConversion'
import {
  AI_SUGGESTION_AREA_MAX_LENGTH,
  AI_SUGGESTION_MAX_COUNT,
  AI_SUGGESTION_STEP_MAX_COUNT,
  AI_SUGGESTION_TITLE_MAX_LENGTH,
  groupAiSuggestions,
  parseAiSuggestionResponse,
} from './aiSuggestionValidation'

describe('AI suggestion foundation helpers', () => {
  it('packs only the selected QA Source and reports truncation/privacy metadata', () => {
    const source = createQaSource({
      id: 'source-1',
      title: 'Checkout requirement',
      content: 'A'.repeat(20),
    })

    const packed = packQaSourceForAiSuggestions(source, {
      maxCharacterCount: 12,
      previewCharacterCount: 8,
    })

    expect(packed).toMatchObject({
      qaSourceId: 'source-1',
      title: 'Checkout requirement',
      originalCharacterCount: 20,
      packedCharacterCount: 12,
      maxCharacterCount: 12,
      truncated: true,
      content: 'AAAAAAAAAAAA',
      preview: 'AAAAAAAA...',
    })
    expect(packed.privacySummary.included).toContain(
      'selected QA Source content',
    )
    expect(packed.privacySummary.excluded).toEqual(
      expect.arrayContaining(['Bugs', 'Risks', 'Releases', 'API keys']),
    )
  })

  it('builds a future AI request without sending it anywhere', () => {
    const packed = packQaSourceForAiSuggestions(
      createQaSource({
        title: 'Payment LLD',
        content: 'Payments must support declined card responses.',
      }),
    )

    const request = buildAiSuggestionRequest(packed)

    expect(request.source).toBe(packed)
    expect(request.prompt).toContain('Use only the provided source content')
    expect(request.prompt).toContain('Return 3-6 high-value suggestions')
    expect(request.prompt).toContain('Coverage selection is phase 1')
    expect(request.prompt).toContain(
      'group candidate scenarios by distinct behavior, risk, actor, state, input class, or failure mode',
    )
    expect(request.prompt).toContain(
      'balanced, high-value, non-overlapping set',
    )
    expect(request.prompt).toContain(
      'narrow sources may produce only 1-2 suggestions',
    )
    expect(request.prompt).toContain(
      'Prefer fewer grounded suggestions over invented category coverage',
    )
    expect(request.prompt).toContain('Do not force every source into every category')
    expect(request.prompt).toContain('do not use category quotas')
    expect(request.prompt).toContain('positive/smoke')
    expect(request.prompt).toContain('provider failure/retry/degraded behavior')
    expect(request.prompt).toContain('different feature/risk areas')
    expect(request.prompt).toContain(
      'do not spend the entire suggestion set on one lifecycle family',
    )
    expect(request.prompt).toContain(
      'subscription lifecycle/payment cluster',
    )
    expect(request.prompt).toContain(
      'highest-value 1-2 suggestions from that lifecycle/payment cluster',
    )
    expect(request.prompt).toContain(
      'cancellation, permissions, provider unavailable',
    )
    expect(request.prompt).toContain(
      'outside the dominant lifecycle/payment cluster',
    )
    expect(request.prompt).toContain('Avoid duplicate or near-duplicate suggestions')
    expect(request.prompt).toContain('Type should match the scenario purpose')
    expect(request.prompt).toContain('priority should reflect user impact and risk')
    expect(request.prompt).toContain(
      'area should identify the most specific source-backed feature area',
    )
    expect(request.prompt).toContain('response-level warnings')
    expect(request.prompt).toContain('do not assume unseen sections')
    expect(request.prompt).toContain('Executable test-case writing is phase 2')
    expect(request.prompt).toContain(
      'each suggestion must still be written as an executable manual QA script',
    )
    expect(request.prompt).toContain(
      'Coverage diversity must not compress each scenario into a one-step summary',
    )
    expect(request.prompt).toContain('Step decomposition')
    expect(request.prompt).toContain('step count is not the goal')
    expect(request.prompt).toContain('Do not pad scripts')
    expect(request.prompt).toContain('Split compound steps')
    expect(request.prompt).toContain('include navigation/setup only when it adds execution value')
    expect(request.prompt).toContain('login, authentication, security')
    expect(request.prompt).toContain(
      'lifecycle, renewal, payment, cancellation, reactivation, permission, and provider-failure flows',
    )
    expect(request.prompt).toContain(
      'backend job, scheduled renewal, simulated provider response, expired grace period, or system state',
    )
    expect(request.prompt).toContain(
      'Do not use passive actions like "wait for next renewal date" as the only step',
    )
    expect(request.prompt).toContain('Use setup/preconditions for starting state')
    expect(request.prompt).toContain('Each step action must be sufficient')
    expect(request.prompt).toContain('passive input-only actions')
    expect(request.prompt).toContain('include that trigger as an explicit action step')
    expect(request.prompt).toContain('Input-only steps should have input-level expected results')
    expect(request.prompt).toContain('single trigger-and-observe atomic checks')
    expect(request.prompt).toContain('Expected results should name observable')
    expect(request.prompt).toContain('no authenticated session is created')
    expect(request.prompt).toContain('login is not allowed')
    expect(request.prompt).toContain('source-grounded evidence')
    expect(request.prompt).toContain('Avoid shallow wording')
    expect(request.prompt).toContain('Payment LLD')
    expect(request.prompt).toContain(
      'Payments must support declined card responses.',
    )
    expect(request.responseSchema).toContain('"suggestions"')
    expect(request.responseSchema).toContain('"warnings"')
  })

  it('rejects malformed JSON and responses without a suggestions array', () => {
    expect(
      parseAiSuggestionResponse('{not json', { qaSourceId: 'source-1' }),
    ).toMatchObject({
      ok: false,
      suggestions: [],
      error: 'AI response was not valid JSON.',
    })

    expect(
      parseAiSuggestionResponse({ items: [] }, { qaSourceId: 'source-1' }),
    ).toMatchObject({
      ok: false,
      suggestions: [],
      error: 'AI response must include a suggestions array.',
    })
  })

  it('groups ready, needs-review, and rejected suggestions', () => {
    const result = parseAiSuggestionResponse(
      {
        suggestions: [
          {
            id: 'ready',
            title: 'Checkout accepts valid card',
            area: 'Checkout',
            priority: 'High',
            type: 'Functional',
            preconditions: 'User has a valid card.',
            structuredSteps: [
              {
                action: 'Submit valid card details.',
                expectedResult: 'Payment is approved.',
              },
            ],
            evidence: ['Payment authorization must handle approved responses.'],
          },
          {
            id: 'needs-review',
            title: 'Checkout handles declined card',
            area: '',
            priority: 'Urgent',
            type: 'Functional',
            structuredSteps: [
              {
                action: 'Submit declined card details.',
                expectedResult: 'Payment is declined with a clear message.',
              },
            ],
          },
          {
            id: 'rejected',
            title: '',
            area: 'Checkout',
            priority: 'Medium',
            type: 'Functional',
            structuredSteps: [],
          },
        ],
      },
      { qaSourceId: 'source-1' },
    )

    expect(result.ok).toBe(true)
    expect(groupAiSuggestions(result.suggestions)).toMatchObject({
      ready: [expect.objectContaining({ id: 'ai-suggestion-1' })],
      needsReview: [expect.objectContaining({ id: 'ai-suggestion-2' })],
      rejected: [expect.objectContaining({ id: 'ai-suggestion-3' })],
    })
    expect(result.suggestions[1]).toMatchObject({
      priority: 'Medium',
      status: 'needs_review',
      warnings: expect.arrayContaining(['Priority "Urgent" is not supported.']),
    })
  })

  it('generates unique internal suggestion IDs instead of trusting provider IDs', () => {
    const result = parseAiSuggestionResponse(
      {
        suggestions: [
          {
            id: 'provider-duplicate-id',
            title: 'Checkout accepts valid card',
            area: 'Checkout',
            priority: 'High',
            type: 'Functional',
            structuredSteps: [
              {
                action: 'Submit valid card details.',
                expectedResult: 'Payment is approved.',
              },
            ],
          },
          {
            id: 'provider-duplicate-id',
            title: 'Checkout handles declined card',
            area: 'Checkout',
            priority: 'High',
            type: 'Functional',
            structuredSteps: [
              {
                action: 'Submit declined card details.',
                expectedResult: 'Payment is declined.',
              },
            ],
          },
        ],
      },
      { qaSourceId: 'source-1' },
    )

    const suggestionIds = result.suggestions.map((suggestion) => suggestion.id)

    expect(suggestionIds).toEqual(['ai-suggestion-1', 'ai-suggestion-2'])
    expect(new Set(suggestionIds).size).toBe(suggestionIds.length)
  })

  it('marks incomplete steps as needing review and prevents silent import', () => {
    const result = parseAiSuggestionResponse(
      {
        suggestions: [
          {
            title: 'Checkout timeout copy',
            area: 'Checkout',
            priority: 'Medium',
            type: 'Functional',
            evidence: ['Payment authorization must handle timeout responses.'],
            structuredSteps: [
              {
                action: 'Trigger a payment timeout.',
                expectedResult: '',
              },
            ],
          },
        ],
      },
      { qaSourceId: 'source-1' },
    )

    expect(result.suggestions[0]).toMatchObject({
      status: 'needs_review',
      warnings: [
        'Step 1 must include both an action and an expected result.',
      ],
    })
    expect(
      convertAiSuggestionToTestCase(result.suggestions[0], {
        now: '2026-05-14T08:00:00.000Z',
        createId: () => 'test-case-1',
      }),
    ).toBeNull()

    const oversizedReadySuggestion = {
      ...result.suggestions[0],
      status: 'ready' as const,
      warnings: [],
      structuredSteps: Array.from({
        length: AI_SUGGESTION_STEP_MAX_COUNT + 1,
      }).map((_, index) => ({
        id: `oversized-step-${index + 1}`,
        action: `Run oversized scenario ${index + 1}.`,
        expectedResult: `Oversized scenario ${index + 1} is handled.`,
      })),
    }

    expect(
      convertAiSuggestionToTestCase(oversizedReadySuggestion, {
        now: '2026-05-14T08:00:00.000Z',
        createId: () => 'test-case-1',
      }),
    ).toBeNull()
  })

  it('downgrades missing evidence, assumptions, and provider warnings to Needs review', () => {
    const result = parseAiSuggestionResponse(
      {
        suggestions: [
          {
            title: 'Checkout approves valid card',
            area: 'Checkout',
            priority: 'High',
            type: 'Functional',
            structuredSteps: [
              {
                action: 'Submit valid card details.',
                expectedResult: 'Payment is approved.',
              },
            ],
          },
          {
            title: 'Checkout sends approval email',
            area: 'Checkout',
            priority: 'Medium',
            type: 'Regression',
            assumptions: ['User has an email address on file.'],
            evidence: ['Send customer notification after approval.'],
            structuredSteps: [
              {
                action: 'Complete a checkout approval.',
                expectedResult: 'Customer notification is sent.',
              },
            ],
          },
          {
            title: 'Checkout handles declined card',
            area: 'Checkout',
            priority: 'High',
            type: 'Functional',
            evidence: ['Declined responses must be handled.'],
            warnings: ['Decline copy is not specified by the source.'],
            structuredSteps: [
              {
                action: 'Submit declined card details.',
                expectedResult: 'Payment is declined with clear feedback.',
              },
            ],
          },
        ],
      },
      { qaSourceId: 'source-1' },
    )

    expect(result.suggestions).toEqual([
      expect.objectContaining({
        status: 'needs_review',
        warnings: expect.arrayContaining([
          'Evidence is missing; verify source support before import.',
        ]),
      }),
      expect.objectContaining({
        status: 'needs_review',
        warnings: expect.arrayContaining([
          'Assumptions require QA review before import.',
        ]),
      }),
      expect.objectContaining({
        status: 'needs_review',
        warnings: expect.arrayContaining([
          'Decline copy is not specified by the source.',
        ]),
      }),
    ])
  })

  it('downgrades vague actions and expected results to Needs review', () => {
    const result = parseAiSuggestionResponse(
      {
        suggestions: [
          {
            title: 'Checkout validates payment',
            area: 'Checkout',
            priority: 'Medium',
            type: 'Functional',
            evidence: ['Payment authorization must handle approved responses.'],
            structuredSteps: [
              {
                action: 'Check functionality for payment authorization.',
                expectedResult: 'Payment works as expected.',
              },
            ],
          },
          {
            title: 'Inactive user cannot log in',
            area: 'Authentication',
            priority: 'High',
            type: 'Functional',
            evidence: ['Inactive accounts cannot authenticate.'],
            structuredSteps: [
              {
                action: 'Submit inactive user credentials.',
                expectedResult: 'Login is not allowed.',
              },
            ],
          },
        ],
      },
      { qaSourceId: 'source-1' },
    )

    expect(result.suggestions[0]).toMatchObject({
      status: 'needs_review',
      warnings: [
        'Step 1 action is too vague for import-ready coverage.',
        'Step 1 expected result is too vague for import-ready coverage.',
      ],
    })
    expect(result.suggestions[1]).toMatchObject({
      status: 'needs_review',
      warnings: ['Step 1 expected result is too vague for import-ready coverage.'],
    })
  })

  it('downgrades compound one-step suggestions to Needs review', () => {
    const result = parseAiSuggestionResponse(
      {
        suggestions: [
          {
            title: 'Login grants dashboard access',
            area: 'Authentication',
            priority: 'High',
            type: 'Functional',
            evidence: ['Valid users can access the dashboard after login.'],
            structuredSteps: [
              {
                action:
                  'Open the login page, enter valid credentials, submit the form, and verify the dashboard is displayed.',
                expectedResult: 'The dashboard is displayed for the authenticated user.',
              },
            ],
          },
          {
            title: 'Admin user receives permissions',
            area: 'Administration',
            priority: 'High',
            type: 'Functional',
            evidence: ['Admin users can access the admin page.'],
            structuredSteps: [
              {
                action:
                  'Create a user, assign admin permissions, log out, log in as that user, and confirm access to the admin page.',
                expectedResult: 'The admin page is available to the admin user.',
              },
            ],
          },
          {
            title: 'Invalid upload shows audit trail',
            area: 'Files',
            priority: 'Medium',
            type: 'Functional',
            evidence: ['Invalid file uploads show an error and audit trail.'],
            structuredSteps: [
              {
                action:
                  'Upload an invalid file, submit it, then verify the error message and audit log.',
                expectedResult: 'The invalid upload is rejected and logged.',
              },
            ],
          },
        ],
      },
      { qaSourceId: 'source-1' },
    )

    expect(result.suggestions).toEqual([
      expect.objectContaining({
        status: 'needs_review',
        warnings: [
          'One-step suggestion appears to combine multiple actions or outcomes; split it into steps or confirm it is atomic.',
        ],
      }),
      expect.objectContaining({
        status: 'needs_review',
        warnings: [
          'One-step suggestion appears to combine multiple actions or outcomes; split it into steps or confirm it is atomic.',
        ],
      }),
      expect.objectContaining({
        status: 'needs_review',
        warnings: [
          'One-step suggestion appears to combine multiple actions or outcomes; split it into steps or confirm it is atomic.',
        ],
      }),
    ])
  })

  it('downgrades input-only one-step actions with system-transition expected results', () => {
    const result = parseAiSuggestionResponse(
      {
        suggestions: [
          {
            title: 'Successful login creates a session',
            area: 'Authentication',
            priority: 'High',
            type: 'Functional',
            evidence: ['Valid users are redirected to the dashboard after login.'],
            structuredSteps: [
              {
                action: 'Enter valid email address and password on the login page.',
                expectedResult:
                  'The user is redirected to the dashboard and an authenticated session is created.',
              },
            ],
          },
          {
            title: 'Account locks after repeated failures',
            area: 'Authentication',
            priority: 'High',
            type: 'Functional',
            evidence: ['Accounts lock after five failed password attempts.'],
            structuredSteps: [
              {
                action: 'Enter invalid password five times.',
                expectedResult: 'The account is locked for 15 minutes.',
              },
            ],
          },
        ],
      },
      { qaSourceId: 'source-1' },
    )

    expect(result.suggestions).toEqual([
      expect.objectContaining({
        status: 'needs_review',
        warnings: [
          'Step 1 action appears input-only but the expected result describes a system transition; add the missing trigger action or revise the expected result.',
        ],
      }),
      expect.objectContaining({
        status: 'needs_review',
        warnings: [
          'Step 1 action appears input-only but the expected result describes a system transition; add the missing trigger action or revise the expected result.',
        ],
      }),
    ])
  })

  it('downgrades duplicate normalized scenarios to Needs review', () => {
    const result = parseAiSuggestionResponse(
      {
        suggestions: [
          {
            title: 'Checkout accepts valid card',
            area: 'Checkout',
            priority: 'High',
            type: 'Functional',
            evidence: ['Approved card responses must be handled.'],
            structuredSteps: [
              {
                action: 'Submit valid card details.',
                expectedResult: 'Payment is approved.',
              },
            ],
          },
          {
            title: ' checkout accepts valid card ',
            area: 'Checkout',
            priority: 'High',
            type: 'Functional',
            evidence: ['Approved card responses must be handled.'],
            structuredSteps: [
              {
                action: 'Submit valid card details',
                expectedResult: 'Payment is approved',
              },
            ],
          },
        ],
      },
      { qaSourceId: 'source-1' },
    )

    expect(result.suggestions[0]).toMatchObject({ status: 'ready' })
    expect(result.suggestions[1]).toMatchObject({
      status: 'needs_review',
      warnings: [
        'Suggestion appears to duplicate an earlier scenario and needs QA review.',
      ],
    })
  })

  it('keeps concrete one-step atomic suggestions Ready when evidence-backed', () => {
    const result = parseAiSuggestionResponse(
      {
        suggestions: [
          {
            title: 'Checkout displays timeout error copy',
            area: 'Checkout',
            priority: 'Medium',
            type: 'Regression',
            evidence: ['Timeout responses must be handled.'],
            structuredSteps: [
              {
                action: 'Trigger a payment timeout response.',
                expectedResult: 'Checkout shows timeout feedback to the user.',
              },
            ],
          },
          {
            title: 'Successful login submit redirects to dashboard',
            area: 'Authentication',
            priority: 'High',
            type: 'Functional',
            evidence: ['Valid users are redirected to the dashboard after login.'],
            structuredSteps: [
              {
                action: 'Submit the login form.',
                expectedResult:
                  'The user is redirected to the dashboard and an authenticated session is created.',
              },
            ],
          },
          {
            title: 'Logout ends the session',
            area: 'Authentication',
            priority: 'Medium',
            type: 'Functional',
            evidence: ['Logging out terminates the authenticated session.'],
            structuredSteps: [
              {
                action: 'Log out.',
                expectedResult:
                  'The session is terminated and the user is returned to the login page.',
              },
            ],
          },
          {
            title: 'Disabled submit button remains inactive',
            area: 'Validation',
            priority: 'Medium',
            type: 'Functional',
            evidence: ['Disabled submit buttons cannot submit the form.'],
            structuredSteps: [
              {
                action: 'Click the disabled Submit button.',
                expectedResult: 'The form is not submitted.',
              },
            ],
          },
          {
            title: 'Email required validation appears on blur',
            area: 'Validation',
            priority: 'Medium',
            type: 'Functional',
            evidence: ['Email is required before submission.'],
            structuredSteps: [
              {
                action: 'Leave the required Email field empty and move focus away.',
                expectedResult: 'Required email validation is shown.',
              },
            ],
          },
          {
            title: 'Invalid email format is rejected',
            area: 'Validation',
            priority: 'Medium',
            type: 'Functional',
            evidence: ['Email must use a valid format.'],
            structuredSteps: [
              {
                action: 'Enter an invalid email format in the Email field.',
                expectedResult: 'Invalid email format validation is shown.',
              },
            ],
          },
          {
            title: 'Authenticated refresh keeps session',
            area: 'Authentication',
            priority: 'Medium',
            type: 'Regression',
            evidence: ['Authenticated users remain signed in after refresh.'],
            structuredSteps: [
              {
                action: 'Refresh the page while already authenticated.',
                expectedResult: 'The authenticated session remains active.',
              },
            ],
          },
        ],
      },
      { qaSourceId: 'source-1' },
    )

    expect(result.suggestions).toEqual([
      expect.objectContaining({ status: 'ready' }),
      expect.objectContaining({ status: 'ready' }),
      expect.objectContaining({ status: 'ready' }),
      expect.objectContaining({ status: 'ready' }),
      expect.objectContaining({ status: 'ready' }),
      expect.objectContaining({ status: 'ready' }),
      expect.objectContaining({ status: 'ready' }),
    ])
  })

  it('prevents forged Ready suggestions from bypassing conversion safety checks', () => {
    const result = parseAiSuggestionResponse(
      {
        suggestions: [
          {
            title: 'Checkout accepts valid card',
            area: 'Checkout',
            priority: 'High',
            type: 'Functional',
            evidence: ['Approved card responses must be handled.'],
            structuredSteps: [
              {
                action: 'Submit valid card details.',
                expectedResult: 'Payment is approved.',
              },
            ],
          },
        ],
      },
      { qaSourceId: 'source-1' },
    )
    const readySuggestion = result.suggestions[0]
    const conversionOptions = {
      now: '2026-05-14T08:00:00.000Z',
      createId: () => 'test-case-1',
    }

    expect(
      convertAiSuggestionToTestCase(
        { ...readySuggestion, evidence: [] },
        conversionOptions,
      ),
    ).toBeNull()
    expect(
      convertAiSuggestionToTestCase(
        { ...readySuggestion, warnings: ['Needs review.'] },
        conversionOptions,
      ),
    ).toBeNull()
    expect(
      convertAiSuggestionToTestCase(
        { ...readySuggestion, assumptions: ['User exists.'] },
        conversionOptions,
      ),
    ).toBeNull()
    expect(
      convertAiSuggestionToTestCase(
        { ...readySuggestion, qaSourceId: '' },
        conversionOptions,
      ),
    ).toBeNull()
  })

  it('caps suggestion count and field lengths', () => {
    const result = parseAiSuggestionResponse(
      {
        suggestions: Array.from({ length: AI_SUGGESTION_MAX_COUNT + 2 }).map(
          (_, index) => ({
            title: `Suggestion ${index} ${'x'.repeat(AI_SUGGESTION_TITLE_MAX_LENGTH)}`,
            area: 'A'.repeat(AI_SUGGESTION_AREA_MAX_LENGTH + 20),
            priority: 'Medium',
            type: 'Functional',
            evidence: ['The source supports the flow.'],
            structuredSteps: [
              {
                action: 'Run the flow.',
                expectedResult: 'The flow succeeds.',
              },
            ],
          }),
        ),
      },
      { qaSourceId: 'source-1' },
    )

    expect(result.suggestions).toHaveLength(AI_SUGGESTION_MAX_COUNT)
    expect(result.warnings).toEqual([
      `Only the first ${AI_SUGGESTION_MAX_COUNT} suggestions were kept for review.`,
    ])
    expect(result.suggestions[0].title).toHaveLength(
      AI_SUGGESTION_TITLE_MAX_LENGTH,
    )
    expect(result.suggestions[0].area).toHaveLength(
      AI_SUGGESTION_AREA_MAX_LENGTH,
    )
    expect(result.suggestions[0].status).toBe('needs_review')
  })

  it('limits excessive structured steps and keeps truncated suggestions out of Ready import', () => {
    const result = parseAiSuggestionResponse(
      {
        suggestions: [
          {
            title: 'Checkout covers every gateway response',
            area: 'Checkout',
            priority: 'High',
            type: 'Functional',
            evidence: ['Gateway responses must be handled.'],
            structuredSteps: Array.from({
              length: AI_SUGGESTION_STEP_MAX_COUNT + 5,
            }).map((_, index) => ({
              action: `Run gateway scenario ${index + 1}.`,
              expectedResult: `Gateway scenario ${index + 1} is handled.`,
            })),
          },
        ],
      },
      { qaSourceId: 'source-1' },
    )

    expect(result.suggestions[0].structuredSteps).toHaveLength(
      AI_SUGGESTION_STEP_MAX_COUNT,
    )
    expect(result.suggestions[0]).toMatchObject({
      status: 'needs_review',
      warnings: [
        `Suggestion had too many steps and was limited to the first ${AI_SUGGESTION_STEP_MAX_COUNT} steps.`,
      ],
    })
    expect(
      convertAiSuggestionToTestCase(result.suggestions[0], {
        now: '2026-05-14T08:00:00.000Z',
        createId: () => 'test-case-1',
      }),
    ).toBeNull()
  })

  it('converts a rich multi-step Ready suggestion into a normal Test Case with legacy compatibility fields and source provenance', () => {
    const result = parseAiSuggestionResponse(
      {
        suggestions: [
          {
            id: 'ready',
            title: 'Checkout accepts valid card',
            area: 'Checkout',
            priority: 'High',
            type: 'Smoke',
            preconditions: 'User is signed in.',
            evidence: ['Approved card responses must be handled.'],
            structuredSteps: [
              {
                action: 'Open checkout.',
                expectedResult: 'Checkout page opens.',
              },
              {
                action: 'Enter valid card details.',
                expectedResult: 'Card details are accepted for authorization.',
              },
              {
                action: 'Submit valid card details.',
                expectedResult: 'Payment authorization is approved.',
              },
              {
                action: 'Review the confirmation state.',
                expectedResult: 'Checkout shows an approved payment confirmation.',
              },
            ],
          },
        ],
      },
      { qaSourceId: 'source-1' },
    )

    expect(result.suggestions[0]).toMatchObject({
      status: 'ready',
      structuredSteps: [
        {
          id: 'ai-step-1',
          action: 'Open checkout.',
          expectedResult: 'Checkout page opens.',
        },
        {
          id: 'ai-step-2',
          action: 'Enter valid card details.',
          expectedResult: 'Card details are accepted for authorization.',
        },
        {
          id: 'ai-step-3',
          action: 'Submit valid card details.',
          expectedResult: 'Payment authorization is approved.',
        },
        {
          id: 'ai-step-4',
          action: 'Review the confirmation state.',
          expectedResult: 'Checkout shows an approved payment confirmation.',
        },
      ],
    })

    expect(
      convertAiSuggestionToTestCase(result.suggestions[0], {
        now: '2026-05-14T08:00:00.000Z',
        createId: () => 'test-case-1',
      }),
    ).toEqual({
      id: 'test-case-1',
      title: 'Checkout accepts valid card',
      area: 'Checkout',
      priority: 'High',
      status: 'Not Run',
      type: 'Smoke',
      preconditions: 'User is signed in.',
      structuredSteps: [
        {
          id: 'ai-step-1',
          action: 'Open checkout.',
          expectedResult: 'Checkout page opens.',
        },
        {
          id: 'ai-step-2',
          action: 'Enter valid card details.',
          expectedResult: 'Card details are accepted for authorization.',
        },
        {
          id: 'ai-step-3',
          action: 'Submit valid card details.',
          expectedResult: 'Payment authorization is approved.',
        },
        {
          id: 'ai-step-4',
          action: 'Review the confirmation state.',
          expectedResult: 'Checkout shows an approved payment confirmation.',
        },
      ],
      qaSourceId: 'source-1',
      steps:
        '1. Open checkout.\n2. Enter valid card details.\n3. Submit valid card details.\n4. Review the confirmation state.',
      expectedResult:
        '1. Checkout page opens.\n2. Card details are accepted for authorization.\n3. Payment authorization is approved.\n4. Checkout shows an approved payment confirmation.',
      createdAt: '2026-05-14T08:00:00.000Z',
      updatedAt: '2026-05-14T08:00:00.000Z',
    })
  })
})
