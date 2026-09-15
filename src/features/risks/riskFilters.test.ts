import { describe, expect, it } from 'vitest'
import { createRisk } from '../../test/riskFactory'
import {
  ALL_RISK_IMPACTS,
  ALL_RISK_LIKELIHOODS,
  ALL_RISK_STATUSES,
  filterAndSortRisks,
} from './riskFilters'

describe('filterAndSortRisks', () => {
  it('searches risks by title case-insensitively', () => {
    const risks = [
      createRisk({ id: 'payment', title: 'Payment provider instability' }),
      createRisk({ id: 'copy', title: 'Release notes may be late' }),
    ]

    const result = filterAndSortRisks(risks, {
      searchTerm: ' payment ',
      statusFilter: ALL_RISK_STATUSES,
      impactFilter: ALL_RISK_IMPACTS,
      likelihoodFilter: ALL_RISK_LIKELIHOODS,
    })

    expect(result).toEqual([risks[0]])
  })

  it('filters risks by status, impact, and likelihood', () => {
    const matchingRisk = createRisk({
      id: 'matching',
      status: 'Mitigating',
      impact: 'Critical',
      likelihood: 'High',
    })
    const risks = [
      createRisk({
        id: 'wrong-status',
        status: 'Open',
        impact: 'Critical',
        likelihood: 'High',
      }),
      createRisk({
        id: 'wrong-impact',
        status: 'Mitigating',
        impact: 'Low',
        likelihood: 'High',
      }),
      createRisk({
        id: 'wrong-likelihood',
        status: 'Mitigating',
        impact: 'Critical',
        likelihood: 'Low',
      }),
      matchingRisk,
    ]

    const result = filterAndSortRisks(risks, {
      searchTerm: '',
      statusFilter: 'Mitigating',
      impactFilter: 'Critical',
      likelihoodFilter: 'High',
    })

    expect(result).toEqual([matchingRisk])
  })

  it('sorts risks by newest updatedAt first', () => {
    const oldRisk = createRisk({
      id: 'old',
      updatedAt: '2026-05-07T08:00:00.000Z',
    })
    const newRisk = createRisk({
      id: 'new',
      updatedAt: '2026-05-07T09:00:00.000Z',
    })

    const result = filterAndSortRisks([oldRisk, newRisk], {
      searchTerm: '',
      statusFilter: ALL_RISK_STATUSES,
      impactFilter: ALL_RISK_IMPACTS,
      likelihoodFilter: ALL_RISK_LIKELIHOODS,
    })

    expect(result).toEqual([newRisk, oldRisk])
  })
})
