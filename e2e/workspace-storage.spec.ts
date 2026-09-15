import { expect, test } from '@playwright/test'
import { demoStorage } from '../scripts/demo-fixture'

for (const previousVersion of [1, 2]) test(`IndexedDB v3 preserves v${previousVersion} records, closes old writers and ignores obsolete artifact-version metadata`, async ({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(async (previousVersion) => {
    const path = '/src/lib/workspace/workspaceRepository.ts'
    const { openWorkspaceRepository } = await import(/* @vite-ignore */ path)
    const name = `qa-v1-upgrade-${crypto.randomUUID()}`
    const old = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name, previousVersion)
      request.onupgradeneeded = () => {
        const records = request.result.createObjectStore('records', { keyPath: ['collection', 'id'] })
        records.createIndex('collection', 'collection'); records.createIndex('source', ['collection', 'sourceId'])
        request.result.createObjectStore('meta', { keyPath: 'id' })
      }
      request.onsuccess = () => resolve(request.result); request.onerror = reject
    })
    await new Promise<void>((resolve, reject) => {
      const transaction = old.transaction(['records', 'meta'], 'readwrite')
      transaction.objectStore('records').put({ collection: 'requirements', id: 'existing', order: 0, version: 8, value: { evidence: 'Original normalized evidence' } })
      transaction.objectStore('meta').put({ id: 'record:["requirements","existing"]', value: { version: 7 } })
      transaction.objectStore('meta').put({ id: 'collection:requirements', value: 8 })
      transaction.oncomplete = () => resolve(); transaction.onabort = reject
    })
    let oldWriterClosed = false
    old.onversionchange = () => { oldWriterClosed = true; old.close() }
    const repository = await openWorkspaceRepository(name)
    const retained = await repository.readRecord('requirements', 'existing')
    let staleRejected = false
    try { await repository.commit([], { recordChecks: [{ collection: 'requirements', id: 'existing', version: 7 }] }) } catch { staleRejected = true }
    await repository.commit([{ collection: 'requirements', put: [{ id: 'existing', value: retained.value, order: 0 }] }], { recordChecks: [{ collection: 'requirements', id: 'existing', version: 8 }] })
    const updated = await repository.readRecord('requirements', 'existing')
    repository.close(); indexedDB.deleteDatabase(name)
    return { oldWriterClosed, staleRejected, retained: retained.value, updatedVersion: updated.version }
  }, previousVersion)
  expect(result).toEqual({ oldWriterClosed: true, staleRejected: true, retained: { evidence: 'Original normalized evidence' }, updatedVersion: 9 })
})

test('the workspace client displays normalized persisted fields, not discarded input metadata', async ({ page }) => {
  await page.goto('/')
  const matches = await page.evaluate(async () => {
    const paths = ['/src/lib/workspace/workspaceRepository.ts', '/src/lib/workspace/workspaceClient.ts']
    const [{ openWorkspaceRepository }, { initializeWorkspaceClient }] = await Promise.all(paths.map((path) => import(/* @vite-ignore */ path)))
    const name = `normalized-client-${crypto.randomUUID()}`; const repository = await openWorkspaceRepository(name); const client = await initializeWorkspaceClient(repository)
    const source = { id: 'normalized', title: 'Saved source', sourceType: 'Requirement', status: 'Draft', content: 'The form must preserve valid input.', notes: '', createdAt: '2026-09-05T10:00:00.000Z', updatedAt: '2026-09-05T10:00:00.000Z', unsupportedMetadata: 'must not masquerade as saved' }
    const result = await client.save('sources', [source]); const saved = await repository.readRecord('sources', source.id)
    const displayed = client.get('sources').items[0]; repository.close(); indexedDB.deleteDatabase(name)
    return result.ok && JSON.stringify(displayed) === JSON.stringify(saved.value) && !Object.hasOwn(displayed, 'unsupportedMetadata')
  })
  expect(matches).toBe(true)
})

test('atomic record-version metadata survives replace/delete and avoids cloning the source body on task checks', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Operational snapshot' })).toBeVisible()
  const result = await page.evaluate(async () => {
    const path = '/src/lib/workspace/workspaceRepository.ts'
    const { openWorkspaceRepository } = await import(/* @vite-ignore */ path)
    const database = `qa-record-versions-${crypto.randomUUID()}`
    const repository = await openWorkspaceRepository(database)
    const versions = await repository.commit([{ collection: 'sources', put: [{ id: 'large', value: { content: 'x'.repeat(1_000_000) }, order: 0 }] }])
    const originalGet = IDBObjectStore.prototype.get
    let sourceBodyReads = 0
    IDBObjectStore.prototype.get = function (key) {
      if (this.name === 'records' && Array.isArray(key) && key[0] === 'sources') sourceBodyReads += 1
      return originalGet.call(this, key)
    }
    for (let index = 0; index < 20; index += 1) await repository.commit([{ collection: 'tasks', put: [{ id: `task-${index}`, value: { status: 'done' }, order: index }] }], { recordChecks: [{ collection: 'sources', id: 'large', version: versions.sources }] })
    IDBObjectStore.prototype.get = originalGet
    let rollback = false
    try { await repository.commit([{ collection: 'sources', replace: true, put: [{ id: 'bad', value: { callback: () => undefined }, order: 0 }] }]) }
    catch { rollback = true }
    const afterFailedReplace = await repository.readRecord('sources', 'large')
    await repository.commit([{ collection: 'sources', replace: true, put: [{ id: 'replacement', value: { title: 'new' }, order: 0 }] }])
    let staleRejected = false
    try { await repository.commit([], { recordChecks: [{ collection: 'sources', id: 'large', version: versions.sources }] }) }
    catch { staleRejected = true }
    await repository.commit([], { recordChecks: [{ collection: 'sources', id: 'large', version: null }] })
    repository.close()
    indexedDB.deleteDatabase(database)
    return { sourceBodyReads, rollback, preserved: afterFailedReplace?.value.content.length, staleRejected }
  })
  expect(result).toEqual({ sourceBodyReads: 0, rollback: true, preserved: 1_000_000, staleRejected: true })
})

test('v1 migration preserves all validated collections and original bytes, without resurrecting deleted records', async ({ page }) => {
  await page.addInitScript((data) => {
    if (!localStorage.getItem('migration-fixture-seeded')) {
      Object.entries(data).forEach(([key, value]) => localStorage.setItem(key, value))
      localStorage.setItem('migration-fixture-seeded', 'yes')
    }
  }, demoStorage)
  await page.goto('/')
  await expect(page.getByRole('navigation', { name: 'Workspace pages' })).toBeVisible()
  const result = await page.evaluate(async (data) => {
    const repositoryPath = '/src/lib/workspace/workspaceRepository.ts'
    const migrationPath = '/src/lib/workspace/workspaceMigration.ts'
    const { openWorkspaceRepository } = await import(/* @vite-ignore */ repositoryPath)
    const { migrateLegacyWorkspace } = await import(/* @vite-ignore */ migrationPath)
    const repository = await openWorkspaceRepository()
    const receipt = await migrateLegacyWorkspace(repository)
    const cases = await repository.readCollection('testCases')
    const sources = await repository.readCollection('sources')
    await repository.commit([{ collection: 'testCases', remove: [cases.records[0].id] }])
    await migrateLegacyWorkspace(repository)
    const after = await repository.readCollection('testCases')
    repository.close()
    return { sourceCount: sources.records.length, caseCount: cases.records.length, after: after.records.length,
      originalBytesUnchanged: Object.entries(data).every(([key, value]) => localStorage.getItem(key) === value), warnings: receipt.warnings }
  }, demoStorage)
  expect(result).toEqual({ sourceCount: 5, caseCount: 18, after: 17, originalBytesUnchanged: true, warnings: [] })
  await page.reload()
  await page.getByRole('navigation', { name: 'Workspace pages' }).getByRole('button', { name: 'Test Cases', exact: true }).click()
  await expect(page.locator('.test-case-card')).toHaveCount(17)
})

test('malformed legacy records remain recoverable and migration warnings are visible', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('qa-mission-control:qa-sources:v0.12', '[{"id":"malformed"}]'))
  await page.goto('/')
  await expect(page.getByRole('status')).toContainText('Some saved QA sources could not be loaded')
  expect(await page.evaluate(() => localStorage.getItem('qa-mission-control:qa-sources:v0.12'))).toBe('[{"id":"malformed"}]')
})

test('queued workspace edits preserve independent additions and reject another tab overwriting them', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Operational snapshot' })).toBeVisible()
  const result = await page.evaluate(async () => {
    const repositoryPath = '/src/lib/workspace/workspaceRepository.ts'
    const clientPath = '/src/lib/workspace/workspaceClient.ts'
    const { openWorkspaceRepository } = await import(/* @vite-ignore */ repositoryPath)
    const { initializeWorkspaceClient } = await import(/* @vite-ignore */ clientPath)
    const name = `qa-client-race-${crypto.randomUUID()}`
    const repository = await openWorkspaceRepository(name)
    const first = await initializeWorkspaceClient(repository)
    const otherRepository = await openWorkspaceRepository(name)
    const otherTab = await initializeWorkspaceClient(otherRepository)
    const source = { id: 'a', title: 'A', content: 'Must validate input.', notes: '', sourceType: 'Requirement', status: 'Draft', createdAt: '2026-09-05T10:00:00.000Z', updatedAt: '2026-09-05T10:00:00.000Z' }
    const results = await Promise.all([first.save('sources', [source]), first.save('sources', [{ ...source, id: 'b' }])])
    const stale = await otherTab.save('sources', [{ ...source, id: 'c' }])
    const saved = await repository.readCollection('sources')
    repository.close()
    otherRepository.close()
    indexedDB.deleteDatabase(name)
    return { results, stale, ids: saved.records.map((record: { id: string }) => record.id).sort() }
  })
  expect(result.results.every((saved: { ok: boolean }) => saved.ok)).toBe(true)
  expect(result.stale.ok).toBe(false)
  expect(result.ids).toEqual(['a', 'b'])
})

test('IndexedDB commits records atomically, rejects stale writers and survives reopen', async ({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(async () => {
    const modulePath = '/src/lib/workspace/workspaceRepository.ts'
    const { openWorkspaceRepository } = await import(/* @vite-ignore */ modulePath)
    const name = `qa-storage-test-${crypto.randomUUID()}`
    const repository = await openWorkspaceRepository(name)
    await repository.commit([{ collection: 'sources', put: [{ id: 's1', value: { content: 'First revision' }, order: 0 }] }])
    const first = await repository.readRecord('sources', 's1')
    await repository.commit([{ collection: 'sources', put: [{ id: 's1', value: { content: 'New revision' }, order: 0 }] }])
    let staleRejected = false
    try {
      await repository.commit([{ collection: 'results', put: [{ id: 'old-result', value: { summary: 'Stale' }, order: 0 }] }], {
        recordChecks: [{ collection: 'sources', id: 's1', version: first.version }],
      })
    } catch { staleRejected = true }
    const stale = await repository.readRecord('results', 'old-result')
    let failedWriteRejected = false
    try {
      await repository.commit([{ collection: 'sources', put: [
        { id: 's1', value: { content: 'Must roll back' }, order: 0 },
        { id: 'bad', value: () => 'not structured-cloneable', order: 1 },
      ] }])
    } catch { failedWriteRejected = true }
    repository.close()
    const reopened = await openWorkspaceRepository(name)
    const saved = await reopened.readCollection('sources')
    reopened.close()
    indexedDB.deleteDatabase(name)
    return { staleRejected, stale, failedWriteRejected, values: saved.records.map((record: { value: unknown }) => record.value), version: saved.version }
  })
  expect(result).toEqual({ staleRejected: true, stale: null, failedWriteRejected: true, values: [{ content: 'New revision' }], version: 2 })
})

test('IndexedDB handles large source bodies and incremental records without localStorage serialization', async ({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(async () => {
    const modulePath = '/src/lib/workspace/workspaceRepository.ts'
    const { openWorkspaceRepository } = await import(/* @vite-ignore */ modulePath)
    const name = `qa-storage-scale-${crypto.randomUUID()}`
    const repository = await openWorkspaceRepository(name)
    const started = performance.now()
    const content = 'Enterprise דרישה.\n'.repeat(500_000)
    await repository.commit([
      { collection: 'sources', put: [{ id: 'large-source', value: { content }, order: 0 }] },
      { collection: 'requirements', put: Array.from({ length: 10_000 }, (_, index) => ({ id: `r${index}`, sourceId: 'large-source', value: { summary: `Requirement ${index}` }, order: index })) },
    ])
    const insertedMs = performance.now() - started
    const before = await repository.readRecord('requirements', 'r9999')
    const updateStarted = performance.now()
    await repository.commit([{ collection: 'requirements', put: [{ id: 'r2', sourceId: 'large-source', value: { summary: 'Updated requirement' }, order: 2 }] }])
    const updateMs = performance.now() - updateStarted
    const after = await repository.readRecord('requirements', 'r9999')
    const source = await repository.readRecord('sources', 'large-source')
    const requirements = await repository.readSourceRecords('requirements', 'large-source')
    repository.close()
    indexedDB.deleteDatabase(name)
    return { characterCount: source.value.content.length, expected: content.length, count: requirements.length, unchanged: before.version === after.version, insertedMs, updateMs }
  })
  expect(result.characterCount).toBe(result.expected)
  expect(result.characterCount).toBeGreaterThan(8_000_000)
  expect(result.count).toBe(10_000)
  expect(result.unchanged).toBe(true)
  test.info().annotations.push({ type: 'measurement', description: `10k records + ${result.characterCount} characters: ${result.insertedMs.toFixed(0)}ms; one-record update: ${result.updateMs.toFixed(1)}ms` })
})

test('500-page canonical document inventory restores atomically and rejects a late build after source edit', async ({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(async () => {
    const repositoryPath = '/src/lib/workspace/workspaceRepository.ts'
    const documentsPath = '/src/lib/workspace/documentRepository.ts'
    const segmentationPath = '/src/features/document-intelligence/documentSegmentation.ts'
    const fixturePath = '/src/features/document-intelligence/enterpriseFixture.ts'
    const { openWorkspaceRepository } = await import(/* @vite-ignore */ repositoryPath)
    const { saveDocumentSnapshot, loadDocumentSnapshot } = await import(/* @vite-ignore */ documentsPath)
    const { buildDocumentSnapshot } = await import(/* @vite-ignore */ segmentationPath)
    const { createEnterpriseFixture } = await import(/* @vite-ignore */ fixturePath)
    const name = `qa-document-scale-${crypto.randomUUID()}`
    const repository = await openWorkspaceRepository(name)
    const fixture = createEnterpriseFixture(500)
    const source = { id: 'large', title: 'Enterprise specification', content: fixture.content, notes: '', sourceType: 'Requirement', status: 'Draft', createdAt: '2026-09-05T10:00:00.000Z', updatedAt: '2026-09-05T10:00:00.000Z' }
    await repository.commit([{ collection: 'sources', put: [{ id: source.id, value: source, order: 0 }] }])
    const record = await repository.readRecord('sources', source.id)
    const started = performance.now()
    const snapshot = await buildDocumentSnapshot(source, { format: 'pdf', pages: fixture.pages })
    const buildMs = performance.now() - started
    const saveStarted = performance.now()
    await saveDocumentSnapshot(repository, snapshot, record.version)
    const saveMs = performance.now() - saveStarted
    const restored = await loadDocumentSnapshot(repository, source.id)
    await repository.commit([{ collection: 'sources', put: [{ id: source.id, value: { ...source, content: source.content + '\nChanged requirement.' }, order: 0 }] }])
    let staleRejected = false
    try { await saveDocumentSnapshot(repository, snapshot, record.version) } catch { staleRejected = true }
    repository.close()
    indexedDB.deleteDatabase(name)
    return { pageCount: restored.pages.length, sectionCount: restored.sections.length, unitCount: restored.units.length,
      exact: restored.units.map((unit: { location: { startOffset: number; endOffset: number } }) => source.content.slice(unit.location.startOffset, unit.location.endOffset)).join('') === source.content,
      staleRejected, buildMs, saveMs }
  })
  expect(result.pageCount).toBe(500)
  expect(result.sectionCount).toBe(1500)
  expect(result.unitCount).toBeGreaterThanOrEqual(1500)
  expect(result.exact).toBe(true)
  expect(result.staleRejected).toBe(true)
  test.info().annotations.push({ type: 'measurement', description: `500-page real pipeline: build ${result.buildMs.toFixed(0)}ms; atomic save ${result.saveMs.toFixed(0)}ms` })
})
