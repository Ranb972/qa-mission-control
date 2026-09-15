import type { Page } from '@playwright/test'

/** Inject failure inside the actual dedicated writer worker, not a mocked save API. */
export async function failWorkerCollectionWrite(page: Page, collection: string) {
  const pattern = '**/workspaceBackup.worker.ts*'
  await page.route(pattern, async (route) => {
    const response = await route.fetch()
    const original = await response.text()
    const injection = `const qaOriginalPut = IDBObjectStore.prototype.put;
IDBObjectStore.prototype.put = function(value, key) {
  if (value?.collection === ${JSON.stringify(collection)}) { IDBObjectStore.prototype.put = qaOriginalPut; this.transaction.abort(); throw new DOMException('Injected worker transaction failure', 'QuotaExceededError'); }
  return key === undefined ? qaOriginalPut.call(this, value) : qaOriginalPut.call(this, value, key);
};\n`
    await route.fulfill({ response, body: injection + original })
  })
  return () => page.unroute(pattern)
}
