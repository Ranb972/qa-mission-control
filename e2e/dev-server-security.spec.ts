import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { mkdir, writeFile, unlink } from 'node:fs/promises'
import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'

for (const color of ['0', '1']) {
  test(`development and review servers deny private files while the synthetic review app works (FORCE_COLOR=${color})`, async ({ request, page }) => {
    const marker = `synthetic-private-canary-${randomUUID()}`
    const paths = ['.local', 'private'].map(directory => `${directory}/${marker}.json`)
    // Exercise both local and CI logging environments, regardless of the parent terminal.
    const env: NodeJS.ProcessEnv = { ...process.env, FORCE_COLOR: color }
    delete env.NO_COLOR
    const server = spawn(process.execPath, ['scripts/dev-review.mjs', '.', '5296', marker], {
      cwd: process.cwd(), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
      env,
    })
    let output = ''
    let spawnError: Error | undefined
    server.once('error', error => { spawnError = error })
    server.stdout.on('data', chunk => { output += chunk })
    server.stderr.on('data', chunk => { output += chunk })
    try {
      for (const path of paths) {
        await mkdir(resolve(path, '..'), { recursive: true })
        await writeFile(path, JSON.stringify({ marker }))
      }
      // Readiness is an HTTP contract, not Vite's ANSI-formatted console output.
      // The unique revision also prevents an unrelated server satisfying the probe.
      await expect.poll(async () => {
        if (spawnError || server.exitCode !== null || server.signalCode !== null) {
          throw new Error(`Review server stopped before readiness: ${spawnError ?? server.exitCode ?? server.signalCode}\n${output}`)
        }
        try {
          const response = await request.get('http://127.0.0.1:5296/__review/build', { timeout: 1000 })
          try {
            if (response.status() !== 200) return null
            const build = await response.json()
            return { revision: build.revision, mode: build.mode }
          } finally {
            await response.dispose()
          }
        } catch {
          return null // Connection refusal while the child starts is expected.
        }
      }, { timeout: 15_000 }).toEqual({ revision: marker, mode: 'Synthetic data / mock AI' }).catch(error => {
        throw new Error(`Review server did not become ready.\n${output}`, { cause: error })
      })
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
      const stopped = new Promise<void>(done => { if (spawnError || server.exitCode !== null || server.signalCode !== null) done(); else server.once('exit', () => done()) })
      server.kill()
      await stopped
      for (const path of paths) await unlink(path).catch(() => undefined)
    }
  })
}
