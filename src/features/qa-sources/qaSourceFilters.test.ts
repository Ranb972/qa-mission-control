import { describe, expect, it } from 'vitest'
import { createQaSource } from '../../test/qaSourceFactory'
import {
  ALL_QA_SOURCE_STATUSES,
  ALL_QA_SOURCE_TYPES,
  filterAndSortQaSources,
} from './qaSourceFilters'

const sources = [
  createQaSource({
    id: 'requirement',
    title: 'Checkout payment requirement',
    sourceType: 'Requirement',
    status: 'Reviewed',
    content: 'Cards and wallet payments must be validated.',
    notes: 'Payment gateway assumptions need review.',
    updatedAt: '2026-05-12T08:00:00.000Z',
  }),
  createQaSource({
    id: 'lld',
    title: 'Notification LLD',
    sourceType: 'LLD',
    status: 'Ready for test design',
    content: 'Email worker retries failed receipt messages.',
    notes: 'Cover retry queue behavior.',
    updatedAt: '2026-05-12T09:00:00.000Z',
  }),
  createQaSource({
    id: 'story',
    title: 'Coupon user story',
    sourceType: 'User Story',
    status: 'Draft',
    content: 'As a shopper, I can apply a coupon.',
    notes: '',
    updatedAt: '2026-05-12T07:00:00.000Z',
  }),
]

describe('qaSourceFilters', () => {
  it('searches by title', () => {
    const result = filterAndSortQaSources(sources, {
      searchTerm: 'checkout',
      sourceTypeFilter: ALL_QA_SOURCE_TYPES,
      statusFilter: ALL_QA_SOURCE_STATUSES,
    })

    expect(result.map((source) => source.id)).toEqual(['requirement'])
  })

  it('searches by content', () => {
    const result = filterAndSortQaSources(sources, {
      searchTerm: 'receipt messages',
      sourceTypeFilter: ALL_QA_SOURCE_TYPES,
      statusFilter: ALL_QA_SOURCE_STATUSES,
    })

    expect(result.map((source) => source.id)).toEqual(['lld'])
  })

  it('searches by notes', () => {
    const result = filterAndSortQaSources(sources, {
      searchTerm: 'gateway assumptions',
      sourceTypeFilter: ALL_QA_SOURCE_TYPES,
      statusFilter: ALL_QA_SOURCE_STATUSES,
    })

    expect(result.map((source) => source.id)).toEqual(['requirement'])
  })

  it('filters by source type', () => {
    const result = filterAndSortQaSources(sources, {
      searchTerm: '',
      sourceTypeFilter: 'LLD',
      statusFilter: ALL_QA_SOURCE_STATUSES,
    })

    expect(result.map((source) => source.id)).toEqual(['lld'])
  })

  it('filters by status', () => {
    const result = filterAndSortQaSources(sources, {
      searchTerm: '',
      sourceTypeFilter: ALL_QA_SOURCE_TYPES,
      statusFilter: 'Draft',
    })

    expect(result.map((source) => source.id)).toEqual(['story'])
  })

  it('combines search and filters and sorts by most recently updated', () => {
    const result = filterAndSortQaSources(sources, {
      searchTerm: 'payment',
      sourceTypeFilter: 'Requirement',
      statusFilter: 'Reviewed',
    })

    expect(result.map((source) => source.id)).toEqual(['requirement'])
  })
})
