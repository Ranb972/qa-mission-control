import { createTestCase } from '../src/test/testCaseFactory'
import { createBug } from '../src/test/bugFactory'
import { createRisk } from '../src/test/riskFactory'
import { createRelease } from '../src/test/releaseFactory'
import { createExecution } from '../src/test/executionFactory'
import { createTestSuite } from '../src/test/testSuiteFactory'
import { createQaSource } from '../src/test/qaSourceFactory'
import { createQaSourceSectionIndex } from '../src/features/qa-sources/qaSourceSections'
import { resolveAiSectionCoveragePlanContext } from '../src/features/ai-suggestions/aiSectionCoveragePlanContext'
import { createPersistedSectionCoveragePlanRecord, SECTION_COVERAGE_PLAN_STORAGE_KEY, SECTION_COVERAGE_PLAN_STORAGE_SCHEMA_VERSION } from '../src/lib/storage/sectionCoveragePlanStorage'
import { createPersistedCoveragePlanRecord, COVERAGE_PLAN_STORAGE_KEY, COVERAGE_PLAN_STORAGE_SCHEMA_VERSION } from '../src/lib/storage/coveragePlanStorage'
import { packQaSourceForAiSuggestions } from '../src/features/ai-suggestions/aiSuggestionContext'
import { AI_COVERAGE_PLAN_SCHEMA_VERSION, type AiCoveragePlan } from '../src/features/ai-suggestions/aiCoveragePlanTypes'
import { createAiCoveragePlanSectionCatalog, getAiCoveragePlanSectionCatalogRuntimeContext } from '../src/features/ai-suggestions/aiCoveragePlanSectionContext'
import { TEST_CASE_STORAGE_KEY } from '../src/lib/storage/testCaseStorage'
import { QA_SOURCE_STORAGE_KEY } from '../src/lib/storage/qaSourceStorage'
import { BUG_STORAGE_KEY } from '../src/lib/storage/bugStorage'
import { RISK_STORAGE_KEY } from '../src/lib/storage/riskStorage'
import { RELEASE_STORAGE_KEY } from '../src/lib/storage/releaseStorage'
import { EXECUTION_STORAGE_KEY } from '../src/lib/storage/executionStorage'
import { TEST_SUITE_STORAGE_KEY } from '../src/lib/storage/testSuiteStorage'

const timestamp = '2026-09-05T09:00:00.000Z'
const sections = [
  ['Cart and order totals', 'Show item prices, discounts, tax, shipping, and the final order total before payment. Preserve the cart when authorization fails.'],
  ['Payment authorization', 'Authorize the payment request. Preserve the cart when authorization fails. Duplicate confirmation clicks must create at most one order.'],
  ['Payment recovery', 'Authorise the payment request. Preserve the cart when authorization fails. Retry a declined card only after an explicit customer action.'],
  ['Delivery addresses', 'Require country, city, street, and postal code. Reject unsupported countries without clearing valid address fields.'],
  ['Inventory reservation', 'Reserve inventory for ten minutes. Return reserved stock when checkout expires or the customer cancels the order.'],
  ['Promotions and coupons', 'Apply one eligible coupon per cart. Show a clear explanation for expired coupons and recalculate the final total.'],
  ['Order confirmation', 'After successful payment show a unique order number and send one receipt. Refreshing confirmation must not charge the customer again.'],
  ['Accessibility', 'All checkout controls must be keyboard operable. Associate validation errors with their fields and announce payment outcomes.'],
  ['Audit and security', 'Never store card security codes. Record payment events using a correlation identifier without exposing provider credentials.'],
  ['Refund policy', 'Refunds require customer support approval. The specification does not define the approval deadline or partial-refund policy.'],
]
export const demoSources = [
  createQaSource({ id: 'demo-source-checkout', title: 'Checkout & payments', sourceType: 'PRD', status: 'Reviewed', content: sections.map(([title, text]) => `# ${title}\n${text}`).join('\n\n'), notes: 'Release 2.4 · Review payment recovery, idempotency, and accessibility before sign-off.', createdAt: timestamp, updatedAt: timestamp }),
  createQaSource({ id: 'demo-source-identity', title: 'Identity & access management', sourceType: 'LLD', status: 'Reviewed', content: '# Authentication\nUsers sign in with email and password. Lock accounts after five failed attempts.\n\n# Roles and permissions\nOnly workspace administrators can change team roles.\n\n# Session recovery\nExpired sessions redirect to sign in while preserving the return location.', notes: 'Security review completed. Validate cross-workspace isolation.', createdAt: timestamp, updatedAt: timestamp }),
  createQaSource({ id: 'demo-source-notifications', title: 'Notifications & receipts', sourceType: 'User Story', status: 'Ready for test design', content: '# Delivery\nSend one email receipt after a successful purchase.\n\n# Retry policy\nRetry failed email delivery three times.\n\n# Preferences\nCustomers can opt out of promotional notifications.', notes: 'Transactional receipts are mandatory; marketing is optional.', createdAt: timestamp, updatedAt: timestamp }),
  createQaSource({ id: 'demo-source-mobile', title: 'Mobile checkout acceptance', sourceType: 'Requirement', status: 'Draft', content: '# Small screens\nCheckout supports 390px wide screens with no horizontal page overflow.\n\n# Keyboard\nThe on-screen keyboard must not cover the active payment field.', notes: 'Pending device lab review.', createdAt: timestamp, updatedAt: timestamp }),
  createQaSource({ id: 'demo-source-refund', title: 'Refunds & cancellation', sourceType: 'Notes', status: 'Draft', content: '# Cancellations\nCustomers may cancel orders before fulfillment.\n\n# Refunds\nSupport reviews refund requests and records the reason.', notes: 'Clarify partial refunds with product.', createdAt: timestamp, updatedAt: timestamp }),
]
const source = demoSources[0]
const sectionIndex = createQaSourceSectionIndex(source)
const sectionRecords = sectionIndex.sections.slice(0, 6).map((section, i) => {
  const context = resolveAiSectionCoveragePlanContext({qaSource:source, sectionIndex, selectedSection:{sectionId:section.id,stableKey:section.stableKey}})
  if (!context.ok) throw new Error(context.error)
  return createPersistedSectionCoveragePlanRecord({context:context.context, analyzedAt:timestamp, plan:{schemaVersion:'section-coverage-plan-json-v1',coverageAreas:[{id:`demo-section-area-${i}`,name:section.title,summary:sections[i][1],behaviors:[i === 2 ? 'Authorise the payment request.' : i === 1 ? 'Authorize the payment request.' : sections[i][1]],evidence:[sections[i][1]],evidenceSupport:'source_backed'}],actors:['Customer'],states:['Checkout pending'],inputs:['Payment request'],failureModes:['Payment provider unavailable'],integrationRisks:['Delayed authorization callback'],permissionsSecurity:['Do not store card security codes'],dataPersistenceConcerns:['Preserve the cart when authorization fails'],ambiguities:[],nextCoverage:[],warnings:[]}})
})
export const demoCoveragePlan: AiCoveragePlan = {schemaVersion:AI_COVERAGE_PLAN_SCHEMA_VERSION,sourceScope:{qaSourceId:source.id,visibleSourceOnly:true as const,sourceTruncated:false,coverageCompleteness:'visible_source_only' as const,sectionContext:null},coverageAreas:sections.slice(0,7).map(([name,summary],i)=>({id:`coverage-area-${i+1}`,name,summary,behaviors:[summary],risks:i===1?['Duplicate authorization can charge twice']:[],evidence:[summary],ambiguities:[],generationReadiness:'source_backed' as const,sourceSectionRefs:[]})),actors:['Customer','Support agent'],states:['Cart active','Payment pending','Order confirmed'],inputs:['Delivery address','Payment token','Coupon code'],failureModes:['Declined payment','Expired reservation'],integrationRisks:['Delayed provider callback'],permissionsSecurity:['Card security codes must never be stored'],dataPersistenceRules:['Preserve cart after declined payment'],ambiguities:[{id:'demo-ambiguity-1',question:'What is the deadline for refund approval?',whyItMatters:'Support cannot define a reliable service-level expectation.',severity:'High' as const,sourceSectionRefs:[]}],nextGenerationAreas:[],warnings:[]}
const sectionCatalog = createAiCoveragePlanSectionCatalog(sectionIndex, packQaSourceForAiSuggestions(source))
const catalogContext = getAiCoveragePlanSectionCatalogRuntimeContext(sectionCatalog)!
demoCoveragePlan.sourceScope.sectionContext = catalogContext.sectionContext
demoCoveragePlan.coverageAreas.forEach((area, index) => {
  const section = [...catalogContext.visibleCanonicalRefByPairKey.values()].find((reference) => reference.ordinal === index + 1)!
  area.sourceSectionRefs = [section]
})
const coverageRecord = createPersistedCoveragePlanRecord({qaSource:source,packedSource:packQaSourceForAiSuggestions(source),analyzedAt:timestamp,plan:demoCoveragePlan})
const testNames = ['Declined payment preserves the cart','Duplicate confirmation creates one order','Valid card completes checkout','Expired coupon shows validation','Unsupported country blocks delivery','Reservation returns stock on timeout','Receipt delivered exactly once','Keyboard reaches all payment controls','Refund requires support approval','Session expiry preserves return location','Admin can change team permissions','Member cannot access another workspace','Order totals include tax and shipping','Saved address pre-fills checkout','Payment callback is idempotent','Email delivery retry is bounded','Cancellation releases reserved stock','Mobile checkout remains usable']
const tests = testNames.map((title,i)=>createTestCase({id:`demo-tc-${i+1}`,title,area:i>8&&i<12?'Identity':i===15?'Notifications':'Checkout',priority:i<3?'Critical':i<9?'High':'Medium',status:'Not Run',type:i%3===0?'Regression':'Functional',preconditions:'Customer has a verified account, a stocked item in the cart, and a valid delivery address.',steps:'Open checkout and submit the payment request.',expectedResult:'The expected outcome is displayed without losing customer data.',structuredSteps:[{id:`step-${i}-1`,action:'Open checkout with the prepared customer and cart.',expectedResult:'The cart items, delivery address, and order total are visible.'},{id:`step-${i}-2`,action:i===0?'Submit a card configured to decline authorization.':'Submit the scenario using the prepared test data.',expectedResult:i===0?'A safe decline message appears. No order is created and the cart remains intact.':'The application completes the expected behavior exactly once.'},{id:`step-${i}-3`,action:'Refresh and verify the resulting application state.',expectedResult:'The saved state is coherent and no duplicate operation occurs.'}],createdAt:timestamp,updatedAt:timestamp}))
const release=createRelease({id:'demo-release',name:'Commerce platform',version:'2.4.0',targetDate:'2026-09-12',status:'In Testing',notes:'Checkout reliability and account security. Resolve payment idempotency before release sign-off.',createdAt:timestamp,updatedAt:timestamp})
const defectScenarios = [
  { title: 'Duplicate payment callback creates a second receipt', caseIndex: 1, steps: 'Complete payment, then replay the same provider callback twice.', expected: 'A single order and receipt exist for the payment.', actual: 'A second receipt is created for the same payment.' },
  { title: 'Postal code error clears valid address fields', caseIndex: 13, steps: 'Load a saved address, enter an invalid postal code, and submit.', expected: 'Show the postal-code error while retaining the street and city.', actual: 'The street and city fields are cleared.' },
  { title: 'Focus leaves the payment dialog', caseIndex: 7, steps: 'Open the payment dialog and tab through every control.', expected: 'Keyboard focus remains in the modal until it is closed.', actual: 'Focus reaches the page behind the dialog.' },
  { title: 'Coupon error lacks a field association', caseIndex: 3, steps: 'Apply an expired coupon with a screen reader enabled.', expected: 'The coupon input is associated with its validation message.', actual: 'The visual error is not announced for the input.' },
  { title: 'Session expiry loses return location', caseIndex: 9, steps: 'Let the session expire on checkout, then authenticate again.', expected: 'Return to the preserved checkout after authentication.', actual: 'The customer is redirected to the home page.' },
]
const bugs = defectScenarios.map((defect, i) => createBug({
  id: `demo-bug-${i + 1}`, title: defect.title,
  severity: i === 0 ? 'Critical' : i < 3 ? 'High' : 'Medium',
  status: i === 2 ? 'Retest' : i === 3 ? 'Fixed' : 'Open',
  testCaseId: tests[defect.caseIndex].id,
  description: 'Observed in staging during the Commerce 2.4 regression review.',
  stepsToReproduce: defect.steps, expectedBehavior: defect.expected,
  actualBehavior: defect.actual, createdAt: timestamp, updatedAt: timestamp,
}))
const risks=['Payment sandbox availability','Refund policy is underspecified','Mobile accessibility device coverage','Email provider rate limits'].map((title,i)=>createRisk({id:`demo-risk-${i+1}`,title,impact:i<2?'High':'Medium',likelihood:i===1?'High':'Medium',status:i===1?'Open':'Mitigating',description:'This gap can reduce confidence in release validation.',mitigationPlan:i===1?'Confirm the partial-refund policy and approval deadline with product.':'Use deterministic fixtures and retain a controlled integration check before sign-off.',createdAt:timestamp,updatedAt:timestamp}))
const executions=tests.slice(0,14).map((tc,i)=>createExecution({id:`demo-ex-${i+1}`,releaseId:release.id,testCaseId:tc.id,result:i===0||i===1?'Failed':i===4?'Blocked':'Passed',notes:i===0?'Cart is retained, but a repeated callback produces a duplicate receipt. See the open Critical bug.':i===1?'Second callback is not deduplicated. Reproduction is consistent in staging.':i===4?'Awaiting an enabled unsupported-country fixture.':'Verified on staging with the reviewed test data.',executedAt:timestamp,createdAt:timestamp,updatedAt:timestamp}))
const suites=['Checkout regression','Release smoke','Identity & permissions','Accessibility checks'].map((name,i)=>createTestSuite({id:`demo-suite-${i+1}`,name,type:i===1?'Smoke':i===2?'Feature':'Regression',description:['Payment outcomes, recovery, totals, and order lifecycle.','Critical purchase and sign-in paths for release confidence.','Authentication, roles, and workspace isolation.','Keyboard, validation, and small-screen usability.'][i],testCaseIds:tests.filter((_,n)=>i===0?n<9:i===1?n<4:i===2?n>=9&&n<12:n===7||n===17).map(t=>t.id),createdAt:timestamp,updatedAt:timestamp}))
export const demoStorage: Record<string,string> = Object.fromEntries([[QA_SOURCE_STORAGE_KEY,demoSources],[TEST_CASE_STORAGE_KEY,tests],[BUG_STORAGE_KEY,bugs],[RISK_STORAGE_KEY,risks],[RELEASE_STORAGE_KEY,[release]],[EXECUTION_STORAGE_KEY,executions],[TEST_SUITE_STORAGE_KEY,suites],[COVERAGE_PLAN_STORAGE_KEY,{storageSchemaVersion:COVERAGE_PLAN_STORAGE_SCHEMA_VERSION,records:[coverageRecord]}],[SECTION_COVERAGE_PLAN_STORAGE_KEY,{storageSchemaVersion:SECTION_COVERAGE_PLAN_STORAGE_SCHEMA_VERSION,records:sectionRecords}]].map(([key,value])=>[key,JSON.stringify(value)]))

export function mockAiResponse(path: string, body: Record<string, unknown>) {
  if (path.endsWith('/test-case-suggestions')) {
    const evidence = String(body.content ?? '').split('Target requirement evidence:\n')[1]?.split('\n\nSource region')[0] ?? ''
    if (evidence === 'Show item prices, discounts, tax, shipping, and the final order total before payment. Preserve the cart when authorization fails.') {
      return { ok: true, warnings: [], suggestions: [{
        title: 'Checkout totals survive a declined payment', area: 'Checkout', priority: 'High', type: 'Functional',
        preconditions: 'Synthetic checkout sandbox: a stocked cart, an eligible coupon, a supported delivery address, and the sandbox declined-payment response are available.',
        structuredSteps: [
          { action: 'Open the cart, apply the eligible coupon, and enter the delivery address.', expectedResult: 'Item prices, discount, tax, shipping, and the final total are visible before payment.' },
          { action: 'Submit payment using the sandbox declined-payment response, then return to the cart.', expectedResult: 'The same items and price adjustments remain in the cart; payment has not completed.' },
        ], evidence: [evidence], assumptions: [], warnings: [],
      }] }
    }
    return { ok: true, warnings: evidence ? [] : ['This synthetic review fixture only supports requirement-scoped drafting.'], suggestions: evidence ? [{
      title: 'Verify the selected acceptance criterion', area: 'Synthetic QA review', priority: 'High', type: 'Functional',
      preconditions: 'The synthetic demonstration workspace is available.', structuredSteps: [
        { action: 'Open the relevant workflow in the demonstration workspace.', expectedResult: 'The controls for the selected acceptance criterion are available.' },
        { action: 'Exercise the requirement using reviewed scenario data.', expectedResult: evidence },
      ], evidence: [evidence], assumptions: ['Replace this generic synthetic fixture with concrete scenario data before real execution.'], warnings: [],
    }] : [] }
  }
  if (path.endsWith('/document-unit')) {
    const text = String(body.text ?? '')
    const evidence = text.split('\n').map((line) => line.trim()).filter((line) => line && !line.startsWith('#')).slice(0, 12)
    return { ok: true, analysis: { version: 1, findings: evidence.map((quote) => ({
      kind: /unclear|clarification|unspecified|does not define/i.test(quote) ? 'ambiguity' : 'requirement', summary: quote.slice(0, 600),
      quote: quote.slice(0, 800), occurrence: 0, coverage: Array.isArray(body.heading) ? body.heading.slice(-1).join('') : 'Commerce acceptance criteria',
    })), limitations: [] } }
  }
  if (path.endsWith('/coverage-area-suggestions')) {
    const area = body.selectedArea as { name: string; summary: string; evidence: string[] }
    return { ok: true, areaSuggestionResult: {
      schemaVersion: 'ai-coverage-area-suggestions-json-v1',
      sourceScope: { qaSourceId: body.qaSourceId, visibleSourceOnly: true, sourceTruncated: body.truncated === true, analysisScope: 'visible_source_only' },
      areaScope: { ...area, generationReadiness: 'source_backed' },
      testCaseSuggestions: [
        { status: 'Ready', confidence: 'High', title: 'Order total reflects all adjustments before payment', area: area.name, priority: 'High', type: 'Functional', preconditions: 'A customer has a stocked cart, a valid coupon, and a delivery address.', structuredSteps: [{ action: 'Open checkout and apply the eligible coupon.', expectedResult: 'Items, discount, tax, shipping, and the final total are shown before payment.' }, { action: 'Trigger a declined payment and return to the cart.', expectedResult: 'The cart and its price adjustments remain intact.' }], evidence: area.evidence, assumptions: [], warnings: [] },
        { status: 'Needs Review', confidence: 'Medium', title: 'Tax rounding is consistent across line items', area: area.name, priority: 'Medium', type: 'Functional', preconditions: 'A cart contains items with fractional tax amounts.', structuredSteps: [{ action: 'Compare each line tax with the final total.', expectedResult: 'The approved rounding policy is applied consistently.' }], evidence: area.evidence, assumptions: ['Product must confirm whether rounding occurs per line or per order.'], warnings: ['Rounding policy needs QA review.'] },
      ],
      coverageAssessment: { coverageLevel: 'Partial', coveredBehaviors: area.evidence, missingBehaviors: ['Currency-specific rounding rules require clarification.'], blockedAmbiguousItems: [], suggestedFollowUpCoverage: ['Verify the approved tax rounding policy.'], stopReason: 'Review these bounded suggestions before further generation.' },
      warnings: [],
    }, warnings: [] }
  }
  if(path.endsWith('/coverage-plan-merge')) return {ok:true,classification:{schemaVersion:'coverage-plan-merge-decisions-json-v1',decisions:(body.candidatePairs as {pairAlias:string}[]).map((pair,i)=>({pairAlias:pair.pairAlias,relation:i%3===0?'conflict':'likely_overlap',reasonCode:i%3===0?'contradictory_claim':'same_intent'}))}}
  if(path.endsWith('/section-coverage-plan')) { const snapshot=body.sectionSnapshot as {title:string}; const visible=body.visibleSection as {content:string}; return {ok:true,analysis:{schemaVersion:'section-coverage-plan-json-v1',coverageAreas:[{name:snapshot.title,summary:'Review the selected acceptance criteria.',behaviors:[visible.content.split('\n').slice(1).join(' ').trim()],evidence:[visible.content.split('\n').slice(1).join(' ').trim()]}],actors:['Customer'],states:['Checkout pending'],inputs:['Payment request'],failureModes:['Payment provider unavailable'],integrationRisks:[],permissionsSecurity:[],dataPersistenceConcerns:['Preserve the cart when authorization fails'],ambiguities:[],nextCoverage:[],warnings:[]},warnings:[]} }
  return {ok:true,coveragePlan:demoCoveragePlan,warnings:[]}
}
