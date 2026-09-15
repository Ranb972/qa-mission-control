import type { Requirement } from '../document-intelligence/requirementModel'
import type { ProductClue, ProductEvidence } from './productEvidence'

export type EvidenceComparison = { requirement: Requirement; clues: ProductClue[]; kind: 'numeric_difference' | 'related_clue' | 'no_matching_clue' }
const stop = new Set('the and that this with from must shall should required value type string number true false return export const function async await public class schema object default response parameter operation'.split(' '))
function tokens(value: string) {
  return [...new Set(value.replace(/([a-z])([A-Z])/g, '$1 $2').toLocaleLowerCase().match(/[\p{L}][\p{L}\p{N}]{2,}/gu)?.map((word) => word.replace(/s$/, '')).filter((word) => !stop.has(word)) ?? [])].slice(0, 100)
}
const numbers = (value: string) => [...new Set(value.match(/(?<![\p{L}\p{N}])\d+(?:\.\d+)?(?![\p{L}\p{N}])/gu) ?? [])].sort().join('|')

/** Bounded lexical candidates, never semantic proof. Common postings are deliberately excluded. */
export function compareProductEvidence(requirements: Requirement[], evidence: ProductEvidence): EvidenceComparison[] {
  const index = new Map<string, number[]>()
  evidence.clues.forEach((clue, ordinal) => { for (const token of tokens(clue.summary)) { const list = index.get(token) ?? []; list.push(ordinal); index.set(token, list) } })
  return requirements.filter((item) => ['requirement', 'business_rule', 'constraint', 'ambiguity'].includes(item.kind)).map((requirement) => {
    const words = tokens(`${requirement.summary} ${requirement.evidence.quote}`)
    const candidates = new Map<number, number>()
    for (const word of words.filter((word) => index.has(word) && index.get(word)!.length <= 100).sort((a, b) => index.get(a)!.length - index.get(b)!.length).slice(0, 8)) {
      for (const ordinal of index.get(word) ?? []) candidates.set(ordinal, (candidates.get(ordinal) ?? 0) + 1)
    }
    const clues = [...candidates].filter(([, score]) => score >= 2).sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 3).map(([ordinal]) => evidence.clues[ordinal])
    const expected = numbers(requirement.evidence.quote)
    const difference = expected && clues.some((clue) => { const actual = numbers(clue.summary); return actual && actual !== expected })
    return { requirement, clues, kind: difference ? 'numeric_difference' : clues.length ? 'related_clue' : 'no_matching_clue' }
  })
}
