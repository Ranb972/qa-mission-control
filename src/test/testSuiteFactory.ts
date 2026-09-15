import type { TestSuite } from '../features/test-suites/testSuiteTypes'

export function createTestSuite(
  overrides: Partial<TestSuite> = {},
): TestSuite {
  return {
    id: 'test-suite-1',
    name: 'Core Smoke Suite',
    description: 'Fast coverage for the most important user journeys.',
    type: 'Smoke',
    testCaseIds: ['test-case-1'],
    createdAt: '2026-05-11T08:00:00.000Z',
    updatedAt: '2026-05-11T08:00:00.000Z',
    ...overrides,
  }
}
