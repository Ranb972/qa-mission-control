import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { mkdir, writeFile, unlink } from 'node:fs/promises'
import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'

test('development and review servers deny private files while the synthetic review app works', async ({ request, page }) => {
  const marker = `synthetic-private-canary-${randomUUID()}`
  const paths = ['.local', 'private'].map(directory => `${directory}/${marker}.json`)
  const server = spawn(process.execPath, ['scripts/dev-review.mjs', '.', '5296'], {
    cwd: process.cwd(), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  server.stdout.on('data', chunk => { output += chunk })
  server.stderr.on('data', chunk => { output += chunk })
  try {
    for (const path of paths) {
      await mkdir(resolve(path, '..'), { recursive: true })
      await writeFile(path, JSON.stringify({ marker }))
    }
    await expect.poll(() => output, { timeout: 30_000 }).toContain('http://127.0.0.1:5296')
    for (const origin of ['http://127.0.0.1:5197', 'http://127.0.0.1:5296']) {
      for (const path of paths) {
        for (const url of [`${origin}/${path}`, `${origin}/@fs/${resolve(path).replaceAll('\\', '/')}`]) {
          const response = await request.get(url)
          expect(response.status()).toBe(403)
          expect(await response.text()).not.toContain(`"marker":"${marker}"`)
        }
      }
    }
    let providerCalls = 0
    await page.route('**/api/ai/**', route => { providerCalls++; return route.abort() })
    await page.goto('http://127.0.0.1:5296')
    await expect(page.getByRole('heading', { name: 'QA Mission Control', exact: true })).toBeVisible()
    await expect(page.locator('.workspace-local')).toContainText('Mock AI')
    expect(providerCalls).toBe(0)
  } finally {
    const stopped = new Promise<void>(done => { if (server.exitCode !== null) done(); else server.once('exit', () => done()) })
    server.kill()
    await stopped
    for (const path of paths) await unlink(path).catch(() => undefined)
  }
})
