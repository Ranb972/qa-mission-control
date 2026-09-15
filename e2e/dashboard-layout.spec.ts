import { expect, test, type Page } from '@playwright/test'

async function expectSeparatedLayout(page: Page) {
  const result = await page.locator('.page--dashboard').evaluate(root => {
    const collisions: string[][] = []
    for (const parent of [root, ...root.querySelectorAll('.dashboard-briefing,.dashboard-operations,.dashboard-detail-register,.demo-entry')]) {
      const boxes = [...parent.children].map(element => ({ name: element.className, rect: element.getBoundingClientRect() })).filter(({ rect }) => rect.width && rect.height)
      for (let a = 0; a < boxes.length; a++) for (let b = a + 1; b < boxes.length; b++) {
        const x = boxes[a].rect, y = boxes[b].rect
        if (Math.min(x.right, y.right) - Math.max(x.left, y.left) > 1 && Math.min(x.bottom, y.bottom) - Math.max(x.top, y.top) > 1) collisions.push([boxes[a].name, boxes[b].name])
      }
    }
    return { collisions, overflow: document.documentElement.scrollWidth > innerWidth || document.querySelector('main')!.scrollWidth > document.querySelector('main')!.clientWidth + 1 }
  })
  expect(result).toEqual({ collisions: [], overflow: false })
}

for (const width of [1440, 1280, 1024, 390]) {
  for (const state of ['empty', 'existing', 'demo']) {
    test(`Dashboard ${state}: separated story, release and workflow at ${width}px`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 1000 })
      let calls = 0
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.route('**/api/ai/**', route => { calls++; return route.abort() })
      await page.goto('/')
      await expect(page.getByRole('button', { name: 'Load synthetic demo workspace', exact: true })).toBeVisible()
      if (state === 'demo') {
        page.once('dialog', dialog => dialog.accept())
        await page.getByRole('button', { name: 'Load synthetic demo workspace', exact: true }).click()
        await expect(page.getByRole('region', { name: 'Investigation route', exact: true })).toBeVisible()
        await expect(page.getByRole('region', { name: 'Primary investigation' })).toContainText('Calculated: At Risk')
        const action = page.getByRole('button', { name: 'Inspect the evidence', exact: true })
        await expect(action).toBeVisible()
        expect((await action.boundingBox())!.y).toBeLessThan(1000)
      }
      if (state === 'existing') {
        await page.evaluate(async () => {
          const path = '/src/lib/workspace/workspaceRepository.ts'
          const { openWorkspaceRepository } = await import(/* @vite-ignore */ path)
          const repository = await openWorkspaceRepository()
          const at = '2026-09-01T09:00:00.000Z'
          const release = { id: 'layout-release', name: 'Commerce platform', version: '2.4.0', targetDate: '2026-09-30', status: 'In Testing', notes: 'Synthetic existing workspace without demo sources.', createdAt: at, updatedAt: at }
          await repository.commit([{ collection: 'releases', put: [{ id: release.id, order: 0, value: release }] }])
          repository.close()
        })
        await page.reload()
        await expect(page.getByRole('region', { name: 'Release targets' })).toContainText('Commerce platform')
        await expect(page.getByRole('region', { name: 'Recent workspace changes' })).toContainText('releases saved')
        await expectSeparatedLayout(page)
        await page.getByText('Explore a synthetic example', { exact: true }).click()
        await expect(page.getByRole('button', { name: 'Load synthetic demo workspace', exact: true })).toBeVisible()
        // The exact formerly-colliding state: existing release plus visible demo-entry story.
        await expectSeparatedLayout(page)
        await page.getByText('Explore a synthetic example', { exact: true }).click()
      }
      await expectSeparatedLayout(page)
      await page.screenshot({ path: testInfo.outputPath(`dashboard-${state}-${width}.png`), animations: 'disabled' })
      const workflow = page.getByRole('list', { name: 'QA Mission Control workflow' })
      await workflow.scrollIntoViewIfNeeded()
      await expectSeparatedLayout(page)
      await expect(workflow).toBeVisible()
      expect(await workflow.locator('li').evaluateAll(items => items.every(item =>
        item.querySelector('span')!.getBoundingClientRect().top >= item.querySelector('strong')!.getBoundingClientRect().bottom,
      ))).toBe(true)
      await page.screenshot({ path: testInfo.outputPath(`dashboard-workflow-${state}-${width}.png`), animations: 'disabled' })
      if (state === 'demo') {
        await page.getByRole('list', { name: 'Evidence trace', exact: true }).getByRole('button', { name: 'QA review', exact: true }).click()
        await expect(page.getByRole('heading', { name: 'Test Cases', exact: true })).toBeVisible()
      }
      if (state === 'existing') {
        await page.evaluate(async () => {
          const path = '/src/lib/workspace/workspaceRepository.ts'
          const { openWorkspaceRepository } = await import(/* @vite-ignore */ path)
          const repository = await openWorkspaceRepository()
          const at = '2026-09-01T09:00:00.000Z'
          const source = { id: 'layout-source', title: 'Synthetic long source', sourceType: 'Requirement', status: 'Reviewed', notes: '', content: 'A transaction must retain its authorized owner. '.repeat(120), createdAt: at, updatedAt: at }
          await repository.commit([{ collection: 'sources', put: [{ id: source.id, order: 0, value: source }] }])
          repository.close()
        })
        await page.reload()
        const route = page.getByRole('region', { name: 'Investigation route', exact: true })
        await expect(route).toContainText('Excerpt · Line 1')
        expect((await route.locator('blockquote').textContent())!.length).toBe(400)
        await expect(route).toContainText('Verify its scope before linking it to a release.')
        await expectSeparatedLayout(page)
      }
      expect(calls).toBe(0)
      expect(errors).toEqual([])
    })
  }
}
