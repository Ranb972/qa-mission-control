import { describe, expect, it } from 'vitest'
import { parseCsv } from './csvParser'

describe('parseCsv', () => {
  it('parses comma-separated rows', () => {
    const result = parseCsv('Title,Steps\nLogin,Open login page')

    expect(result.delimiter).toBe(',')
    expect(result.headers).toEqual(['Title', 'Steps'])
    expect(result.rows).toEqual([
      {
        rowNumber: 2,
        values: {
          Title: 'Login',
          Steps: 'Open login page',
        },
      },
    ])
  })

  it('parses quoted values with commas', () => {
    const result = parseCsv('Title,Steps\n"Checkout, coupon","Add item, apply code"')

    expect(result.rows[0].values).toEqual({
      Title: 'Checkout, coupon',
      Steps: 'Add item, apply code',
    })
  })

  it('parses escaped quotes', () => {
    const result = parseCsv('Title,Steps\n"Login ""happy path""","Submit form"')

    expect(result.rows[0].values.Title).toBe('Login "happy path"')
  })

  it('handles CRLF and LF line endings', () => {
    const result = parseCsv('Title,Steps\r\nLogin,Open\r\nCheckout,Pay\nProfile,Save')

    expect(result.rows.map((row) => row.values.Title)).toEqual([
      'Login',
      'Checkout',
      'Profile',
    ])
  })

  it('strips a UTF-8 BOM from the first header', () => {
    const result = parseCsv('\ufeffTitle,Steps\nLogin,Open')

    expect(result.headers).toEqual(['Title', 'Steps'])
  })

  it('detects semicolon-delimited CSV files', () => {
    const result = parseCsv('Title;Steps\nLogin;Open login page')

    expect(result.delimiter).toBe(';')
    expect(result.rows[0].values).toEqual({
      Title: 'Login',
      Steps: 'Open login page',
    })
  })
})
