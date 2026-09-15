import { describe, expect, it } from 'vitest'
import { createQaSource } from '../../test/qaSourceFactory'
import {
  createQaSourceSectionIndex,
  getQaSourceSectionIndexFreshness,
  QA_SOURCE_SECTION_SCHEMA_VERSION,
  QA_SOURCE_SECTIONER_VERSION,
} from './qaSourceSections'

describe('qaSourceSections', () => {
  it('extracts Markdown headings with offsets and line ranges', () => {
    const content = [
      '# Checkout LLD',
      '',
      'Payment authorization must handle approved responses.',
      '',
      '## Declines',
      'Declined cards show recoverable messaging.',
    ].join('\n')
    const source = createQaSource({ id: 'source-1', content })

    const index = createQaSourceSectionIndex(source, '2026-05-27T08:00:00.000Z')

    expect(index.schemaVersion).toBe(QA_SOURCE_SECTION_SCHEMA_VERSION)
    expect(index.sectionerVersion).toBe(QA_SOURCE_SECTIONER_VERSION)
    expect(index.sections).toHaveLength(2)
    expect(index.sections[0]).toMatchObject({
      ordinal: 1,
      title: 'Checkout LLD',
      level: 1,
      path: ['Checkout LLD'],
      startOffset: 0,
      startLine: 1,
      endLine: 4,
      includedInCoverage: true,
    })
    expect(index.sections[0].endOffset).toBe(content.indexOf('## Declines'))
    expect(index.sections[1]).toMatchObject({
      ordinal: 2,
      title: 'Declines',
      level: 2,
      path: ['Checkout LLD', 'Declines'],
      startOffset: content.indexOf('## Declines'),
      startLine: 5,
      endLine: 6,
    })
    expect(index.sections[1].preview).toContain('Declined cards')
  })

  it('extracts Setext headings where reasonable', () => {
    const content = [
      'Checkout Overview',
      '=================',
      'Checkout supports card authorization.',
      '',
      'Failure modes',
      '-------------',
      'Timeouts must be handled.',
    ].join('\n')

    const index = createQaSourceSectionIndex(createQaSource({ content }))

    expect(index.sections.map((section) => section.title)).toEqual([
      'Checkout Overview',
      'Failure modes',
    ])
    expect(index.sections[1]).toMatchObject({
      level: 2,
      path: ['Checkout Overview', 'Failure modes'],
    })
  })

  it('extracts numbered headings and nested paths', () => {
    const content = [
      '1. Authentication',
      'Users sign in with email.',
      '',
      '1.1 Locked Accounts',
      'Locked accounts require support review.',
      '',
      '2. Billing',
      'Billing handles retries.',
    ].join('\n')

    const index = createQaSourceSectionIndex(createQaSource({ content }))

    expect(index.sections.map((section) => section.title)).toEqual([
      'Authentication',
      'Locked Accounts',
      'Billing',
    ])
    expect(index.sections[1].path).toEqual(['Authentication', 'Locked Accounts'])
    expect(index.sections[2].path).toEqual(['Billing'])
  })

  it('keeps duplicate headings unique and deterministic', () => {
    const content = [
      '# Notifications',
      'Email notification behavior.',
      '',
      '# Notifications',
      'SMS notification behavior.',
    ].join('\n')
    const source = createQaSource({ content })

    const firstIndex = createQaSourceSectionIndex(source)
    const secondIndex = createQaSourceSectionIndex(source)

    expect(firstIndex.warnings).toContain(
      'Duplicate section headings were detected; stable occurrence keys were applied.',
    )
    expect(firstIndex.sections[0].title).toBe('Notifications')
    expect(firstIndex.sections[1].title).toBe('Notifications')
    expect(firstIndex.sections[0].stableKey).not.toBe(
      firstIndex.sections[1].stableKey,
    )
    expect(firstIndex.sections.map((section) => section.id)).toEqual(
      secondIndex.sections.map((section) => section.id),
    )
  })

  it('extracts useful all-caps headings from DOCX-like plain text', () => {
    const content = [
      'CUSTOMER NOTIFICATIONS',
      'Send email after payment approval.',
      '',
      'RETRY RULES',
      'Retry notification delivery once.',
    ].join('\n')

    const index = createQaSourceSectionIndex(createQaSource({ content }))

    expect(index.sections.map((section) => section.title)).toEqual([
      'CUSTOMER NOTIFICATIONS',
      'RETRY RULES',
    ])
    expect(index.warnings).toEqual([])
  })

  it('handles PDF-like page markers without treating them as section headings', () => {
    const content = [
      '--- Page 1 ---',
      'AUTHENTICATION',
      'Login supports valid credentials.',
      '',
      '--- Page 2 ---',
      'BILLING',
      'Billing supports payment retries.',
    ].join('\n')

    const index = createQaSourceSectionIndex(createQaSource({ content }))

    expect(index.sections.map((section) => section.title)).toEqual([
      'Introduction',
      'AUTHENTICATION',
      'BILLING',
    ])
    expect(index.sections[0].preview).toContain('--- Page 1 ---')
  })

  it('supports Unicode and Hebrew source text safely', () => {
    const content = ['# התחברות', 'משתמש יכול להתחבר עם סיסמה תקינה.'].join('\n')

    const index = createQaSourceSectionIndex(createQaSource({ content }))

    expect(index.sections).toHaveLength(1)
    expect(index.sections[0].title).toBe('התחברות')
    expect(index.sections[0].preview).toContain('משתמש יכול להתחבר')
    expect(index.sections[0].stableKey).toContain('התחברות')
  })

  it('creates fallback parts for long unheaded text at line boundaries where practical', () => {
    const paragraphs = Array.from({ length: 14 }, (_, index) =>
      `Paragraph ${index + 1} ${'source behavior '.repeat(45)}`.trim(),
    )
    const content = paragraphs.join('\n\n')

    const index = createQaSourceSectionIndex(createQaSource({ content }))

    expect(index.sections.length).toBeGreaterThan(1)
    expect(index.sections[0].title).toBe('Part 1')
    expect(index.sections[1].title).toBe('Part 2')
    expect(index.warnings).toContain(
      'No reliable headings were detected; source structure uses fallback parts.',
    )
    expect(content[index.sections[0].endOffset]).toBe('\n')
  })

  it('does not mutate source content and detects stale source changes', () => {
    const source = createQaSource({
      content: '# Checkout\nPayment authorization behavior.',
    })
    const originalContent = source.content
    const index = createQaSourceSectionIndex(source)

    expect(source.content).toBe(originalContent)
    expect(getQaSourceSectionIndexFreshness(index, source)).toEqual({
      isFresh: true,
      reasons: [],
    })
    expect(
      getQaSourceSectionIndexFreshness(index, {
        ...source,
        updatedAt: '2026-05-27T09:00:00.000Z',
      }).isFresh,
    ).toBe(false)
    expect(
      getQaSourceSectionIndexFreshness(index, {
        ...source,
        content: '# Checkout\nChanged behavior.',
      }).reasons,
    ).toContain(
      'The QA Source content or metadata no longer matches this section index.',
    )
  })
})
