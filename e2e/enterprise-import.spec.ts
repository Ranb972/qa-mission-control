import { expect, test } from '@playwright/test'
import { enterpriseDocx, enterprisePdf } from './enterprise-document-fixture'

test('imports a real 500-page PDF without splitting, preserves page 500 and restores canonical provenance', async ({ page }) => {
  test.setTimeout(90_000)
  const errors: string[] = []
  let aiRequests = 0
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('request', (request) => { if (request.url().includes('/api/ai/')) aiRequests += 1 })
  await page.goto('/')
  await page.getByRole('navigation', { name: 'Workspace pages' }).getByRole('button', { name: 'QA Sources', exact: true }).click()
  await page.getByRole('button', { name: 'New QA Source', exact: true }).click()
  const form = page.getByRole('form', { name: 'Create QA Source form' })
  await form.getByLabel('Import .txt, .md, .docx, or .pdf file').setInputFiles({ name: 'enterprise-500.pdf', mimeType: 'application/pdf', buffer: enterprisePdf(500, 81) })
  await expect(form.getByRole('status')).toContainText('499 of 500 pages', { timeout: 60_000 })
  await expect(form.getByLabel('Source content')).toHaveValue(/REQ-500-25/)
  await form.getByRole('button', { name: 'Create QA Source', exact: true }).click()
  await expect(page.getByRole('article', { name: 'enterprise 500' })).toBeVisible()
  await page.getByRole('article', { name: 'enterprise 500' }).getByText('Source Structure', { exact: true }).click()
  await expect(page.getByRole('radiogroup', { name: /Select one section from/ }).getByRole('radio')).toHaveCount(40)
  await page.getByRole('searchbox', { name: 'Find a section or requirement' }).fill('REQ-500-25')
  await expect(page.getByRole('radiogroup', { name: /Select one section from/ }).getByRole('radio')).toHaveCount(1)
  await page.getByRole('searchbox', { name: 'Find a section or requirement' }).fill('')
  for (const width of [1440, 1280, 1024, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.locator('.source-structure-panel').scrollIntoViewIfNeeded()
    expect(await page.evaluate(() => {
      const main = document.querySelector('main')!
      return document.documentElement.scrollWidth <= innerWidth && main.scrollWidth <= main.clientWidth + 1
    })).toBe(true)
    await page.screenshot({ path: test.info().outputPath(`enterprise-source-${width}.png`) })
  }
  await page.reload()
  const inspected = await page.evaluate(async () => {
    const modulePath = '/src/lib/workspace/workspaceRepository.ts'
    const segmenterPath = '/src/features/document-intelligence/documentSegmentation.ts'
    const { openWorkspaceRepository } = await import(/* @vite-ignore */ modulePath)
    const { buildDocumentSnapshot } = await import(/* @vite-ignore */ segmenterPath)
    const repository = await openWorkspaceRepository()
    const saved = await repository.readCollection('sources')
    repository.close()
    const source = saved.records[0]?.value
    if (!source) return null
    const snapshot = await buildDocumentSnapshot(source)
    return {
      pageCount: snapshot.manifest.pageCount,
      visualPage: snapshot.pages[80].status,
      sectionCount: snapshot.sections.length,
      exact: snapshot.units.map((unit: { location: { startOffset: number; endOffset: number } }) => source.content.slice(unit.location.startOffset, unit.location.endOffset)).join('') === source.content,
      bounded: snapshot.units.every((unit: { byteCount: number; location: { startOffset: number; endOffset: number } }) => unit.byteCount <= 18_000 && unit.location.endOffset - unit.location.startOffset <= 6000),
      lastPage: snapshot.units.at(-1)?.location.page,
    }
  })
  expect(inspected).toMatchObject({ pageCount: 500, visualPage: 'needs_visual_review', exact: true, bounded: true, lastPage: 500 })
  expect(inspected?.sectionCount).toBeGreaterThan(1000)
  expect(aiRequests).toBe(0)
  expect(errors).toEqual([])
})

test('imports real bilingual DOCX tables with canonical cell locations and drops file locations after a text edit', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('navigation', { name: 'Workspace pages' }).getByRole('button', { name: 'QA Sources', exact: true }).click()
  await page.getByRole('button', { name: 'New QA Source', exact: true }).click()
  const form = page.getByRole('form', { name: 'Create QA Source form' })
  await form.getByLabel('Import .txt, .md, .docx, or .pdf file').setInputFiles({ name: 'enterprise-tables.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: enterpriseDocx() })
  await expect(form.getByLabel('Source content')).toHaveValue(/חובה לאמת הרשאות לפני תשלום/)
  await form.getByRole('button', { name: 'Create QA Source', exact: true }).click()
  const card = page.getByRole('article', { name: 'enterprise tables' })
  await expect(card).toBeVisible()
  const provenance = await page.evaluate(async () => {
    const modulePath = '/src/lib/workspace/workspaceRepository.ts'
    const { openWorkspaceRepository } = await import(/* @vite-ignore */ modulePath)
    const repository = await openWorkspaceRepository()
    const saved = await repository.readCollection('sources')
    repository.close()
    const source = saved.records[0].value
    const row = source.documentImport.blocks.find((block: { location: { table?: number; row?: number } }) => block.location.table === 1 && block.location.row === 2)
    return { heading: source.content.startsWith('# Commerce requirements'),
      cells: row.location.cells.map((cell: { startOffset: number; endOffset: number }) => source.content.slice(cell.startOffset, cell.endOffset).trim()) }
  })
  expect(provenance).toEqual({ heading: true, cells: ['REQ-1', 'חובה לאמת הרשאות לפני תשלום'] })
  await card.getByRole('button', { name: 'Edit', exact: true }).click()
  const edit = page.getByRole('form', { name: 'Edit QA Source form' })
  await edit.getByLabel('Source content').fill('# Edited requirements\nThe source text changed.')
  await edit.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(card).toContainText('The source text changed.')
  await page.reload()
  const hasHistoricalLocations = await page.evaluate(async () => {
    const modulePath = '/src/lib/workspace/workspaceRepository.ts'
    const { openWorkspaceRepository } = await import(/* @vite-ignore */ modulePath)
    const repository = await openWorkspaceRepository()
    const saved = await repository.readCollection('sources')
    repository.close()
    return Boolean(saved.records[0].value.documentImport)
  })
  expect(hasHistoricalLocations).toBe(false)
})
