import { describe, expect, it } from 'vitest'
import type { Requirement } from '../document-intelligence/requirementModel'
import { importRepositoryEvidence } from './repositoryImport'
import { compareProductEvidence } from './evidenceComparison'

const requirement = (summary: string) => ({ id: summary, kind: 'requirement', summary, evidence: { quote: summary } }) as Requirement
describe('bounded potential implementation discrepancies', () => {
  it('retains different claims, relates naming conventions and does not claim an unmatched feature is missing', async () => {
    const evidence = await importRepositoryEvidence([{ name: 'session.ts', text: 'export const SESSION_TIMEOUT_MINUTES = 90;\nexport function refundPayment() {}' }])
    const rows = compareProductEvidence([requirement('Sessions timeout after 30 minutes.'), requirement('Refund payments must be supported.'), requirement('A receipt must be emailed.')], evidence.manifest)
    expect(rows.map((row) => row.kind)).toEqual(['numeric_difference', 'related_clue', 'no_matching_clue'])
    expect(rows[0].clues[0].summary).toContain('90')
    expect(rows[0].requirement.evidence.quote).toContain('30')
    expect(rows[2].clues).toEqual([])
  })
  it('does not equate a single common keyword or a test declaration with tested coverage', async () => {
    const evidence = await importRepositoryEvidence([{ name: 'refund.test.ts', text: 'it("refund payments require review", () => {});' }])
    expect(compareProductEvidence([requirement('Refund payments require review.')], evidence.manifest)[0].kind).toBe('related_clue')
    expect(compareProductEvidence([requirement('Payments are encrypted.')], evidence.manifest)[0].kind).toBe('no_matching_clue')
  })
  it('does not let absent keywords crowd out real candidates in long enterprise requirements', async () => {
    const evidence = await importRepositoryEvidence([{ name: 'checkout.ts', text: 'export function authorizePaymentRequest() {}' }])
    const row = compareProductEvidence([requirement('Authorize the payment request. Preserve the cart when authorization fails. Duplicate confirmation clicks must create at most one order.')], evidence.manifest)[0]
    expect(row.kind).toBe('related_clue')
    expect(row.clues).toHaveLength(1)
  })
})
