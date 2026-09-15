import { CORE_COLLECTIONS, coreParsers, coreRecordId, validateCoreCollection, type CoreCollectionName, type CoreCollections, type CoreWorkspace } from './workspaceSchema'
import type { CommitOptions, WorkspaceRepository } from './workspaceRepository'
import { migrateLegacyWorkspace } from './workspaceMigration'

export type WorkspaceSaveResult = { ok: boolean; error: string | null }
type CoreState = { [K in CoreCollectionName]: { items: CoreCollections[K][]; version: number } }

export class WorkspaceClient {
  readonly repository: WorkspaceRepository
  readonly migrationWarnings: string[]
  private state: CoreState
  private queues = new Map<CoreCollectionName, Promise<unknown>>()
  private listeners = new Set<() => void>()
  private changeNumber = 0

  constructor(repository: WorkspaceRepository, state: CoreState, warnings: string[]) {
    this.repository = repository
    this.state = state
    this.migrationWarnings = warnings
  }

  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  getChangeNumber = () => this.changeNumber

  get<K extends CoreCollectionName>(name: K): CoreState[K] { return this.state[name] }

  async refresh<K extends CoreCollectionName>(name: K) {
    const loaded = await this.repository.readCollection<CoreCollections[K]>(name)
    if (loaded.version !== this.state[name].version) {
      const items = validateCoreCollection(name, loaded.records.map((record) => record.value))
      this.set(name, items, loaded.version)
    }
    return this.get(name)
  }

  private set<K extends CoreCollectionName>(name: K, items: CoreCollections[K][], version: number) {
    this.state[name] = { items, version } as CoreState[K]
    this.changeNumber += 1
    this.listeners.forEach((listener) => listener())
  }

  /** Serialize writes in this tab and compare versions atomically against other tabs. */
  save<K extends CoreCollectionName>(name: K, items: CoreCollections[K][], checks: CommitOptions = {}): Promise<WorkspaceSaveResult> {
    // Capture the caller's base before queuing. Two rapid independent additions must not delete each other.
    const baseItems = this.get(name).items
    const preceding = this.queues.get(name) ?? Promise.resolve()
    const task = preceding.then(async () => {
      try {
        const current = this.get(name)
        const baseById = new Map(baseItems.map((value) => [coreRecordId(name, value), value]))
        const intendedIds = new Set(items.map((value) => coreRecordId(name, value)))
        const removedIds = new Set(Array.from(baseById.keys()).filter((id) => !intendedIds.has(id)))
        const rebased = new Map(current.items.filter((value) => !removedIds.has(coreRecordId(name, value))).map((value) => [coreRecordId(name, value), value]))
        for (const value of items) {
          const id = coreRecordId(name, value)
          if (baseById.get(id) !== value) rebased.set(id, value)
        }
        const orderedIds = [...items.map((value) => coreRecordId(name, value)), ...Array.from(rebased.keys()).filter((id) => !intendedIds.has(id))]
        const nextItems = orderedIds.flatMap((id) => rebased.has(id) ? [rebased.get(id)!] : [])
        const oldById = new Map(current.items.map((value, order) => [coreRecordId(name, value), { value, order }]))
        const ids = new Set<string>()
        const put = []
        for (let order = 0; order < nextItems.length; order += 1) {
          const value = nextItems[order]
          const id = coreRecordId(name, value)
          if (!id || ids.has(id)) throw new Error('Workspace update contains invalid or duplicate identities.')
          ids.add(id)
          const previous = oldById.get(id)
          if (previous?.value === value && previous.order === order) continue
          const parsed = coreParsers[name](value)
          if (!parsed) throw new Error('Workspace update contains invalid data. Previously saved data was not replaced.')
          put.push({ id, value: parsed, order })
        }
        const remove = Array.from(oldById.keys()).filter((id) => !ids.has(id))
        const versions = await this.repository.commit([{ collection: name, put, remove }], {
          ...checks, collectionChecks: [{ collection: name, version: current.version }, ...(checks.collectionChecks ?? [])],
        })
        const persisted = new Map(put.map((record) => [record.id, record.value as CoreCollections[K]]))
        // Display exactly what the validated transaction persisted, not fields a
        // serializer deliberately omitted. Otherwise refresh can contradict "saved" UI.
        this.set(name, nextItems.map((value) => persisted.get(coreRecordId(name, value)) ?? value), versions[name])
        return { ok: true, error: null }
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : 'Workspace changes could not be saved. Previously saved data was preserved.' }
      }
    })
    this.queues.set(name, task)
    return task
  }

  snapshot(): CoreWorkspace {
    return Object.fromEntries(CORE_COLLECTIONS.map((name) => [name, this.state[name].items])) as CoreWorkspace
  }
}

export async function initializeWorkspaceClient(repository: WorkspaceRepository): Promise<WorkspaceClient> {
  const migration = await migrateLegacyWorkspace(repository)
  const entries = await Promise.all(CORE_COLLECTIONS.map(async (name) => {
    const loaded = await repository.readCollection(name)
    const items = validateCoreCollection(name, loaded.records.map((record) => record.value))
    return [name, { items, version: loaded.version }]
  }))
  return new WorkspaceClient(repository, Object.fromEntries(entries) as CoreState, migration.warnings)
}
