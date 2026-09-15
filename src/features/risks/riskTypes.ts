export const RISK_IMPACTS = [
  'Low',
  'Medium',
  'High',
  'Critical',
] as const

export const RISK_LIKELIHOODS = [
  'Low',
  'Medium',
  'High',
] as const

export const RISK_STATUSES = [
  'Open',
  'Mitigating',
  'Accepted',
  'Resolved',
] as const

export type RiskImpact = (typeof RISK_IMPACTS)[number]
export type RiskLikelihood = (typeof RISK_LIKELIHOODS)[number]
export type RiskStatus = (typeof RISK_STATUSES)[number]

export type Risk = {
  id: string
  title: string
  description: string
  impact: RiskImpact
  likelihood: RiskLikelihood
  status: RiskStatus
  mitigationPlan: string
  createdAt: string
  updatedAt: string
}

export type RiskFormValues = Omit<Risk, 'id' | 'createdAt' | 'updatedAt'>

export type RiskFormErrors = Partial<Record<keyof RiskFormValues, string>>

export const EMPTY_RISK_FORM_VALUES: RiskFormValues = {
  title: '',
  description: '',
  impact: 'Medium',
  likelihood: 'Medium',
  status: 'Open',
  mitigationPlan: '',
}
