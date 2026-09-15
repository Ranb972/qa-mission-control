import { activityForChanges, appendActivity, parseActivityLedger, type ActivityLedger } from './workspaceHistory'

export const WORKSPACE_DATABASE = 'qa-mission-control-workspace'
// v2 removed duplicate artifact metadata; v3 closes pre-product-evidence writers
// whose source serializers cannot preserve the new canonical evidence metadata.
// Stores and all existing records are retained; no destructive migration.
const DATABASE_VERSION = 3
export const STORAGE_ERROR = 'Workspace storage could not complete this operation. Previously saved data was not replaced. Keep this tab open and export a backup before clearing browser data.'
export const CONFLICT_ERROR = 'This data changed in another operation or tab. Reload the latest saved state before trying again.'

export type StoredRecord<T = unknown> = {
  collection: string
  id: string
  value: T
  order: number
  version: number
  sourceId?: string
}

export type RecordWrite = Pick<StoredRecord, 'id' | 'value' | 'order' | 'sourceId'>
export type CollectionChange = {
  collection: string
  put?: RecordWrite[]
  remove?: string[]
  /** Full replacement is reserved for explicitly confirmed restore/migration operations. */
  replace?: boolean
}
export type CommitOptions = {
  collectionChecks?: Array<{ collection: string; version: number }>
  recordChecks?: Array<{ collection: string; id: string; version: number | null }>
  metadata?: Array<{ id: string; value: unknown }>
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(new Error(STORAGE_ERROR))
    transaction.onerror = () => { /* onabort reports the bounded error once. */ }
  })
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(new Error(STORAGE_ERROR))
  })
}

function validKey(value: string) {
  return typeof value === 'string' && value.length > 0 && value.length <= 2000
}
const recordVersionKey = (collection: string, id: string) => `record:${JSON.stringify([collection, id])}`

/** Real asynchronous, per-record IndexedDB persistence. No localStorage mirror or fire-and-forget saves. */
export class WorkspaceRepository {
  private database: IDBDatabase
  private closed = false

  constructor(database: IDBDatabase) {
    this.database = database
    database.onversionchange = () => this.close()
  }

  close() {
    this.closed = true
    this.database.close()
  }

  private transaction(mode: IDBTransactionMode) {
    if (this.closed) throw new Error('Workspace storage was upgraded in another tab. Reload this tab to continue safely.')
    try { return this.database.transaction(['records', 'meta'], mode) }
    catch { throw new Error(STORAGE_ERROR) }
  }

  async readCollection<T>(collection: string): Promise<{ records: StoredRecord<T>[]; version: number }> {
    const transaction = this.transaction('readonly')
    const done = transactionDone(transaction)
    const [records, metadata] = await Promise.all([
      requestResult(transaction.objectStore('records').index('collection').getAll(collection)) as Promise<StoredRecord<T>[]>,
      requestResult(transaction.objectStore('meta').get(`collection:${collection}`)), done,
    ])
    return { records: records.sort((left, right) => left.order - right.order || left.id.localeCompare(right.id)), version: metadata?.value ?? 0 }
  }

  async readRecord<T>(collection: string, id: string): Promise<StoredRecord<T> | null> {
    const transaction = this.transaction('readonly')
    const [record] = await Promise.all([
      requestResult(transaction.objectStore('records').get([collection, id])), transactionDone(transaction),
    ])
    return record ?? null
  }

  /** Portable exports read all included collections and versions in one coherent snapshot. */
  async readCollectionsSnapshot(collections: readonly string[]) {
    const transaction = this.transaction('readonly')
    const done = transactionDone(transaction)
    const reads = collections.map(async (name) => {
      const [records, metadata] = await Promise.all([
        requestResult(transaction.objectStore('records').index('collection').getAll(name)) as Promise<StoredRecord[]>,
        requestResult(transaction.objectStore('meta').get(`collection:${name}`)),
      ])
      return [name, { records: records.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)), version: metadata?.value ?? 0 }] as const
    })
    const [entries] = await Promise.all([Promise.all(reads), done])
    return Object.fromEntries(entries)
  }

  async readSourceRecords<T>(collection: string, sourceId: string): Promise<StoredRecord<T>[]> {
    const transaction = this.transaction('readonly')
    const [records] = await Promise.all([
      requestResult(transaction.objectStore('records').index('source').getAll([collection, sourceId])), transactionDone(transaction),
    ])
    return records.sort((left: StoredRecord<T>, right: StoredRecord<T>) => left.order - right.order)
  }

  async readMetadata<T>(id: string): Promise<T | null> {
    const transaction = this.transaction('readonly')
    const [record] = await Promise.all([requestResult(transaction.objectStore('meta').get(id)), transactionDone(transaction)])
    return record?.value ?? null
  }

  async readSourceBundle(collections: readonly string[], sourceId: string): Promise<Record<string, StoredRecord[]>> {
    const bundle = await this.readSourceBundleWithVersions(collections, sourceId)
    return Object.fromEntries(Object.entries(bundle).map(([name, value]) => [name, value.records]))
  }

  async readSourceBundleWithVersions(collections: readonly string[], sourceId: string): Promise<Record<string, { records: StoredRecord[]; version: number }>> {
    const transaction = this.transaction('readonly')
    const done = transactionDone(transaction)
    const reads = collections.map(async (name) => {
      const [records, metadata] = await Promise.all([
        requestResult(transaction.objectStore('records').index('source').getAll([name, sourceId])),
        requestResult(transaction.objectStore('meta').get(`collection:${name}`)),
      ])
      return [name, { records: records.sort((left: StoredRecord, right: StoredRecord) => left.order - right.order), version: metadata?.value ?? 0 }] as const
    })
    const [entries] = await Promise.all([Promise.all(reads), done])
    return Object.fromEntries(entries)
  }

  /** Checks and writes share one transaction: late source results cannot pass a time-of-check race. */
  async commit(changes: CollectionChange[], options: CommitOptions = {}): Promise<Record<string, number>> {
    const names = changes.map((change) => change.collection)
    if (new Set(names).size !== names.length || changes.some((change) =>
      !validKey(change.collection) || (change.put ?? []).some((record) => !validKey(record.id) || !Number.isSafeInteger(record.order)) ||
      new Set((change.put ?? []).map((record) => record.id)).size !== (change.put ?? []).length ||
      (change.remove ?? []).some((id) => !validKey(id)))) throw new Error('Workspace update contains invalid or duplicate identities.')
    const transaction = this.transaction('readwrite')
    const records = transaction.objectStore('records')
    const meta = transaction.objectStore('meta')
    let conflict = false
    let synchronousFailure = false
    const versions: Record<string, number> = Object.create(null)
    const activity = activityForChanges(changes)
    let ledger: ActivityLedger = { id: 'recent', events: [] }
    const readNames = new Set([...names, ...(options.collectionChecks ?? []).map((check) => check.collection), ...(activity.length ? ['workspaceHistory'] : [])])
    const pendingCount = readNames.size + (options.recordChecks?.length ?? 0) + (activity.length ? 1 : 0)
    let pending = pendingCount
    const done = transactionDone(transaction).catch(() => { throw new Error(conflict ? CONFLICT_ERROR : STORAGE_ERROR) })
    const abort = () => { try { transaction.abort() } catch { /* A request may already have aborted the transaction; done still reports its failure. */ } }

    const write = () => {
      if (conflict) { abort(); return }
      try {
        for (const change of changes) {
          const nextVersion = (versions[change.collection] ?? 0) + 1
          const put = () => {
            try {
            for (const id of change.remove ?? []) {
              records.delete([change.collection, id])
              if (change.collection === 'sources') meta.put({ id: recordVersionKey(change.collection, id), value: { version: null } })
            }
            for (const item of change.put ?? []) {
              records.put({ ...item, collection: change.collection, version: nextVersion })
              if (change.collection === 'sources') meta.put({ id: recordVersionKey(change.collection, item.id), value: { version: nextVersion } })
            }
            } catch {
              synchronousFailure = true
              abort()
            }
          }
          if (change.replace) {
            const cursor = records.index('collection').openKeyCursor(change.collection)
            cursor.onsuccess = () => {
              if (cursor.result) {
                records.delete(cursor.result.primaryKey)
                if (change.collection === 'sources') meta.put({ id: recordVersionKey(change.collection, String((cursor.result.primaryKey as IDBValidKey[])[1])), value: { version: null } })
                cursor.result.continue()
              }
              else put()
            }
          } else put()
          versions[change.collection] = nextVersion
          meta.put({ id: `collection:${change.collection}`, value: nextVersion })
        }
        for (const item of options.metadata ?? []) {
          if (!validKey(item.id) || item.id.startsWith('collection:') || item.id.startsWith('record:')) throw new Error(STORAGE_ERROR)
          meta.put(item)
        }
        if (activity.length) {
          const version = (versions.workspaceHistory ?? 0) + 1
          records.put({ collection: 'workspaceHistory', id: 'recent', order: 0, version, value: appendActivity(ledger, activity) })
          meta.put({ id: 'collection:workspaceHistory', value: version })
          versions.workspaceHistory = version
        }
      } catch { synchronousFailure = true; abort() }
    }
    const resolved = () => { pending -= 1; if (pending === 0) write() }
    if (activity.length) {
      const request = records.get(['workspaceHistory', 'recent'])
      request.onsuccess = () => {
        const parsed = request.result ? parseActivityLedger(request.result.value) : ledger
        if (!parsed) { synchronousFailure = true; abort(); return }
        ledger = parsed; resolved()
      }
    }
    for (const name of readNames) {
      const request = meta.get(`collection:${name}`)
      request.onsuccess = () => {
        const version: number = request.result?.value ?? 0
        versions[name] = version
        if (options.collectionChecks?.some((check) => check.collection === name && check.version !== version)) conflict = true
        resolved()
      }
    }
    for (const check of options.recordChecks ?? []) {
      if (check.collection !== 'sources') {
        // These bounded artifacts already carry their authoritative version.
        // Avoid doubling every one of tens of thousands of graph writes.
        const request = records.get([check.collection, check.id])
        request.onsuccess = () => {
          if ((request.result?.version ?? null) !== check.version) conflict = true
          resolved()
        }
        continue
      }
      // Check tiny atomic version metadata, not a multi-megabyte source body on every task transition.
      const request = meta.get(recordVersionKey(check.collection, check.id))
      request.onsuccess = () => {
        if (request.result) {
          if (request.result.value.version !== check.version) conflict = true
          resolved()
        } else {
          // Backward-compatible lazy initialization for records written before version metadata existed.
          const legacy = records.get([check.collection, check.id])
          legacy.onsuccess = () => {
            const version = legacy.result?.version ?? null
            meta.put({ id: recordVersionKey(check.collection, check.id), value: { version } })
            if (version !== check.version) conflict = true
            resolved()
          }
        }
      }
    }
    if (pendingCount === 0) write()
    await done
    if (synchronousFailure) throw new Error(STORAGE_ERROR)
    return versions
  }
}

export function openWorkspaceRepository(name = WORKSPACE_DATABASE): Promise<WorkspaceRepository> {
  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest
    let rejected = false
    try { request = indexedDB.open(name, DATABASE_VERSION) }
    catch { reject(new Error(STORAGE_ERROR)); return }
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains('records')) {
        const records = database.createObjectStore('records', { keyPath: ['collection', 'id'] })
        records.createIndex('collection', 'collection')
        records.createIndex('source', ['collection', 'sourceId'])
      }
      if (!database.objectStoreNames.contains('meta')) database.createObjectStore('meta', { keyPath: 'id' })
    }
    request.onsuccess = () => {
      if (rejected) request.result.close()
      else resolve(new WorkspaceRepository(request.result))
    }
    request.onerror = () => reject(new Error(STORAGE_ERROR))
    request.onblocked = () => {
      rejected = true
      reject(new Error('An older QA Mission Control tab is holding storage open. Close that tab and reload. No saved data was deleted.'))
    }
  })
}
