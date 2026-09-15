import { describe, expect, it, vi } from 'vitest'
import {
  AI_COVERAGE_PLAN_MERGE_BACKEND_MAX_REQUEST_UTF8_BYTES,
  AI_COVERAGE_PLAN_MERGE_BACKEND_MAX_RESPONSE_UTF8_BYTES,
  AI_COVERAGE_PLAN_MERGE_BACKEND_REQUEST_VERSION,
  AI_COVERAGE_PLAN_MERGE_DECISION_SCHEMA_VERSION,
  createAiCoveragePlanMergeBackendRequest,
  handleAiCoveragePlanMergeBackendRequest,
  parseAiCoveragePlanMergeBackendResponse,
  parseAiCoveragePlanMergeDecisionResponse,
  type AiCoveragePlanMergeBackendRequest,
} from './aiCoveragePlanMergeBackendContract'

function alias(prefix: string, index: number) {
  return `${prefix}${String(index).padStart(31, '0')}`
}

function createValidRequest(): AiCoveragePlanMergeBackendRequest {
  return {
    requestVersion: AI_COVERAGE_PLAN_MERGE_BACKEND_REQUEST_VERSION,
    findings: [
      {
        alias: alias('f', 1),
        sectionAlias: alias('s', 1),
        kind: 'behavior',
        text: 'Customer can recover a locked account.',
        context: 'Authentication recovery behavior',
      },
      {
        alias: alias('f', 2),
        sectionAlias: alias('s', 2),
        kind: 'behavior',
        text: 'A locked customer may request account recovery.',
        context: 'Locked-account support flow',
      },
    ],
    candidatePairs: [
      {
        pairAlias: alias('p', 1),
        leftAlias: alias('f', 1),
        rightAlias: alias('f', 2),
      },
    ],
  }
}

function createValidClassification(pairAliases = [alias('p', 1)]) {
  return {
    schemaVersion: AI_COVERAGE_PLAN_MERGE_DECISION_SCHEMA_VERSION,
    decisions: pairAliases.map((pairAlias) => ({
      pairAlias,
      relation: 'likely_overlap' as const,
      reasonCode: 'same_intent' as const,
    })),
  }
}

function createSuccess(pairAliases = [alias('p', 1)]) {
  return {
    ok: true as const,
    classification: createValidClassification(pairAliases),
  }
}

function submit(
  body: unknown,
  provider?: {
    classifyCoveragePlanMergePairs: ReturnType<typeof vi.fn>
  },
  headers: Record<string, string> = { 'content-type': 'application/json' },
) {
  return handleAiCoveragePlanMergeBackendRequest(
    { method: 'POST', headers, body },
    { provider },
  )
}

describe('AI coverage-plan merge backend contract', () => {
  it('creates an exact bounded request and accepts one decision per pair', async () => {
    const request = createValidRequest()
    const provider = {
      classifyCoveragePlanMergePairs: vi.fn().mockResolvedValue(createSuccess()),
    }

    expect(createAiCoveragePlanMergeBackendRequest(request)).toEqual(request)
    await expect(submit(request, provider)).resolves.toEqual({
      status: 200,
      body: createSuccess(),
    })
    expect(provider.classifyCoveragePlanMergePairs).toHaveBeenCalledTimes(1)
    expect(provider.classifyCoveragePlanMergePairs).toHaveBeenCalledWith(request)
  })

  it('requires POST with JSON and invokes no provider for invalid input', async () => {
    const provider = { classifyCoveragePlanMergePairs: vi.fn() }
    const request = createValidRequest()
    const responses = await Promise.all([
      handleAiCoveragePlanMergeBackendRequest(
        {
          method: 'GET',
          headers: { 'content-type': 'application/json' },
          body: request,
        },
        { provider },
      ),
      handleAiCoveragePlanMergeBackendRequest(
        { method: 'POST', headers: { 'content-type': 'text/plain' }, body: request },
        { provider },
      ),
      submit('{not-json', provider),
    ])

    expect(responses.map((response) => response.status)).toEqual([405, 400, 400])
    expect(provider.classifyCoveragePlanMergePairs).not.toHaveBeenCalled()
  })

  it('rejects extra or forbidden request fields recursively', async () => {
    const provider = { classifyCoveragePlanMergePairs: vi.fn() }
    const request = createValidRequest()
    const forbiddenRequests = [
      { ...request, qaSource: 'SECRET_SOURCE' },
      {
        ...request,
        findings: [
          { ...request.findings[0], evidence: ['SECRET_EVIDENCE'] },
          request.findings[1],
        ],
      },
      {
        ...request,
        candidatePairs: [
          { ...request.candidatePairs[0], prompt: 'SECRET_PROMPT' },
        ],
      },
      { ...request, responseSchema: { secret: true } },
      { ...request, apiKey: 'SECRET_KEY' },
      { ...request, approval: { approved: true } },
    ]

    for (const body of forbiddenRequests) {
      const response = await submit(body, provider)
      expect(response).toMatchObject({
        status: 400,
        body: { ok: false, error: { code: 'bad_request' } },
      })
      expect(JSON.stringify(response)).not.toContain('SECRET_')
    }
    expect(provider.classifyCoveragePlanMergePairs).not.toHaveBeenCalled()
  })

  it('rejects invalid aliases, self/cross-kind pairs, duplicates, and unknown refs', async () => {
    const provider = { classifyCoveragePlanMergePairs: vi.fn() }
    const request = createValidRequest()
    const invalidRequests = [
      {
        ...request,
        findings: [
          { ...request.findings[0], alias: '\u05d0'.repeat(32) },
          request.findings[1],
        ],
      },
      {
        ...request,
        findings: [
          { ...request.findings[0], alias: 'x'.repeat(33) },
          request.findings[1],
        ],
      },
      {
        ...request,
        findings: [request.findings[0], { ...request.findings[1], alias: request.findings[0].alias }],
      },
      {
        ...request,
        candidatePairs: [
          {
            ...request.candidatePairs[0],
            rightAlias: request.candidatePairs[0].leftAlias,
          },
        ],
      },
      {
        ...request,
        findings: [request.findings[0], { ...request.findings[1], kind: 'actor' }],
      },
      {
        ...request,
        candidatePairs: [request.candidatePairs[0], { ...request.candidatePairs[0] }],
      },
      {
        ...request,
        candidatePairs: [
          { ...request.candidatePairs[0], rightAlias: alias('f', 99) },
        ],
      },
    ]

    for (const body of invalidRequests) {
      await expect(submit(body, provider)).resolves.toMatchObject({
        status: 400,
        body: { ok: false, error: { code: 'bad_request' } },
      })
    }
    expect(provider.classifyCoveragePlanMergePairs).not.toHaveBeenCalled()
  })

  it('rejects provider-visible findings that are not referenced by a candidate pair', async () => {
    const provider = { classifyCoveragePlanMergePairs: vi.fn() }
    const request = createValidRequest()
    const response = await submit(
      {
        ...request,
        findings: [
          ...request.findings,
          {
            ...request.findings[0],
            alias: alias('f', 3),
            sectionAlias: alias('s', 3),
            text: 'Unreferenced finding',
          },
        ],
      },
      provider,
    )

    expect(response).toMatchObject({
      status: 400,
      body: { ok: false, error: { code: 'bad_request' } },
    })
    expect(provider.classifyCoveragePlanMergePairs).not.toHaveBeenCalled()
  })

  it('requires every ephemeral alias to contain exactly 32 ASCII characters', async () => {
    const provider = { classifyCoveragePlanMergePairs: vi.fn() }
    const request = createValidRequest()
    const shortAlias = 'short_alias'
    const response = await submit(
      {
        ...request,
        findings: [
          { ...request.findings[0], alias: shortAlias },
          request.findings[1],
        ],
        candidatePairs: [
          { ...request.candidatePairs[0], leftAlias: shortAlias },
        ],
      },
      provider,
    )

    expect(response).toMatchObject({
      status: 400,
      body: { ok: false, error: { code: 'bad_request' } },
    })
    expect(provider.classifyCoveragePlanMergePairs).not.toHaveBeenCalled()
  })

  it('rejects same-section candidate pairs before provider invocation', async () => {
    const provider = { classifyCoveragePlanMergePairs: vi.fn() }
    const request = createValidRequest()
    const response = await submit(
      {
        ...request,
        findings: [
          request.findings[0],
          {
            ...request.findings[1],
            sectionAlias: request.findings[0].sectionAlias,
          },
          {
            alias: alias('f', 3),
            sectionAlias: alias('s', 2),
            kind: 'behavior',
            text: 'A separate section finding.',
            context: 'Separate section context',
          },
        ],
      },
      provider,
    )

    expect(response).toMatchObject({
      status: 400,
      body: { ok: false, error: { code: 'bad_request' } },
    })
    expect(provider.classifyCoveragePlanMergePairs).not.toHaveBeenCalled()
  })
  it('enforces the exact text and context character ceilings', async () => {
    const provider = {
      classifyCoveragePlanMergePairs: vi.fn().mockResolvedValue(createSuccess()),
    }
    const request = createValidRequest()
    const exactLimit = {
      ...request,
      findings: [
        { ...request.findings[0], text: 'x'.repeat(500), context: '\u05d0'.repeat(500) },
        request.findings[1],
      ],
    }
    const overLimit = {
      ...request,
      findings: [
        { ...request.findings[0], text: 'x'.repeat(501) },
        request.findings[1],
      ],
    }

    await expect(submit(exactLimit, provider)).resolves.toMatchObject({ status: 200 })
    await expect(submit(overLimit, provider)).resolves.toMatchObject({ status: 400 })
    expect(provider.classifyCoveragePlanMergePairs).toHaveBeenCalledTimes(1)
  })
  it('enforces 2-8 section aliases, 40 findings per section, and 80 total', async () => {
    const provider = {
      classifyCoveragePlanMergePairs: vi.fn().mockImplementation(
        (request: AiCoveragePlanMergeBackendRequest) =>
          Promise.resolve(
            createSuccess(request.candidatePairs.map((pair) => pair.pairAlias)),
          ),
      ),
    }
    const request = createValidRequest()
    const oneSection = {
      ...request,
      findings: request.findings.map((finding) => ({
        ...finding,
        sectionAlias: alias('s', 1),
      })),
    }
    const nineSectionFindings = Array.from({ length: 9 }, (_, index) => ({
      alias: alias('f', index + 1),
      sectionAlias: alias('s', index + 1),
      kind: 'behavior' as const,
      text: `Behavior ${index + 1}`,
      context: `Context ${index + 1}`,
    }))
    const createCoveringPairs = (
      findings: AiCoveragePlanMergeBackendRequest['findings'],
    ) =>
      findings.slice(1).map((finding, index) => ({
        pairAlias: alias('p', index + 1),
        leftAlias: findings[0].alias,
        rightAlias: finding.alias,
      }))
    const eightSections = {
      ...request,
      findings: nineSectionFindings.slice(0, 8),
      candidatePairs: createCoveringPairs(nineSectionFindings.slice(0, 8)),
    }
    const nineSections = {
      ...request,
      findings: nineSectionFindings,
      candidatePairs: createCoveringPairs(nineSectionFindings),
    }
    const fortyPerSection = {
      ...request,
      findings: Array.from({ length: 80 }, (_, index) => ({
        alias: alias('f', index + 1),
        sectionAlias: alias('s', index < 40 ? 1 : 2),
        kind: 'behavior' as const,
        text: `Behavior ${index + 1}`,
        context: `Context ${index + 1}`,
      })),
      candidatePairs: Array.from({ length: 40 }, (_, index) => ({
        pairAlias: alias('p', index + 1),
        leftAlias: alias('f', index + 1),
        rightAlias: alias('f', index + 41),
      })),
    }
    const fortyOneInSection = {
      ...fortyPerSection,
      findings: [
        ...fortyPerSection.findings.slice(0, 41).map((finding) => ({
          ...finding,
          sectionAlias: alias('s', 1),
        })),
        ...fortyPerSection.findings.slice(41).map((finding) => ({
          ...finding,
          sectionAlias: alias('s', 2),
        })),
      ],
    }
    const eightyOneTotal = {
      ...fortyPerSection,
      findings: [
        ...fortyPerSection.findings,
        {
          alias: alias('f', 81),
          sectionAlias: alias('s', 3),
          kind: 'behavior' as const,
          text: 'Behavior 81',
          context: 'Context 81',
        },
      ],
    }

    await expect(submit(oneSection, provider)).resolves.toMatchObject({ status: 400 })
    await expect(submit(eightSections, provider)).resolves.toMatchObject({
      status: 200,
    })
    await expect(submit(nineSections, provider)).resolves.toMatchObject({ status: 400 })
    await expect(submit(fortyPerSection, provider)).resolves.toMatchObject({ status: 200 })
    await expect(submit(fortyOneInSection, provider)).resolves.toMatchObject({ status: 413 })
    await expect(submit(eightyOneTotal, provider)).resolves.toMatchObject({ status: 413 })
    expect(provider.classifyCoveragePlanMergePairs).toHaveBeenCalledTimes(2)
  })

  it('enforces the 120-pair ceiling without silently omitting pairs', async () => {
    const request = createValidRequest()
    const findings = Array.from({ length: 24 }, (_, index) => ({
      alias: alias('f', index + 1),
      sectionAlias: alias('s', index < 12 ? 1 : 2),
      kind: 'behavior' as const,
      text: `Behavior ${index + 1}`,
      context: `Context ${index + 1}`,
    }))
    const allPairs = findings.flatMap((left, leftIndex) =>
      findings
        .slice(leftIndex + 1)
        .filter((right) => right.sectionAlias !== left.sectionAlias)
        .map((right) => ({ left, right })),
    )
    const coveragePairs = findings.slice(0, 12).map((left, index) => ({
      left,
      right: findings[index + 12],
    }))
    const coveragePairKeys = new Set(
      coveragePairs.map(({ left, right }) => `${left.alias}\u0000${right.alias}`),
    )
    const prioritizedPairs = [
      ...coveragePairs,
      ...allPairs.filter(
        ({ left, right }) => !coveragePairKeys.has(`${left.alias}\u0000${right.alias}`),
      ),
    ]
    const createPairs = (count: number) =>
      prioritizedPairs.slice(0, count).map(({ left, right }, index) => ({
        pairAlias: alias('p', index + 1),
        leftAlias: left.alias,
        rightAlias: right.alias,
      }))
    const provider = {
      classifyCoveragePlanMergePairs: vi.fn().mockImplementation(
        (validRequest: AiCoveragePlanMergeBackendRequest) =>
          Promise.resolve(
            createSuccess(validRequest.candidatePairs.map((pair) => pair.pairAlias)),
          ),
      ),
    }

    await expect(
      submit({ ...request, findings, candidatePairs: createPairs(120) }, provider),
    ).resolves.toMatchObject({ status: 200 })
    await expect(
      submit({ ...request, findings, candidatePairs: createPairs(121) }, provider),
    ).resolves.toMatchObject({ status: 413 })
    expect(provider.classifyCoveragePlanMergePairs).toHaveBeenCalledTimes(1)
  })

  it('enforces Content-Length, raw, and parsed/reserialized 96 KiB limits', async () => {
    const provider = { classifyCoveragePlanMergePairs: vi.fn() }
    const request = createValidRequest()
    const oversizedParsed = {
      ...request,
      findings: Array.from({ length: 80 }, (_, index) => ({
        alias: alias('f', index + 1),
        sectionAlias: alias('s', index < 40 ? 1 : 2),
        kind: 'behavior' as const,
        text: `${'א'.repeat(498)}${String(index).padStart(2, '0')}`,
        context: `${'ב'.repeat(498)}${String(index).padStart(2, '0')}`,
      })),
      candidatePairs: [request.candidatePairs[0]],
    }
    const responses = await Promise.all([
      submit(request, provider, {
        'content-type': 'application/json',
        'content-length': String(
          AI_COVERAGE_PLAN_MERGE_BACKEND_MAX_REQUEST_UTF8_BYTES + 1,
        ),
      }),
      submit(`{"padding":"${'x'.repeat(AI_COVERAGE_PLAN_MERGE_BACKEND_MAX_REQUEST_UTF8_BYTES)}"}`, provider),
      submit(oversizedParsed, provider),
    ])

    expect(responses.map((response) => response.status)).toEqual([413, 413, 413])
    expect(provider.classifyCoveragePlanMergePairs).not.toHaveBeenCalled()
  })

  it('normalizes decisions to requested pair order and requires a bijection', async () => {
    const request = createValidRequest()
    const thirdFinding = {
      alias: alias('f', 3),
      sectionAlias: alias('s', 2),
      kind: 'behavior' as const,
      text: 'Support can review a recovery request.',
      context: 'Support review flow',
    }
    const pair2 = {
      pairAlias: alias('p', 2),
      leftAlias: alias('f', 1),
      rightAlias: alias('f', 3),
    }
    const twoPairRequest = {
      ...request,
      findings: [...request.findings, thirdFinding],
      candidatePairs: [...request.candidatePairs, pair2],
    }
    const provider = {
      classifyCoveragePlanMergePairs: vi.fn().mockResolvedValue({
        ok: true,
        classification: {
          schemaVersion: AI_COVERAGE_PLAN_MERGE_DECISION_SCHEMA_VERSION,
          decisions: [
            {
              pairAlias: pair2.pairAlias,
              relation: 'distinct',
              reasonCode: 'different_scope',
            },
            createValidClassification().decisions[0],
          ],
        },
      }),
    }
    const response = await submit(twoPairRequest, provider)

    expect(response).toMatchObject({ status: 200 })
    expect(response.body).toMatchObject({
      ok: true,
      classification: {
        decisions: [
          { pairAlias: alias('p', 1) },
          { pairAlias: alias('p', 2) },
        ],
      },
    })

    const invalidClassifications = [
      { ...createValidClassification(), decisions: [] },
      {
        ...createValidClassification(),
        decisions: [
          ...createValidClassification().decisions,
          ...createValidClassification().decisions,
        ],
      },
      createValidClassification([alias('p', 99)]),
      {
        ...createValidClassification(),
        decisions: [
          { ...createValidClassification().decisions[0], finding: 'unsafe' },
        ],
      },
    ]

    for (const classification of invalidClassifications) {
      const invalidResponse = await submit(request, {
        classifyCoveragePlanMergePairs: vi.fn().mockResolvedValue({
          ok: true,
          classification,
        }),
      })
      expect(invalidResponse).toMatchObject({
        status: 502,
        body: { ok: false, error: { code: 'invalid_provider_response' } },
      })
    }
  })

  it('exposes a discriminated closed-set decision parser', () => {
    expect(
      parseAiCoveragePlanMergeDecisionResponse(
        createValidClassification(),
        [alias('p', 1)],
      ),
    ).toEqual({
      ok: true,
      decisions: createValidClassification().decisions,
      error: null,
    })
    expect(
      parseAiCoveragePlanMergeDecisionResponse(
        {
          ...createValidClassification(),
          decisions: [
            {
              ...createValidClassification().decisions[0],
              relation: 'merge_and_delete',
            },
          ],
        },
        [alias('p', 1)],
      ),
    ).toEqual({
      ok: false,
      decisions: null,
      error: 'invalid_provider_response',
    })
  })
  it('strictly parses bounded success/error envelopes', () => {
    const success = createSuccess()
    const error = {
      ok: false as const,
      error: {
        code: 'rate_limited' as const,
        message: 'Try again later.',
        retryable: true,
      },
    }

    expect(parseAiCoveragePlanMergeBackendResponse(success, [alias('p', 1)])).toEqual(success)
    expect(parseAiCoveragePlanMergeBackendResponse(error, [alias('p', 1)])).toEqual(error)
    expect(
      parseAiCoveragePlanMergeBackendResponse(
        { ...success, rawProviderResponse: 'unsafe' },
        [alias('p', 1)],
      ),
    ).toBeNull()
    expect(
      parseAiCoveragePlanMergeBackendResponse(
        { ...error, error: { ...error.error, stack: 'unsafe' } },
        [alias('p', 1)],
      ),
    ).toBeNull()
    expect(
      parseAiCoveragePlanMergeBackendResponse(
        {
          ...error,
          error: {
            ...error.error,
            message: 'x'.repeat(AI_COVERAGE_PLAN_MERGE_BACKEND_MAX_RESPONSE_UTF8_BYTES),
          },
        },
        [alias('p', 1)],
      ),
    ).toBeNull()
  })

  it('maps safe provider errors, missing configuration, and thrown failures', async () => {
    const request = createValidRequest()
    const cases = [
      ['bad_request', 400],
      ['too_large', 413],
      ['rate_limited', 429],
      ['internal_error', 500],
      ['invalid_provider_response', 502],
      ['provider_unavailable', 503],
      ['timeout', 504],
    ] as const

    for (const [code, status] of cases) {
      const response = await submit(request, {
        classifyCoveragePlanMergePairs: vi.fn().mockResolvedValue({
          ok: false,
          error: { code, message: 'Safe provider error.', retryable: true },
        }),
      })
      expect(response.status).toBe(status)
    }

    await expect(submit(request)).resolves.toMatchObject({
      status: 503,
      body: { ok: false, error: { code: 'provider_unavailable' } },
    })
    const thrown = await submit(request, {
      classifyCoveragePlanMergePairs: vi
        .fn()
        .mockRejectedValue(new Error('SECRET_STACK_AND_PAYLOAD')),
    })
    expect(thrown).toMatchObject({
      status: 500,
      body: { ok: false, error: { code: 'internal_error' } },
    })
    expect(JSON.stringify(thrown)).not.toContain('SECRET_STACK_AND_PAYLOAD')
  })
})
