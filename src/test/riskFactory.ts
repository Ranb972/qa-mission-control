import type { Risk } from '../features/risks/riskTypes'

export function createRisk(overrides: Partial<Risk> = {}): Risk {
  return {
    id: 'risk-1',
    title: 'Payment provider outage delays checkout validation',
    description: 'Third-party payment instability may block release confidence.',
    impact: 'High',
    likelihood: 'Medium',
    status: 'Open',
    mitigationPlan: 'Prepare fallback test data and monitor provider status.',
    createdAt: '2026-05-07T08:00:00.000Z',
    updatedAt: '2026-05-07T08:00:00.000Z',
    ...overrides,
  }
}
