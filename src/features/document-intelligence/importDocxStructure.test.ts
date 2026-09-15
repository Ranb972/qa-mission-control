import { describe, expect, it } from 'vitest'
import { extractDocxStructure } from './importDocxStructure'

describe('structured DOCX conversion', () => {
  it('preserves hierarchy, paragraphs, bilingual tables and canonical cells', () => {
    const result = extractDocxStructure('<h1>Checkout</h1><p>Must authorize payment.</p><table><tr><th>Rule</th><th>דרישה</th></tr><tr><td>R1</td><td>חובה לאמת</td></tr></table>')
    expect(result.content).toBe('# Checkout\nMust authorize payment.\n\n| Rule | דרישה |\n| R1 | חובה לאמת |\n')
    const row = result.blocks.at(-1)!
    expect(row.location).toMatchObject({ table: 1, row: 2 })
    expect(row.location.cells?.map((cell) => result.content.slice(cell.startOffset, cell.endOffset).trim())).toEqual(['R1', 'חובה לאמת'])
    expect(result.blocks.map((block) => result.content.slice(block.location.startOffset, block.location.endOffset)).join('')).toBe(result.content)
  })
  it('accounts for images but never retains HTML, active links or embedded payloads', () => {
    const result = extractDocxStructure('<p><a href="javascript:alert(1)">Requirement</a><img src="data:image/png;base64,PRIVATE_BYTES"></p><script>SECRET_SCRIPT</script>')
    expect(result.content).toBe('Requirement\n\n[Document image — needs visual review]\n')
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE_BYTES|SECRET_SCRIPT|javascript/)
    expect(result.blocks.at(-1)?.status).toBe('needs_visual_review')
  })
})
