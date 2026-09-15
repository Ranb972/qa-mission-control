// Isolated visual review: synthetic data, no environment files and no provider calls.
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { execFileSync } from 'node:child_process'
import { resolve, basename } from 'node:path'
import { readFile } from 'node:fs/promises'

const root = resolve(process.argv[2] || '.')
const port = Number(process.argv[3] || 5182)
function currentRevision() {
  try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() }
  catch { return 'source archive' }
}
const revision = process.argv[4] || currentRevision()
const startedAt = new Date().toISOString()
const fixturePath = resolve(process.cwd(), 'scripts/demo-fixture.ts')
const evidenceRoot = process.argv[5] ? resolve(process.argv[5]) : null
let server

const reviewPlugin = {
  name: 'local-visual-review',
  async transformIndexHtml(html) {
    const fixture = await server.ssrLoadModule(fixturePath)
    const seed = JSON.stringify(fixture.demoStorage).replace(/</g, '\\u003c')
    return html.replace('<head>', `<head>
      <meta name="qa-review-revision" content="${revision}">
      <meta name="qa-review-mode" content="Synthetic data · Mock AI">
      <script>
        try {
          if (!localStorage.getItem('qa-visual-demo-v1') && !Object.keys(localStorage).some(k => k.startsWith('qa-mission-control:'))) {
            const data = ${seed};
            for (const [key, value] of Object.entries(data)) localStorage.setItem(key, value);
            localStorage.setItem('qa-visual-demo-v1', 'seeded');
          }
        } catch { /* The app reports unavailable browser storage. */ }
      </script>`).replace('<title>QA Mission Control</title>', '<title>QA Mission Control · Regression fixture review</title>')
  },
  async configureServer(reviewServer) {
    const ocr = await reviewServer.ssrLoadModule(resolve(process.cwd(), 'scripts/local-ocr-plugin.ts'))
    ocr.localOcrPlugin().configureServer(reviewServer)
    if (evidenceRoot) {
      reviewServer.middlewares.use('/__review/evidence', async (request, response) => {
        // Serve only this review's generated gallery and known image paths.
        const pathname = new URL(request.url, 'http://127.0.0.1').pathname
        const allowed = pathname === '/' || pathname === '/index.html' ||
          /^\/(before-1440|current-(1440|1280|1024|390))\/\d{2}-[a-z-]+\.png$/.test(pathname)
        if (!allowed) {
          response.statusCode = 404
          response.end('Not found')
          return
        }
        try {
          const file = resolve(evidenceRoot, pathname === '/' ? 'index.html' : pathname.slice(1))
          response.setHeader('Content-Type', basename(file).endsWith('.png') ? 'image/png' : 'text/html; charset=utf-8')
          response.setHeader('Cache-Control', 'no-store')
          response.end(await readFile(file))
        } catch {
          response.statusCode = 404
          response.end('Evidence not generated yet')
        }
      })
    }
    reviewServer.middlewares.use('/__review/build', (_, response) => {
      response.setHeader('Content-Type', 'application/json')
      response.end(JSON.stringify({ root, revision, startedAt, mode: 'Synthetic data / mock AI' }))
    })
    reviewServer.middlewares.use('/api/ai', async (request, response) => {
      response.setHeader('Content-Type', 'application/json')
      if (request.method !== 'POST') {
        response.statusCode = 405
        response.end('{}')
        return
      }
      let raw = ''
      for await (const chunk of request) {
        raw += chunk
        if (raw.length > 200000) {
          response.statusCode = 413
          response.end('{}')
          return
        }
      }
      try {
        const fixture = await reviewServer.ssrLoadModule(fixturePath)
        response.end(JSON.stringify(fixture.mockAiResponse(request.url, JSON.parse(raw))))
      } catch {
        response.statusCode = 400
        response.end(JSON.stringify({ ok: false, error: { code: 'invalid_request', message: 'This request is not supported by the local review fixture.', retryable: false } }))
      }
    })
  },
}

server = await createServer({
  root,
  configFile: false,
  envDir: false,
  plugins: [react(), reviewPlugin],
  server: {
    host: '127.0.0.1', port, strictPort: true,
    watch: { ignored: ['**/.local/**', '**/private/**'] },
    fs: {
      allow: [process.cwd(), root],
      deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/private/**', '**/.local/**'],
    },
  },
})
await server.listen()
console.log(`QA visual review · ${revision} · ${root}`)
server.printUrls()
