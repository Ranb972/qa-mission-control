import { describe, expect, it } from 'vitest'
import { importApiContract } from './apiContractImport'
import { parseProductEvidence } from './productEvidence'

describe('explicit structured API evidence', () => {
  it('extracts operations, overridden parameters, auth alternatives, responses and schema boundaries with canonical pointers', async () => {
    const input = { openapi: '3.1.0', info: { title: 'Commerce' }, security: [{ bearerAuth: [] }], paths: { '/orders/{id}': { parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], get: { summary: 'Read an order', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer', minimum: 1 } }], responses: { 200: { description: 'An order', content: { 'application/json': { schema: { $ref: '#/components/schemas/Order' } } } }, 404: { description: 'Order missing' } } }, delete: { security: [], responses: { 204: { description: 'Removed' } } } } }, components: { schemas: { Order: { type: 'object', required: ['id'], additionalProperties: false, properties: { id: { type: 'integer', minimum: 0 }, total: { type: 'number', maximum: 99999 } } } }, securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } } } }
    const result = await importApiContract({ name: 'commerce.json', text: JSON.stringify(input) })
    expect(result.manifest.kind).toBe('openapi')
    expect(result.content).toContain('GET /orders/{id}')
    expect(result.content).toContain('404')
    expect(result.content).toContain('minimum: 0')
    expect(result.content).toContain('additionalProperties: false')
    expect(result.content).toContain('Anonymous access permitted by this operation')
    expect(result.content).toContain('bearerAuth')
    expect(result.manifest.clues.some((item) => item.origin.pointer === '/paths/~1orders~1{id}/get/parameters/0')).toBe(true)
    expect(result.manifest.clues.filter((item) => item.kind === 'parameter' && item.summary.startsWith('GET')).every((item) => item.summary.includes('integer'))).toBe(true)
    expect(parseProductEvidence(result.manifest, result.content)).toEqual(result.manifest)
    for (const clue of result.manifest.clues) expect(result.content.slice(clue.startOffset, clue.endOffset)).toBe(clue.summary)
  })
  it('represents schema composition and unresolved references explicitly without fetching or leaking examples/default credentials', async () => {
    const result = await importApiContract({ name: 'schema.json', text: JSON.stringify({ $schema: 'https://json-schema.org/draft/2020-12/schema', allOf: [{ properties: { age: { type: 'integer', minimum: 18 } } }, { $ref: 'https://private.example/schema' }], properties: { token: { type: 'string', default: 'SECRET_DEFAULT_VALUE', examples: ['SECRET_EXAMPLE_VALUE'] } } }) })
    expect(result.manifest.kind).toBe('json_schema')
    expect(result.content).toContain('allOf')
    expect(result.content).not.toContain('SECRET_')
    expect(result.content).not.toContain('private.example')
    expect(result.manifest.limitations.join(' ')).toMatch(/references.*not.*fetched/i)
    expect(result.manifest.clues.some((item) => item.origin.pointer === '/allOf/0/properties/age')).toBe(true)
  })
  it('fails closed on malformed/unsupported/oversized contracts instead of projecting a source prefix', async () => {
    for (const text of ['{', '{"openapi":"2.0","paths":{}}', '{"unrelated":true}', 'x'.repeat(2 * 1024 * 1024 + 1)]) await expect(importApiContract({ name: 'input.json', text })).rejects.toThrow()
  })
})
