import specification from '../../../demo-source-candidate/northstar-commerce-platform-v3.2-spec.md?raw'
import changeNotice from '../../../demo-source-candidate/northstar-commerce-platform-v3.3-change-notice.md?raw'
import type { FindingKind } from '../document-intelligence/unitAnalysisContract'
import type { ExecutionResult } from '../executions/executionTypes'

export const NORTHSTAR_SOURCE_ID = 'demo-northstar-source-3.2'
export const NORTHSTAR_CHANGE_ID = 'demo-northstar-source-3.3'
export const NORTHSTAR_RELEASE_ID = 'demo-northstar-release-3.2'
export const northstarSources = [
  { id: NORTHSTAR_SOURCE_ID, title: 'Northstar Commerce Platform v3.2', content: specification },
  { id: NORTHSTAR_CHANGE_ID, title: 'Northstar Commerce Platform v3.3 Change Notice', content: changeNotice },
]
export const isNorthstarSource = (id: string) => id === NORTHSTAR_SOURCE_ID || id === NORTHSTAR_CHANGE_ID

type Finding = { code: string; title: string; quote: string; offset: number; topic: string; kind: FindingKind }
const topics: Record<string, string> = {
  AUTH: 'Identity & permissions', CAT: 'Catalog & pricing', CART: 'Cart & reservation', CHK: 'Checkout integrity',
  ORD: 'Order lifecycle', PAY: 'Payment safety', PROMO: 'Promotions & discounts', INV: 'Inventory & reservation',
  SHIP: 'Shipping & fulfillment', TAX: 'Tax calculation', REF: 'Returns & refunds', NOTIF: 'Notifications',
  ADMIN: 'Administration', AUD: 'Security & audit', API: 'API contracts', REL: 'Recovery & continuity',
  PERF: 'Performance & capacity', ACC: 'Accessibility & localization', READY: 'Release decision',
}
const specialTopics: Record<string, string> = {
  'NCP-REF-001': 'Marketplace return fallback', 'NCP-REF-003': 'Marketplace return fallback', 'NCP-CHG-001': 'Marketplace return fallback',
  'NCP-CART-006': 'Reservation scope', 'NCP-INV-006': 'Reservation scope', 'NCP-CHG-002': 'Reservation scope',
  'NCP-CHG-003': 'Checkout integrity', 'NCP-CHG-004': 'Payment safety', 'NCP-CHG-005': 'Release decision',
}

/** Curated parsing of the supplied synthetic fixture, not a general extractor or provider result. */
export function northstarFindings(content: string): Finding[] {
  const headings = [...content.matchAll(/^#{2,3} (NCP-([A-Z]+)-\d+) — (.+)\r?$/gm)]
  return headings.map((match, index) => {
    const end = headings[index + 1]?.index ?? content.length
    const block = content.slice(match.index!, end)
    const statement = /^\*\*Requirement:\*\* (.+)\r?$/m.exec(block)
    const firstParagraph = block.slice(block.indexOf('\n') + 1).trim().split(/\r?\n\r?\n/)[0]
    const quote = statement ? statement[1].trimEnd() : firstParagraph
    const code = match[1]
    return { code, title: match[3].trimEnd(), quote, offset: match.index! + block.indexOf(quote),
      topic: specialTopics[code] ?? topics[match[2]] ?? match[2],
      kind: /\*\*Classification:\*\* Review required/.test(block) || code === 'NCP-CHG-001' ? 'ambiguity' : 'requirement' }
  })
}

type DemoTest = { code: string; title: string; steps: string; expected: string; result: ExecutionResult; suite: string }
export const northstarTests: DemoTest[] = [
  { code: 'NCP-CHK-005', title: 'Single confirmation creates one order', steps: 'Submit a valid cart once. Inspect the stored order and confirmation response.', expected: 'One commercial order is persisted and its identity is returned.', result: 'Passed', suite: 'Checkout Integrity' },
  { code: 'NCP-CHK-005', title: 'Rapid double confirmation does not create a duplicate', steps: 'Delay the first confirmation response. Submit twice rapidly with the same logical identity. Count stored orders.', expected: 'Exactly one order exists; both responses reference that order.', result: 'Failed', suite: 'Checkout Integrity' },
  { code: 'NCP-CHK-005', title: 'Retry after client timeout remains idempotent', steps: 'Allow the first request to persist an order but time out at the client. Retry with the same identity.', expected: 'The retry returns the original order without a second business effect.', result: 'Not Run', suite: 'Checkout Integrity' },
  { code: 'NCP-CHK-005', title: 'Replayed confirmation event does not send duplicate notification', steps: 'Complete confirmation, then replay the same event twice. Inspect notification records.', expected: 'One confirmation notification is emitted for the commercial order.', result: 'Passed', suite: 'Checkout Integrity' },
  { code: 'NCP-PAY-002', title: 'Payment retry does not charge twice', steps: 'Capture a valid payment. Retry the request with the original idempotency key. Compare charge identities.', expected: 'One charge exists for the logical payment.', result: 'Passed', suite: 'Payment Safety' },
  { code: 'NCP-PAY-004', title: 'Payment timeout awaits verification before retry', steps: 'Withhold the payment-provider response. Inspect the payment state and available retry action.', expected: 'Payment enters verification-pending; no new payment identity is silently created.', result: 'Not Run', suite: 'Payment Safety' },
  { code: 'NCP-PAY-003', title: 'Declined payment preserves the cart', steps: 'Submit a synthetic declined payment. Inspect the cart and order records.', expected: 'Cart contents remain intact and no order is created.', result: 'Passed', suite: 'Payment Safety' },
  { code: 'NCP-REL-004', title: 'Restart recovers persisted order and payment', steps: 'Stop the synthetic service after payment persistence. Restart and inspect order/payment identifiers.', expected: 'The persisted state recovers without duplicate records.', result: 'Not Run', suite: 'Recovery & Continuity' },
  { code: 'NCP-REL-006', title: 'Message replay preserves one business effect', steps: 'Deliver an already committed order event after a worker restart. Inspect persisted effects.', expected: 'The previously recorded event identity is not applied again.', result: 'Passed', suite: 'Recovery & Continuity' },
  { code: 'NCP-AUD-001', title: 'Audit records actor, change, time and target', steps: 'Make an authorized inventory correction. Inspect the resulting audit event.', expected: 'The event contains actor identity, nature of change, timestamp and target entity.', result: 'Passed', suite: 'Security & Audit' },
  { code: 'NCP-AUTH-006', title: 'Hidden controls do not replace server authorization', steps: 'As a shopper, send a privileged mutation directly without using the administrative UI.', expected: 'The server rejects the mutation and leaves the protected record unchanged.', result: 'Passed', suite: 'Security & Audit' },
  { code: 'NCP-AUTH-003', title: 'Password reset expires at the 30-minute boundary', steps: 'Issue a reset link. Attempt use at 30 minutes, then attempt reuse of a successfully consumed link.', expected: 'Expired and previously consumed links cannot reset the password.', result: 'Passed', suite: 'Security & Audit' },
  { code: 'NCP-CART-003', title: 'Cart rejects zero and fractional quantities', steps: 'Submit quantities 0, -1 and 1.5 through the cart endpoint; then submit 1.', expected: 'Invalid quantities are rejected; the positive integer is accepted within configured limits.', result: 'Passed', suite: 'Checkout Integrity' },
  { code: 'NCP-REF-001', title: 'Marketplace return eligibility requires policy review', steps: 'Open return eligibility for a marketplace order whose seller has no policy. Compare category, fulfillment date, order state and policy window with both specifications.', expected: 'Eligibility accounts for category, fulfillment date, order state and policy window. No universal fallback is assumed until the NCP-REF-003 / NCP-CHG-001 conflict is reviewed.', result: 'Not Run', suite: 'Release Smoke' },
  { code: 'NCP-INV-004', title: 'Standard reservation expires after 15 minutes', steps: 'Reserve stock through standard checkout. Advance the controlled clock to 15 minutes.', expected: 'The standard reservation expires; no manual-order exception is assumed.', result: 'Passed', suite: 'Checkout Integrity' },
  { code: 'NCP-READY-005', title: 'Release sign-off requires a human QA decision', steps: 'Review execution, defect and source-conflict signals. Attempt to interpret a calculated readiness result as approval.', expected: 'Calculated status alone never records final human QA approval.', result: 'Not Run', suite: 'Release Smoke' },
]
