import { expect, test } from '@playwright/test'
import { failWorkerCollectionWrite } from './worker-storage-failure'

test('one explicit synthetic demo load creates a coherent traceable release without any provider calls', async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  let calls = 0
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/api/ai/**', async (route) => { calls += 1; await route.abort() })
  await page.goto('/')
  const navigate = (name: string) => page.getByRole('navigation', { name: 'Workspace pages' }).getByRole('button', { name, exact: true }).click()
  await navigate('Import')
  await page.getByRole('button', { name: 'Workspace backup & restore', exact: true }).click()
  const removeFailure = await failWorkerCollectionWrite(page, 'testCases')
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Load synthetic demo workspace', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Previously saved data was not replaced', { timeout: 30_000 })
  const afterFailure = await page.evaluate(async () => {
    const path = '/src/lib/workspace/workspaceRepository.ts'
    const { openWorkspaceRepository } = await import(/* @vite-ignore */ path)
    const repository = await openWorkspaceRepository()
    const counts = await Promise.all(['sources', 'testCases', 'requirements'].map(async (name) => (await repository.readCollection(name)).records.length))
    repository.close(); return counts
  })
  expect(afterFailure).toEqual([0, 0, 0])
  await removeFailure()
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Load synthetic demo workspace', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Operational snapshot', exact: true })).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('.workspace-local')).toContainText('Synthetic demo data')
  await navigate('QA Sources')
  await page.getByRole('button', { name: 'Source sets', exact: true }).click()
  const sources = page.getByRole('region', { name: 'Source set intelligence', exact: true })
  await expect(sources).toContainText('Current requirements110')
  await expect(sources).toContainText('Potential conflicts2')
  for (const summary of await sources.locator('summary').filter({ hasText: 'Potential requirement conflict' }).all()) await summary.click()
  await expect(sources).toContainText('no universal fallback window')
  await expect(sources).toContainText('45-day return window')
  for (const width of [1440, 1280, 1024, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await sources.scrollIntoViewIfNeeded()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`demo-source-set-${width}.png`) })
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await navigate('Release Report')
  const report = page.getByRole('region', { name: 'Release requirement traceability', exact: true })
  await expect(report).toContainText('QA-confirmed tests13 / 110')
  await expect(report).toContainText('Linked recorded failures1')
  await expect(report).toContainText('9 ambiguities')
  await expect(report).toContainText('2 potential conflicts')
  await expect(report).not.toContainText('unverified source regions')
  for (const width of [1440, 1280, 1024, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await report.scrollIntoViewIfNeeded()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`demo-release-${width}.png`) })
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  for (const name of ['Test Cases', 'Bugs', 'Risks', 'Test Suites', 'Executions', 'Releases']) {
    await navigate(name)
    await page.screenshot({ path: testInfo.outputPath(`demo-${name.toLowerCase().replaceAll(' ', '-')}.png`) })
  }
  await page.reload()
  await navigate('Release Report')
  await expect(report).toContainText('QA-confirmed tests13 / 110')
  expect(calls).toBe(0)
  expect(errors).toEqual([])
})
