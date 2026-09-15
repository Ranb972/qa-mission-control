import { expect, test, type Page } from '@playwright/test'

async function navigate(page: Page, name: string) {
  const target = page.getByRole('navigation', { name: 'Workspace pages' }).getByRole('button', { name, exact: true })
  await page.locator('#workspace-navigation').waitFor({ state: 'attached' })
  if (!await target.isVisible()) await page.getByRole('button', { name: 'Menu', exact: true }).click()
  await target.click()
}

async function seedProfessionalWorkspace(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Operational snapshot' })).toBeVisible()
  await page.evaluate(async () => {
    const paths = ['/src/lib/workspace/workspaceRepository.ts', '/src/features/document-intelligence/documentSegmentation.ts', '/src/features/document-intelligence/requirementModel.ts', '/src/features/document-intelligence/coverageIntelligence.ts', '/src/features/document-intelligence/requirementTraceability.ts']
    const [{ openWorkspaceRepository }, { buildDocumentSnapshot }, { materializeRequirements }, { buildCoverageIntelligence }, { createRequirementTestLink, testDesignFingerprint }] = await Promise.all(paths.map(path => import(/* @vite-ignore */ path)))
    const timestamp = '2026-09-01T09:00:00.000Z'
    const topics = ['Identity', 'Order integrity', 'Inventory', 'Refunds', 'Delivery', 'Receipts', 'Localization', 'Subscriptions', 'Security', 'Audit']
    const policies = [
      'A suspended account must not complete checkout.', 'Duplicate confirmation must create at most one order.',
      'Unavailable stock must be rejected before payment.', 'A refund must retain the original payment reference.',
      'A corrected postal code must preserve the street address.', 'A retried callback must not create a second receipt.',
      'The confirmation must show the selected currency.', 'Canceling renewal must preserve the current paid term.',
      'Expired sessions must not authorize payment.', 'A changed delivery address must retain an audit entry.',
    ]
    const quotes = Array.from({ length: 100 }, (_, index) => `REQ ${String(index + 1).padStart(3, '0')}: ${policies[Math.floor(index / 10)]} ${index % 20 === 19 ? 'The exception requires clarification.' : `Apply this rule to customer group ${index % 10 + 1}.`}`)
    const source = { id: 'precision-source', title: 'Synthetic commerce acceptance · 100 findings', sourceType: 'Requirement', status: 'Reviewed', notes: 'Synthetic usability fixture. No real customer or provider evidence.', createdAt: timestamp, updatedAt: timestamp, content: topics.map((topic, index) => `# ${topic}\n${quotes.slice(index * 10, index * 10 + 10).join('\n')}`).join('\n\n') }
    const snapshot = await buildDocumentSnapshot(source)
    const requirements = []
    const intelligence = []
    for (const unit of snapshot.units) {
      const lines = source.content.slice(unit.location.startOffset, unit.location.endOffset).split('\n').filter(line => line.startsWith('REQ '))
      const topic = snapshot.sections.find(section => section.id === unit.sectionId).title
      const findings = await materializeRequirements(source, snapshot, unit, { version: 1, findings: lines.map(quote => ({ kind: quote.includes('requires clarification') ? 'ambiguity' : 'requirement', summary: quote, quote, occurrence: 0, coverage: topic })), limitations: [] }, timestamp)
      requirements.push(...findings)
      intelligence.push({ id: unit.id, sourceId: source.id, sourceCreatedAt: source.createdAt, unitId: unit.id, reuseKey: unit.reuseKey, analysisVersion: 'requirements-unit-v1', requirementIds: findings.map(item => item.id), reviewNotes: [], analyzedAt: timestamp })
    }
    const tests = quotes.map((quote, index) => ({ id: `precision-test-${index + 1}`, title: `QA ${String(index + 1).padStart(3, '0')} · ${policies[Math.floor(index / 10)]}`, area: topics[Math.floor(index / 10)], priority: index % 3 === 0 ? 'High' : 'Medium', status: 'Not Run', type: 'Functional', preconditions: `Synthetic customer group ${index % 10 + 1}; controlled commerce environment.`, steps: `Exercise the policy for group ${index % 10 + 1} and inspect the persisted transaction.`, expectedResult: quote, createdAt: timestamp, updatedAt: timestamp }))
    const testLinks = await Promise.all(requirements.slice(0, 80).filter(item => item.kind === 'requirement').map(item => createRequirementTestLink(item, tests[requirements.indexOf(item)], timestamp)))
    const coverage = await buildCoverageIntelligence(snapshot, requirements, new Set(snapshot.units.map(unit => unit.id)))
    const executions = await Promise.all(tests.slice(0, 3).map(async item => ({ id: `run-${item.id}`, releaseId: 'precision-release', testCaseId: item.id, result: 'Failed', notes: 'Synthetic observation: a suspended account completed checkout.', executedAt: timestamp, testDesignFingerprint: await testDesignFingerprint(item), createdAt: timestamp, updatedAt: timestamp })))
    const repository = await openWorkspaceRepository()
    const write = (collection: string, values: Array<{ id: string }>, sourceId?: string) => ({ collection, put: values.map((value, order) => ({ id: value.id, order, value, ...(sourceId ? { sourceId } : {}) })) })
    await repository.commit([
      write('sources', [source]), write('requirements', requirements, source.id), write('unitIntelligence', intelligence, source.id), write('testCases', tests), write('requirementTestLinks', testLinks, source.id), write('requirementCoverageAreas', coverage.areas, source.id), write('requirementCoverageLinks', coverage.links, source.id), write('executions', executions),
      write('sourceCoveragePlans', [{ id: source.id, sourceId: source.id, sourceRevision: coverage.sourceRevision, requirementSetFingerprint: coverage.requirementSetFingerprint, requirementCount: 100, areaCount: coverage.areas.length, createdAt: timestamp, updatedAt: timestamp }], source.id),
      write('releases', [{ id: 'precision-release', name: 'Synthetic commerce', version: '1.0', targetDate: '2026-09-30', status: 'In Testing', notes: 'Synthetic usability fixture.', createdAt: timestamp, updatedAt: timestamp }]),
    ])
    repository.close()
  })
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Operational snapshot' })).toBeVisible()
}

for (const width of [1440, 1024, 390]) {
  test(`Editorial Precision: keyboard, evidence and QA navigation across 100 items at ${width}px`, async ({ page }, testInfo) => {
    test.setTimeout(120_000)
    await page.setViewportSize({ width, height: 1000 })
    let providerCalls = 0
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/api/ai/**', route => { providerCalls++; return route.abort() })
    await seedProfessionalWorkspace(page)
    const capture = async (name: string) => {
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.querySelector('main')!.scrollWidth <= document.querySelector('main')!.clientWidth + 1)).toBe(true)
      await page.screenshot({ path: testInfo.outputPath(`100-${name}-${width}.png`), animations: 'disabled' })
    }
    await expect(page.getByRole('region', { name: 'Recent workspace changes' })).toContainText('sources saved')
    await navigate(page, 'QA Sources')
    const rows = page.locator('.requirement-row')
    await expect(rows).toHaveCount(40)
    await rows.first().focus()
    await page.keyboard.press('ArrowDown')
    await expect(rows.nth(1)).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.locator('.requirement-dossier h4')).toBeFocused()
    await expect(page.locator('.requirement-dossier blockquote')).toContainText('REQ 002:')
    await expect(page.locator('.decision-band')).toContainText('Linked recorded failures')
    await expect(page.locator('.decision-band__failure dd')).toHaveText('1')
    if (width === 390) await expect(page.getByRole('navigation', { name: 'Requirement collection' })).not.toBeVisible()
    await capture('requirement-detail')
    await page.getByRole('button', { name: 'Back to findings', exact: true }).click()
    await expect(rows.nth(1)).toBeFocused()
    await page.keyboard.press('Home')
    await expect(rows.first()).toBeFocused()
    await page.keyboard.press('End')
    await expect(rows.last()).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.locator('.requirement-dossier h4')).toContainText('REQ 040:')
    await page.getByRole('button', { name: 'Next finding', exact: true }).click()
    await expect(page.locator('.requirement-dossier h4')).toContainText('REQ 041:')
    await expect(page.locator('.requirement-dossier h4')).toBeFocused()
    await page.getByRole('button', { name: 'Previous finding', exact: true }).click()
    await expect(page.locator('.requirement-dossier h4')).toContainText('REQ 040:')
    await page.getByRole('button', { name: 'Back to findings', exact: true }).click()
    await capture('requirement-collection')
    await page.getByLabel('Find evidence', { exact: true }).fill('REQ 099:')
    await expect(rows).toHaveCount(1)
    await rows.first().click()
    await expect(page.locator('.requirement-dossier blockquote')).toContainText('REQ 099:')
    await expect(page.locator('.requirement-dossier')).toContainText('Audit')
    await page.getByRole('button', { name: 'View coverage & execution impact', exact: true }).click()
    await page.getByLabel('Coverage attention').selectOption('failures')
    const topics = page.locator('.source-coverage-intelligence > .document-result')
    await expect(topics).toHaveCount(1)
    await expect(topics.first()).toContainText('3 findings with failures')
    await capture('coverage-failures')
    await page.getByLabel('Coverage attention').selectOption('gaps')
    await expect(topics).toHaveCount(2)
    await page.getByLabel('Coverage attention').selectOption('ambiguity')
    await expect(topics).toHaveCount(5)
    await page.getByLabel('Find coverage topics').fill('unmatched')
    await expect(topics).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'Requirement-backed global coverage' })).toContainText('No topics match')

    await navigate(page, 'Test Cases')
    await page.getByLabel('Sort Test Cases').selectOption('title')
    await expect(page.locator('.test-library__row')).toHaveCount(40)
    await capture('test-collection')
    const fortieth = page.getByRole('article', { name: /^QA 040/ })
    await fortieth.getByRole('button', { name: 'Expand', exact: true }).click()
    await expect(fortieth.getByRole('heading', { name: /^QA 040/ })).toBeFocused()
    if (width === 390) await expect(page.getByRole('article', { name: /^QA 001/ })).not.toBeVisible()
    await page.getByRole('button', { name: 'Next test', exact: true }).click()
    const fortyFirst = page.getByRole('article', { name: /^QA 041/ })
    await expect(fortyFirst.getByRole('heading', { name: /^QA 041/ })).toBeFocused()
    await expect(page.locator('.test-case-card__details')).toHaveCount(1)
    await capture('test-detail')
    await page.getByRole('button', { name: 'Back to tests', exact: true }).click()
    await expect(fortyFirst.getByRole('button', { name: 'Expand', exact: true })).toBeFocused()
    await page.getByLabel('Sort Test Cases').selectOption('priority')
    await expect(page.locator('.test-library__row').first().locator('.badge-row > .badge').nth(1)).toHaveText('High')
    await page.getByLabel('Sort Test Cases').selectOption('updated')
    await page.getByLabel('Search by title').fill('QA 099')
    await expect(page.locator('.test-library__row')).toHaveCount(1)
    await page.getByRole('article', { name: /^QA 099/ }).getByRole('button', { name: 'Expand', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Next test', exact: true })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Previous test', exact: true })).toBeDisabled()
    expect(providerCalls).toBe(0)
    expect(errors).toEqual([])
  })
}
