import { useRef, useState, useSyncExternalStore } from 'react'
import { useWorkspace } from '../workspace/workspaceContext'
import type { CoreCollectionName, CoreCollections } from '../workspace/workspaceSchema'

type LoadCollectionResult<TItem> = {
  items: TItem[]
  error: string | null
}

type SaveCollectionResult = {
  ok: boolean
  error: string | null
}

type UsePersistedCollectionOptions<TItem> = {
  collection?: CoreCollectionName
  load: () => LoadCollectionResult<TItem>
  save: (items: TItem[]) => SaveCollectionResult
}
const noSubscription = () => () => undefined

export function usePersistedCollection<TItem>({
  collection,
  load,
  save,
}: UsePersistedCollectionOptions<TItem>) {
  const workspace = useWorkspace()
  const externalItems = useSyncExternalStore(workspace?.subscribe ?? noSubscription,
    () => workspace && collection ? workspace.get(collection).items as TItem[] : null)
  const [initialLoadResult] = useState(() => workspace && collection
    ? { items: workspace.get(collection).items as TItem[], error: null }
    : load())
  const [items, setItems] = useState<TItem[]>(initialLoadResult.items)
  const [error, setError] = useState<string | null>(initialLoadResult.error)
  const [isSaving, setIsSaving] = useState(false)
  const saveSequence = useRef(0)

  async function handleChange(nextItems: TItem[]) {
    const sequence = ++saveSequence.current
    setIsSaving(true)
    const saveResult = workspace && collection
      ? await workspace.save(collection, nextItems as CoreCollections[typeof collection][])
      : save(nextItems)
    if (sequence === saveSequence.current) {
      // A visible successful row represents a completed transaction, not merely a queued write.
      setItems(saveResult.ok && workspace && collection ? workspace.get(collection).items as TItem[] : nextItems)
      setError(saveResult.error)
      setIsSaving(false)
    }
    return saveResult
  }

  function acceptSavedItems(nextItems: TItem[]) {
    setItems(nextItems)
    setError(null)
  }

  async function commitChange(nextItems: TItem[]) {
    const result = workspace && collection
      ? await workspace.save(collection, nextItems as CoreCollections[typeof collection][])
      : save(nextItems)
    setError(result.error)
    if (result.ok) setItems(nextItems)
    return result
  }

  return {
    items: error ? items : externalItems ?? items,
    onChange: handleChange,
    acceptSavedItems,
    commitChange,
    error,
    isSaving,
  }
}
