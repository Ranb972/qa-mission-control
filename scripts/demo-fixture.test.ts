import { beforeEach, describe, expect, it } from 'vitest'
import { demoSources, demoStorage, mockAiResponse } from './demo-fixture'
import { loadCoveragePlans, getCoveragePlanFreshness, getCoveragePlanSectionReferenceFreshness } from '../src/lib/storage/coveragePlanStorage'
import { loadSectionCoveragePlans } from '../src/lib/storage/sectionCoveragePlanStorage'
import { loadQaSources } from '../src/lib/storage/qaSourceStorage'
import { loadTestCases } from '../src/lib/storage/testCaseStorage'
import { loadTestSuites } from '../src/lib/storage/testSuiteStorage'
import { loadExecutions } from '../src/lib/storage/executionStorage'
import { loadBugs } from '../src/lib/storage/bugStorage'
import { loadRisks } from '../src/lib/storage/riskStorage'
import { loadReleases } from '../src/lib/storage/releaseStorage'
import { createQaSourceSectionIndex } from '../src/features/qa-sources/qaSourceSections'
import { createAiCoveragePlanSectionCatalog } from '../src/features/ai-suggestions/aiCoveragePlanSectionContext'
import { packQaSourceForAiSuggestions } from '../src/features/ai-suggestions/aiSuggestionContext'

describe('isolated visual review fixtures', () => {
  beforeEach(() => {
    localStorage.clear()
    Object.entries(demoStorage).forEach(([key, value]) => localStorage.setItem(key, value))
  })
  it('restores every collection through the real product validators', () => {
    for (const load of [loadQaSources, loadTestCases, loadTestSuites, loadExecutions, loadBugs, loadRisks, loadReleases, loadCoveragePlans, loadSectionCoveragePlans]) {
      expect(load().error).toBeNull()
    }
    expect(loadTestCases().testCases).toHaveLength(18)
    expect(loadQaSources().qaSources).toHaveLength(5)
    expect(loadSectionCoveragePlans().records).toHaveLength(6)
  })
  it('uses current app-owned source references, not invented durable provider authority', () => {
    const source = demoSources[0]
    const record = loadCoveragePlans().coveragePlans[0]
    expect(getCoveragePlanFreshness(record, source).isFresh).toBe(true)
    const index = createQaSourceSectionIndex(source)
    expect(getCoveragePlanSectionReferenceFreshness(record, index, createAiCoveragePlanSectionCatalog(index, packQaSourceForAiSuggestions(source)))).toEqual({ isFresh: true, reasons: [] })
  })
  it('offers a concrete checkout review scenario but keeps unknown synthetic drafts limited', () => {
    const quote = 'Show item prices, discounts, tax, shipping, and the final order total before payment. Preserve the cart when authorization fails.'
    const draft = (evidence: string) => mockAiResponse('/test-case-suggestions', { content: `Target requirement evidence:\n${evidence}\n\nSource region` })
    expect(draft(quote)).toMatchObject({ suggestions: [{ title: 'Checkout totals survive a declined payment', evidence: [quote], assumptions: [], warnings: [] }] })
    expect(draft('An unknown acceptance criterion.')).toMatchObject({ suggestions: [{ assumptions: ['Replace this generic synthetic fixture with concrete scenario data before real execution.'] }] })
  })
})
