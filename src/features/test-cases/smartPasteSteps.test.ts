import { describe, expect, it } from 'vitest'
import { parseSmartPasteSteps } from './smartPasteSteps'

describe('parseSmartPasteSteps', () => {
  it('parses numbered lines with pipe separators', () => {
    const result = parseSmartPasteSteps(
      [
        '1. Open login page | Login form is displayed',
        '2. Enter valid email | Email is accepted',
      ].join('\n'),
    )

    expect(result.steps).toEqual([
      {
        action: 'Open login page',
        expectedResult: 'Login form is displayed',
        warnings: [],
        confidence: 'High confidence',
      },
      {
        action: 'Enter valid email',
        expectedResult: 'Email is accepted',
        warnings: [],
        confidence: 'High confidence',
      },
    ])
    expect(result.invalidLines).toEqual([])
  })

  it('parses Hebrew numbered lines with pipe separators', () => {
    const result = parseSmartPasteSteps(
      [
        '1. להיכנס למסך התחברות | מוצגים שדות אימייל וסיסמה',
        '2. להזין משתמש תקין | השדה מקבל את הערך',
      ].join('\n'),
    )

    expect(result.steps).toEqual([
      expect.objectContaining({
        action: 'להיכנס למסך התחברות',
        expectedResult: 'מוצגים שדות אימייל וסיסמה',
        confidence: 'High confidence',
      }),
      expect.objectContaining({
        action: 'להזין משתמש תקין',
        expectedResult: 'השדה מקבל את הערך',
        confidence: 'High confidence',
      }),
    ])
  })

  it('parses Step and Expected pairs', () => {
    const result = parseSmartPasteSteps(
      [
        'Step 1: Open login page',
        'Expected: Login form is displayed',
        '',
        'Step 2: Enter valid email',
        'Expected: Email is accepted',
      ].join('\r\n'),
    )

    expect(result.steps).toEqual([
      expect.objectContaining({
        action: 'Open login page',
        expectedResult: 'Login form is displayed',
        confidence: 'High confidence',
      }),
      expect.objectContaining({
        action: 'Enter valid email',
        expectedResult: 'Email is accepted',
        confidence: 'High confidence',
      }),
    ])
  })

  it('parses Hebrew צעד and תוצאה צפויה pairs', () => {
    const result = parseSmartPasteSteps(
      [
        'צעד 1: להיכנס למסך התחברות',
        'תוצאה צפויה: מוצגים שדות אימייל וסיסמה',
        'צעד 2: להזין משתמש תקין',
        'תוצאה צפויה: השדה מקבל את הערך',
      ].join('\n'),
    )

    expect(result.steps).toEqual([
      expect.objectContaining({
        action: 'להיכנס למסך התחברות',
        expectedResult: 'מוצגים שדות אימייל וסיסמה',
        confidence: 'High confidence',
      }),
      expect.objectContaining({
        action: 'להזין משתמש תקין',
        expectedResult: 'השדה מקבל את הערך',
        confidence: 'High confidence',
      }),
    ])
  })

  it('marks fallback numbered lines as needing expected-result review', () => {
    const result = parseSmartPasteSteps(
      ['1. Open login page', '2. Enter valid email'].join('\n'),
    )

    expect(result.steps).toEqual([
      expect.objectContaining({
        action: 'Open login page',
        expectedResult: '',
        confidence: 'Needs review',
      }),
      expect.objectContaining({
        action: 'Enter valid email',
        expectedResult: '',
        confidence: 'Needs review',
      }),
    ])
    expect(result.steps[0].warnings).toContain(
      'Expected result is missing. Fill it in before saving this test case.',
    )
    expect(result.warnings).toContain(
      '2 steps need expected results before saving.',
    )
  })

  it('supports =>, ->, em dash, and spaced dash separators', () => {
    const result = parseSmartPasteSteps(
      [
        '1. Open login => Login opens',
        '2. Submit form -> Dashboard opens',
        '3. Open reports — Reports load',
        '4. Export report - File downloads',
      ].join('\n'),
    )

    expect(result.steps.map((step) => step.expectedResult)).toEqual([
      'Login opens',
      'Dashboard opens',
      'Reports load',
      'File downloads',
    ])
  })

  it('parses tab-separated Excel rows with action and expected result', () => {
    const result = parseSmartPasteSteps(
      [
        'Open login page\tLogin form is displayed',
        'Enter valid email\tEmail is accepted',
      ].join('\n'),
    )

    expect(result.steps).toEqual([
      expect.objectContaining({
        action: 'Open login page',
        expectedResult: 'Login form is displayed',
        confidence: 'Medium confidence',
      }),
      expect.objectContaining({
        action: 'Enter valid email',
        expectedResult: 'Email is accepted',
        confidence: 'Medium confidence',
      }),
    ])
    expect(result.invalidLines).toEqual([])
  })

  it('parses tab-separated Excel rows with a numeric first column', () => {
    const result = parseSmartPasteSteps(
      [
        '1\tOpen login page\tLogin form is displayed',
        '2.\tEnter valid email\tEmail is accepted',
      ].join('\n'),
    )

    expect(result.steps).toEqual([
      expect.objectContaining({
        action: 'Open login page',
        expectedResult: 'Login form is displayed',
        confidence: 'High confidence',
      }),
      expect.objectContaining({
        action: 'Enter valid email',
        expectedResult: 'Email is accepted',
        confidence: 'High confidence',
      }),
    ])
    expect(result.invalidLines).toEqual([])
  })

  it('prefers strong separators before spaced dash', () => {
    const result = parseSmartPasteSteps(
      '1. Verify profile - read-only state | Save button is disabled',
    )

    expect(result.steps).toEqual([
      expect.objectContaining({
        action: 'Verify profile - read-only state',
        expectedResult: 'Save button is disabled',
        confidence: 'High confidence',
      }),
    ])
  })

  it('does not split aggressively on normal hyphenated text', () => {
    const result = parseSmartPasteSteps(
      '1. Open the self-service login-page',
    )

    expect(result.steps).toHaveLength(1)
    expect(result.steps[0]).toEqual(
      expect.objectContaining({
        action: 'Open the self-service login-page',
        expectedResult: '',
        confidence: 'Needs review',
      }),
    )
  })

  it('does not crash on malformed input and reports invalid lines', () => {
    const result = parseSmartPasteSteps(
      ['Open login page', 'Expected:', '2. Enter email | Email accepted'].join(
        '\n',
      ),
    )

    expect(result.steps).toEqual([
      expect.objectContaining({
        action: 'Enter email',
        expectedResult: 'Email accepted',
      }),
    ])
    expect(result.invalidLines).toEqual(['Open login page', 'Expected:'])
    expect(result.warnings).toContain('2 lines were not recognized.')
  })

  it('returns no detected steps for empty input', () => {
    const result = parseSmartPasteSteps('\uFEFF  \n\n')

    expect(result).toEqual({
      steps: [],
      warnings: [],
      invalidLines: [],
    })
  })
})
