import { createSourceEvidenceMatcher, isUnfinishedBehavior } from './sourceEvidence'

export type SectionEvidenceSourceContext = {
  visibleSectionContent: string
  /** Only an explicitly complete selected section may prove an EOF boundary. */
  visibleSectionTruncated?: boolean
}

// Structural list syntax only, not a semantic or fuzzy clause classifier.
const LIST_PREFIX = /^[ \t]*(?:[-*•‣▪–—]|\d{1,3}[.)]|\([a-zA-Z0-9]{1,3}\)|[a-zA-Z][.)])[ \t]+/
function balancedBrackets(text: string) {
  const stack: string[] = []
  const pairs: Record<string, string> = { ')': '(', ']': '[', '}': '{' }
  for (const character of text) {
    if ('([{'.includes(character)) stack.push(character)
    else if (Object.hasOwn(pairs, character) && stack.pop() !== pairs[character]) return false
  }
  return stack.length === 0
}

/** Evidence-only source checks. Behavior validation and exact matching stay
 * unchanged; the sole acceptance exception is one complete semicolon list item. */
export function createEvidenceCompletenessCheck(context: SectionEvidenceSourceContext | undefined, maxLength: number) {
  const source = context?.visibleSectionContent
  const match = source === undefined ? undefined : createSourceEvidenceMatcher(source)
  return (quote: string): boolean => {
    // An exact excerpt can still stop mid-predicate at a PDF hard wrap. Refuse
    // that proven clipping; never append the omitted continuation as evidence.
    if (source !== undefined && /\b(?:is|are|was|were)$/i.test(quote)) {
      const original = match?.(quote, maxLength)
      if (original) {
        let occurrence = source.indexOf(original)
        while (occurrence >= 0) {
          const tail = source.slice(occurrence + original.length)
          const continuation = /^(?:[ \t]*\r?\n[ \t]*|[ \t]+)([^\r\n]*)/.exec(tail)?.[1] ?? ''
          // Never cross a blank paragraph, list item or Markdown heading. EOF
          // alone is not evidence that an omitted predicate continuation exists.
          if (/^\p{L}/u.test(continuation.trimStart()) && !LIST_PREFIX.test(continuation)) return false
          occurrence = source.indexOf(original, occurrence + 1)
        }
      }
    }
    if (!isUnfinishedBehavior(quote)) return true
    if (!quote.endsWith(';') || isUnfinishedBehavior(quote.slice(0, -1).trimEnd()) || !balancedBrackets(quote)) return false
    const original = match?.(quote, maxLength)
    if (!original || source === undefined) return false
    // A contiguous multi-item or multi-paragraph quote is not one complete item.
    if (original.split(/\r?\n/).slice(1).some(line => !line.trim() || LIST_PREFIX.test(line))) return false

    let occurrence = source.indexOf(original)
    while (occurrence >= 0) {
      const lineStart = source.lastIndexOf('\n', occurrence - 1) + 1
      const prefix = LIST_PREFIX.exec(source.slice(lineStart))?.[0]
      if (!prefix) return false
      const markerStart = lineStart + (prefix.match(/^[ \t]*/)?.[0].length ?? 0)
      // Omit only indentation and/or the literal list marker, never clause words.
      if (occurrence !== markerStart && occurrence !== lineStart + prefix.length) return false
      const end = occurrence + original.length
      // Numbered markers and punctuation alone are not substantive item content.
      const itemBody = source.slice(lineStart + prefix.length, end - 1)
      if (!/[\p{L}\p{N}]/u.test(itemBody)) return false
      const newline = source.indexOf('\n', end)
      const tail = source.slice(end, newline < 0 ? source.length : newline).trim()
      if (tail && !/^(?:and|or)$/i.test(tail)) return false
      const following = newline < 0 ? '' : source.slice(newline + 1)
      const nextItem = LIST_PREFIX.test(following)
      // A connector is allowed only as the separator before the next list item.
      if (tail && !nextItem) return false
      const paragraphBoundary = /^[ \t]*\r?\n/.test(following)
      const completeEnd = !following.trim() && context?.visibleSectionTruncated === false
      if (!nextItem && !paragraphBoundary && !completeEnd) return false
      // Repeated literal excerpts must not hide an interior/clipped occurrence.
      occurrence = source.indexOf(original, occurrence + 1)
    }
    return true
  }
}
