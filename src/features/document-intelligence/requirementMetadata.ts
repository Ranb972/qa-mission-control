type MetadataField = { label: string; value: string; start: number; end: number }
const FIELD = /^\s*(Requirement\s+ID|Status|Title|BSC\s+reference|Man\s*\/\s*auto|Frequency|Volumes)\s*:\s*(.*?)\s*$/i
const fold = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase()

/** Recognizes explicit document key/value fields, not arbitrary "status" prose.
 * Status/Title alone are not enough: require a Requirement ID and another
 * recognized field in the same adjacent metadata block. Never removes source. */
export function createRequirementMetadataContext(source: string) {
  const lines = [...source.matchAll(/[^\r\n]+/g)]
  const fields: MetadataField[] = []
  let block: MetadataField[] = []
  const flush = () => {
    if (block.length >= 2 && block.some((field) => /^requirement\s+id$/i.test(field.label))) fields.push(...block)
    block = []
  }
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const match = line[0].match(FIELD)
    if (!match) { flush(); continue }
    let value = match[2]
    let end = line.index! + line[0].length
    // PDF extraction can put a short field value on the following line. Do
    // not consume functional prose or another labeled field as its value.
    const next = lines[index + 1]
    const following = lines[index + 2]
    if (!value && next && next[0].trim().length <= 80 && !next[0].includes(':') &&
      !/\b(must|shall|should|will|system)\b/i.test(next[0]) && !/[.!?]$/.test(next[0].trim()) &&
      (/^[A-Z][A-Z0-9_-]{0,30}$/.test(next[0].trim()) || following && (FIELD.test(following[0]) || /^\s*Functional Requirements\s*:/i.test(following[0])))) {
      value = next[0].trim(); end = next.index! + next[0].length; index += 1
    }
    block.push({ label: match[1], value, start: line.index!, end })
  }
  flush()
  const outside = fields.reduce((text, field) => text.slice(0, field.start) + ' '.repeat(field.end - field.start) + text.slice(field.end), source)
  const normalizedOutside = fold(outside)
  const inMetadataSpan = (start: number, end: number) => start >= 0 && end > start && end <= source.length &&
    fields.some((field) => start < field.end && end > field.start) && outside.slice(start, end).trim().length === 0
  return {
    inMetadataSpan,
    isMetadataOnlyConcept(value: string) {
      const wanted = fold(value)
      if (!wanted || !fields.some((field) => [field.label, field.value, `${field.label}: ${field.value}`].some((candidate) => fold(candidate) === wanted))) return false
      // A real occurrence outside metadata retains its meaning, including M.
      let index = normalizedOutside.indexOf(wanted)
      while (index >= 0) {
        const before = normalizedOutside[index - 1] ?? ''
        const after = normalizedOutside[index + wanted.length] ?? ''
        if (!/[\p{L}\p{N}_]/u.test(before) && !/[\p{L}\p{N}_]/u.test(after)) return false
        index = normalizedOutside.indexOf(wanted, index + 1)
      }
      return true
    },
  }
}
