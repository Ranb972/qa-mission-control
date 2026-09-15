import type { TestCase } from '../features/test-cases/testCaseTypes'

export function createTestCase(overrides: Partial<TestCase> = {}): TestCase {
  return {
    id: 'test-case-1',
    title: 'Login accepts valid credentials',
    area: 'Authentication',
    priority: 'Medium',
    status: 'Not Run',
    type: 'Functional',
    steps: 'Open login page and submit valid credentials.',
    expectedResult: 'User lands on the dashboard.',
    createdAt: '2026-05-07T08:00:00.000Z',
    updatedAt: '2026-05-07T08:00:00.000Z',
    ...overrides,
  }
}
