import type {
  AiSuggestionRequest,
  PackedQaSourceContext,
} from './aiSuggestionTypes'

export const AI_SUGGESTION_RESPONSE_SCHEMA = `{
  "suggestions": [
    {
      "title": "string",
      "area": "string",
      "priority": "Low | Medium | High | Critical",
      "type": "Functional | UI | Regression | Smoke | Edge Case",
      "preconditions": "string",
      "structuredSteps": [
        {
          "action": "string",
          "expectedResult": "string"
        }
      ],
      "evidence": ["short source-backed quote or section reference"],
      "assumptions": ["explicit assumption, if any"],
      "warnings": ["review warning, if any"]
    }
  ],
  "warnings": ["response-level warning, if any"]
}`

export function buildAiSuggestionRequest(
  source: PackedQaSourceContext,
): AiSuggestionRequest {
  return {
    source,
    responseSchema: AI_SUGGESTION_RESPONSE_SCHEMA,
    prompt: [
      'You are assisting a QA tester by suggesting structured test cases from one reviewed QA Source.',
      'Use only the provided source content. Do not invent business rules, actors, data, or expected results.',
      'Return JSON only, matching the response schema exactly. Use exact keys only and never use null.',
      'Return 3-6 high-value suggestions when the source supports that many, never more than 8, and return fewer if the source is narrow.',
      'Coverage selection is phase 1: internally identify source-backed behaviors before choosing suggestions, then group candidate scenarios by distinct behavior, risk, actor, state, input class, or failure mode.',
      'Select a balanced, high-value, non-overlapping set when the source supports it; narrow sources may produce only 1-2 suggestions.',
      'Prefer fewer grounded suggestions over invented category coverage. Do not force every source into every category and do not use category quotas.',
      'When source-supported, prefer variety across positive/smoke, negative/error behavior, validation/input handling, edge/boundary behavior, permissions/roles/account states, state transitions/lifecycle rules, provider failure/retry/degraded behavior, persistence/session/data integrity, and regression candidates for critical or fragile flows.',
      'For broad sources, choose scenarios from different feature/risk areas when source-supported; do not spend the entire suggestion set on one lifecycle family if other distinct source-backed areas are available.',
      'Treat renewal success, renewal failure, grace period, retry, expiration, and reactivation as one related subscription lifecycle/payment cluster during selection.',
      'Choose only the highest-value 1-2 suggestions from that lifecycle/payment cluster when cancellation, permissions, provider unavailable, access blocking, duplicate submit, cross-organization, audit, notification, or plan-change behavior is also visible.',
      'Prefer variety across feature areas, actors, risk types, and system boundaries.',
      'When visible and source-supported, include at least one scenario outside the dominant lifecycle/payment cluster.',
      'Avoid duplicate or near-duplicate suggestions unless each tests a genuinely different source-backed rule, trigger, actor, state, input class, or failure mode.',
      'Type should match the scenario purpose instead of defaulting to one value, priority should reflect user impact and risk, and area should identify the most specific source-backed feature area.',
      'Use response-level warnings for source-wide caveats such as narrow or truncated source material, and do not assume unseen sections.',
      'Every suggested test case must have a title, area, supported priority, supported type, and at least one complete structured step.',
      'Executable test-case writing is phase 2: after selecting diverse scenarios, each suggestion must still be written as an executable manual QA script, not a scenario summary.',
      'Coverage diversity must not compress each scenario into a one-step summary. Preserve executable script quality for every selected suggestion.',
      'Step decomposition: use only the concrete execution steps needed to run the scenario clearly; non-atomic flows often need 2-5 steps, but step count is not the goal.',
      'Do not pad scripts, repeat the same verification, add generic navigation/setup, or make every suggestion longer just to satisfy a step count.',
      'Split compound steps when one action combines setup, action, and assertion; keep atomic checks concise.',
      'When a flow starts from a page, screen, or form, include navigation/setup only when it adds execution value or is needed to make the scenario runnable.',
      'For login, authentication, security, role, lockout, and account-state flows, split scripts into meaningful navigation/setup, input or repeated attempt, submit/trigger, and observable verification steps when source-supported and execution-valuable.',
      'For lifecycle, renewal, payment, cancellation, reactivation, permission, and provider-failure flows, include only meaningful execution steps needed to make the scenario runnable.',
      'If a scenario depends on a backend job, scheduled renewal, simulated provider response, expired grace period, or system state, the action should describe a testable trigger or setup, not only passive waiting.',
      'Do not use passive actions like "wait for next renewal date" as the only step when the expected result includes multiple system state changes.',
      'Use setup/preconditions for starting state, action steps for test triggers and user/system actions, and expected results for observable outcomes.',
      'Each step action must be sufficient to produce its expected result.',
      'Do not attach redirect, saved data, session creation, lockout, status transition, permission change, or persistence outcomes to passive input-only actions.',
      'If a system-level outcome depends on submitting, clicking, saving, refreshing, logging out, attempting login, uploading, or confirming, include that trigger as an explicit action step.',
      'Input-only steps should have input-level expected results; trigger steps should have system-level expected results.',
      'Use one-step tests only for single trigger-and-observe atomic checks, and do not pad atomic checks.',
      'Expected results should name observable UI state, saved data, validation behavior, status transition, permission effect, error handling, notification behavior, or persistence behavior.',
      'For login/security expected results, prefer observable outcomes such as no authenticated session is created, the user is not redirected to the dashboard, the dashboard is displayed, the session remains active after refresh, or the account remains locked during the lockout period.',
      'Include evidence, assumptions, and warnings so the tester can review before creating Test Cases.',
      'Require source-grounded evidence for every suggestion and ensure expected results are traceable to that evidence.',
      'Avoid shallow wording such as "verify works", "check functionality", "system behaves correctly", "the system behaves as expected", "appropriate message", "correct result", "the action succeeds", "login is not allowed", or "works as expected".',
      'Use warnings for uncertain or inferred behavior, and assumptions only for harmless setup assumptions.',
      'Use "" for no preconditions and [] for no evidence, assumptions, or warnings.',
      '',
      `Source title: ${source.title}`,
      `Source type: ${source.sourceType}`,
      `Source status: ${source.status}`,
      `Source updated at: ${source.updatedAt}`,
      `Source truncated: ${source.truncated ? 'yes' : 'no'}`,
      '',
      'Source content:',
      source.content,
    ].join('\n'),
  }
}
