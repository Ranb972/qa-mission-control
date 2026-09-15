import { describe, expect, it } from 'vitest'
import { importRepositoryEvidence } from './repositoryImport'

describe('explicit repository excerpt clues', () => {
  it('extracts only selected route/module/component/test/flag clues and preserves original file line evidence', async () => {
    const result = await importRepositoryEvidence([
      { name: 'src/orders.ts', text: 'export class OrderService {}\nrouter.get("/orders", listOrders)\nconst FEATURE_REFUNDS = true\nconst SESSION_TIMEOUT_MINUTES = 90' },
      { name: 'src/Checkout.tsx', text: 'export function Checkout() { return null }' },
      { name: 'tests/checkout.test.ts', text: 'test("prevents duplicate confirmation", async () => {})' },
      { name: 'README.md', text: '# Checkout product\nRefunds are accepted within 30 days.\n' },
    ])
    expect(result.manifest.files).toHaveLength(4)
    expect(result.manifest.clues.map((clue) => clue.kind)).toEqual(expect.arrayContaining(['route', 'module', 'component', 'test', 'feature_flag', 'documentation']))
    expect(result.manifest.clues.find((clue) => clue.kind === 'route')).toMatchObject({ origin: { fileIndex: 0, line: 2 } })
    expect(result.content).toContain('SESSION_TIMEOUT_MINUTES = 90')
    expect(result.manifest.limitations.join(' ')).toMatch(/not.*complete.*repository/i)
  })
  it('rejects secret filenames/literals, duplicate paths, unsupported binaries and oversized selections before projection', async () => {
    for (const files of [
      [{ name: '.env.local', text: 'FEATURE=true' }],
      [{ name: 'src/settings.ts', text: 'const apiKey = "gsk_' + 'x'.repeat(25) + '"' }],
      [{ name: 'private.pem', text: 'key' }],
      [{ name: '../secret.ts', text: 'export const test = true' }],
      [{ name: 'module.ts', text: 'export class One {}' }, { name: 'module.ts', text: 'export class Two {}' }],
      [{ name: 'archive.zip', text: 'binary' }],
    ]) await expect(importRepositoryEvidence(files)).rejects.toThrow()
  })
  it('accounts for unrecognized and overlong lines instead of treating their absence as missing implementation', async () => {
    const result = await importRepositoryEvidence([{ name: 'src/index.ts', text: 'export class Example {}\nplain unsupported syntax\n' + 'x'.repeat(1500) }])
    expect(result.manifest.files[0].lineCount).toBe(3)
    expect(result.manifest.clues).toHaveLength(1)
    expect(result.manifest.limitations.join(' ')).toContain('2 nonblank lines')
  })
})
