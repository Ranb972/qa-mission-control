import type { Release } from '../features/releases/releaseTypes'

export function createRelease(overrides: Partial<Release> = {}): Release {
  return {
    id: 'release-1',
    name: 'May Checkout Release',
    version: 'v1.4.0',
    targetDate: '2026-05-21',
    status: 'Planning',
    notes: 'Initial release tracking notes.',
    createdAt: '2026-05-07T08:00:00.000Z',
    updatedAt: '2026-05-07T08:00:00.000Z',
    ...overrides,
  }
}
