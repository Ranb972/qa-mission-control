import { describe, expect, it } from 'vitest'
import { createQaSourceSectionIndex } from '../src/features/qa-sources/qaSourceSections'
import { fingerprint } from '../src/features/document-intelligence/documentFingerprint'
import type { QaSource } from '../src/features/qa-sources/qaSourceTypes'
import { projectBoundedSourceSections } from './read-bounded-source-sections'

const targets = [{ ordinal: 2, marker: '7.8' }, { ordinal: 4, marker: 'SVA_AS_F001' }]
const source: QaSource = { id: 'synthetic-source', title: 'PRIVATE_TITLE', notes: 'PRIVATE_NOTES',
  sourceType: 'Requirement', status: 'Draft', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
  content: '# Unrelated\nPRIVATE_BODY stays private.\n# Requirement 7.8\n- Audité identity;\r\n- 日期 🧪.\n# Unrelated next\nPRIVATE_NEXT_BODY stays private.\n# SVA_AS_F001\nStatus: M\nDetailed synthetic requirement shall validate input.\n# Last\nPRIVATE_LAST_BODY stays private.' }

describe('read-only bounded source projection', () => {
  it('exports exact Unicode slices and only whitelisted target provenance, without mutating inputs', async () => {
    const index = createQaSourceSectionIndex(source)
    const before = JSON.stringify([source, index])
    const json = await projectBoundedSourceSections(source, index, targets)
    expect(json).not.toContain('PRIVATE_')
    const result = JSON.parse(json)
    expect(result.sections).toHaveLength(2)
    for (const [position, target] of targets.entries()) {
      const section = index.sections[target.ordinal - 1]
      expect(result.sections[position].visibleSection.content).toBe(source.content.slice(section.startOffset, section.endOffset))
      expect(result.sections[position].visibleSection.truncated).toBe(false)
      expect(result.sections[position].location).toMatchObject({ pageProvenance: 'unavailable', pages: [] })
    }
    expect(JSON.stringify([source, index])).toBe(before)
    expect(new TextDecoder().decode(new TextEncoder().encode(json))).toBe(json)
  })

  it('exports only intersecting current page coordinates; stale page attribution is explicitly unavailable', async () => {
    const split = source.content.indexOf('# Unrelated next')
    const imported = { ...source, documentImport: { schemaVersion: 1 as const, fileName: 'PRIVATE_FILE.pdf', format: 'pdf' as const,
      contentFingerprint: await fingerprint(source.content), blocks: [], pages: [
        { number: 1, startOffset: 0, endOffset: split, status: 'pending' as const, extraction: 'text' as const },
        { number: 2, startOffset: split, endOffset: source.content.length, status: 'pending' as const, extraction: 'text' as const },
      ] } }
    const index = createQaSourceSectionIndex(imported)
    const json = await projectBoundedSourceSections(imported, index, targets)
    expect(json).not.toContain('PRIVATE_')
    expect(JSON.parse(json).sections.map((section: { location: { pages: { number: number }[] } }) => section.location.pages.map(page => page.number))).toEqual([[1], [2]])
    imported.documentImport.contentFingerprint = '0'.repeat(64)
    expect(JSON.parse(await projectBoundedSourceSections(imported, index, targets)).sections[0].location).toMatchObject({ pageProvenance: 'unavailable', pages: [] })
  })

  it.each(['stale revision', 'clipped offsets', 'wrong marker', 'duplicate target', 'oversized', 'credential', 'malformed Unicode'])('refuses %s without outputting any source data', async reason => {
    const next = structuredClone(source)
    const index = createQaSourceSectionIndex(next)
    let requested = structuredClone(targets)
    if (reason === 'stale revision') next.updatedAt = '2026-09-02T00:00:00.000Z'
    if (reason === 'clipped offsets') index.sections[1].startOffset += 1
    if (reason === 'wrong marker') requested[0].marker = '7.80'
    if (reason === 'duplicate target') requested = [targets[0], targets[0]]
    if (reason === 'oversized') next.content = next.content.replace('Audité identity', 'x'.repeat(25_000))
    if (reason === 'credential') next.content = next.content.replace('Audité identity', 'api_key=synthetic-secret-value')
    if (reason === 'malformed Unicode') next.content = next.content.replace('Audité identity', '\uD800')
    const currentIndex = ['oversized', 'credential', 'malformed Unicode'].includes(reason) ? createQaSourceSectionIndex(next) : index
    await expect(projectBoundedSourceSections(next, currentIndex, requested)).rejects.toThrow(/^Bounded export refused:/)
  })
})
