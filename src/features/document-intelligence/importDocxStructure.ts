import type { DocumentBlock } from './documentTypes'

/** Reads Mammoth's detached conversion tree. No HTML, links, image bytes or scripts are rendered or stored. */
export function extractDocxStructure(html: string): { content: string; blocks: DocumentBlock[] } {
  const template = document.createElement('template')
  template.innerHTML = html
  const parts: string[] = []
  const blocks: DocumentBlock[] = []
  let offset = 0
  let line = 1
  let paragraph = 0
  let table = 0
  const append = (text: string, kind: DocumentBlock['kind'], location: Partial<DocumentBlock['location']> = {}) => {
    if (!text) return
    const newLines = (text.match(/\n/g) ?? []).length
    blocks.push({ id: `docx-block-${blocks.length + 1}`, kind, status: kind === 'visual' ? 'needs_visual_review' : 'pending',
      location: { startOffset: offset, endOffset: offset + text.length, startLine: line, endLine: line + newLines - (text.endsWith('\n') ? 1 : 0), ...location } })
    parts.push(text)
    offset += text.length
    line += newLines
  }
  const textOf = (element: Element) => (element.textContent ?? '').replace(/\s+/g, ' ').trim()
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) { if (node.textContent?.trim()) append(`${node.textContent.trim()}\n\n`, 'paragraph', { paragraph: ++paragraph }); return }
    if (!(node instanceof Element)) return
    const tag = node.tagName.toLowerCase()
    if (['script', 'style', 'iframe', 'object', 'embed'].includes(tag)) return
    if (tag === 'table') {
      table += 1
      const tableNumber = table
      const rows = Array.from(node.querySelectorAll('tr')).filter((row) => row.closest('table') === node)
      rows.forEach((row, index) => {
        const cells = Array.from(row.children).filter((cell) => ['TD', 'TH'].includes(cell.tagName))
        let rowText = '|'
        const locations: NonNullable<DocumentBlock['location']['cells']> = []
        cells.forEach((cell, column) => {
          const cellText = ` ${textOf(cell).replaceAll('|', '\\|')} `
          locations.push({ column: column + 1, startOffset: offset + rowText.length, endOffset: offset + rowText.length + cellText.length })
          rowText += `${cellText}|`
        })
        append(`${rowText}\n`, 'table_row', { table: tableNumber, row: index + 1, cells: locations })
        if (row.querySelector('img')) append(`[Table ${tableNumber}, row ${index + 1}: image — needs visual review]\n`, 'visual', { table: tableNumber, row: index + 1 })
      })
      return
    }
    if (/^h[1-6]$/.test(tag)) { append(`${'#'.repeat(Number(tag[1]))} ${textOf(node)}\n`, 'heading'); return }
    if (tag === 'img') { append('[Document image — needs visual review]\n', 'visual'); return }
    if (tag === 'p' || tag === 'li') {
      const text = textOf(node)
      if (text) append(`${tag === 'li' ? '- ' : ''}${text}\n\n`, tag === 'li' ? 'list' : 'paragraph', { paragraph: ++paragraph })
      for (const image of node.querySelectorAll('img')) walk(image)
      return
    }
    for (const child of node.childNodes) walk(child)
  }
  for (const child of template.content.childNodes) walk(child)
  return { content: parts.join(''), blocks }
}
