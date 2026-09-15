import type { Risk, RiskImpact, RiskLikelihood, RiskStatus } from './riskTypes'

export const ALL_RISK_STATUSES = 'All statuses' as const
export const ALL_RISK_IMPACTS = 'All impacts' as const
export const ALL_RISK_LIKELIHOODS = 'All likelihoods' as const

export type RiskStatusFilter = RiskStatus | typeof ALL_RISK_STATUSES
export type RiskImpactFilter = RiskImpact | typeof ALL_RISK_IMPACTS
export type RiskLikelihoodFilter =
  | RiskLikelihood
  | typeof ALL_RISK_LIKELIHOODS

type RiskFilterOptions = {
  searchTerm: string
  statusFilter: RiskStatusFilter
  impactFilter: RiskImpactFilter
  likelihoodFilter: RiskLikelihoodFilter
}

export function filterAndSortRisks(
  risks: Risk[],
  { searchTerm, statusFilter, impactFilter, likelihoodFilter }: RiskFilterOptions,
) {
  const normalizedSearch = searchTerm.trim().toLowerCase()

  return [...risks]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .filter((risk) => {
      const matchesSearch = risk.title.toLowerCase().includes(normalizedSearch)
      const matchesStatus =
        statusFilter === ALL_RISK_STATUSES || risk.status === statusFilter
      const matchesImpact =
        impactFilter === ALL_RISK_IMPACTS || risk.impact === impactFilter
      const matchesLikelihood =
        likelihoodFilter === ALL_RISK_LIKELIHOODS ||
        risk.likelihood === likelihoodFilter

      return matchesSearch && matchesStatus && matchesImpact && matchesLikelihood
    })
}
