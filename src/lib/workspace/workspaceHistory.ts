import type { CollectionChange } from './workspaceRepository'

export const HISTORY_LIMIT = 200
export const HISTORY_CATEGORIES = ['sources', 'coverage', 'test_design', 'test_traceability', 'execution', 'analysis', 'bugs', 'risks', 'suites', 'releases', 'source_sets', 'evidence_review'] as const
export const HISTORY_ACTIONS = ['saved', 'removed', 'running', 'completed', 'partial', 'paused', 'canceled'] as const
export type ActivityItem = { category: typeof HISTORY_CATEGORIES[number]; action: typeof HISTORY_ACTIONS[number]; count: number }
export type WorkspaceActivity = { id: string; at: string; items: ActivityItem[] }
export type ActivityLedger = { id: 'recent'; events: WorkspaceActivity[] }
const categories: Record<string, ActivityItem['category']> = { sources: 'sources', coveragePlans: 'coverage', sectionPlans: 'coverage', sourceCoveragePlans: 'coverage', testCases: 'test_design', requirementTestLinks: 'test_traceability', executions: 'execution', bugs: 'bugs', risks: 'risks', testSuites: 'suites', releases: 'releases', releaseRequirementBaselines: 'releases', sourceSets: 'source_sets', productEvidenceReviews: 'evidence_review' }
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
export function activityForChanges(changes: CollectionChange[]): ActivityItem[] {
  // A confirmed restore brings its own history. Do not fabricate the history of a backup or migration.
  if (changes.some((change) => change.replace || change.collection === 'workspaceHistory')) return []
  return changes.flatMap((change): ActivityItem[] => {
    if (change.collection === 'analysisJobs') return (change.put ?? []).flatMap((row) => {
      const status = object(row.value).status
      return ['running', 'completed', 'partial', 'paused', 'canceled'].includes(String(status)) ? [{ category: 'analysis', action: status as ActivityItem['action'], count: 1 }] : []
    })
    const category = categories[change.collection]
    if (!category) return []
    return [...(change.put?.length ? [{ category, action: 'saved' as const, count: change.put.length }] : []), ...(change.remove?.length ? [{ category, action: 'removed' as const, count: change.remove.length }] : [])]
  }).slice(0, 24)
}
export function parseActivityLedger(raw: unknown): ActivityLedger | null {
  const value = object(raw)
  if (value.id !== 'recent' || Object.keys(value).some((key) => !['id', 'events'].includes(key)) || !Array.isArray(value.events) || value.events.length > HISTORY_LIMIT) return null
  const ids = new Set<string>(); const events: WorkspaceActivity[] = []
  for (const event of value.events) {
    const row = object(event)
    if (Object.keys(row).some((key) => !['id', 'at', 'items'].includes(key)) || typeof row.id !== 'string' || !/^[a-f0-9-]{36}$/.test(row.id) || ids.has(row.id) || typeof row.at !== 'string' || row.at.length > 80 || !Number.isFinite(Date.parse(row.at)) || !Array.isArray(row.items) || !row.items.length || row.items.length > 24) return null
    const items: ActivityItem[] = []
    for (const entry of row.items) {
      const item = object(entry)
      if (Object.keys(item).some((key) => !['category', 'action', 'count'].includes(key)) || !HISTORY_CATEGORIES.includes(item.category as ActivityItem['category']) || !HISTORY_ACTIONS.includes(item.action as ActivityItem['action']) || !Number.isSafeInteger(item.count) || Number(item.count) < 1 || Number(item.count) > 500000) return null
      items.push({ category: item.category as ActivityItem['category'], action: item.action as ActivityItem['action'], count: item.count as number })
    }
    ids.add(row.id); events.push({ id: row.id, at: row.at, items })
  }
  return { id: 'recent', events }
}
export function appendActivity(previous: ActivityLedger, items: ActivityItem[], at = new Date().toISOString()): ActivityLedger {
  return { id: 'recent', events: [{ id: crypto.randomUUID(), at, items }, ...previous.events].slice(0, HISTORY_LIMIT) }
}
