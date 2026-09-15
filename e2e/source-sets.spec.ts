import { expect, test } from '@playwright/test'

const timestamp = '2026-09-05T10:00:00.000Z'
const sources = [
  { id: 'business', title: 'Business refund policy', content: '# Refunds\nRefund within 14 days.' },
  { id: 'api', title: 'API refund contract', content: '# Refunds\nRefund within 30 days.' },
  { id: 'unrelated', title: 'Unrelated marketing policy', content: '# Refunds\nRefund within 60 days.' },
].map((source) => ({ ...source, sourceType: 'Requirement', status: 'Draft', notes: '', createdAt: timestamp, updatedAt: timestamp }))

test('explicit source sets preserve both conflicting sources and exclude unrelated analyzed evidence', async ({ page }, testInfo) => {
  let calls = 0
  let drafts = 0
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/api/ai/test-case-suggestions', async (route) => { drafts += 1; await route.fulfill({ json: { ok: true, suggestions: [], warnings: [] } }) })
  await page.addInitScript((sources) => { if (!localStorage.getItem('source-set-seeded')) { localStorage.setItem('qa-mission-control:qa-sources:v0.12', JSON.stringify(sources)); localStorage.setItem('source-set-seeded', 'yes') } }, sources)
  await page.route('**/api/ai/document-unit', async (route) => {
    calls += 1
    const quote = route.request().postDataJSON().text.split('\n')[1].trim()
    await route.fulfill({ json: { ok: true, analysis: { version: 1, findings: [{ kind: 'requirement', summary: quote, quote, occurrence: 0, coverage: 'Refunds' }], limitations: [] } } })
  })
  await page.goto('/')
  await page.getByRole('navigation', { name: 'Workspace pages' }).getByRole('button', { name: 'QA Sources', exact: true }).click()
  for (const source of sources) {
    await page.getByRole('button', { name: `Open source: ${source.title}`, exact: true }).click()
    await page.getByRole('button', { name: 'Analyze Entire Specification', exact: true }).click()
    await page.getByRole('button', { name: 'Confirm and analyze', exact: true }).click()
    await expect(page.locator('.document-job')).toContainText('Analysis completed')
  }
  expect(calls).toBe(3)
  await page.getByRole('button', { name: 'Source sets', exact: true }).click()
  await page.getByRole('button', { name: 'Create source set', exact: true }).click()
  const editor = page.getByRole('dialog', { name: 'Create related source set', exact: true })
  await editor.getByLabel('Source set name', { exact: true }).fill('Commerce release specifications')
  await expect(editor.getByRole('button', { name: 'Save 0 related sources', exact: true })).toBeDisabled()
  await editor.getByRole('checkbox', { name: 'Business refund policy Requirement', exact: true }).check()
  await expect(editor.getByRole('button', { name: 'Save 1 related sources', exact: true })).toBeEnabled()
  await editor.getByRole('checkbox', { name: 'API refund contract Requirement', exact: true }).check()
  expect(calls).toBe(3)
  await editor.getByRole('button', { name: 'Save 2 related sources', exact: true }).click()
  await expect(editor).not.toBeVisible()
  const intelligence = page.getByRole('region', { name: 'Source set intelligence', exact: true })
  await expect(intelligence).toContainText('Analyzed regions2 / 2')
  await expect(intelligence).toContainText('Current requirements2')
  await expect(intelligence).toContainText('Potential conflicts1')
  await intelligence.getByText('Potential requirement conflict · clarification required · 2 findings', { exact: true }).click()
  await expect(intelligence).toContainText('Business refund policy')
  await expect(intelligence).toContainText('API refund contract')
  await expect(intelligence).toContainText('Refund within 14 days.')
  await expect(intelligence).toContainText('Refund within 30 days.')
  await expect(intelligence).not.toContainText('60 days')
  await expect(intelligence).not.toContainText('Unrelated marketing')
  for (const width of [1440, 1280, 1024, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await intelligence.scrollIntoViewIfNeeded()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`source-set-${width}.png`) })
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.reload()
  await page.getByRole('navigation', { name: 'Workspace pages' }).getByRole('button', { name: 'QA Sources', exact: true }).click()
  await page.getByRole('button', { name: 'Source sets', exact: true }).click()
  await expect(intelligence).toContainText('Current requirements2')
  expect(calls).toBe(3)
  await intelligence.getByRole('button', { name: 'Review source', exact: true }).first().click()
  await page.locator('.requirement-collection .requirement-row').first().click()
  await page.getByRole('button', { name: 'Draft tests', exact: true }).click()
  const draftReview = page.getByRole('dialog', { name: 'Draft tests for one requirement', exact: true })
  await draftReview.getByRole('button', { name: 'Generate test drafts', exact: true }).click()
  await expect(draftReview.getByRole('alert')).toContainText('Related source-set evidence requires clarification')
  expect(drafts).toBe(0)
  await draftReview.getByRole('button', { name: 'Close', exact: true }).click()
  await page.getByRole('navigation', { name: 'Workspace pages' }).getByRole('button', { name: 'AI Coverage Workspace', exact: true }).click()
  await page.getByLabel('QA Source', { exact: true }).selectOption('business')
  await page.getByRole('button', { name: 'Advanced: direct suggestions', exact: true }).click()
  await page.getByRole('button', { name: 'Generate direct suggestions', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Known requirement ambiguity or related-source conflict')
  expect(drafts).toBe(0)
  // Source ID reuse is not membership: the original incarnation must remain explicit and missing.
  await page.evaluate(async () => {
    const path = '/src/lib/workspace/workspaceRepository.ts'
    const { openWorkspaceRepository } = await import(/* @vite-ignore */ path)
    const repository = await openWorkspaceRepository()
    const source = await repository.readRecord('sources', 'api')
    await repository.commit([{ collection: 'sources', put: [{ id: source.id, order: source.order, value: { ...source.value, createdAt: '2026-09-06T10:00:00.000Z' } }] }])
    repository.close()
  })
  await page.reload()
  await page.getByRole('navigation', { name: 'Workspace pages' }).getByRole('button', { name: 'QA Sources', exact: true }).click()
  await page.getByRole('button', { name: 'Source sets', exact: true }).click()
  await expect(intelligence).toContainText('Missing member — no replacement inferred')
  await expect(intelligence).toContainText('Current requirements1')
  page.once('dialog', (dialog) => dialog.dismiss())
  await page.getByRole('button', { name: 'Delete source set', exact: true }).click()
  await expect(intelligence).toBeVisible()
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Delete source set', exact: true }).click()
  await expect(page.getByText('No source sets yet.', { exact: false })).toBeVisible()
  const saved = await page.evaluate(async () => {
    const path = '/src/lib/workspace/workspaceRepository.ts'
    const { openWorkspaceRepository } = await import(/* @vite-ignore */ path)
    const repository = await openWorkspaceRepository()
    const counts = await Promise.all(['sources', 'requirements', 'testCases', 'sourceSets'].map(async (name) => (await repository.readCollection(name)).records.length))
    repository.close(); return counts
  })
  expect(saved).toEqual([3, 3, 0, 0])
  expect(calls).toBe(3)
  expect(errors).toEqual([])
})
