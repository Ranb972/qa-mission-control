import { expect, test } from '@playwright/test'

// Isolated synthetic browser only. No user profile or live provider access.
test('bounded console extraction reads only the exact source and leaves every record and meta value unchanged', async ({ page }) => {
  let aiCalls = 0
  await page.route('**/api/ai/**', route => { aiCalls += 1; return route.abort() })
  await page.route('**/bounded-export-test', route => route.fulfill({ contentType: 'text/html', body: '<title>Isolated export test</title>' }))
  await page.goto('/bounded-export-test')
  const result = await page.evaluate(async () => {
    const repositoryPath = '/src/lib/workspace/workspaceRepository.ts'
    const sectionPath = '/src/features/qa-sources/qaSourceSections.ts'
    const exportPath = '/scripts/read-bounded-source-sections.ts'
    const { openWorkspaceRepository } = await import(/* @vite-ignore */ repositoryPath)
    const { createQaSourceSectionIndex } = await import(/* @vite-ignore */ sectionPath)
    const { readBoundedSourceSections } = await import(/* @vite-ignore */ exportPath)
    const content = Array.from({ length: 1246 }, (_, index) => {
      const title = index === 426 ? 'Requirement 7.8' : index === 1244 ? 'SYN_REF_F001' : `Unrelated ${index + 1}`
      return `# ${title}\n${index === 426 || index === 1244 ? 'Synthetic exact text é 🧪.\r\n' : 'UNRELATED_BODY stays private.\n'}`
    }).join('')
    const source = { id: 'selected', title: 'UNRELATED_TITLE', notes: 'UNRELATED_NOTES', sourceType: 'Requirement', status: 'Draft',
      content, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' }
    const index = createQaSourceSectionIndex(source)
    const repository = await openWorkspaceRepository()
    await repository.commit([
      { collection: 'sources', put: [{ id: 'selected', value: source, order: 0 }, { id: 'unrelated', value: { content: 'PRIVATE_UNRELATED_SOURCE' }, order: 1 }] },
      { collection: 'sectionIndexes', put: [{ id: 'selected', value: index, order: 0 }] },
      { collection: 'sectionPlans', put: [{ id: 'private-analysis', value: { prompt: 'PRIVATE_PROMPT', rawProviderResponse: 'PRIVATE_RESPONSE' }, order: 0 }] },
    ])
    repository.close()
    const snapshot = async () => {
      const db = await new Promise<IDBDatabase>(resolve => { const request = indexedDB.open('qa-mission-control-workspace'); request.onsuccess = () => resolve(request.result) })
      try {
        return await new Promise<string>(resolve => {
          const tx = db.transaction(['records', 'meta'], 'readonly')
          const records = tx.objectStore('records').getAll()
          const meta = tx.objectStore('meta').getAll()
          tx.oncomplete = () => resolve(JSON.stringify({ version: db.version, records: records.result, meta: meta.result }))
        })
      } finally { db.close() }
    }
    const targets = [{ ordinal: 427, marker: '7.8' }, { ordinal: 1245, marker: 'SYN_REF_F001' }]
    const before = await snapshot()
    const reads: string[] = []
    const original = IDBObjectStore.prototype.get
    IDBObjectStore.prototype.get = function (key) { reads.push(JSON.stringify(key)); return original.call(this, key) }
    let json: string
    try { json = await readBoundedSourceSections(targets) } finally { IDBObjectStore.prototype.get = original }
    return { json, before, after: await snapshot(), reads,
      expected: targets.map(target => content.slice(index.sections[target.ordinal - 1].startOffset, index.sections[target.ordinal - 1].endOffset)) }
  })
  expect(result.before).toBe(result.after)
  expect(result.reads).toEqual(['["sources","selected"]'])
  expect(result.json).not.toMatch(/UNRELATED|PRIVATE_|prompt|rawProviderResponse/)
  const exported = JSON.parse(result.json)
  expect(exported.sections.map((section: { visibleSection: { content: string } }) => section.visibleSection.content)).toEqual(result.expected)
  expect(exported.sections.map((section: { sectionSnapshot: { ordinal: number } }) => section.sectionSnapshot.ordinal)).toEqual([427, 1245])
  expect(aiCalls).toBe(0)
})

test('missing or ambiguous workspaces fail closed without creating a database or selecting a source', async ({ page }) => {
  await page.route('**/bounded-export-test', route => route.fulfill({ contentType: 'text/html', body: '<title>Isolated export test</title>' }))
  await page.goto('/bounded-export-test')
  const result = await page.evaluate(async () => {
    const exportPath = '/scripts/read-bounded-source-sections.ts'
    const repositoryPath = '/src/lib/workspace/workspaceRepository.ts'
    const sectionPath = '/src/features/qa-sources/qaSourceSections.ts'
    const { readBoundedSourceSections } = await import(/* @vite-ignore */ exportPath)
    const { openWorkspaceRepository } = await import(/* @vite-ignore */ repositoryPath)
    const { createQaSourceSectionIndex } = await import(/* @vite-ignore */ sectionPath)
    const targets = [{ ordinal: 1, marker: '7.8' }, { ordinal: 2, marker: 'SYN_REF_F001' }]
    const before = await indexedDB.databases()
    const missing = await readBoundedSourceSections(targets).catch((error: Error) => error.message)
    const after = await indexedDB.databases()
    const repository = await openWorkspaceRepository()
    const values = ['first', 'second'].map(id => ({ id, title: 'Private title', notes: '', sourceType: 'Requirement', status: 'Draft',
      content: '# Requirement 7.8\nSynthetic.\n# SYN_REF_F001\nSynthetic detailed section.', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' }))
    await repository.commit([{ collection: 'sectionIndexes', put: values.map((value, order) => ({ id: value.id, value: createQaSourceSectionIndex(value), order })) }])
    repository.close()
    let sourceReads = 0
    const original = IDBObjectStore.prototype.get
    IDBObjectStore.prototype.get = function (key) { sourceReads += 1; return original.call(this, key) }
    let ambiguous: string
    try { ambiguous = await readBoundedSourceSections(targets).catch((error: Error) => error.message) } finally { IDBObjectStore.prototype.get = original }
    return { before, after, missing, ambiguous, sourceReads }
  })
  expect(result.after).toEqual(result.before)
  expect(result.missing).toMatch(/^Bounded export refused:/)
  expect(result.ambiguous).toMatch(/^Bounded export refused:/)
  expect(result.sourceReads).toBe(0)
})
