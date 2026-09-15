import { expect, test } from '@playwright/test'
import { liveAiCalibrationFixtures, calibrationSectionResponse } from '../src/test/fixtures/liveAiCalibration'
import { installWorkspaceInspection } from './workspace-inspection'

for (const fixture of liveAiCalibrationFixtures) {
  test(`calibration ${fixture.anchor}: explicit behavior evidence survives the rendered review and reload`, async ({ page }, testInfo) => {
    await installWorkspaceInspection(page)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    let calls = 0
    await page.route('**/api/ai/**', async (route) => {
      expect(route.request().url()).toContain('/api/ai/section-coverage-plan')
      calls += 1
      const request = route.request().postDataJSON()
      expect(request.visibleSection.content).toContain(fixture.source)
      expect(request.visibleSection.content).not.toContain('NEIGHBOR_SENTINEL')
      expect((await route.request().allHeaders()).authorization).toBeUndefined()
      const analysis = calibrationSectionResponse(fixture)
      if (calls > 1) analysis.coverageAreas[0].behaviorEvidence = analysis.coverageAreas[0].behaviorEvidence.slice(0, 1)
      await route.fulfill({ json: { ok: true, analysis: { ...analysis, states: fixture.anchor === 'SYN_REF_F001' ? ['M'] : [] }, warnings: [] } })
    })
    await page.goto('/')
    await page.getByRole('button', { name: /^QA Sources\b/ }).click()
    await page.getByRole('button', { name: 'New QA Source' }).click()
    const form = page.getByRole('form', { name: 'Create QA Source form' })
    await form.getByLabel('Source title').fill(`Calibration ${fixture.anchor}`)
    await form.getByLabel('Source content').fill(`# Anchor ${fixture.anchor}\n${fixture.source}\n# Neighbor\nNEIGHBOR_SENTINEL`)
    await form.getByRole('button', { name: 'Create QA Source', exact: true }).click()
    const card = page.getByRole('article', { name: `Calibration ${fixture.anchor}`, exact: true })
    await card.getByText('Source Structure', { exact: true }).click()
    await card.getByRole('radio', { name: new RegExp(`1\\. Anchor`) }).check()
    expect(calls).toBe(0)
    await card.getByRole('button', { name: 'Analyze section', exact: true }).dblclick()
    const panel = card.getByRole('region', { name: `Section coverage analysis for Anchor ${fixture.anchor}`, exact: true })
    await expect(panel.getByText('Evidence linked for each behavior', { exact: true })).toBeVisible()
    expect(calls).toBe(1)
    await panel.getByText('Behaviors and validated evidence', { exact: true }).click()
    for (const [behavior] of fixture.behaviors) await expect(panel.getByText(behavior, { exact: true }).first()).toBeVisible()
    expect(await panel.locator('q').count()).toBe(fixture.behaviors.length)
    for (const quote of await panel.locator('q').allTextContents()) expect(fixture.source.includes(quote)).toBe(true)
    if (fixture.anchor === 'SYN_REF_F001') {
      await expect(panel.getByRole('heading', { name: 'States', exact: true }).locator('..')).toContainText('None identified.')
    }
    const stored = await page.evaluate(async () => await window.qaReadPersistedCollection('qa-mission-control:ai-section-coverage-plans:v0.21'))
    expect(stored).toContain('behaviorEvidence')
    expect(stored).not.toMatch(/rawProviderResponse|"prompt"|"messages"/)
    const testsBefore = await page.evaluate(async () => await window.qaReadPersistedCollection('qa-mission-control:test-cases:v0.1'))
    await page.reload()
    await page.getByRole('button', { name: /^QA Sources\b/ }).click()
    await card.getByText('Source Structure', { exact: true }).click()
    await card.getByRole('radio', { name: /1\. Anchor/ }).check()
    await expect(panel.getByText('Evidence linked for each behavior', { exact: true })).toBeVisible()
    expect(calls).toBe(1)
    if (fixture.anchor === '8.24') {
      await panel.getByText('Behaviors and validated evidence', { exact: true }).click()
      for (const width of [1440, 1280, 1024, 390]) {
        await page.setViewportSize({ width, height: 1000 })
        await panel.scrollIntoViewIfNeeded()
        expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
        const excerptHeading = panel.getByRole('heading', { name: 'Validated area excerpts (not evidence for every behavior)', exact: true })
        const headingBounds = await excerptHeading.boundingBox()
        const quoteBounds = await excerptHeading.locator('..').locator('li').first().boundingBox()
        expect(headingBounds).not.toBeNull()
        expect(quoteBounds).not.toBeNull()
        expect(quoteBounds!.y - headingBounds!.y - headingBounds!.height).toBeLessThan(24)
        await page.screenshot({ path: testInfo.outputPath(`calibration-behavior-evidence-${width}.png`) })
      }
      await card.getByRole('button', { name: 'Re-analyze section' }).click()
      await expect(panel.getByText('Partial evidence · review behaviors', { exact: true })).toBeVisible()
      await expect(panel.getByText('Needs evidence review — no validated quote linked to this behavior.', { exact: true })).toHaveCount(3)
      expect(calls).toBe(2)
    }
    expect(await page.evaluate(async () => await window.qaReadPersistedCollection('qa-mission-control:test-cases:v0.1'))).toBe(testsBefore)
    expect(errors).toEqual([])
  })
}

test('structural evidence stays honest and readable across viewports and legacy restoration', async ({ page }, testInfo) => {
  await installWorkspaceInspection(page)
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  const source = 'Audit items:\n- the identity of the user\n  who made the change;\n- the nature of the change; and\n- the date and time of the change.\nThe system shall provide backup, restore and job restart facilities for recovery after hardware failure or unexpected errors, preserving the original data and recording the recovery outcome for authorized review.'
  const behavior = 'Record the identity of the user responsible for a standing-data change, with the nature of the change and its date and time available for authorized audit review.'
  const recovery = 'Provide backup, restore and job restart facilities for recovery after hardware failure or unexpected errors, preserving the original data and recording the recovery outcome for authorized review.'
  const identityQuote = 'the identity of the user who made the change;'
  const recoveryQuote = source.split('\n').at(-1)!
  const linked = { name: 'Linked audit and recovery', summary: 'Review the original supporting source items.', behaviors: [behavior, recovery], evidence: [identityQuote, recoveryQuote],
    behaviorEvidence: [{ behavior, evidence: [identityQuote] }, { behavior: recovery, evidence: [recoveryQuote] }] }
  const analysis = { ...calibrationSectionResponse(liveAiCalibrationFixtures[1]), coverageAreas: [linked,
    { ...linked, name: 'Partial interpretation', behaviorEvidence: [{ behavior, evidence: [identityQuote] }, { behavior: recovery, evidence: [] }] },
    { ...linked, name: 'Unsupported interpretation', evidence: [], behaviorEvidence: [{ behavior, evidence: ['Invented supporting evidence.'] }, { behavior: recovery, evidence: [] }] },
  ] }
  let calls = 0
  await page.route('**/api/ai/**', async route => {
    calls += 1
    expect(route.request().url()).toContain('/api/ai/section-coverage-plan')
    expect(route.request().postDataJSON().visibleSection.content).toContain(source)
    expect(route.request().postDataJSON().visibleSection.content).not.toContain('NEIGHBOR_SENTINEL')
    const headers = await route.request().allHeaders()
    expect(headers.authorization).toBeUndefined()
    expect(headers.cookie).toBeUndefined()
    expect(Object.keys(headers).some(key => key.includes('calibrate'))).toBe(false)
    await route.fulfill({ json: { ok: true, analysis, warnings: [] } })
  })
  await page.goto('/')
  await page.getByRole('button', { name: /^QA Sources\b/ }).click()
  await page.getByRole('button', { name: 'New QA Source' }).click()
  const form = page.getByRole('form', { name: 'Create QA Source form' })
  await form.getByLabel('Source title').fill('Evidence review workspace')
  await form.getByLabel('Source content').fill(`# Audit and recovery\n${source}\n# Neighbor\nNEIGHBOR_SENTINEL`)
  await form.getByRole('button', { name: 'Create QA Source', exact: true }).click()
  const card = page.getByRole('article', { name: 'Evidence review workspace', exact: true })
  const panel = card.getByRole('region', { name: 'Section coverage analysis for Audit and recovery', exact: true })
  const selectSection = async () => {
    await card.getByText('Source Structure', { exact: true }).click()
    await card.getByRole('radio', { name: /1\. Audit and recovery/ }).check()
  }
  await selectSection()
  expect(calls).toBe(0)
  const testsBefore = await page.evaluate(async () => window.qaReadPersistedCollection('qa-mission-control:test-cases:v0.1'))
  await card.getByRole('button', { name: 'Analyze section', exact: true }).dblclick()
  await expect(panel.getByText('Evidence linked for each behavior', { exact: true })).toBeVisible()
  await expect(panel.getByText('Partial evidence · review behaviors', { exact: true })).toBeVisible()
  await expect(panel.getByText('No validated behavior evidence', { exact: true })).toBeVisible()
  expect(calls).toBe(1)
  await page.reload()
  await page.getByRole('button', { name: /^QA Sources\b/ }).click()
  await selectSection()
  for (const summary of await panel.getByText('Behaviors and validated evidence', { exact: true }).all()) await summary.click()
  await expect(panel.locator('q').first()).toHaveText('the identity of the user\n  who made the change;')
  await expect(panel.getByRole('heading', { name: 'Warnings', exact: true })).toBeVisible()
  for (const width of [1440, 1280, 1024, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await card.getByText('Source Structure', { exact: true }).scrollIntoViewIfNeeded()
    await page.screenshot({ path: testInfo.outputPath(`structure-${width}.png`) })
    for (const [index, state] of ['linked', 'partial', 'unsupported'].entries()) {
      const area = panel.locator('.section-coverage-analysis__area-list > li').nth(index)
      await area.scrollIntoViewIfNeeded()
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
      const disclosure = area.locator('.section-coverage-analysis__disclosure-body')
      const bounds = await disclosure.boundingBox()
      const behaviorBounds = await disclosure.getByRole('heading', { name: 'Behaviors', exact: true }).locator('..').boundingBox()
      expect(bounds).not.toBeNull()
      expect(behaviorBounds).not.toBeNull()
      // Nested source workbenches must not squeeze long behavior prose into tiny columns.
      expect(behaviorBounds!.width).toBeGreaterThanOrEqual(Math.min(260, bounds!.width - 2))
      await page.screenshot({ path: testInfo.outputPath(`${state}-${width}.png`) })
    }
    await panel.getByRole('heading', { name: 'Warnings', exact: true }).scrollIntoViewIfNeeded()
    await page.screenshot({ path: testInfo.outputPath(`warnings-${width}.png`) })
  }
  const saved = await page.evaluate(async () => window.qaReadPersistedCollection('qa-mission-control:ai-section-coverage-plans:v0.21'))
  expect(saved).not.toMatch(/rawProviderResponse|"prompt"|"messages"|Invented supporting evidence/)
  // Only this isolated test profile: simulate readable pre-association v1 storage.
  const legacy = JSON.parse(saved!)
  for (const area of legacy.records[0].plan.coverageAreas) {
    delete area.behaviorEvidence
    area.evidenceSupport = area.evidence.length ? 'source_backed' : 'needs_review'
  }
  await page.evaluate(async value => window.qaWritePersistedCollection('qa-mission-control:ai-section-coverage-plans:v0.21', value), JSON.stringify(legacy))
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.reload()
  await page.getByRole('button', { name: /^QA Sources\b/ }).click()
  await selectSection()
  await expect(panel.getByText('No validated behavior evidence', { exact: true })).toHaveCount(1)
  await expect(panel.getByText('Partial evidence · review behaviors', { exact: true })).toHaveCount(2)
  await expect(panel.getByText('Needs evidence review — no validated quote linked to this behavior.', { exact: true })).toHaveCount(6)
  await expect(panel.getByText('Evidence linked for each behavior', { exact: true })).toHaveCount(0)
  await panel.getByText('Behaviors and validated evidence', { exact: true }).first().click()
  for (const width of [1440, 1280, 1024, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await panel.locator('.section-coverage-analysis__area-list > li').first().scrollIntoViewIfNeeded()
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
    await page.screenshot({ path: testInfo.outputPath(`legacy-${width}.png`) })
  }
  expect(calls).toBe(1)
  expect(await page.evaluate(async () => window.qaReadPersistedCollection('qa-mission-control:test-cases:v0.1'))).toBe(testsBefore)
  expect(errors).toEqual([])
})
