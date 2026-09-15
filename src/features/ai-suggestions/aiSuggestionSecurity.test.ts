import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cwd } from 'node:process'
import { describe, expect, it } from 'vitest'

function listFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const child = join(directory, entry.name)

    if (entry.isDirectory()) {
      return listFiles(child)
    }

    return [child]
  })
}

function readProductionCode(rootNames: string[]) {
  const files = rootNames.flatMap((rootName) => listFiles(join(cwd(), rootName)))
  const productionFiles = files.filter((file) => {
    const path = file.replaceAll('\\', '/')

    return (
      (path.endsWith('.ts') || path.endsWith('.tsx')) &&
      !path.endsWith('.test.ts') &&
      !path.endsWith('.test.tsx') &&
      !path.includes('/src/test/')
    )
  })

  return productionFiles
    .map((file) => readFileSync(file, 'utf8'))
    .join('\n')
}

describe('AI suggestion security guardrails', () => {
  it('keeps AI secrets and provider endpoints out of production browser code', () => {
    const browserCode = readProductionCode(['src'])

    expect(browserCode).not.toMatch(
      /VITE_(OPENAI|ANTHROPIC|AI|MODEL|SECRET|TOKEN|API_KEY)/i,
    )
    expect(browserCode).not.toMatch(
      /api\.groq\.com|api\.openai\.com|api\.anthropic\.com|\/v1\/chat\/completions|\/v1\/responses/i,
    )
  })

  it('does not introduce VITE-prefixed AI secrets anywhere', () => {
    const productionCode = readProductionCode(['src', 'api'])

    expect(productionCode).not.toMatch(
      /VITE_(GROQ|OPENAI|ANTHROPIC|AI|MODEL|SECRET|TOKEN|API_KEY)/i,
    )
  })

  it('does not store credential-like AI values in browser storage', () => {
    const productionCode = readProductionCode(['src', 'api'])

    expect(productionCode).not.toMatch(
      /(localStorage|sessionStorage)\s*\.\s*(setItem|getItem)\([^)]*(groq|openai|anthropic|api[_-]?key|secret|token|credential)/i,
    )
  })
})
