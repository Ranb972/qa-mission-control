import { describe, expect, it } from 'vitest'
import { parseSourceSet, sourceSetMembers } from './sourceSetModel'
import type { QaSource } from '../qa-sources/qaSourceTypes'
const set = { schemaVersion: 1, id: 'set', name: 'Commerce', description: '', members: [{ sourceId: 'a', sourceCreatedAt: '2026-01-01' }, { sourceId: 'b', sourceCreatedAt: '2026-01-01' }], createdAt: '2026-01-01', updatedAt: '2026-01-01' }
describe('explicit source set identities', () => {
  it('copies only bounded app-owned membership and metadata', () => {
    expect(parseSourceSet({ ...set, providerToken: 'not durable' })).toEqual(set)
    expect(parseSourceSet({ ...set, members: [] })).toBeNull()
    expect(parseSourceSet({ ...set, members: set.members.slice(0, 1) })?.members).toHaveLength(1)
    expect(parseSourceSet({ ...set, members: [set.members[0], set.members[0]] })).toBeNull()
    expect(parseSourceSet({ ...set, name: 'x'.repeat(121) })).toBeNull()
    expect(parseSourceSet({ ...set, members: Array.from({ length: 101 }, (_, id) => ({ sourceId: String(id), sourceCreatedAt: '2026-01-01' })) })).toBeNull()
  })
  it('never includes unrelated sources or silently reattaches a deleted source identity', () => {
    const parsed = parseSourceSet(set)!
    const sources = [{ id: 'a', createdAt: '2026-01-01' }, { id: 'b', createdAt: '2026-02-01' }, { id: 'unrelated', createdAt: '2026-01-01' }] as QaSource[]
    expect(sourceSetMembers(parsed, sources).map((item) => item.source?.id ?? null)).toEqual(['a', null])
  })
})
