import type { DocumentPage } from './documentTypes'

/** Generated, not checked-in binaries: ~3,000 characters/page, with realistic difficult structure. */
export function createEnterpriseFixture(pageCount: number) {
  const pages: DocumentPage[] = []
  const pieces: string[] = []
  let offset = 0
  for (let page = 1; page <= pageCount; page += 1) {
    const text = `# Chapter ${page}: Commerce\n## Acceptance rules\n` +
      Array.from({ length: 18 }, (_, rule) =>
        `REQ-${page}-${rule + 1}: The service must validate the customer's authorization before accepting transaction ${rule + 1}. Record the outcome without storing payment credentials.\n`,
      ).join('') +
      `## Validation\n| Rule | Expected behavior |\n|---|---|\n| Refund | Refund within ${page % 2 ? 14 : 30} days |\n| הרשאות | חובה לאמת הרשאות לפני תשלום |\nThe response should be reasonably fast (clarification needed).\n\n`
    pieces.push(text)
    pages.push({ number: page, startOffset: offset, endOffset: offset + text.length, status: 'pending', extraction: 'text' })
    offset += text.length
  }
  return { content: pieces.join(''), pages }
}
