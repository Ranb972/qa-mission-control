import { expect, test, type Page } from '@playwright/test'

const timestamp = '2026-09-05T10:00:00.000Z'
const source = { id: 'release-spec', title: 'Commerce acceptance specification', sourceType: 'Requirement', status: 'Draft', notes: '', content: '# Receipt\nA receipt must include the order number.\n# Session\nSessions must expire after 30 minutes.', createdAt: timestamp, updatedAt: timestamp }
async function navigate(page: Page, name: string) { await page.getByRole('navigation', { name: 'Workspace pages' }).getByRole('button', { name, exact: true }).click() }
async function savedBaseline(page: Page) {
  return page.evaluate(async () => {
    const path = '/src/lib/workspace/workspaceRepository.ts'
    const { openWorkspaceRepository } = await import(/* @vite-ignore */ path)
    const repository = await openWorkspaceRepository()
    const saved = await repository.readRecord('releaseRequirementBaselines', 'release-a')
    repository.close(); return saved
  })
}

test('release requirement reports preserve explicit baselines, isolate runs and expose changed source evidence', async ({ page }, testInfo) => {
  let calls = 0
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.addInitScript((source) => { if (!localStorage.getItem('release-requirements-seeded')) { localStorage.setItem('qa-mission-control:qa-sources:v0.12', JSON.stringify([source])); localStorage.setItem('release-requirements-seeded', 'yes') } }, source)
  await page.route('**/api/ai/document-unit', async (route) => {
    calls += 1
    const quote = route.request().postDataJSON().text.split('\n').find((line: string) => line.trim() && !line.startsWith('#')).trim()
    await route.fulfill({ json: { ok: true, analysis: { version: 1, findings: [{ kind: 'requirement', summary: quote, quote, occurrence: 0, coverage: quote.includes('Session') ? 'Session' : 'Receipt' }], limitations: [] } } })
  })
  await page.goto('/')
  await navigate(page, 'QA Sources')
  await page.getByRole('button', { name: 'Analyze Entire Specification', exact: true }).click()
  await page.getByRole('button', { name: 'Confirm and analyze', exact: true }).click()
  await expect(page.locator('.document-job')).toContainText('Analysis completed')
  expect(calls).toBe(2)
  // Synthetic existing QA-approved data; the real product action below only captures a scope.
  await page.evaluate(async ({ source, timestamp }) => {
    const paths = ['/src/lib/workspace/workspaceRepository.ts', '/src/lib/workspace/analysisJobRepository.ts', '/src/features/document-intelligence/requirementTraceability.ts', '/src/lib/workspace/traceabilityRepository.ts']
    const [{ openWorkspaceRepository }, { AnalysisJobRepository }, { createRequirementTestLink, testDesignFingerprint }, { saveSourceCoveragePlan, loadSourceTraceability }] = await Promise.all(paths.map((path) => import(/* @vite-ignore */ path)))
    const repository = await openWorkspaceRepository()
    const prepared = await new AnalysisJobRepository(repository).prepare(source.id)
    await saveSourceCoveragePlan(repository, prepared, await loadSourceTraceability(repository, source.id))
    const test = { id: 'receipt-test', title: 'Receipt includes the order number', area: 'Checkout', type: 'Functional', priority: 'High', status: 'Not Run', steps: 'Place an order and open its receipt.', expectedResult: 'The receipt shows the exact order number.', createdAt: timestamp, updatedAt: timestamp }
    const link = await createRequirementTestLink(prepared.currentRequirements.find((item) => item.summary.includes('receipt')), test, timestamp)
    const fingerprint = await testDesignFingerprint(test)
    const write = (collection: string, values: Array<{ id: string }>, sourceId?: string) => ({ collection, put: values.map((value, order) => ({ id: value.id, order, value, ...(sourceId ? { sourceId } : {}) })) })
    await repository.commit([
      write('sourceSets', [{ schemaVersion: 1, id: 'commerce-set', name: 'Commerce specifications', description: 'Explicit acceptance scope', members: [{ sourceId: source.id, sourceCreatedAt: source.createdAt }], createdAt: timestamp, updatedAt: timestamp }]),
      write('testCases', [test]), write('requirementTestLinks', [link], source.id),
      write('releases', ['a', 'b'].map((id) => ({ id: `release-${id}`, name: `Commerce ${id.toUpperCase()}`, version: '2.4', targetDate: '2026-09-15', status: 'In Testing', notes: '', createdAt: timestamp, updatedAt: timestamp }))),
      write('executions', ['a', 'b'].map((id) => ({ id: `run-${id}`, releaseId: `release-${id}`, testCaseId: test.id, result: id === 'a' ? 'Failed' : 'Passed', notes: id === 'a' ? 'Order number was absent.' : 'Order number present.', executedAt: timestamp, createdAt: timestamp, updatedAt: timestamp, testDesignFingerprint: fingerprint }))),
    ])
    repository.close()
  }, { source, timestamp })
  await page.reload()
  await navigate(page, 'Release Report')
  const assessment = page.getByRole('region', { name: 'Release requirement traceability', exact: true })
  await expect(assessment).toContainText('Requirement completeness has not been assessed')
  await assessment.getByText('Link sources to this release', { exact: true }).click()
  await assessment.getByLabel('Release source set', { exact: true }).selectOption('commerce-set')
  expect(await savedBaseline(page)).toBeNull()
  page.once('dialog', (dialog) => dialog.accept())
  await assessment.getByRole('button', { name: 'Capture release requirement baseline', exact: true }).click()
  await expect(assessment).toContainText('QA-confirmed tests1 / 2')
  await expect(assessment).toContainText('Linked recorded failures1')
  await expect(assessment).toContainText('No verified execution1')
  const baseline = await savedBaseline(page)
  await assessment.getByLabel('Requirement report filter', { exact: true }).selectOption('failed')
  await expect(assessment.locator('.coverage-evidence-row')).toHaveCount(1)
  await expect(assessment).toContainText('A receipt must include the order number.')
  await page.getByText('Markdown Export', { exact: true }).first().click()
  await expect(page.getByRole('textbox', { name: 'Markdown report preview', exact: true })).toHaveValue(/QA-confirmed test traceability: 1 \/ 2/)
  for (const width of [1440, 1280, 1024, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await assessment.scrollIntoViewIfNeeded()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`release-requirements-${width}.png`) })
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.getByLabel('Select release', { exact: true }).selectOption('release-b')
  await expect(assessment).toContainText('Requirement completeness has not been assessed')
  await assessment.getByText('Link sources to this release', { exact: true }).click()
  await assessment.getByLabel('Release source set', { exact: true }).selectOption('commerce-set')
  page.once('dialog', (dialog) => dialog.accept())
  await assessment.getByRole('button', { name: 'Capture release requirement baseline', exact: true }).click()
  await expect(assessment).toContainText('Linked recorded failures0')
  await page.reload()
  await navigate(page, 'Release Report')
  await page.getByLabel('Select release', { exact: true }).selectOption('release-a')
  await expect(assessment).toContainText('Linked recorded failures1')
  expect(await savedBaseline(page)).toEqual(baseline)
  await navigate(page, 'QA Sources')
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await page.getByLabel('Source content', { exact: true }).fill(source.content.replace('30 minutes', '60 minutes'))
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await page.getByRole('button', { name: 'Analyze Entire Specification', exact: true }).click()
  await page.getByRole('button', { name: 'Confirm and analyze', exact: true }).click()
  await expect(page.locator('.document-job')).toContainText('Analysis completed')
  expect(calls).toBe(3)
  await navigate(page, 'Release Report')
  await expect(assessment).toContainText('Changed requirements · 1 historical / 1 added')
  await assessment.getByText('Changed requirements · 1 historical / 1 added', { exact: true }).click()
  await expect(assessment).toContainText('Sessions must expire after 30 minutes.')
  await expect(assessment).toContainText('Historical evidence; not a current source location.')
  await assessment.getByText('Review or replace the release source baseline', { exact: true }).click()
  page.once('dialog', (dialog) => dialog.dismiss())
  await assessment.getByRole('button', { name: 'Replace release requirement baseline', exact: true }).click()
  expect(await savedBaseline(page)).toEqual(baseline)
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (value, key) {
      if (value?.collection === 'releaseRequirementBaselines') { IDBObjectStore.prototype.put = original; this.transaction.abort(); throw new DOMException('Injected save failure', 'QuotaExceededError') }
      return key === undefined ? original.call(this, value) : original.call(this, value, key)
    }
  })
  page.once('dialog', (dialog) => dialog.accept())
  await assessment.getByRole('button', { name: 'Replace release requirement baseline', exact: true }).click()
  await expect(assessment.getByRole('alert')).toBeVisible()
  expect(await savedBaseline(page)).toEqual(baseline)
  page.once('dialog', (dialog) => dialog.accept())
  await assessment.getByRole('button', { name: 'Replace release requirement baseline', exact: true }).click()
  await expect(assessment).toContainText('Changed requirements · 0 historical / 0 added')
  expect(calls).toBe(3)
  expect(errors).toEqual([])
})
