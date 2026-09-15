/** Whitespace-only comparison with a reversible map to the original UTF-16 span.
 * No case, punctuation, Unicode composition, hyphenation or semantic changes. */
function foldWithSpans(text: string) {
  let folded = ''
  const starts: number[] = []
  const ends: number[] = []
  for (let index = 0; index < text.length;) {
    const start = index
    if (/\s/u.test(text[index])) {
      while (index < text.length && /\s/u.test(text[index])) index += 1
      folded += ' '
    } else {
      folded += text[index]
      index += 1
    }
    starts.push(start)
    ends.push(index)
  }
  return { folded, starts, ends }
}

export function createSourceEvidenceMatcher(source: string) {
  let sourceMap: ReturnType<typeof foldWithSpans> | undefined
  return (quote: string, maxLength: number): string | null => {
    if (!quote || quote !== quote.trim() || quote.length > maxLength) return null
    if (source.includes(quote)) return quote
    sourceMap ??= foldWithSpans(source)
    const wanted = foldWithSpans(quote).folded
    const start = sourceMap.folded.indexOf(wanted)
    // A normalized quote must identify one contiguous span, not an arbitrary
    // occurrence among differently wrapped source passages.
    if (start < 0 || sourceMap.folded.indexOf(wanted, start + 1) >= 0) return null
    const original = source.slice(sourceMap.starts[start], sourceMap.ends[start + wanted.length - 1])
    return original.length <= maxLength && foldWithSpans(original).folded === wanted ? original : null
  }
}

export function isUnfinishedBehavior(text: string) {
  if (/[,:;…]$|\.{3}$|\b(?:e\.g\.|i\.e\.)$/i.test(text)) return true
  // This is prose, not a programming-language parser: mixed bracket pairs can
  // legitimately express intervals such as [0, 100). Only detect an open tail.
  return (text.match(/[([{]/g)?.length ?? 0) > (text.match(/[)\]}]/g)?.length ?? 0)
}
