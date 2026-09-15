import { expect, test, type Page } from '@playwright/test'

const source = { id: 'enterprise-analysis', sourceType: 'Requirement', status: 'Draft', title: 'Commerce specification', notes: '',
  content: '# Receipts\nCustomers must receive receipts.\n# Refunds\nRefunds must complete in 14 days.\n# Security\nSessions must expire after 30 minutes.',
  createdAt: '2026-09-05T10:00:00.000Z', updatedAt: '2026-09-05T10:00:00.000Z' }
async function open(page: Page) {
  await page.addInitScript((item) => { if (!localStorage.getItem('enterprise-seeded')) { localStorage.setItem('qa-mission-control:qa-sources:v0.12', JSON.stringify([item])); localStorage.setItem('enterprise-seeded', 'yes') } }, source)
  await page.goto('/')
  await page.getByRole('navigation', { name: 'Workspace pages' }).getByRole('button', { name: 'QA Sources', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Analyze Entire Specification', exact: true })).toBeEnabled()
}
function result(text: string) {
  const quote = text.slice(text.indexOf('\n') + 1).trim()
  return { ok: true, analysis: { version: 1, findings: [{ kind: 'requirement', summary: quote, quote, occurrence: 0, coverage: 'Commerce controls' }], limitations: [] } }
}
async function readSaved(page: Page) {
  return page.evaluate(async () => {
    const path = '/src/lib/workspace/workspaceRepository.ts'
    const { openWorkspaceRepository } = await import(/* @vite-ignore */ path)
    const repository = await openWorkspaceRepository()
    const [jobs, tasks, requirements, tests] = await Promise.all(['analysisJobs', 'analysisTasks', 'requirements', 'testCases'].map((name) => repository.readCollection(name)))
    repository.close()
    return { jobs: jobs.records.map((item: { value: unknown }) => item.value), tasks: tasks.records.map((item: { value: unknown }) => item.value), requirements: requirements.records.map((item: { value: unknown }) => item.value), testCount: tests.records.length }
  })
}

test('whole-source preflight, explicit bounded analysis, exact reuse and durable evidence work through the real UI', async ({ page }, testInfo) => {
  await page.context().addCookies([{ name: 'qa-unrelated-local-session', value: 'SYNTHETIC_NOT_A_REAL_SECRET', url: 'http://127.0.0.1:5197/' }])
  const requests: string[] = []
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/api/ai/document-unit', async (route) => {
    const headers = await route.request().allHeaders()
    expect(headers).not.toHaveProperty('cookie')
    expect(headers).not.toHaveProperty('authorization')
    const request = route.request().postDataJSON()
    requests.push(request.text)
    expect(Object.keys(request).sort()).toEqual(['heading', 'text', 'version'])
    expect(request.text.length).toBeLessThanOrEqual(6000)
    await route.fulfill({ json: result(request.text) })
  })
  await open(page)
  await page.getByRole('button', { name: 'Analyze Entire Specification', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Analysis confirmation' })).toContainText('Analyze all 3 source regions')
  expect(requests).toHaveLength(0)
  await page.getByRole('button', { name: 'Confirm and analyze', exact: true }).dblclick()
  await expect(page.locator('.document-job')).toContainText('Analysis completed')
  expect(requests).toHaveLength(3)
  await expect(page.locator('.requirement-collection .requirement-row')).toHaveCount(3)
  const saved = await readSaved(page)
  expect(saved.requirements).toHaveLength(3)
  expect(saved.testCount).toBe(0)
  expect(JSON.stringify(saved.tasks)).not.toContain('Customers must')
  expect(JSON.stringify(saved)).not.toMatch(/Authorization|rawResponse|messages|apiKey/)
  await page.reload()
  await page.getByRole('navigation', { name: 'Workspace pages' }).getByRole('button', { name: 'QA Sources', exact: true }).click()
  await expect(page.locator('.requirement-collection .requirement-row')).toHaveCount(3)
  expect(requests).toHaveLength(3)
  await page.getByRole('button', { name: 'Analyze Entire Specification', exact: true }).click()
  await expect(page.locator('.document-preflight')).toContainText('Reused locally')
  await page.getByRole('button', { name: 'Confirm and analyze', exact: true }).click()
  await expect(page.locator('.document-job')).toContainText('Analysis completed')
  expect(requests).toHaveLength(3)
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await page.getByLabel('Source content', { exact: true }).fill(source.content.replace('14 days', '30 business days'))
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(page.locator('.requirement-collection .requirement-row')).toHaveCount(2)
  await page.getByRole('button', { name: 'Analyze Entire Specification', exact: true }).click()
  await page.getByRole('button', { name: 'Confirm and analyze', exact: true }).click()
  await expect(page.locator('.document-job')).toContainText('Analysis completed')
  expect(requests).toHaveLength(4)
  expect(requests[3]).toContain('30 business days')
  await page.locator('.requirement-collection .requirement-row').last().click()
  for (const width of [1440, 1280, 1024, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.locator('.document-intelligence').scrollIntoViewIfNeeded()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`intelligence-${width}.png`) })
  }
  expect(errors).toEqual([])
})

test('reload with in-flight tasks preserves completed results, resumes explicitly and prevents a second-tab runner', async ({ page, context }) => {
  let calls = 0
  await page.route('**/api/ai/document-unit', async (route) => {
    calls += 1
    if (calls === 1) await route.fulfill({ json: result(route.request().postDataJSON().text) })
    // Other requests intentionally remain in flight until reload closes their original page operation.
  })
  await open(page)
  await page.getByRole('button', { name: 'Analyze Entire Specification', exact: true }).click()
  await page.getByRole('button', { name: 'Confirm and analyze', exact: true }).click()
  await expect.poll(async () => (await readSaved(page)).requirements.length).toBe(1)
  const other = await context.newPage()
  await other.goto('/')
  await other.getByRole('navigation', { name: 'Workspace pages' }).getByRole('button', { name: 'QA Sources', exact: true }).click()
  await other.getByRole('button', { name: 'Resume analysis', exact: true }).click()
  await expect(other.getByRole('alert')).toContainText('already active in another tab')
  await other.close()
  await page.reload()
  await page.unroute('**/api/ai/document-unit')
  let resumed = 0
  await page.route('**/api/ai/document-unit', async (route) => { resumed += 1; await route.fulfill({ json: result(route.request().postDataJSON().text) }) })
  await page.getByRole('navigation', { name: 'Workspace pages' }).getByRole('button', { name: 'QA Sources', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Resume analysis', exact: true })).toBeVisible()
  expect(resumed).toBe(0)
  await page.getByRole('button', { name: 'Resume analysis', exact: true }).click()
  await expect(page.locator('.document-job')).toContainText('Analysis completed')
  expect(resumed).toBe(2)
  expect((await readSaved(page)).requirements).toHaveLength(3)
})

test('global requirement coverage saves explicitly and QA-confirmed many-to-many test links survive reload', async ({ page }, testInfo) => {
  let calls = 0
  await page.addInitScript(() => localStorage.setItem('qa-mission-control:test-cases:v0.1', JSON.stringify([
    { id: 'test-receipt', title: 'Receipt is sent once', area: 'Commerce', priority: 'High', status: 'Not Run', type: 'Functional', steps: 'Complete an authorized payment. Refresh confirmation.', expectedResult: 'One receipt is sent.', createdAt: '2026-01-01', updatedAt: '2026-01-01' },
    { id: 'test-audit', title: 'Receipt audit is retained', area: 'Commerce', priority: 'Medium', status: 'Not Run', type: 'Functional', steps: 'Complete payment and inspect the audit record.', expectedResult: 'The receipt event is recorded without credentials.', createdAt: '2026-01-01', updatedAt: '2026-01-01' },
  ])))
  await page.route('**/api/ai/document-unit', async (route) => { calls += 1; await route.fulfill({ json: result(route.request().postDataJSON().text) }) })
  await open(page)
  await page.getByRole('button', { name: 'Analyze Entire Specification', exact: true }).click()
  await page.getByRole('button', { name: 'Confirm and analyze', exact: true }).click()
  await expect(page.locator('.document-job')).toContainText('Analysis completed')
  await page.getByRole('button', { name: 'Coverage & traceability', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Requirement-backed global coverage' })).toContainText('Unsaved requirement-backed candidate')
  expect(calls).toBe(3)
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Save requirement coverage', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Requirement-backed global coverage' })).toContainText('Saved requirement-backed plan')
  await page.getByRole('button', { name: 'Requirements & findings', exact: true }).click()
  await page.locator('.requirement-collection .requirement-row').first().click()
  await page.locator('.requirement-dossier').getByRole('button', { name: 'Link reviewed tests' }).click()
  const review = page.getByRole('dialog', { name: 'Link reviewed Test Cases' })
  await expect(review).toBeVisible()
  await review.getByRole('checkbox', { name: 'Receipt is sent once Commerce', exact: true }).check()
  await review.getByRole('checkbox', { name: 'Receipt audit is retained Commerce', exact: true }).check()
  await expect(review.getByRole('button', { name: 'Confirm reviewed coverage', exact: true })).toBeDisabled()
  await review.getByRole('checkbox', { name: /I reviewed these 2 Test Cases/ }).check()
  await review.getByRole('button', { name: 'Confirm reviewed coverage', exact: true }).click()
  await expect(review).not.toBeVisible()
  await expect(page.locator('.source-coverage-intelligence .document-metrics')).toContainText('QA-confirmed test traceability1 / 3')
  expect((await readSaved(page)).testCount).toBe(2)
  expect(calls).toBe(3)
  await page.reload()
  await page.getByRole('navigation', { name: 'Workspace pages' }).getByRole('button', { name: 'QA Sources', exact: true }).click()
  await page.getByRole('button', { name: 'Coverage & traceability', exact: true }).click()
  await expect(page.locator('.source-coverage-intelligence .document-metrics')).toContainText('QA-confirmed test traceability1 / 3')
  await expect(page.getByRole('region', { name: 'Requirement-backed global coverage' })).toContainText('Saved requirement-backed plan')
  for (const width of [1440, 1280, 1024, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.locator('.source-coverage-intelligence').scrollIntoViewIfNeeded()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`requirement-coverage-${width}.png`) })
  }
})

const securityDraft = { ok: true, warnings: [], suggestions: [{ title: 'Session expires after 30 minutes', area: 'Security', priority: 'High', type: 'Functional', preconditions: 'A user has an authenticated session.', structuredSteps: [{ action: 'Leave the session inactive for 30 minutes.', expectedResult: 'The session expires.' }, { action: 'Request the protected account page.', expectedResult: 'The sign-in screen is displayed.' }], evidence: ['Sessions must expire after 30 minutes.'], assumptions: [], warnings: [] }] }
async function openSecurityDraft(page: Page) {
  await page.route('**/api/ai/document-unit', async (route) => route.fulfill({ json: result(route.request().postDataJSON().text) }))
  await open(page)
  await page.getByRole('button', { name: 'Analyze Entire Specification', exact: true }).click()
  await page.getByRole('button', { name: 'Confirm and analyze', exact: true }).click()
  await expect(page.locator('.document-job')).toContainText('Analysis completed')
  await page.locator('.requirement-collection .requirement-row').filter({ hasText: 'Sessions must expire' }).click()
  const row = page.locator('.requirement-dossier')
  await row.getByRole('button', { name: 'Draft tests', exact: true }).click()
  return page.getByRole('dialog', { name: 'Draft tests for one requirement' })
}
test('requirement drafting uses one explicit leaf request; QA approval atomically imports tests and links without reload', async ({ page }, testInfo) => {
  await page.context().addCookies([{ name: 'qa-unrelated-local-session', value: 'SYNTHETIC_NOT_A_REAL_SECRET', url: 'http://127.0.0.1:5197/' }])
  const calls: Record<string, unknown>[] = []
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/api/ai/test-case-suggestions', async (route) => {
    const headers = await route.request().allHeaders()
    expect(headers).not.toHaveProperty('cookie')
    expect(headers).not.toHaveProperty('authorization')
    calls.push(route.request().postDataJSON())
    await route.fulfill({ json: securityDraft })
  })
  const review = await openSecurityDraft(page)
  expect(calls).toHaveLength(0)
  expect((await readSaved(page)).testCount).toBe(0)
  await review.getByRole('button', { name: 'Generate test drafts', exact: true }).dblclick()
  await expect(review.getByRole('checkbox', { name: securityDraft.suggestions[0].title, exact: true })).toBeEnabled()
  expect(calls).toHaveLength(1)
  expect(JSON.stringify(calls[0])).toContain('Sessions must expire')
  expect(JSON.stringify(calls[0])).not.toMatch(/Customers must|Refunds must|Authorization/)
  expect((await readSaved(page)).testCount).toBe(0)
  await review.getByRole('checkbox', { name: securityDraft.suggestions[0].title, exact: true }).check()
  for (const width of [1440, 1280, 1024, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`requirement-drafts-${width}.png`) })
  }
  await review.getByRole('button', { name: 'Approve and import 1 selected', exact: true }).dblclick()
  await expect(review.getByRole('status')).toContainText('1 QA-approved Test Cases')
  expect((await readSaved(page)).testCount).toBe(1)
  await review.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(page.locator('.requirement-dossier').getByRole('button', { name: 'Draft tests', exact: true })).toBeFocused()
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.getByRole('navigation', { name: 'Workspace pages' }).getByRole('button', { name: 'Test Cases', exact: true }).click()
  await expect(page.getByText('Session expires after 30 minutes', { exact: true })).toBeVisible()
  await page.reload()
  await page.getByRole('navigation', { name: 'Workspace pages' }).getByRole('button', { name: 'QA Sources', exact: true }).click()
  await page.getByRole('button', { name: 'Coverage & traceability', exact: true }).click()
  await expect(page.locator('.source-coverage-intelligence .document-metrics')).toContainText('QA-confirmed test traceability1 / 3')
  expect(calls).toHaveLength(1)
  expect(errors).toEqual([])
})
test('requirement draft import rolls back both collections on write failure and rejects a changed source', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/api/ai/test-case-suggestions', async (route) => route.fulfill({ json: securityDraft }))
  const review = await openSecurityDraft(page)
  await review.getByRole('button', { name: 'Generate test drafts', exact: true }).click()
  await review.getByRole('checkbox', { name: securityDraft.suggestions[0].title, exact: true }).check()
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (value, key) {
      if (value?.collection === 'requirementTestLinks') { IDBObjectStore.prototype.put = original; this.transaction.abort(); throw new DOMException('Injected storage failure', 'QuotaExceededError') }
      return key === undefined ? original.call(this, value) : original.call(this, value, key)
    }
  })
  await review.getByRole('button', { name: 'Approve and import 1 selected', exact: true }).click()
  await expect(review.getByRole('alert')).toContainText('Previously saved data was not replaced')
  expect((await readSaved(page)).testCount).toBe(0)
  const linkCount = await page.evaluate(async () => {
    const path = '/src/lib/workspace/workspaceRepository.ts'
    const { openWorkspaceRepository } = await import(/* @vite-ignore */ path)
    const repository = await openWorkspaceRepository()
    const links = await repository.readCollection('requirementTestLinks')
    const current = await repository.readRecord('sources', 'enterprise-analysis')
    await repository.commit([{ collection: 'sources', put: [{ id: current.id, order: 0, value: { ...current.value, content: current.value.content.replace('30 minutes', '60 minutes') } }] }])
    repository.close()
    return links.records.length
  })
  expect(linkCount).toBe(0)
  await review.getByRole('button', { name: 'Approve and import 1 selected', exact: true }).click()
  await expect(review.getByRole('alert')).toContainText('changed in another operation')
  expect((await readSaved(page)).testCount).toBe(0)
  expect(errors).toEqual([])
})
test('late requirement draft response is rejected after a concurrent source change and closing discards review state', async ({ page }) => {
  let send: (() => Promise<void>) | undefined
  await page.route('**/api/ai/test-case-suggestions', async (route) => { send = () => route.fulfill({ json: securityDraft }) })
  const review = await openSecurityDraft(page)
  await review.getByRole('button', { name: 'Generate test drafts', exact: true }).click()
  await expect.poll(() => !!send).toBe(true)
  await page.evaluate(async () => {
    const path = '/src/lib/workspace/workspaceRepository.ts'
    const { openWorkspaceRepository } = await import(/* @vite-ignore */ path)
    const repository = await openWorkspaceRepository()
    const current = await repository.readRecord('sources', 'enterprise-analysis')
    await repository.commit([{ collection: 'sources', put: [{ id: current.id, order: 0, value: { ...current.value, content: current.value.content + '\nA concurrent source edit.' } }] }])
    repository.close()
  })
  await send!()
  await expect(review.getByRole('alert')).toContainText('changed during drafting')
  await expect(review.getByRole('checkbox')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(review).not.toBeVisible()
  expect((await readSaved(page)).testCount).toBe(0)
})

test('change impact preserves unrelated traceability and compares historical evidence without automatic re-linking', async ({ page }, testInfo) => {
  const review = await openSecurityDraft(page)
  await review.getByRole('button', { name: 'Close', exact: true }).click()
  await page.evaluate(async () => {
    const paths = ['/src/lib/workspace/workspaceRepository.ts', '/src/lib/workspace/analysisJobRepository.ts', '/src/features/document-intelligence/requirementTraceability.ts', '/src/lib/workspace/traceabilityRepository.ts']
    const [{ openWorkspaceRepository }, { AnalysisJobRepository }, { createRequirementTestLink }, { saveSourceCoveragePlan, loadSourceTraceability }] = await Promise.all(paths.map((path) => import(/* @vite-ignore */ path)))
    const repository = await openWorkspaceRepository()
    const prepared = await new AnalysisJobRepository(repository).prepare('enterprise-analysis')
    await saveSourceCoveragePlan(repository, prepared, await loadSourceTraceability(repository, prepared.source.id))
    const tests = ['Receipt arrives', 'Session expires after 30 minutes'].map((title, index) => ({ id: `impact-test-${index}`, title, area: 'Commerce', type: 'Functional', priority: 'High', status: 'Not Run', steps: 'Exercise the specified scenario.', expectedResult: title, createdAt: '2026-01-01', updatedAt: '2026-01-01' }))
    const links = await Promise.all([prepared.currentRequirements[0], prepared.currentRequirements[2]].map((requirement, index) => createRequirementTestLink(requirement, tests[index], '2026-09-05')))
    const write = (collection: string, values: Array<{ id: string }>, sourceId?: string) => ({ collection, put: values.map((value, order) => ({ id: value.id, order, value, ...(sourceId ? { sourceId } : {}) })) })
    await repository.commit([
      write('testCases', tests), write('requirementTestLinks', links, prepared.source.id),
      write('releases', [{ id: 'impact-release', name: 'Commerce release', version: '2.4', targetDate: '2026-09-15', status: 'In Testing', notes: '', createdAt: '2026-01-01', updatedAt: '2026-01-01' }]),
      write('testSuites', [{ id: 'impact-suite', name: 'Session security', type: 'Regression', description: '', testCaseIds: ['impact-test-1'], createdAt: '2026-01-01', updatedAt: '2026-01-01' }]),
      write('executions', [{ id: 'impact-execution', releaseId: 'impact-release', testCaseId: 'impact-test-1', result: 'Failed', notes: 'Session remained active.', executedAt: '2026-01-01', createdAt: '2026-01-01', updatedAt: '2026-01-01' }]),
      write('bugs', [{ id: 'impact-bug', title: 'Expired session remains authorized', severity: 'High', status: 'Open', testCaseId: 'impact-test-1', description: 'Observed in staging.', stepsToReproduce: 'Wait 30 minutes.', expectedBehavior: 'Session expires.', actualBehavior: 'Session remains active.', createdAt: '2026-01-01', updatedAt: '2026-01-01' }]),
    ])
    repository.close()
  })
  await page.reload()
  await page.getByRole('navigation', { name: 'Workspace pages' }).getByRole('button', { name: 'QA Sources', exact: true }).click()
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await page.getByLabel('Source content', { exact: true }).fill(source.content.replace('30 minutes', '60 minutes'))
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(page.locator('.requirement-collection .requirement-row')).toHaveCount(2)
  await page.getByRole('button', { name: 'Coverage & traceability', exact: true }).click()
  await expect(page.locator('.source-coverage-intelligence .document-metrics')).toContainText('QA-confirmed test traceability1 / 2')
  await page.getByRole('button', { name: 'Change impact', exact: true }).click()
  const impact = page.getByRole('region', { name: 'Requirement change impact' })
  await expect(impact.locator('.document-result')).toHaveCount(1)
  await impact.locator('.document-result > summary').click()
  await expect(impact).toContainText('Sessions must expire after 30 minutes.')
  await expect(impact).toContainText('No replacement is assumed')
  for (const name of ['Test Cases · 1', 'Suites · 1', 'Executions · 1', 'Releases · 1', 'Bugs · 1']) await impact.getByText(name, { exact: true }).click()
  await expect(impact).toContainText('Expired session remains authorized')
  await expect(impact).toContainText('Commerce release 2.4')
  await page.getByRole('button', { name: 'Analyze Entire Specification', exact: true }).click()
  await page.getByRole('button', { name: 'Confirm and analyze', exact: true }).click()
  await expect(page.locator('.document-job')).toContainText('Analysis completed')
  await impact.getByText('Choose current evidence for comparison', { exact: true }).click()
  await impact.getByLabel('Search current findings', { exact: true }).fill('60 minutes')
  await impact.getByRole('button', { name: 'Sessions must expire after 60 minutes.', exact: true }).click()
  await expect(impact.locator('.requirement-comparison')).toContainText('Sessions must expire after 60 minutes.')
  await expect(impact.locator('.requirement-comparison')).toContainText('not confirmed lineage or transferred approval')
  for (const width of [1440, 1280, 1024, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await impact.scrollIntoViewIfNeeded()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`change-impact-${width}.png`) })
  }
  await page.getByRole('button', { name: 'Coverage & traceability', exact: true }).click()
  await expect(page.locator('.source-coverage-intelligence .document-metrics')).toContainText('QA-confirmed test traceability1 / 3')
  expect((await readSaved(page)).testCount).toBe(2)
})

test('real 500-page pipeline persists 9000 evidence-backed requirements, resumes bounded work and reuses a distant edit', async ({ page }, testInfo) => {
  test.setTimeout(180_000)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Operational snapshot' })).toBeVisible()
  const measured = await page.evaluate(async () => {
    const modules = ['/src/lib/workspace/workspaceRepository.ts', '/src/lib/workspace/analysisJobRepository.ts', '/src/features/document-intelligence/analysisJobRunner.ts', '/src/features/document-intelligence/enterpriseFixture.ts', '/src/features/document-intelligence/documentFingerprint.ts']
    const [{ openWorkspaceRepository }, { AnalysisJobRepository }, { runAnalysisJob }, { createEnterpriseFixture }, { fingerprint }] = await Promise.all(modules.map((path) => import(/* @vite-ignore */ path)))
    const database = `qa-500-job-${crypto.randomUUID()}`
    let repository = await openWorkspaceRepository(database)
    let store = new AnalysisJobRepository(repository)
    const fixture = createEnterpriseFixture(500)
    const source = { id: 'source-500', title: 'Enterprise commerce', sourceType: 'Requirement', status: 'Draft', notes: '', content: fixture.content,
      createdAt: '2026-09-05T10:00:00.000Z', updatedAt: '2026-09-05T10:00:00.000Z',
      documentImport: { schemaVersion: 1, fileName: 'enterprise-500.txt', format: 'text', contentFingerprint: await fingerprint(fixture.content), pages: fixture.pages, blocks: [] } }
    await repository.commit([{ collection: 'sources', put: [{ id: source.id, value: source, order: 0 }] }])
    const started = performance.now()
    let prepared = await store.prepare(source.id)
    await store.create(prepared)
    let attempts = 0
    let active = 0
    let peak = 0
    let allBounded = true
    const controller = new AbortController()
    const analyze = async (request: { text: string }) => {
      attempts += 1; active += 1; peak = Math.max(peak, active)
      allBounded &&= request.text.length <= 6000 && new TextEncoder().encode(request.text).length <= 18000
      await Promise.resolve()
      active -= 1
      const findings = [...request.text.matchAll(/REQ-\d+-\d+:[^\n]+/g)].map((match) => ({ kind: 'requirement', summary: match[0], quote: match[0], occurrence: 0, coverage: 'Authorization and audit' }))
      if (attempts === 1000) controller.abort()
      return { ok: true, analysis: { version: 1, findings, limitations: [] } }
    }
    await runAnalysisJob({ prepared, store, signal: controller.signal, analyze })
    const partialTasks = await store.tasks(source.id)
    const partialCount = partialTasks.filter((item: { value: { status: string } }) => item.value.status === 'completed').length
    repository.close()
    repository = await openWorkspaceRepository(database)
    store = new AnalysisJobRepository(repository)
    prepared = await store.prepare(source.id)
    await runAnalysisJob({ prepared, store, signal: new AbortController().signal, analyze })
    const completed = await store.prepare(source.id)
    const original = await repository.readRecord('sources', source.id)
    const changed = { ...source, content: source.content.replace('REQ-250-1: The service must validate', 'REQ-250-1: The service must revalidate'), updatedAt: '2026-09-05T11:00:00.000Z', documentImport: undefined }
    await repository.commit([{ collection: 'sources', put: [{ id: source.id, value: changed, order: 0 }] }], { recordChecks: [{ collection: 'sources', id: source.id, version: original.version }] })
    const edited = await store.prepare(source.id)
    const findings = await repository.readCollection('requirements')
    const tests = await repository.readCollection('testCases')
    const elapsedMs = Math.round(performance.now() - started)
    const result = { pages: completed.snapshot.manifest.pageCount, units: completed.snapshot.units.length, partialCount,
      current: completed.currentRequirements.length, providerTasksAfterCompletion: completed.preflight.providerTasks,
      providerTasksAfterEdit: edited.preflight.providerTasks, reusedAfterEdit: edited.preflight.reusedTasks,
      finalRequirement: completed.currentRequirements.some((item: { evidence: { quote: string; location: { page: number } } }) => item.evidence.quote.startsWith('REQ-500-18:') && item.evidence.location.page === 500),
      attempts, peak, allBounded, persistedRequirements: findings.records.length, testCount: tests.records.length, elapsedMs }
    repository.close()
    indexedDB.deleteDatabase(database)
    return result
  })
  expect(measured.pages).toBe(500)
  expect(measured.units).toBe(1500)
  expect(measured.partialCount).toBeGreaterThan(990)
  expect(measured.partialCount).toBeLessThan(1001)
  expect(measured.current).toBe(9000)
  expect(measured.persistedRequirements).toBe(9000)
  expect(measured.providerTasksAfterCompletion).toBe(0)
  expect(measured.providerTasksAfterEdit).toBe(1)
  expect(measured.reusedAfterEdit).toBe(1499)
  expect(measured.finalRequirement).toBe(true)
  expect(measured.peak).toBeLessThanOrEqual(2)
  expect(measured.attempts).toBeLessThanOrEqual(1502)
  expect(measured.allBounded).toBe(true)
  expect(measured.testCount).toBe(0)
  testInfo.annotations.push({ type: 'measurement', description: JSON.stringify(measured) })
})
