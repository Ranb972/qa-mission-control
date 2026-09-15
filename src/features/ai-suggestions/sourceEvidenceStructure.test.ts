import { describe, expect, it } from 'vitest'
import { createEvidenceCompletenessCheck } from './sourceEvidenceStructure'

const check = (source: string, quote: string, truncated = false) => createEvidenceCompletenessCheck({ visibleSectionContent: source, visibleSectionTruncated: truncated }, 240)(quote)

describe('source-proven clipped copula evidence', () => {
  it.each([
    ['Controls must ensure changes are\ncompleted promptly.', 'Controls must ensure changes are'],
    ['Controls must ensure changes are\r\n  completed promptly.', 'Controls must ensure changes are'],
    ['Controls must ensure changes are completed promptly.', 'Controls must ensure changes are'],
    ['The audit record is\nretained.', 'The audit record is'],
    ['The audit record was\nretained.', 'The audit record was'],
    ['The audit records were\nretained.', 'The audit records were'],
    ['Controls must ensure\n changes are\ncompleted promptly.', 'Controls must ensure changes are'],
  ])('rejects a proven unfinished predicate without repairing it: %s', (source, quote) => {
    expect(check(source, quote)).toBe(false)
  })
  it.each([
    ['Controls must ensure changes are\ncompleted promptly.', 'Controls must ensure changes are completed promptly.'],
    ['Maintain an audit trail, and\nprovide reporting.', 'Maintain an audit trail, and'],
    ['- Record the operator;\n- Record the timestamp.', 'Record the operator;'],
    ['A label is', 'A label is'],
    ['A label is\n\nA separate paragraph.', 'A label is'],
    ['A label is\n- A separate list.', 'A label is'],
    ['A label is\n# A separate heading', 'A label is'],
  ])('does not infer a continuation or reject a complete supported excerpt: %s', (source, quote) => {
    expect(check(source, quote)).toBe(true)
  })
})

describe('source-structural semicolon evidence exception', () => {
  it.each([
    ['- the identity of the user who made the change;\n- the nature of the change; and\n- the date and time of the change.', '- the identity of the user who made the change;'],
    ['- the identity of the user who made the change;\n- the nature of the change; and\n- the date and time of the change.', 'the nature of the change;'],
    ['  • Record user identity;\r\n  • Record date/time.', 'Record user identity;'],
    ['1. Record user identity;\n2. Record date/time.', '1. Record user identity;'],
    ['(a) Record user identity;\n(b) Record date/time.', 'Record user identity;'],
    ['- Record the identity of the user\n  who changed the data;\n- Record time.', 'Record the identity of the user who changed the data;'],
    ['- Record user identity;', 'Record user identity;'],
    ['- Record user identity;\n\nA separate reporting paragraph.', 'Record user identity;'],
  ])('accepts only a complete source list item: %s', (source, quote) => {
    expect(check(source, quote)).toBe(true)
  })
  it.each([
    ['- Record user; unless anonymous.\n- Record time.', 'Record user;'],
    ['- Record user;\n  except service accounts.\n- Record time.', 'Record user;'],
    ['- When enabled, record user;\n- Record time.', 'record user;'],
    ['- Record user; and\n  include service accounts.\n- Record time.', 'Record user;'],
    ['Record user;\nRecord time.', 'Record user;'],
    ['- Record user;\n- Record time;', '- Record user;\n- Record time;'],
    ['- Record user identity;\n- Record time.', 'Capture user identity;'],
    ['- Record the user and retain the identity;\n- Record time.', 'Record the user identity;'],
    ['- Record\n user;\n- Record\tuser;', 'Record user;'],
    ['- Record user;\nInline Record user; continuation.', 'Record user;'],
    ['- provide facilities e.g. (backup,\n- Restore data.', 'provide facilities e.g. (backup,'],
    ['- Provide (backup;\n- Restore data.', 'Provide (backup;'],
    ['- Provide backup);\n- Restore data.', 'Provide backup);'],
    ['- Provide ([backup)];\n- Restore data.', 'Provide ([backup)];'],
    ['- Provide e.g.;\n- Restore data.', 'Provide e.g.;'],
    ['- Provide backup,;\n- Restore data.', 'Provide backup,;'],
    ['- Provide backup:;\n- Restore data.', 'Provide backup:;'],
    ['- Provide backup...;\n- Restore data.', 'Provide backup...;'],
  ])('rejects incomplete, unsupported or structurally ambiguous evidence: %s', (source, quote) => {
    expect(check(source, quote)).toBe(false)
  })
  it('never treats a clipped visible-source end as proof of a complete item', () => {
    expect(check('- Record user;', 'Record user;', true)).toBe(false)
    expect(createEvidenceCompletenessCheck({ visibleSectionContent: '- Record user;' }, 240)('Record user;')).toBe(false)
    expect(check('- Record user;\n- Record time', 'Record user;', true)).toBe(true)
  })
  it.each([';', '- ;', '1. ;', '();', '- ();', '1. ();', '• ...!?;', '...!?;', '• 😀;', '😀;'])('rejects an empty or punctuation-only list body: %s', quote => {
    const item = /^(?:[-•]|1\.) /.test(quote) ? quote : `- ${quote}`
    expect(check(`${item}\n- Record time.`, quote)).toBe(false)
  })
  it('allows substantive Unicode list content without imposing English vocabulary', () => {
    expect(check('- 記録する;\n- Next item.', '記録する;')).toBe(true)
  })
  it('does not relax source-free parsing or ordinary unfinished prose', () => {
    const noSource = createEvidenceCompletenessCheck(undefined, 240)
    expect(noSource('Record user;')).toBe(false)
    expect(noSource('Record user.')).toBe(true)
    expect(noSource('provide facilities e.g. (backup,')).toBe(false)
  })
})
