import type { QaSource } from '../qa-sources/qaSourceTypes'
export const SOURCE_SET_MAX_MEMBERS = 100
export type SourceSet = { id: string; name: string; description: string; members: Array<{ sourceId: string; sourceCreatedAt: string }>; createdAt: string; updatedAt: string; schemaVersion: 1 }
const text = (value: unknown, max: number, empty = false): value is string => typeof value === 'string' && value.length <= max && (empty || value.trim().length > 0)
export function parseSourceSet(value: unknown): SourceSet | null {
  if (!value || typeof value !== 'object') return null
  const item = value as Record<string, unknown>
  if (item.schemaVersion !== 1 || !text(item.id, 200) || !text(item.name, 120) || !text(item.description, 1000, true) ||
    !text(item.createdAt, 80) || !Number.isFinite(Date.parse(item.createdAt)) || !text(item.updatedAt, 80) || !Number.isFinite(Date.parse(item.updatedAt)) ||
    !Array.isArray(item.members) || item.members.length < 1 || item.members.length > SOURCE_SET_MAX_MEMBERS) return null
  const members: SourceSet['members'] = []
  const ids = new Set<string>()
  for (const raw of item.members) {
    if (!raw || typeof raw !== 'object') return null
    const member = raw as Record<string, unknown>
    if (!text(member.sourceId, 2000) || ids.has(member.sourceId) || !text(member.sourceCreatedAt, 80) || !Number.isFinite(Date.parse(member.sourceCreatedAt))) return null
    ids.add(member.sourceId)
    members.push({ sourceId: member.sourceId, sourceCreatedAt: member.sourceCreatedAt })
  }
  return { schemaVersion: 1, id: item.id, name: item.name, description: item.description, members, createdAt: item.createdAt, updatedAt: item.updatedAt }
}
export function sourceSetMembers(set: SourceSet, sources: QaSource[]) {
  const byId = new Map(sources.map((source) => [source.id, source]))
  return set.members.map((member) => ({ member, source: byId.get(member.sourceId)?.createdAt === member.sourceCreatedAt ? byId.get(member.sourceId)! : null }))
}
