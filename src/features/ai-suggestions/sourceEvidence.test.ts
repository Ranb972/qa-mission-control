import { describe, expect, it } from 'vitest'
import { createSourceEvidenceMatcher, isUnfinishedBehavior } from './sourceEvidence'
import { createRequirementMetadataContext } from '../document-intelligence/requirementMetadata'

describe('reversible source evidence matching', () => {
  it('returns the original contiguous source span after whitespace-only folding', () => {
    const source = 'Header\r\nRecord the user,\r\n\t nature\u00a0of change and date/time.\nFooter'
    expect(createSourceEvidenceMatcher(source)('Record the user, nature of change and date/time.', 240))
      .toBe('Record the user,\r\n\t nature\u00a0of change and date/time.')
  })
  it.each([
    ['Restore the data.', 'Recover the information.'],
    ['Restore the data.', 'restore the data.'],
    ['Restore “data”.', 'Restore "data".'],
    ['re-\nvalidate data', 'revalidate data'],
    ['Restore data after failure.', 'Restore data failure.'],
    ['caf\u00e9 data', 'cafe\u0301 data'],
    ['Restore data.', ' Restore data. '],
  ])('does not repair unsupported changes to %s', (source, quote) => {
    expect(createSourceEvidenceMatcher(source)(quote, 240)).toBeNull()
  })
  it('rejects ambiguous normalized occurrences and excessive reconstructed spans', () => {
    expect(createSourceEvidenceMatcher('Restore\n data. Restore\tdata.')('Restore data.', 240)).toBeNull()
    expect(createSourceEvidenceMatcher(`Restore${' '.repeat(240)}data.`)('Restore data.', 240)).toBeNull()
  })
  it('retains exact Unicode and repeated literal quotes', () => {
    expect(createSourceEvidenceMatcher('שחזור 😀\nשחזור 😀')('שחזור 😀', 240)).toBe('שחזור 😀')
  })
  it('detects unfinished prose, not valid mathematical interval notation', () => {
    expect(isUnfinishedBehavior('provide facilities e.g. (backup,')).toBe(true)
    expect(isUnfinishedBehavior('Support values in [0, 100).')).toBe(false)
    expect(isUnfinishedBehavior('Restart jobs after an unexpected error.')).toBe(false)
  })
})

describe('bounded requirement metadata context', () => {
  it('recognizes PDF label/value line wrapping and contiguous metadata-only quotes', () => {
    const source = 'Requirement ID:\nSYN_REF_F001\nStatus:\nM\nTitle: Capture reference data\nFunctional Requirements: Capture and validate data.'
    const context = createRequirementMetadataContext(source)
    expect(context.isMetadataOnlyConcept('M')).toBe(true)
    expect(context.inMetadataSpan(0, source.indexOf('Functional'))).toBe(true)
    expect(context.inMetadataSpan(source.indexOf('Capture and'), source.length)).toBe(false)
  })
  it('does not classify ordinary form fields or bare labels as requirement metadata', () => {
    for (const source of ['Status: M\nTitle: Monitoring\nFrequency: 10 Hz', 'The state M requires a recovery action.']) {
      expect(createRequirementMetadataContext(source).isMetadataOnlyConcept('M')).toBe(false)
    }
  })
  it('does not swallow a functional sentence after an empty metadata field', () => {
    const source = 'Requirement ID: SYN_REF_F001\nStatus: M\nVolumes:\nCapture reference data.\nValidate reference data.'
    const context = createRequirementMetadataContext(source)
    expect(context.isMetadataOnlyConcept('Capture reference data.')).toBe(false)
    expect(context.inMetadataSpan(source.indexOf('Capture'), source.indexOf('Validate'))).toBe(false)
  })
})
