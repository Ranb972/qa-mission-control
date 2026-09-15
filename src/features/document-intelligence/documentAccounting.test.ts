import { describe, expect, it } from 'vitest'
import { documentAccounting } from './documentAccounting'
import type { DocumentSnapshot } from './documentTypes'

const snapshot = {
  manifest: {},
  pages: [
    { number: 1, status: 'pending' }, { number: 2, status: 'needs_visual_review' },
  ],
  blocks: [
    { id: 'b1', kind: 'paragraph', status: 'pending', location: { page: 1 } },
    { id: 'b2', kind: 'visual', status: 'needs_visual_review', location: { page: 2 } },
  ],
  units: [
    { id: 'u1', blockIds: ['b1'], status: 'pending', location: { page: 1 } },
    { id: 'u2', blockIds: ['b1'], status: 'pending', location: { page: 1 } },
  ], sections: [],
} as DocumentSnapshot

describe('complete source accounting', () => {
  it('does not mistake successful text analysis for complete analysis of visual material', () => {
    const result = documentAccounting(snapshot, new Map([['u1', 'current'], ['u2', 'current']]))
    expect(result.units.current).toBe(2)
    expect(result.pages.needs_visual_review).toBe(1)
    expect(result.complete).toBe(false)
  })
  it('propagates failed and stale units to their containing blocks and pages', () => {
    const failed = documentAccounting(snapshot, new Map([['u1', 'current'], ['u2', 'failed']]))
    expect(failed.units.failed).toBe(1)
    expect(failed.blocks.failed).toBe(1)
    expect(failed.pages.failed).toBe(1)
    expect(failed.complete).toBe(false)
    const stale = documentAccounting(snapshot, new Map([['u1', 'stale']]))
    expect(stale.pages.stale).toBe(1)
  })
  it('keeps explicit exclusions separate from analyzed evidence', () => {
    const result = documentAccounting(snapshot, new Map([['u1', 'current'], ['u2', 'excluded'], ['b2', 'excluded']]))
    expect(result.complete).toBe(true)
    expect(result.exclusions).toBe(1)
    expect(result.label).toBe('1 of 2 analysis units current')
  })
})
