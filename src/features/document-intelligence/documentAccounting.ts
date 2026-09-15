import type { AccountingStatus, DocumentSnapshot } from './documentTypes'

export type AccountingCounts = Record<AccountingStatus, number> & { total: number }

function count(statuses: AccountingStatus[]): AccountingCounts {
  const counts: AccountingCounts = { total: statuses.length, current: 0, pending: 0, failed: 0, excluded: 0, needs_visual_review: 0, stale: 0 }
  for (const status of statuses) counts[status] += 1
  return counts
}

function combine(statuses: AccountingStatus[]): AccountingStatus {
  for (const status of ['failed', 'needs_visual_review', 'stale', 'pending'] as const) if (statuses.includes(status)) return status
  return statuses.includes('current') ? 'current' : statuses.length ? 'excluded' : 'pending'
}

/** Derives completeness from all regions, not just the successful subset. */
export function documentAccounting(snapshot: DocumentSnapshot, states: ReadonlyMap<string, AccountingStatus> = new Map()) {
  const blockStates = new Map<string, AccountingStatus[]>()
  const pageStates = new Map<number, AccountingStatus[]>()
  const units = snapshot.units.map((unit) => {
    const status = states.get(unit.id) ?? unit.status
    for (const id of unit.blockIds) {
      const values = blockStates.get(id) ?? []
      values.push(status)
      blockStates.set(id, values)
    }
    if (unit.location.page !== undefined) {
      const values = pageStates.get(unit.location.page) ?? []
      values.push(status)
      pageStates.set(unit.location.page, values)
    }
    return status
  })
  const blocks = snapshot.blocks.map((block) => {
    const status = block.kind === 'visual' ? states.get(block.id) ?? block.status : combine(blockStates.get(block.id) ?? [block.status])
    if (block.kind === 'visual' && block.location.page !== undefined) {
      const values = pageStates.get(block.location.page) ?? []
      values.push(status)
      pageStates.set(block.location.page, values)
    }
    return status
  })
  const pages = snapshot.pages.map((page) => combine(pageStates.get(page.number) ?? [page.status]))
  const unitCounts = count(units)
  const pageCounts = count(pages)
  const blockCounts = count(blocks)
  const all = [...units, ...blocks, ...pages]
  const complete = all.length > 0 && all.every((status) => status === 'current' || status === 'excluded')
  return {
    units: unitCounts, pages: pageCounts, blocks: blockCounts, complete,
    label: `${unitCounts.current} of ${unitCounts.total} analysis units current`,
    /** Exclusion is a conscious scope decision, never evidence of coverage. */
    exclusions: unitCounts.excluded,
  }
}
