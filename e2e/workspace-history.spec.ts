import { expect, test } from '@playwright/test'

test('activity is bounded, concurrent-safe and committed atomically with the underlying QA data', async ({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(async () => {
    const path = '/src/lib/workspace/workspaceRepository.ts'
    const { openWorkspaceRepository } = await import(/* @vite-ignore */ path)
    const database = `qa-history-${crypto.randomUUID()}`
    const repository = await openWorkspaceRepository(database)
    const other = await openWorkspaceRepository(database)
    await Promise.all(Array.from({ length: 205 }, (_, index) => (index % 2 ? repository : other).commit([{ collection: 'sources', put: [{ id: `source-${index}`, value: { content: 'PRIVATE_SOURCE_BODY_DO_NOT_LOG' }, order: index }] }])))
    const before = await repository.readRecord('workspaceHistory', 'recent')
    const originalPut = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function(value, key) {
      if (value?.collection === 'workspaceHistory') { this.transaction.abort(); throw new DOMException('Injected history failure', 'QuotaExceededError') }
      return key === undefined ? originalPut.call(this, value) : originalPut.call(this, value, key)
    }
    let failed = false
    try { await repository.commit([{ collection: 'sources', put: [{ id: 'must-rollback', value: { content: 'not saved' }, order: 300 }] }]) } catch { failed = true }
    finally { IDBObjectStore.prototype.put = originalPut }
    const after = await repository.readRecord('workspaceHistory', 'recent')
    const sources = await repository.readCollection('sources')
    const rollback = await repository.readRecord('sources', 'must-rollback')
    repository.close(); other.close(); indexedDB.deleteDatabase(database)
    return { failed, rollback, count: sources.records.length, events: before.value.events.length, unique: new Set(before.value.events.map((event: { id: string }) => event.id)).size, safe: !JSON.stringify(before.value).includes('PRIVATE_SOURCE'), unchanged: JSON.stringify(before) === JSON.stringify(after) }
  })
  expect(result).toEqual({ failed: true, rollback: null, count: 205, events: 200, unique: 200, safe: true, unchanged: true })
})

test('local activity can be reviewed, filtered and restored through the existing workspace tools', async ({ page }, testInfo) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Operational snapshot', exact: true })).toBeVisible()
  await page.evaluate(async () => {
    const path = '/src/lib/workspace/workspaceRepository.ts'; const { openWorkspaceRepository } = await import(/* @vite-ignore */ path)
    const repository = await openWorkspaceRepository()
    const source = { id: 'history-spec', title: 'Release acceptance policy', sourceType: 'Requirement', status: 'Draft', notes: '', content: '# Security\nSessions expire after 30 minutes.', createdAt: '2026-09-05T10:00:00.000Z', updatedAt: '2026-09-05T10:00:00.000Z' }
    await repository.commit([{ collection: 'sources', put: [{ id: source.id, value: source, order: 0 }] }]); repository.close()
  })
  await page.reload()
  await page.getByRole('navigation', { name: 'Workspace pages' }).getByRole('button', { name: 'Import', exact: true }).click()
  await page.getByRole('button', { name: 'Workspace backup & restore', exact: true }).click()
  const history = page.getByRole('region', { name: 'Local workspace activity', exact: true })
  await expect(history).toContainText('Sources saved · 1')
  await history.getByRole('combobox', { name: 'Activity category', exact: true }).selectOption('execution')
  await expect(history).toContainText('No saved operations match')
  await history.getByRole('combobox', { name: 'Activity category', exact: true }).selectOption('all')
  await page.screenshot({ path: testInfo.outputPath('local-history.png') })
  const restored = await page.evaluate(async () => {
    const paths = ['/src/lib/workspace/workspaceBackupWorkerClient.ts', '/src/lib/workspace/workspaceRepository.ts', '/src/lib/workspace/workspaceBackupRepository.ts']
    const [{ processWorkspacePackage }, { openWorkspaceRepository }, { workspaceRestoreVersions }] = await Promise.all(paths.map((path) => import(/* @vite-ignore */ path)))
    const text = await processWorkspacePackage('export_current', null); const backup = await processWorkspacePackage('validate', text)
    const repository = await openWorkspaceRepository(); const expected = await workspaceRestoreVersions(repository)
    await processWorkspacePackage('restore', { backup, expected })
    const record = await repository.readRecord('workspaceHistory', 'recent'); repository.close()
    return JSON.stringify(record.value) === JSON.stringify(backup.collections.workspaceHistory[0].value)
  })
  expect(restored).toBe(true)
})
