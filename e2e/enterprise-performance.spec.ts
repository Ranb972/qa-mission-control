import { expect, test } from '@playwright/test'

test('measures 10000 canonical requirements, 3000 tests and 30000 traceability links in the real workspace', async ({ page }, testInfo) => {
  test.setTimeout(420000)
  let calls = 0
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/api/ai/**', async (route) => { calls += 1; await route.abort() })
  await page.addInitScript(() => {
    const measures = { longTasks: [] as number[] }
    Object.assign(window, { qaPerformance: measures })
    new PerformanceObserver((list) => { measures.longTasks.push(...list.getEntries().map((entry) => entry.duration)) }).observe({ type: 'longtask', buffered: true })
  })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Operational snapshot', exact: true })).toBeVisible()
  const seeded = await page.evaluate(async () => {
    const paths = ['/src/lib/workspace/workspaceRepository.ts', '/src/features/document-intelligence/documentSegmentation.ts', '/src/features/document-intelligence/requirementModel.ts', '/src/features/document-intelligence/coverageIntelligence.ts', '/src/features/document-intelligence/requirementTraceability.ts']
    const [{ openWorkspaceRepository }, { buildDocumentSnapshot }, { materializeRequirements }, { buildCoverageIntelligence }, { createRequirementTestLink, testDesignFingerprint }] = await Promise.all(paths.map((path) => import(/* @vite-ignore */ path)))
    const timestamp = '2026-09-01T09:00:00.000Z'
    const start = performance.now()
    const source = { id: 'scale-source', title: 'Enterprise 10000 requirement acceptance', sourceType: 'Requirement', status: 'Reviewed', notes: 'Synthetic scale fixture.', createdAt: timestamp, updatedAt: timestamp, content: Array.from({ length: 250 }, (_, section) => `# Capability ${section + 1}\n${Array.from({ length: 40 }, (_, row) => `REQ ${section * 40 + row + 1}: The system must persist record ${section * 40 + row + 1} with its authorized owner.`).join('\n')}`).join('\n\n') }
    const snapshot = await buildDocumentSnapshot(source)
    const requirements = []
    const intelligence = []
    for (const unit of snapshot.units) {
      const text = source.content.slice(unit.location.startOffset, unit.location.endOffset)
      const quoteLines = text.split('\n').filter((line) => line.startsWith('REQ '))
      const topic = snapshot.sections.find((section) => section.id === unit.sectionId).title
      const findings = await materializeRequirements(source, snapshot, unit, { version: 1, findings: quoteLines.map((quote) => ({ kind: 'requirement', summary: quote, quote, occurrence: 0, coverage: topic })), limitations: [] }, timestamp)
      requirements.push(...findings)
      intelligence.push({ id: unit.id, sourceId: source.id, sourceCreatedAt: source.createdAt, unitId: unit.id, reuseKey: unit.reuseKey, analysisVersion: 'requirements-unit-v1', requirementIds: findings.map((item) => item.id), reviewNotes: [], analyzedAt: timestamp })
    }
    const tests = Array.from({ length: 3000 }, (_, index) => ({ id: `scale-test-${index + 1}`, title: `Acceptance test ${String(index + 1).padStart(4, '0')}`, area: `Capability ${index % 250 + 1}`, priority: 'High', status: 'Not Run', type: 'Functional', steps: `Persist record ${index + 1} as its owner and reload it.`, expectedResult: 'The saved record is returned only to its authorized owner.', createdAt: timestamp, updatedAt: timestamp }))
    const testLinks = []
    for (let start = 0; start < requirements.length; start += 100) testLinks.push(...(await Promise.all(requirements.slice(start, start + 100).flatMap((requirement, offset) => [0, 1, 2].map((shift) => createRequirementTestLink(requirement, tests[(start + offset + shift) % tests.length], timestamp))))))
    const coverage = await buildCoverageIntelligence(snapshot, requirements, new Set(snapshot.units.map((unit) => unit.id)))
    const executions = await Promise.all(tests.map(async (test, index) => ({ id: `scale-run-${index}`, releaseId: 'scale-release', testCaseId: test.id, result: index % 3 === 0 ? 'Failed' : 'Passed', notes: `Synthetic observed result for ${test.title}.`, executedAt: timestamp, testDesignFingerprint: await testDesignFingerprint(test), createdAt: timestamp, updatedAt: timestamp })))
    const repository = await openWorkspaceRepository()
    const write = (collection: string, values: Array<{ id: string }>, sourceId?: string) => ({ collection, put: values.map((value, order) => ({ id: value.id, order, value, ...(sourceId ? { sourceId } : {}) })) })
    const builtMs = performance.now() - start
    const saveStart = performance.now()
    await repository.commit([
      write('sources', [source]), write('requirements', requirements, source.id), write('unitIntelligence', intelligence, source.id), write('testCases', tests), write('requirementTestLinks', testLinks, source.id), write('requirementCoverageAreas', coverage.areas, source.id), write('requirementCoverageLinks', coverage.links, source.id), write('executions', executions),
      write('sourceCoveragePlans', [{ id: source.id, sourceId: source.id, sourceRevision: coverage.sourceRevision, requirementSetFingerprint: coverage.requirementSetFingerprint, requirementCount: 10000, areaCount: coverage.areas.length, createdAt: timestamp, updatedAt: timestamp }], source.id),
      write('releases', [{ id: 'scale-release', name: 'Enterprise scale release', version: '3.0', targetDate: '2026-09-30', status: 'In Testing', notes: 'Synthetic stress evidence only.', createdAt: timestamp, updatedAt: timestamp }]),
      write('sourceSets', [{ schemaVersion: 1, id: 'scale-set', name: 'Enterprise scale scope', description: '', members: [{ sourceId: source.id, sourceCreatedAt: source.createdAt }], createdAt: timestamp, updatedAt: timestamp }]),
      write('releaseRequirementBaselines', [{ schemaVersion: 1, id: 'scale-release', releaseCreatedAt: timestamp, sourceSetId: 'scale-set', sourceSetCreatedAt: timestamp, members: [{ sourceId: source.id, sourceCreatedAt: source.createdAt }], requirements: requirements.map(({ id, fingerprint }) => ({ id, fingerprint })), capturedAt: timestamp }]),
    ])
    repository.close()
    return { buildMs: builtMs, saveMs: performance.now() - saveStart, requirements: requirements.length, tests: tests.length, links: testLinks.length, regions: snapshot.units.length }
  })
  expect(seeded).toMatchObject({ requirements: 10000, tests: 3000, links: 30000, regions: 250 })
  console.log(JSON.stringify({ enterpriseScale: seeded }))
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Operational snapshot', exact: true })).toBeVisible()
  await page.setViewportSize({ width: 1440, height: 1000 })
  const measurements = []
  for (const name of ['Test Cases', 'Executions', 'QA Sources', 'Release Report']) {
    await page.evaluate(() => { (window as unknown as { qaPerformance: { longTasks: number[] } }).qaPerformance.longTasks = [] })
    const start = Date.now()
    await page.getByRole('navigation', { name: 'Workspace pages' }).getByRole('button', { name, exact: true }).click()
    if (name === 'QA Sources') await expect(page.locator('.document-requirements')).toContainText('REQ 1:', { timeout: 30000 })
    if (name === 'Release Report') await expect(page.getByRole('region', { name: 'Release requirement traceability', exact: true })).toContainText('QA-confirmed tests10000 / 10000', { timeout: 20000 })
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    const elapsedMs = Date.now() - start
    const metrics = await page.evaluate(() => ({ domNodes: document.querySelectorAll('*').length, maxLongTaskMs: Math.max(0, ...(window as unknown as { qaPerformance: { longTasks: number[] } }).qaPerformance.longTasks), overflow: document.documentElement.scrollWidth > innerWidth }))
    measurements.push({ screen: name, elapsedMs, ...metrics })
    console.log(JSON.stringify(measurements.at(-1)))
    expect(metrics.overflow).toBe(false)
    expect(metrics.domNodes).toBeLessThan(2500)
    await page.screenshot({ path: testInfo.outputPath(`scale-${name.toLowerCase().replaceAll(' ', '-')}.png`) })
  }
  await page.getByLabel('Find release requirements', { exact: true }).fill('REQ 10000:')
  await expect(page.getByRole('region', { name: 'Release requirement traceability', exact: true }).locator('.coverage-evidence-row')).toHaveCount(1)
  await expect(page.getByRole('region', { name: 'Release requirement traceability', exact: true })).toContainText('record 10000')
  await page.getByRole('navigation', { name: 'Workspace pages' }).getByRole('button', { name: 'Test Cases', exact: true }).click()
  await expect(page.locator('.test-library__row')).toHaveCount(40)
  await page.getByRole('navigation', { name: 'Test Case library pages' }).getByRole('button', { name: 'Next', exact: true }).click()
  await expect(page.getByRole('navigation', { name: 'Test Case library pages' })).toContainText('41–80')
  await page.getByLabel('Search by title', { exact: true }).fill('Acceptance test 3000')
  await expect(page.locator('.test-library__row')).toHaveCount(1)
  await expect(page.locator('.test-library__row')).toContainText('Acceptance test 3000')
  await page.getByRole('navigation', { name: 'Workspace pages' }).getByRole('button', { name: 'Executions', exact: true }).click()
  await expect(page.locator('.execution-queue-item')).toHaveCount(40)
  await page.getByRole('navigation', { name: 'Execution queue pages' }).getByRole('button', { name: 'Next', exact: true }).click()
  await expect(page.locator('.execution-runner-panel')).toContainText('Acceptance test 0041')
  await page.getByLabel('Find a Test Case', { exact: true }).fill('Acceptance test 3000')
  await expect(page.locator('.execution-queue-item')).toHaveCount(1)
  await expect(page.locator('.execution-runner-panel')).toContainText('Acceptance test 3000')
  await page.getByRole('navigation', { name: 'Workspace pages' }).getByRole('button', { name: 'QA Sources', exact: true }).click()
  await page.getByLabel('Find evidence', { exact: true }).fill('REQ 10000:')
  await expect(page.locator('.requirement-collection .requirement-row')).toHaveCount(1)
  await expect(page.locator('.document-requirements')).toContainText('record 10000')
  // Exercise the same dedicated-worker operations as the workspace tools, not just fixture IO.
  const transfer = await page.evaluate(async () => {
    const clientPath = '/src/lib/workspace/workspaceBackupWorkerClient.ts'
    const repositoryPath = '/src/lib/workspace/workspaceRepository.ts'
    const restorePath = '/src/lib/workspace/workspaceBackupRepository.ts'
    const { processWorkspacePackage } = await import(/* @vite-ignore */ clientPath)
    const { openWorkspaceRepository } = await import(/* @vite-ignore */ repositoryPath)
    const { workspaceRestoreVersions } = await import(/* @vite-ignore */ restorePath)
    const metrics = (window as unknown as { qaPerformance: { longTasks: number[] } }).qaPerformance
    metrics.longTasks = []
    let heartbeat = 0
    let lastBeat = performance.now()
    let maxHeartbeatGapMs = 0
    const timer = setInterval(() => { const now = performance.now(); maxHeartbeatGapMs = Math.max(maxHeartbeatGapMs, now - lastBeat); lastBeat = now; heartbeat += 1 }, 50)
    try {
      let start = performance.now()
      const text = await processWorkspacePackage('export_current', null)
      const exportMs = performance.now() - start
      start = performance.now()
      const backup = await processWorkspacePackage('validate', text)
      const validateMs = performance.now() - start
      const repository = await openWorkspaceRepository()
      try {
        const expected = await workspaceRestoreVersions(repository)
        start = performance.now()
        await processWorkspacePackage('restore', { backup, expected })
        const restoreMs = performance.now() - start
        const counts = Object.fromEntries(await Promise.all(['requirements', 'testCases', 'requirementTestLinks', 'executions'].map(async (name) => [name, (await repository.readCollection(name)).records.length])))
        await new Promise((resolve) => setTimeout(resolve, 100))
        return { bytes: new Blob([text]).size, exportMs, validateMs, restoreMs, heartbeat, maxHeartbeatGapMs, maxLongTaskMs: Math.max(0, ...metrics.longTasks), counts }
      } finally { repository.close() }
    } finally { clearInterval(timer) }
  })
  expect(transfer.counts).toEqual({ requirements: 10000, testCases: 3000, requirementTestLinks: 30000, executions: 3000 })
  expect(transfer.heartbeat).toBeGreaterThan(10)
  console.log(JSON.stringify({ enterpriseScale: seeded, screens: measurements, transfer }))
  await testInfo.attach('enterprise-performance.json', { body: JSON.stringify({ enterpriseScale: seeded, screens: measurements, transfer }), contentType: 'application/json' })
  expect(calls).toBe(0)
  expect(errors).toEqual([])
})
