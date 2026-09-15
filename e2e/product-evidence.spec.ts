import { expect, test, type Page } from '@playwright/test'

const spec = { id: 'product-spec', title: 'Access requirements', sourceType: 'Requirement', status: 'Draft', notes: '', content: '# Sessions\nSessions timeout after 30 minutes.\n# Receipts\nReceipts must be emailed to customers.', createdAt: '2026-09-05T10:00:00.000Z', updatedAt: '2026-09-05T10:00:00.000Z' }
const nav = (page: Page) => page.getByRole('navigation', { name: 'Workspace pages' }).getByRole('button', { name: 'QA Sources', exact: true }).click()
async function records(page: Page) {
  return page.evaluate(async () => {
    const path = '/src/lib/workspace/workspaceRepository.ts'
    const { openWorkspaceRepository } = await import(/* @vite-ignore */ path)
    const repository = await openWorkspaceRepository()
    const data = await repository.readCollectionsSnapshot(['sources', 'productEvidenceReviews', 'requirements', 'testCases'])
    repository.close(); return data
  })
}
test('explicit repository clues compare to current specification evidence and QA decisions restore safely', async ({ page }, testInfo) => {
  let calls = 0; const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.addInitScript((source) => { if (!localStorage.getItem('product-seeded')) { localStorage.setItem('qa-mission-control:qa-sources:v0.12', JSON.stringify([source])); localStorage.setItem('product-seeded', 'yes') } }, spec)
  await page.route('**/api/ai/**', async (route) => {
    calls++
    const quote = route.request().postDataJSON().text.split('\n').slice(1).join('\n').trim()
    await route.fulfill({ json: { ok: true, analysis: { version: 1, findings: [{ kind: 'requirement', summary: quote, quote, occurrence: 0, coverage: 'Access controls' }], limitations: [] } } })
  })
  await page.goto('/'); await nav(page)
  await page.getByRole('button', { name: 'Analyze Entire Specification', exact: true }).click()
  await page.getByRole('button', { name: 'Confirm and analyze', exact: true }).click()
  await expect(page.locator('.document-job')).toContainText('Analysis completed')
  expect(calls).toBe(2)
  await page.getByRole('button', { name: 'New QA Source', exact: true }).click()
  await page.getByLabel('Source title', { exact: true }).fill('Selected access implementation')
  await page.getByText('Import product, API or repository evidence', { exact: true }).click()
  await page.getByLabel('Evidence format', { exact: true }).selectOption('repository')
  await page.getByLabel('Choose product evidence files', { exact: true }).setInputFiles([
    { name: 'session.ts', mimeType: 'text/plain', buffer: Buffer.from('export const SESSION_TIMEOUT_MINUTES = 90;\nexport function createSession() {}\n// omitted unrecognized comment') },
    { name: 'session.test.ts', mimeType: 'text/plain', buffer: Buffer.from('it("session timeout expires", () => {});') },
  ])
  await expect(page.getByRole('region', { name: 'Product evidence import preview' })).toContainText('3 evidence clues')
  expect((await records(page)).sources.records).toHaveLength(1)
  await page.getByRole('button', { name: 'Use reviewed evidence as source', exact: true }).click()
  await page.getByRole('button', { name: 'Create QA Source', exact: true }).click()
  const panel = page.getByRole('region', { name: 'Product evidence workspace', exact: true })
  await expect(panel).toBeVisible()
  await expect(page.getByRole('button', { name: 'Analyze Evidence Projection', exact: true })).toBeVisible()
  expect(calls).toBe(2)
  await panel.getByRole('combobox', { name: 'Compare with specification', exact: true }).selectOption(spec.id)
  expect(calls).toBe(2)
  await panel.getByRole('button', { name: 'Compare selected sources locally', exact: true }).dblclick()
  const row = panel.locator('.product-comparison').filter({ hasText: 'Sessions timeout after 30 minutes.' })
  await expect(row).toContainText('Possible numeric discrepancy')
  await row.locator('summary').first().click()
  await expect(row).toContainText('session.ts · line 1')
  await expect(row).toContainText('SESSION_TIMEOUT_MINUTES = 90')
  await row.getByText('Record a QA review decision', { exact: true }).click()
  await row.getByLabel('Review rationale', { exact: true }).fill('Clarify the deployed session timeout with the specification owner.')
  await row.getByRole('button', { name: 'Save QA evidence decision', exact: true }).dblclick()
  await expect(row).toContainText('Saved QA decision: Potential difference')
  expect((await records(page)).productEvidenceReviews.records).toHaveLength(1)
  const transfer = await page.evaluate(async () => {
    const paths = ['/src/lib/workspace/workspaceBackupWorkerClient.ts', '/src/lib/workspace/workspaceRepository.ts', '/src/lib/workspace/workspaceBackupRepository.ts']
    const [{ processWorkspacePackage }, { openWorkspaceRepository }, { workspaceRestoreVersions }] = await Promise.all(paths.map((path) => import(/* @vite-ignore */ path)))
    const text = await processWorkspacePackage('export_current', null)
    const backup = await processWorkspacePackage('validate', text)
    const repository = await openWorkspaceRepository(); const expected = await workspaceRestoreVersions(repository); repository.close()
    await processWorkspacePackage('restore', { backup, expected })
    return { reviews: backup.collections.productEvidenceReviews.length, clues: backup.collections.sources.find((record: { value: { documentImport?: unknown } }) => record.value.documentImport)?.value.documentImport.productEvidence.clues.length }
  })
  expect(transfer).toEqual({ reviews: 1, clues: 3 })
  await expect(panel).toContainText('No matching clue in selected scope')
  for (const width of [1440, 1280, 1024, 390]) {
    await page.setViewportSize({ width, height: 1000 }); await row.scrollIntoViewIfNeeded()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`product-evidence-${width}.png`) })
  }
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.reload(); await nav(page)
  await page.getByRole('button', { name: 'Open source: Selected access implementation', exact: true }).click()
  await panel.getByRole('combobox', { name: 'Compare with specification', exact: true }).selectOption(spec.id)
  await panel.getByRole('button', { name: 'Compare selected sources locally', exact: true }).click()
  await expect(row).toContainText('QA reviewed')
  // Simulate another tab changing the exact specification between comparison and save.
  await row.locator('summary').first().click()
  await row.getByText('Record an updated QA decision', { exact: true }).click()
  await page.evaluate(async (source) => {
    const path = '/src/lib/workspace/workspaceRepository.ts'; const { openWorkspaceRepository } = await import(/* @vite-ignore */ path)
    const repository = await openWorkspaceRepository()
    await repository.commit([{ collection: 'sources', put: [{ id: source.id, order: 0, value: { ...source, content: source.content.replace('30', '45'), updatedAt: '2026-09-05T12:00:00.000Z' } }] }]); repository.close()
  }, spec)
  await row.getByRole('button', { name: 'Save QA evidence decision', exact: true }).click()
  await expect(row.getByRole('alert')).toContainText('changed in another operation or tab')
  const saved = await records(page)
  expect(saved.productEvidenceReviews.records).toHaveLength(1)
  expect(saved.testCases.records).toHaveLength(0)
  expect(calls).toBe(2)
  expect(JSON.stringify(saved.productEvidenceReviews)).not.toMatch(/rawResponse|rawPrompt|SESSION_TIMEOUT_MINUTES/)
  expect(errors).toEqual([])
})

test('API JSON projection exposes canonical contract locations, rejects secrets and creates no analysis automatically', async ({ page }) => {
  let calls = 0
  await page.route('**/api/ai/**', async (route) => { calls++; await route.abort() })
  await page.goto('/'); await nav(page)
  await page.getByRole('button', { name: 'New QA Source', exact: true }).click()
  await page.getByLabel('Source title', { exact: true }).fill('Order API contract')
  await page.getByText('Import product, API or repository evidence', { exact: true }).click()
  const file = page.getByLabel('Choose product evidence files', { exact: true })
  await file.setInputFiles({ name: 'secrets.json', mimeType: 'application/json', buffer: Buffer.from('{"api_key":"gsk_abcdefghijklmnopqrstuvwxyz"}') })
  await expect(page.getByRole('alert')).toContainText('credential material')
  const api = { openapi: '3.1.0', paths: { '/orders': { post: { summary: 'Create an order', security: [{ bearerAuth: [] }], responses: { 201: { description: 'Created' }, 409: { description: 'Duplicate order' } } } } }, components: { schemas: { Order: { type: 'object', required: ['amount'], properties: { amount: { type: 'number', minimum: 1, maximum: 10000 } } } } } }
  await file.setInputFiles({ name: 'orders.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(api)) })
  await expect(page.getByRole('region', { name: 'Product evidence import preview' })).toBeVisible()
  await page.getByRole('button', { name: 'Use reviewed evidence as source', exact: true }).click()
  await page.getByRole('button', { name: 'Create QA Source', exact: true }).click()
  const panel = page.getByRole('region', { name: 'Product evidence workspace', exact: true })
  await panel.getByRole('combobox', { name: 'Evidence filter', exact: true }).selectOption('schema')
  const clue = panel.locator('.document-result').filter({ hasText: 'maximum: 10000' })
  await clue.locator('summary').click()
  await expect(clue).toContainText('orders.json · #/components/schemas/Order/properties/amount')
  await page.reload(); await nav(page)
  await expect(panel).toBeVisible()
  const saved = await records(page)
  expect(saved.sources.records).toHaveLength(1)
  expect(saved.requirements.records).toHaveLength(0)
  expect(saved.testCases.records).toHaveLength(0)
  expect(JSON.stringify(saved)).not.toContain('gsk_')
  expect(calls).toBe(0)
})
