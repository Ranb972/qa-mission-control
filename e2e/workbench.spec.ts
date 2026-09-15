import { expect, test, type Page } from '@playwright/test'
import { demoStorage } from '../scripts/demo-fixture'

async function navigate(page: Page, name: string) {
  const target = page.getByRole('navigation', { name: 'Workspace pages' }).getByRole('button', { name, exact: true })
  if (!(await target.isVisible())) await page.getByRole('button', { name: 'Menu', exact: true }).click()
  await target.click()
  await expect(page.getByRole('main')).toBeFocused()
}

for (const width of [1440, 1280, 1024, 390]) {
  test(`populated workbench remains usable at ${width}px without implicit AI`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    const errors: string[] = []
    const requests: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('request', (request) => { if (request.url().includes('/api/ai/')) requests.push(request.url()) })
    await page.addInitScript((data) => {
      localStorage.clear()
      Object.entries(data).forEach(([key, value]) => localStorage.setItem(key, value))
    }, demoStorage)
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Operational snapshot' })).toBeVisible()
    if (width === 390) {
      const menu = page.getByRole('button', { name: 'Menu', exact: true })
      await menu.click()
      await page.keyboard.press('Tab')
      await page.keyboard.press('Escape')
      await expect(menu).toBeFocused()
      await expect(menu).toHaveAttribute('aria-expanded', 'false')
    }
    await navigate(page, 'QA Sources')
    await expect(page.getByRole('navigation', { name: 'Source library' }).getByRole('button')).toHaveCount(5)
    await page.getByRole('button', { name: 'Open source: Identity & access management' }).click()
    await expect(page.getByRole('article', { name: 'Identity & access management' })).toBeVisible()
    await expect(page.getByRole('article', { name: 'Checkout & payments' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Open source: Checkout & payments' }).click()
    const source = page.getByRole('article', { name: 'Checkout & payments' })
    await source.getByText('Source Structure', { exact: true }).click()
    await source.getByRole('radio', { name: /2\. Payment authorization/ }).check()
    await expect(source.getByRole('heading', { name: 'Current section analysis' })).toBeVisible()
    await source.getByRole('button', { name: 'Open AI coverage workspace' }).click()
    if (width >= 1024) {
      const metrics = page.locator('.coverage-deck-stat')
      const first = await metrics.first().boundingBox()
      const last = await metrics.last().boundingBox()
      expect(first && last && Math.abs(first.y - last.y) < 1).toBe(true)
    }
    await navigate(page, 'Test Cases')
    await expect(page.locator('.test-library__row')).toHaveCount(18)
    if (width >= 1024) {
      const row = page.getByRole('article', { name: 'Duplicate confirmation creates one order' })
      const type = await row.locator('.badge-row > .badge').nth(2).boundingBox()
      const action = await row.getByRole('button', { name: 'Expand', exact: true }).boundingBox()
      expect(type && action && type.x + type.width < action.x).toBe(true)
    }
    await page.getByRole('article', { name: 'Declined payment preserves the cart' }).getByRole('button', { name: 'Expand', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Preconditions' })).toBeVisible()
    await navigate(page, 'Executions')
    await page.getByRole('button', { name: 'Show failed tests' }).click()
    await expect(page.getByLabel('Filter by execution status')).toHaveValue('Failed')
    await expect(page.locator('.execution-queue-item')).toHaveCount(2)
    await expect(page.getByRole('group', { name: 'Execution progress' })).toContainText('14 of 18')
    await navigate(page, 'Release Report')
    await expect(page.getByRole('region', { name: 'Report Preview' })).toContainText('Commerce platform')
    await expect(page.getByRole('button', { name: 'Print report' })).toBeVisible()
    await expect(page.getByLabel('Markdown report preview')).not.toBeVisible()
    await page.locator('summary').filter({ hasText: 'Markdown Export' }).click()
    await expect(page.getByLabel('Markdown report preview')).toHaveValue(/Commerce platform/)
    expect(await page.evaluate(() => {
      const main = document.querySelector('main')!
      return document.documentElement.scrollWidth <= innerWidth && main.scrollWidth <= main.clientWidth + 1
    })).toBe(true)
    expect(requests).toEqual([])
    expect(errors).toEqual([])
  })
}
