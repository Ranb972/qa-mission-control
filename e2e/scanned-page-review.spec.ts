import { expect, test, type Page } from '@playwright/test'

async function scannedPdf(page: Page) {
  const jpeg = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 1000; canvas.height = 700
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 1000, 700); ctx.fillStyle = '#111'; ctx.font = '32px Arial'
    ctx.fillText('SESSION SECURITY', 60, 100); ctx.fillText('Sessions must expire after 30 minutes.', 60, 170)
    ctx.fillText('Warn the user before ending the session.', 60, 225)
    ctx.strokeRect(60, 300, 800, 170); ctx.fillText('Sign in > Active > Warning > Expired', 85, 390)
    return canvas.toDataURL('image/jpeg', 0.95).split(',')[1]
  })
  const bytes = Buffer.from(jpeg, 'base64')
  const objects = [Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'), Buffer.from('<< /Type /Pages /Count 1 /Kids [3 0 R] >>'), Buffer.from('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 1000 700] /Resources << /XObject << /Scan 5 0 R >> >> /Contents 4 0 R >>')]
  const command = 'q 1000 0 0 700 0 0 cm /Scan Do Q'
  objects.push(Buffer.from(`<< /Length ${command.length} >>\nstream\n${command}\nendstream`))
  objects.push(Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width 1000 /Height 700 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>\nstream\n`), bytes, Buffer.from('\nendstream')]))
  const chunks = [Buffer.from('%PDF-1.4\n')]; const offsets = [0]; let length = chunks[0].length
  objects.forEach((object, index) => { offsets.push(length); const chunk = Buffer.concat([Buffer.from(`${index + 1} 0 obj\n`), object, Buffer.from('\nendobj\n')]); chunks.push(chunk); length += chunk.length })
  chunks.push(Buffer.from(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${length}\n%%EOF`))
  return Buffer.concat(chunks)
}
async function openScan(page: Page) {
  await page.goto('/')
  const buffer = await scannedPdf(page)
  await page.getByRole('navigation', { name: 'Workspace pages' }).getByRole('button', { name: 'QA Sources', exact: true }).click()
  await page.getByRole('button', { name: 'New QA Source', exact: true }).click()
  const form = page.getByRole('form', { name: 'Create QA Source form' })
  await form.getByLabel('Import .txt, .md, .docx, or .pdf file').setInputFiles({ name: 'session-scan.pdf', mimeType: 'application/pdf', buffer })
  await expect(form.getByLabel('Source content')).toHaveValue(/no selectable text/)
  await form.getByText('Scanned & visual page review · 1 remaining', { exact: true }).click()
  await form.getByRole('button', { name: 'Open page preview', exact: true }).click()
  await expect(form.getByRole('img', { name: /Original PDF page 1/ })).toBeVisible()
  return { form, buffer }
}

test('scan-only PDF uses one real local OCR call where supported, retains visual review and exact attachment identity', async ({ page }) => {
  test.setTimeout(90000)
  await page.context().addCookies([{ name: 'qa-unrelated-local-session', value: 'SYNTHETIC_NOT_A_REAL_SECRET', url: 'http://127.0.0.1:5197/' }])
  await page.route('**/api/documents/ocr', async (route) => {
    const headers = await route.request().allHeaders()
    expect(headers).not.toHaveProperty('cookie')
    expect(headers).not.toHaveProperty('authorization')
    await route.continue()
  })
  let ai = 0; let posts = 0; const errors: string[] = []
  page.on('request', (request) => { if (request.url().includes('/api/ai/')) ai++; if (request.url().includes('/api/documents/ocr') && request.method() === 'POST') posts++ })
  page.on('pageerror', (error) => errors.push(error.message))
  const { form, buffer } = await openScan(page)
  expect(posts).toBe(0); expect(ai).toBe(0)
  const availability = page.waitForResponse((response) => response.url().endsWith('/api/documents/ocr'))
  await form.getByRole('button', { name: 'Check local OCR availability' }).click()
  const capability = await (await availability).json()
  // No skipped test on other OSes: the unsupported/manual path is verified there.
  if (process.platform === 'win32') expect(capability.supported).toBe(true)
  if (capability.supported) {
    await form.getByLabel('OCR language', { exact: true }).selectOption('en-US')
    await form.getByRole('button', { name: 'Recognize this page', exact: true }).click()
    await expect(form.getByLabel('Reviewed page transcript')).toHaveValue(/Sessions must expire after 30 minutes\./, { timeout: 40000 })
    await expect(form.locator('.pdf-page-review').getByRole('status')).toContainText('Confidence is unavailable')
    expect(posts).toBe(1)
  } else await expect(form.getByRole('alert')).toContainText('Local OCR is unavailable')
  await form.getByLabel('Reviewed page transcript').fill('Sessions must expire after 30 minutes.\nWarn the user before ending the session.\nתרשים התחברות: חובה לבדוק את רצף המצבים.')
  await expect(form.getByRole('button', { name: 'Apply reviewed page to source' })).toBeDisabled()
  await form.getByLabel('I compared this transcript with the page and corrected the text.').check()
  for (const width of [1440, 1280, 1024, 390]) {
    await page.setViewportSize({ width, height: 1000 }); await form.locator('.pdf-review-grid').scrollIntoViewIfNeeded()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && [...document.querySelectorAll('.modal-dialog, .pdf-review-grid')].every((node) => node.scrollWidth <= node.clientWidth + 1))).toBe(true)
    await page.screenshot({ path: test.info().outputPath(`ocr-page-review-${width}.png`) })
  }
  await form.getByRole('button', { name: 'Apply reviewed page to source' }).click()
  await expect(form.getByLabel('Source content')).toHaveValue(/תרשים התחברות/)
  await expect(form.getByText('Scanned & visual page review · 1 remaining', { exact: true })).toBeVisible()
  await form.getByRole('button', { name: 'Create QA Source', exact: true }).click()
  await page.reload()
  const saved = await page.evaluate(async () => {
    const modulePath = '/src/lib/workspace/workspaceRepository.ts'; const { openWorkspaceRepository } = await import(/* @vite-ignore */ modulePath)
    const repo = await openWorkspaceRepository(); const source = (await repo.readCollection('sources')).records[0].value
    const tests = (await repo.readCollection('testCases')).records.length; repo.close()
    return { page: source.documentImport.pages[0], identity: source.documentImport.originalFileFingerprint.length, noImage: !JSON.stringify(source).includes('data:image'), tests }
  })
  expect(saved).toMatchObject({ page: { number: 1, status: 'needs_visual_review', review: { method: capability.supported ? 'ocr' : 'manual' } }, identity: 64, noImage: true, tests: 0 })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.getByRole('navigation', { name: 'Workspace pages' }).getByRole('button', { name: 'QA Sources', exact: true }).click()
  const card = page.getByRole('article', { name: 'session scan' }); await card.getByRole('button', { name: 'Edit', exact: true }).click()
  const edit = page.getByRole('form', { name: 'Edit QA Source form' }); await edit.getByText('Scanned & visual page review · 1 remaining', { exact: true }).click()
  await edit.getByLabel('Reattach exact original PDF').setInputFiles({ name: 'wrong.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 wrong') })
  await expect(edit.getByRole('alert')).toContainText('does not match')
  await edit.getByLabel('Reattach exact original PDF').setInputFiles({ name: 'renamed.pdf', mimeType: 'application/pdf', buffer })
  await edit.getByRole('button', { name: 'Open page preview' }).click()
  await expect(edit.getByLabel('Reviewed page transcript')).toHaveValue(/30 minutes/)
  await edit.getByLabel('I compared this transcript with the page and corrected the text.').check()
  await edit.getByLabel('I also accounted for diagrams, tables and other visual meaning, or confirmed there is none.').check()
  await edit.getByRole('button', { name: 'Apply reviewed page to source' }).click()
  await edit.getByRole('button', { name: 'Save changes', exact: true }).click()
  expect(ai).toBe(0); expect(errors).toEqual([])
})

test('canceling late OCR cannot overwrite newer source text or call the provider', async ({ page }) => {
  const { form } = await openScan(page)
  await page.route('**/api/documents/ocr', async (route) => {
    if (route.request().method() === 'GET') await route.fulfill({ json: { ok: true, supported: true, languages: ['en-US'] } })
    else { await new Promise((resolve) => setTimeout(resolve, 300)); await route.fulfill({ json: { ok: true, text: 'OLD OCR RESPONSE', language: 'en-US' } }).catch(() => undefined) }
  })
  await form.getByRole('button', { name: 'Check local OCR availability' }).click()
  await form.getByLabel('Reviewed page transcript').fill('Reviewed draft before cancellation')
  const called = page.waitForRequest((request) => request.url().includes('/api/documents/ocr') && request.method() === 'POST')
  await form.getByRole('button', { name: 'Recognize this page' }).click(); await called
  await form.getByRole('button', { name: 'Cancel page operation' }).click()
  await expect(form.getByLabel('Reviewed page transcript')).toHaveValue('Reviewed draft before cancellation')
  await form.getByLabel('Source content').fill('NEW MANUALLY EDITED SOURCE')
  await page.waitForTimeout(400)
  await expect(form.getByLabel('Source content')).toHaveValue('NEW MANUALLY EDITED SOURCE')
  await expect(form.locator('.pdf-page-review')).toHaveCount(0)
})
