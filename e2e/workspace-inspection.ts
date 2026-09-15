import type { Page } from '@playwright/test'

declare global {
  interface Window {
    qaReadPersistedCollection: (name: string) => Promise<string | null>
    qaWritePersistedCollection: (name: string, json: string) => Promise<void>
  }
}

/** Test-only inspection of the actual database. JSON envelopes retain existing assertion shapes, not a localStorage mirror. */
export async function installWorkspaceInspection(page: Page) {
  await page.addInitScript(() => {
    const collectionNames: Record<string, string> = {
      'qa-mission-control:test-cases:v0.1': 'testCases',
      'qa-mission-control:qa-sources:v0.12': 'sources',
      'qa-mission-control:ai-coverage-plans:v0.18': 'coveragePlans',
      'qa-mission-control:ai-section-coverage-plans:v0.21': 'sectionPlans',
    }
    window.qaReadPersistedCollection = async (key) => {
      const modulePath = '/src/lib/workspace/workspaceRepository.ts'
      const { openWorkspaceRepository } = await import(/* @vite-ignore */ modulePath)
      const repository = await openWorkspaceRepository()
      try {
        const name = collectionNames[key]
        if (!name) throw new Error('Unknown inspection collection')
        const saved = await repository.readCollection(name)
        if (!saved.records.length) return null
        const values = saved.records.map((record: { value: unknown }) => record.value)
        return JSON.stringify(name === 'coveragePlans' || name === 'sectionPlans' ? { storageSchemaVersion: 1, records: values } : values)
      } finally { repository.close() }
    }
    window.qaWritePersistedCollection = async (key, json) => {
      const modulePath = '/src/lib/workspace/workspaceRepository.ts'
      const { openWorkspaceRepository } = await import(/* @vite-ignore */ modulePath)
      const repository = await openWorkspaceRepository()
      try {
        const name = collectionNames[key]
        if (!name) throw new Error('Unknown inspection collection')
        const parsed = JSON.parse(json)
        const values = Array.isArray(parsed) ? parsed : parsed.records
        await repository.commit([{ collection: name, replace: true,
          put: values.map((value: { id: string }, order: number) => ({ id: value.id, value, order })) }])
      } finally { repository.close() }
    }
  })
}
