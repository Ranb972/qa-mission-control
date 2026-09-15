import type { QaSource } from '../features/qa-sources/qaSourceTypes'

export function createQaSource(overrides: Partial<QaSource> = {}): QaSource {
  return {
    id: 'qa-source-1',
    title: 'Checkout payment requirement',
    sourceType: 'Requirement',
    status: 'Draft',
    content:
      'The checkout flow must accept valid cards and show clear validation errors for expired cards.',
    notes: 'Review payment edge cases before test design.',
    createdAt: '2026-05-12T08:00:00.000Z',
    updatedAt: '2026-05-12T08:00:00.000Z',
    ...overrides,
  }
}
