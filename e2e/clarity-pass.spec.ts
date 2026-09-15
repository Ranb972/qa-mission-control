import { expect, test, type Page } from '@playwright/test'

async function navigate(page: Page, name: string) {
  const target = page.getByRole('navigation', { name: 'Workspace pages' }).getByRole('button', { name, exact: true })
  // A reload can finish before React mounts; wait before deciding whether the menu is mobile.
  await page.locator('#workspace-navigation').waitFor({ state: 'attached' })
  if (!await target.isVisible()) await page.getByRole('button', { name: 'Menu', exact: true }).click()
  await target.click()
}

async function expectLayout(page: Page) {
  expect(await page.evaluate(() => {
    const main = document.querySelector('main')!
    const collisions: string[] = []
    for (const parent of document.querySelectorAll('.coverage-start,.report-decision,.report-section-grid')) {
      const boxes = [...parent.children].map(el => el.getBoundingClientRect()).filter(box => box.width && box.height)
      for (let a = 0; a < boxes.length; a++) for (let b = a + 1; b < boxes.length; b++) {
        const x = boxes[a], y = boxes[b]
        if (Math.min(x.right, y.right) - Math.max(x.left, y.left) > 1 && Math.min(x.bottom, y.bottom) - Math.max(x.top, y.top) > 1) collisions.push(parent.className)
      }
    }
    return { overflow: document.documentElement.scrollWidth > innerWidth || main.scrollWidth > main.clientWidth + 1, collisions }
  })).toEqual({ overflow: false, collisions: [] })
}

for (const width of [1440, 1024, 390]) {
  test(`clarity at ${width}px: prepare evidence, interpret results and act on the selected release`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 })
    let calls = 0
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/api/ai/**', route => { calls++; return route.abort() })
    const capture = async (name: string) => { await expectLayout(page); await page.screenshot({ path: testInfo.outputPath(`${name}-${width}.png`), animations: 'disabled' }) }
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Load synthetic demo workspace', exact: true })).toBeVisible()
    await navigate(page, 'AI Coverage Workspace')
    await expect(page.getByRole('list', { name: 'Source to test workflow' })).toContainText('Evidence')
    await capture('coverage-empty')
    await page.getByRole('list', { name: 'Source to test workflow' }).scrollIntoViewIfNeeded()
    await capture('coverage-workflow')
    await page.getByRole('button', { name: 'Go to Sources', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'QA Sources', exact: true })).toBeVisible()
    await navigate(page, 'AI Coverage Workspace')
    await page.getByRole('button', { name: 'Explore the demo', exact: true }).click()
    page.once('dialog', dialog => dialog.accept())
    await page.getByRole('button', { name: 'Load synthetic demo workspace', exact: true }).click()
    await expect(page.getByRole('region', { name: 'Investigation route', exact: true })).toBeVisible()
    await navigate(page, 'AI Coverage Workspace')
    await expect(page.getByRole('heading', { name: 'Global Coverage Plan', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Open optional AI planner', exact: true }).click()
    await expect(page.getByRole('complementary', { name: 'Start from saved evidence' })).toContainText('Synthetic demo')
    await capture('coverage-demo')
    await page.getByLabel('QA Source', { exact: true }).selectOption({ label: 'Northstar Commerce Platform v3.2' })
    await expect(page.getByRole('heading', { name: 'Ready to analyze selected QA source' })).toBeVisible()
    await capture('coverage-selected')
    await page.getByRole('button', { name: 'Review source evidence', exact: true }).click()
    await expect(page.getByRole('article', { name: 'Northstar Commerce Platform v3.2', exact: true })).toBeVisible()
    await navigate(page, 'Executions')
    await expect(page.getByRole('region', { name: 'Awaiting run', exact: true })).toContainText('5')
    await capture('executions')
    await page.getByRole('button', { name: 'Show tests awaiting run' }).click()
    await expect(page.getByLabel('Filter by execution status', { exact: true })).toHaveValue('Not Run')
    await expect(page.locator('.execution-queue-item')).toHaveCount(5)
    await expect(page.locator('.execution-queue-item').first()).toContainText('Awaiting run')
    await page.locator('.execution-queue-item').first().click()
    // Keep this test in the queue while changing its result; the pending-only filter correctly removes completed tests.
    await page.getByLabel('Filter by execution status', { exact: true }).selectOption('All')
    const result = page.getByLabel('Execution result', { exact: true })
    await expect(result.getByRole('option', { name: 'Awaiting run', exact: true })).toHaveAttribute('value', 'Not Run')
    await result.selectOption('Passed')
    await expect(result).toHaveValue('Passed')
    await expect(page.getByRole('region', { name: 'Awaiting run', exact: true })).toContainText('4')
    await result.selectOption({ label: 'Awaiting run' })
    await expect(result).toHaveValue('Not Run')
    await expect(page.getByRole('region', { name: 'Awaiting run', exact: true })).toContainText('5')
    await result.scrollIntoViewIfNeeded()
    await capture('execution-pending')
    await navigate(page, 'Release Report')
    const verdict = page.getByRole('region', { name: 'Calculated Readiness', exact: true })
    await expect(verdict).toContainText('At Risk')
    await expect(verdict).toContainText('1 failed test case')
    await capture('report')
    await page.locator('.report-masthead').evaluate(el => el.scrollIntoView({ block: 'start' }))
    await capture('report-decision')
    await page.getByRole('region', { name: 'Calculated Readiness' }).locator('summary').click()
    await page.getByRole('region', { name: 'Recommended next actions' }).locator('summary').click()
    await capture('report-signals')
    await page.getByRole('button', { name: 'Review source evidence', exact: true }).click()
    await expect(page.locator('.report-evidence-anchor')).toBeFocused()
    await expect(page.getByRole('heading', { name: 'Source and requirement assessment' })).toBeVisible()
    await page.getByRole('button', { name: 'Review executions', exact: true }).click()
    await expect(page.getByLabel('Filter by execution status', { exact: true })).toHaveValue('Failed')
    await expect(page.locator('.execution-queue-item')).toHaveCount(1)

    // A report action must preserve a non-default release, not silently open the first release.
    await page.evaluate(async () => {
      const path = '/src/lib/workspace/workspaceRepository.ts'
      const { openWorkspaceRepository } = await import(/* @vite-ignore */ path)
      const repository = await openWorkspaceRepository()
      const at = '2026-09-01T09:00:00.000Z'
      const release = { id: 'clarity-second-release', name: 'Next commerce release', version: '2.5.0', targetDate: '2026-10-01', status: 'Planning', notes: 'Synthetic navigation regression fixture.', createdAt: at, updatedAt: at }
      await repository.commit([{ collection: 'releases', put: [{ id: release.id, order: 1, value: release }] }])
      repository.close()
    })
    await page.reload()
    await navigate(page, 'Release Report')
    await page.getByLabel('Select release', { exact: true }).selectOption('clarity-second-release')
    await expect(page.getByRole('region', { name: 'Recommended next actions' })).toContainText('Run the remaining tests.')
    await page.getByRole('button', { name: 'Review executions', exact: true }).click()
    await expect(page.getByLabel('Select release', { exact: true })).toHaveValue('clarity-second-release')
    await expect(page.getByLabel('Filter by execution status', { exact: true })).toHaveValue('Not Run')
    await expect(page.getByRole('region', { name: 'Awaiting run', exact: true })).toContainText('16')
    await expectLayout(page)
    expect(calls).toBe(0)
    expect(errors).toEqual([])
  })
}
