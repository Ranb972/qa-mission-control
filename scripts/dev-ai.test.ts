import { EventEmitter } from 'node:events'
import { spawn } from 'node:child_process'
import { afterEach, expect, test, vi } from 'vitest'

vi.mock('node:child_process', () => {
  const mocked = { spawn: vi.fn(() => new EventEmitter()) }
  return { ...mocked, default: mocked }
})
vi.mock('./ai-env.mjs', () => ({
  loadEnvLocal: () => ({ exists: false }),
  getAiEnvVisibility: () => ({ GROQ_API_KEY_VISIBLE: false, GROQ_MODEL_VISIBLE: false }),
}))
afterEach(() => vi.restoreAllMocks())

test('the key-enabled launcher limits its listener to loopback without starting a provider', async () => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
  // Intercept process creation and environment loading before importing the real entry point.
  await import('./dev-ai.mjs')
  const args = vi.mocked(spawn).mock.calls[0][1] as string[]
  const endpoint = new URL(`http://${args[args.indexOf('--listen') + 1]}`)
  expect(['127.0.0.1', '[::1]']).toContain(endpoint.hostname)
  expect(Number(endpoint.port)).toBeGreaterThan(0)
})
