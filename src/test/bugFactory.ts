import type { Bug } from '../features/bugs/bugTypes'

export function createBug(overrides: Partial<Bug> = {}): Bug {
  return {
    id: 'bug-1',
    title: 'Checkout total is incorrect',
    description: 'Discounted checkout totals do not match the expected amount.',
    severity: 'High',
    status: 'Open',
    stepsToReproduce: 'Add discounted item to cart and proceed to checkout.',
    expectedBehavior: 'Checkout total includes the discount.',
    actualBehavior: 'Checkout total shows the full price.',
    createdAt: '2026-05-07T08:00:00.000Z',
    updatedAt: '2026-05-07T08:00:00.000Z',
    ...overrides,
  }
}
