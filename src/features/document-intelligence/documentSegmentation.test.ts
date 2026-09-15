import { webcrypto } from 'node:crypto'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { buildDocumentSnapshot, MAX_UNIT_BYTES, MAX_UNIT_CHARACTERS } from './documentSegmentation'
import { createEnterpriseFixture } from './enterpriseFixture'
import type { QaSource } from '../qa-sources/qaSourceTypes'

beforeAll(() => { vi.stubGlobal('crypto', webcrypto) })

const source = (content: string): QaSource => ({
  id: 'source-test', title: 'Enterprise requirements', content, notes: '',
  sourceType: 'Requirement', status: 'Draft',
  createdAt: '2026-09-05T10:00:00.000Z', updatedAt: '2026-09-05T10:00:00.000Z',
})

async function assertComplete(content: string) {
  const result = await buildDocumentSnapshot(source(content))
  expect(result.units.map((unit) => content.slice(unit.location.startOffset, unit.location.endOffset)).join('')).toBe(content)
  expect(result.blocks.map((block) => content.slice(block.location.startOffset, block.location.endOffset)).join('')).toBe(content)
  for (const unit of result.units) {
    const text = content.slice(unit.location.startOffset, unit.location.endOffset)
    expect(text.length).toBeLessThanOrEqual(MAX_UNIT_CHARACTERS)
    expect(unit.byteCount).toBeLessThanOrEqual(MAX_UNIT_BYTES)
    expect(text.isWellFormed()).toBe(true)
    expect(unit.blockIds.length).toBeGreaterThan(0)
  }
  expect(new Set(result.units.map((unit) => unit.id)).size).toBe(result.units.length)
  return result
}

describe('canonical enterprise segmentation', () => {
  it.each([60_001, 100_001])('recursively splits a %i-character semantic chapter with no loss', async (length) => {
    const result = await assertComplete('# One chapter\r\n' + 'a'.repeat(length))
    expect(result.sections).toHaveLength(1)
    expect(result.units.length).toBeGreaterThan(10)
  })

  it('accounts for whitespace, CRLF, no headings and Unicode boundaries', async () => {
    await assertComplete(' \r\n\r\n' + 'שלום 👩🏽‍💻 café. '.repeat(1600) + '\r\n\r\n')
    await assertComplete('  \r\n \t ')
    const empty = await assertComplete('')
    expect(empty.units).toEqual([])
  })

  it('retains distinct duplicate headings, table rows/cells and nested hierarchy', async () => {
    const result = await assertComplete('# Checkout\n## Payment\n| Rule | דרישה |\n|---|---|\n| R1 | חובה לאמת |\n## Payment\nMust decline invalid cards.\n')
    expect(result.sections).toHaveLength(3)
    expect(result.sections[1].parentId).toBe(result.sections[0].id)
    expect(result.sections[2].parentId).toBe(result.sections[0].id)
    const rows = result.blocks.filter((block) => block.kind === 'table_row')
    expect(rows).toHaveLength(3)
    expect(rows[2].location).toMatchObject({ table: 1, row: 3 })
    expect(rows[2].location.cells?.map((cell) => result.manifest.characterCount > cell.endOffset)).toEqual([true, true])
  })

  it('retains exact distant-unit reuse without treating offsets or source revision as content identity', async () => {
    const old = await buildDocumentSnapshot(source('# A\nMust allow refunds in 14 days.\n# B\nMust encrypt data.\n'))
    const next = await buildDocumentSnapshot(source('# A\nMust allow refunds in 30 business days.\n# B\nMust encrypt data.\n'))
    expect(next.manifest.sourceRevision).not.toBe(old.manifest.sourceRevision)
    expect(next.units[0].reuseKey).not.toBe(old.units[0].reuseKey)
    expect(next.units[1].reuseKey).toBe(old.units[1].reuseKey)
    expect(next.units[1].location.startOffset).not.toBe(old.units[1].location.startOffset)
    const moved = await buildDocumentSnapshot(source('# C\nMust encrypt data.\n'))
    expect(moved.units[0].reuseKey).not.toBe(old.units[1].reuseKey)
  })

  it('accounts for empty, visual and failed pages without hiding missing regions', async () => {
    const result = await buildDocumentSnapshot(source('Text\n'), {
      format: 'pdf', fileName: 'spec.pdf', pages: [
        { number: 1, startOffset: 0, endOffset: 5, status: 'pending', extraction: 'text' },
        { number: 2, startOffset: 5, endOffset: 5, status: 'needs_visual_review', extraction: 'none' },
        { number: 3, startOffset: 5, endOffset: 5, status: 'failed', extraction: 'failed' },
      ],
    })
    expect(result.manifest).toMatchObject({ pageCount: 3, visualReviewCount: 1, parsingStatus: 'partial', analysisStatus: 'pending' })
    expect(result.pages[2].status).toBe('failed')
    expect(result.blocks.filter((block) => block.kind === 'visual')).toHaveLength(2)
  })

  it.each([500, 1000])('accounts for every character of a real %i-page-equivalent fixture', async (pages) => {
    const fixture = createEnterpriseFixture(pages)
    const result = await buildDocumentSnapshot(source(fixture.content), { format: 'pdf', pages: fixture.pages })
    expect(result.manifest.pageCount).toBe(pages)
    expect(result.sections.length).toBeGreaterThan(pages)
    expect(result.units.map((unit) => fixture.content.slice(unit.location.startOffset, unit.location.endOffset)).join('')).toBe(fixture.content)
    expect(result.units.every((unit) => unit.byteCount <= MAX_UNIT_BYTES && unit.location.endOffset - unit.location.startOffset <= MAX_UNIT_CHARACTERS)).toBe(true)
    expect(result.units.at(-1)?.location.page).toBe(pages)
    expect(result.manifest.characterCount).toBeGreaterThan(pages * 2500)
  }, 30_000)
})
