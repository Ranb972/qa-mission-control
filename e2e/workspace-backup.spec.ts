import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { failWorkerCollectionWrite } from './worker-storage-failure'

const timestamp = '2026-09-05T10:00:00.000Z'
const source = { id: 'backup-spec', title: 'Order acceptance policy', sourceType: 'Requirement', status: 'Draft', notes: '', content: '# Receipt\nA receipt must show the order number.', createdAt: timestamp, updatedAt: timestamp }
async function openTransfer(page: Page) {
  await page.getByRole('navigation', { name: 'Workspace pages' }).getByRole('button', { name: 'Import', exact: true }).click()
  await page.getByRole('button', { name: 'Workspace backup & restore', exact: true }).click()
}
async function inspect(page: Page) {
  return page.evaluate(async () => {
    const path = '/src/lib/workspace/workspaceRepository.ts'
    const { openWorkspaceRepository } = await import(/* @vite-ignore */ path)
    const repository = await openWorkspaceRepository()
    const result = await repository.readCollectionsSnapshot(['sources', 'requirements', 'testCases', 'requirementTestLinks', 'analysisJobs'])
    repository.close(); return result
  })
}
test('portable backup validates in a worker and restores atomic identities without AI or stale writes', async ({ page }, testInfo) => {
  let calls = 0
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.addInitScript((source) => { if (!localStorage.getItem('backup-seeded')) { localStorage.setItem('qa-mission-control:qa-sources:v0.12', JSON.stringify([source])); localStorage.setItem('backup-seeded', 'yes') } }, source)
  await page.route('**/api/ai/**', async (route) => {
    calls += 1
    await route.fulfill({ json: { ok: true, analysis: { version: 1, findings: [{ kind: 'requirement', summary: 'Receipt identifies its order', quote: 'A receipt must show the order number.', occurrence: 0, coverage: 'Receipt' }], limitations: [] } } })
  })
  await page.goto('/')
  await page.getByRole('navigation', { name: 'Workspace pages' }).getByRole('button', { name: 'QA Sources', exact: true }).click()
  await page.getByRole('button', { name: 'Analyze Entire Specification', exact: true }).click()
  await page.getByRole('button', { name: 'Confirm and analyze', exact: true }).click()
  await expect(page.locator('.document-job')).toContainText('Analysis completed')
  await openTransfer(page)
  await page.evaluate(async (timestamp) => {
    const paths = ['/src/lib/workspace/workspaceRepository.ts', '/src/features/document-intelligence/requirementTraceability.ts']
    const [{ openWorkspaceRepository }, { createRequirementTestLink }] = await Promise.all(paths.map((path) => import(/* @vite-ignore */ path)))
    const repository = await openWorkspaceRepository()
    const requirement = (await repository.readCollection('requirements')).records[0].value
    const test = { id: 'backup-test', title: 'Verify receipt order number', area: 'Receipt', type: 'Functional', priority: 'High', status: 'Not Run', steps: 'Open the receipt for order 1042.', expectedResult: 'Order 1042 is displayed.', createdAt: timestamp, updatedAt: timestamp }
    const link = await createRequirementTestLink(requirement, test, timestamp)
    const job = await repository.readRecord('analysisJobs', requirement.sourceId)
    await repository.commit([{ collection: 'testCases', put: [{ id: test.id, value: test, order: 0 }] }, { collection: 'requirementTestLinks', put: [{ id: link.id, sourceId: link.sourceId, value: link, order: 0 }] },
      { collection: 'analysisJobs', put: [{ id: job.id, sourceId: job.sourceId, order: job.order, value: { ...job.value, status: 'running' } }] }])
    repository.close()
  }, timestamp)
  const original = await inspect(page)
  const downloadEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download workspace backup', exact: true }).click()
  const download = await downloadEvent
  const text = await readFile((await download.path())!, 'utf8')
  const parsed = JSON.parse(text)
  expect(parsed.collections.requirements[0].value.id).toBe(original.requirements.records[0].id)
  expect(text).not.toContain('rawResponse')
  expect(text).not.toContain('Authorization')
  const input = page.getByLabel('Choose workspace backup', { exact: true })
  await input.setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{ "malformed": true }') })
  await expect(page.getByRole('alert')).toContainText('could not be validated')
  expect(await inspect(page)).toEqual(original)
  const upload = () => input.setInputFiles({ name: 'commerce-backup.json', mimeType: 'application/json', buffer: Buffer.from(text) })
  await upload()
  const preview = page.getByRole('region', { name: 'Validated restore preview', exact: true })
  await expect(preview).toContainText('Requirements1')
  await expect(preview.getByRole('button', { name: 'Replace workspace from backup', exact: true })).toBeDisabled()
  await preview.getByRole('checkbox').check()
  for (const width of [1440, 1280, 1024, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await preview.scrollIntoViewIfNeeded()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`workspace-transfer-${width}.png`) })
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  page.once('dialog', (dialog) => dialog.dismiss())
  await preview.getByRole('button', { name: 'Replace workspace from backup', exact: true }).click()
  expect(await inspect(page)).toEqual(original)
  await page.evaluate(async () => {
    const path = '/src/lib/workspace/workspaceRepository.ts'
    const { openWorkspaceRepository } = await import(/* @vite-ignore */ path)
    const repository = await openWorkspaceRepository()
    const test = await repository.readRecord('testCases', 'backup-test')
    await repository.commit([{ collection: 'testCases', put: [{ id: 'concurrent-test', value: { ...test.value, id: 'concurrent-test', title: 'Work added after the preview' }, order: 1 }] }])
    repository.close()
  })
  const concurrent = await inspect(page)
  page.once('dialog', (dialog) => dialog.accept())
  await preview.getByRole('button', { name: 'Replace workspace from backup', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('changed in another operation')
  expect(await inspect(page)).toEqual(concurrent)
  await upload()
  await expect(preview).toBeVisible()
  await preview.getByRole('checkbox').check()
  const removeFailure = await failWorkerCollectionWrite(page, 'requirementTestLinks')
  page.once('dialog', (dialog) => dialog.accept())
  await preview.getByRole('button', { name: 'Replace workspace from backup', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Previously saved data was not replaced')
  expect(await inspect(page)).toEqual(concurrent)
  await removeFailure()
  page.once('dialog', (dialog) => dialog.accept())
  await preview.getByRole('button', { name: 'Replace workspace from backup', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Operational snapshot', exact: true })).toBeVisible()
  const restored = await inspect(page)
  for (const name of ['sources', 'requirements', 'testCases', 'requirementTestLinks']) expect(restored[name].records.map((record: { value: unknown }) => record.value)).toEqual(original[name].records.map((record: { value: unknown }) => record.value))
  expect(restored.analysisJobs.records[0].value.status).toBe('paused')
  expect(restored.analysisJobs.records[0].value.sourceVersion).toBe(restored.sources.records[0].version)
  await page.getByRole('navigation', { name: 'Workspace pages' }).getByRole('button', { name: 'QA Sources', exact: true }).click()
  await expect(page.locator('.document-requirements')).toContainText('Receipt identifies its order')
  await expect(page.locator('.document-job')).toContainText('Analysis paused')
  expect(calls).toBe(1)
  const staleRejected = await page.evaluate(async (version) => {
    const path = '/src/lib/workspace/workspaceRepository.ts'
    const { openWorkspaceRepository } = await import(/* @vite-ignore */ path)
    const repository = await openWorkspaceRepository()
    try { await repository.commit([], { recordChecks: [{ collection: 'sources', id: 'backup-spec', version }] }); return false } catch { return true } finally { repository.close() }
  }, original.sources.records[0].version)
  expect(staleRejected).toBe(true)
  expect(errors).toEqual([])
})
